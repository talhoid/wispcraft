import { Buffer } from "./buf";

async function compress(buf: Buffer): Promise<Buffer> {
	const compressor = new CompressionStream("deflate");

	compressor.writable.getWriter().write(buf.inner);

	const data = Buffer.new();

	const reader = compressor.readable.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done || !value) break;

		data.extend(new Buffer(value));
	}

	return data;
}

async function decompress(buf: Buffer): Promise<Buffer> {
	const compressor = new DecompressionStream("deflate");

	compressor.writable.getWriter().write(buf.inner);

	const data = Buffer.new();

	const reader = compressor.readable.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done || !value) break;

		data.extend(new Buffer(value));
	}

	return data;
}

export function bufferTransformer(): TransformStream<Uint8Array, Buffer> {
	return new TransformStream({
		transform(chunk, controller) {
			controller.enqueue(new Buffer(chunk));
		},
	});
}

export function bufferWriter(
	write: WritableStream<Uint8Array>
): WritableStream<Buffer> {
	const writer = write.getWriter();
	return new WritableStream({
		async write(thing) {
			writer.write(thing.inner);
		},
	});
}

export function lengthFramer(): TransformStream<Buffer> {
	let currentPacket = Buffer.new();
	return new TransformStream({
		transform(chunk, controller) {
			while (true) {
				currentPacket.extend(chunk);
				const size = currentPacket.readVarInt();
				if (!size) {
					// failed to read, don't do anything
					break;
				}

				if (currentPacket.length < size) {
					// too small, don't do anything
					break;
				}

				controller.enqueue(currentPacket.take(size));
			}
		},
	});
}

export class Decompressor {
	compressionThresh: number = 0;
	transform: TransformStream<Buffer>;

	constructor() {
		const self = this;
		this.transform = new TransformStream({
			async transform(chunk, controller) {
				const len = chunk.readVarInt();

				if (!len) throw new Error("Decompressor: packet was too small");

				if (len == 0) {
					controller.enqueue(chunk);
				} else if (len >= self.compressionThresh) {
					controller.enqueue(await decompress(chunk));
				} else {
					throw new Error(
						"Decompressor: server sent compressed packet below threshold"
					);
				}
			},
		});
	}
}

export function eagerlyPoll<T>(stream: ReadableStream<T>): ReadableStream<T> {
	return new ReadableStream({
		async start(controller) {
			const reader = stream.getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (done || !value) break;
				controller.enqueue(value);
			}
			controller.close();
		},
	});
}
