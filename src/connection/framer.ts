import { Buffer } from "../buffer";

export type BytesReader = ReadableStreamDefaultReader<Buffer>;
export type BytesWriter = WritableStreamDefaultWriter<Buffer>;

function writeTransform<I, O>(
	stream: WritableStream<I>,
	transformer: (val: O) => I
): WritableStream<O> {
	const writer = stream.getWriter();
	return new WritableStream({
		write(val, _) {
			writer.write(transformer(val));
		},
		close() {
			writer.close();
		},
	});
}

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
	write: WritableStream<Uint8Array>,
): WritableStream<Buffer> {
	return writeTransform(write, (x) => x.inner);
}

export function lengthTransformer(): TransformStream<Buffer> {
	let currentPacket = Buffer.new();
	let currentSize = -1;
	return new TransformStream({
		transform(chunk, controller) {
			currentPacket.extend(chunk);
			if (currentSize === -1) {
				currentSize = currentPacket.readVarInt()!;
			}

			if (currentPacket.length < currentSize) {
				// too small, don't do anything
				return;
			}

			controller.enqueue(currentPacket);
			currentPacket = new Buffer(new Uint8Array());
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
						"Decompressor: server sent compressed packet below threshold",
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
