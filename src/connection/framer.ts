import { Buffer } from "../buffer";

export type BytesReader = ReadableStreamDefaultReader<Buffer>;
export type BytesWriter = WritableStreamDefaultWriter<Buffer>;

function writeTransform<I, O>(
	stream: WritableStream<I>,
	transformer: (val: O) => I,
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
			while (true) {
				if (currentSize === -1) {
					const size = currentPacket.readVarInt();
					if (!size) {
						// failed to read, don't do anything
						break;
					}
					currentSize = size;
				}

				if (currentPacket.length < currentSize) {
					// too small, don't do anything
					break;
				}

				const pkt = currentPacket.take(currentSize);
				controller.enqueue(pkt);
				currentSize = -1;
			}
		},
	});
}

export class Decompressor {
	compressionThresh: number = -1;
	transform: TransformStream<Buffer>;

	constructor() {
		const self = this;
		this.transform = new TransformStream({
			async transform(chunk, controller) {
				if (self.compressionThresh === -1) {
					controller.enqueue(chunk);
					return;
				}

				const len = chunk.readVarInt();

				if (len === undefined)
					throw new Error("Decompressor: packet was too small");

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

// @ts-ignore
window.lengthTransformer = lengthTransformer;
