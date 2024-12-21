import { EaglerProxy } from "..";
import { connect_tcp } from "./epoxy";
import { Buffer } from "../buffer";
import {
	bufferTransformer,
	bufferWriter,
	BytesReader,
	BytesWriter,
	eagerlyPoll,
	lengthTransformer,
} from "./framer";

function link<T>(): [ReadableStream<T>, WritableStream<T>] {
	let readController: ReadableStreamDefaultController<T>;
	let writeController: WritableStreamDefaultController;

	return [
		new ReadableStream({
			start(controller) {
				readController = controller;
			},
			cancel() {
				writeController.error("other side closed");
			},
		}),
		new WritableStream({
			start(controller) {
				writeController = controller;
			},
			write(obj) {
				readController.enqueue(obj);
			},
			close() {
				readController.close();
			},
		}),
	];
}

export class Connection {
	// used by fake websocket
	eaglerIn: BytesWriter;
	eaglerOut: BytesReader;

	// linked to eaglerIn, has packets the client sends
	processIn: BytesReader;
	// linked to eaglerOut, has packets the server sends
	processOut: BytesWriter;

	url: URL;

	constructor(uri: string) {
		const [processIn, eaglerIn] = link<Buffer>();
		this.processIn = processIn.getReader();
		this.eaglerIn = eaglerIn.getWriter();

		const [eaglerOut, processOut] = link<Buffer>();
		this.eaglerOut = eaglerOut.getReader();
		this.processOut = processOut.getWriter();

		this.url = new URL(uri.slice(uri.toLowerCase().indexOf("://") + 3));
		if (!this.url.port) this.url.port = "25565";
		if (this.url.protocol != "java:") throw new Error("invalid protocol");
	}

	async forward(connectcallback: () => void) {
		const conn = await connect_tcp(this.url.host);
		connectcallback();
		const writer = bufferWriter(conn.write).getWriter();

		const impl = new EaglerProxy(
			this.processOut,
			writer,
			this.url.hostname,
			this.url.port ? parseInt(this.url.port) : 25565,
		);

		// epoxy -> process -> (hopefully) eagler task
		(async () => {
			const reader = eagerlyPoll<Buffer>(
				conn.read
					.pipeThrough(bufferTransformer())
					.pipeThrough(lengthTransformer()),
				// .pipeThrough(impl.decompressor.transform),
			).getReader();

			while (true) {
				const { done, value } = await reader.read();
				if (done || !value) return;

				await impl.epoxyRead(value);
			}

			// TODO cleanup
		})();

		// eagler -> process -> (hopefully) epoxy task
		(async () => {
			while (true) {
				const { done, value } = await this.processIn.read();
				if (done || !value) return;

				await impl.eaglerRead(value);
			}
			// TODO cleanup
		})();
	}
}
