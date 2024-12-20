import { EaglerProxy } from "..";
import { connect_tcp } from "./epoxy";
import { Buffer } from "../buffer";
import {
	bufferTransformer,
	bufferWriter,
	eagerlyPoll,
	lengthTransformer,
} from "./framer";

export type BytesReader = ReadableStreamDefaultReader<Buffer>;
export type BytesWriter = WritableStreamDefaultWriter<Buffer>;

export class Connection {
	// used by fake websocket
	eaglerIn: BytesWriter;
	eaglerOut: BytesReader;

	// linked to eaglerIn, has packets the client sends
	processIn: BytesReader;
	// linked to eaglerOut, has packets the server sends
	processOut: BytesWriter;

	socketaddr: string;

	impl: EaglerProxy;

	constructor(uri: string) {
		// TODO handle close lol
		let inController: ReadableStreamDefaultController<Uint8Array>;
		this.processIn = new ReadableStream({
			start(controller) {
				inController = controller;
			},
		}).getReader();
		this.eaglerIn = new WritableStream({
			write(chunk) {
				inController.enqueue(chunk);
			},
		}).getWriter();

		let outController: ReadableStreamDefaultController<Uint8Array>;
		this.eaglerOut = new ReadableStream({
			start(controller) {
				outController = controller;
			},
		}).getReader();
		this.processOut = new WritableStream({
			write(chunk) {
				outController.enqueue(chunk);
			},
		}).getWriter();

		// ayunami code
		let ipPort = uri.slice(uri.toLowerCase().indexOf("://java://") + 10);
		let i = ipPort.indexOf("/");
		if (i != -1) {
			ipPort = ipPort.slice(0, i);
		}
		i = ipPort.lastIndexOf("]");
		if (i == -1) {
			i = +ipPort.includes(":");
		} else {
			i = +ipPort.slice(i).includes(":");
		}
		if (!i) {
			ipPort += ":25565";
		}

		this.socketaddr = ipPort;

		this.impl = new EaglerProxy();
	}

	async forward(connectcallback: () => void) {
		const conn = await connect_tcp(this.socketaddr);
		connectcallback();
		const writer = bufferWriter(conn.write).getWriter();

		// epoxy -> process -> (hopefully) eagler task
		(async () => {
			const reader = eagerlyPoll<Buffer>(
				conn.read
					.pipeThrough(bufferTransformer())
					.pipeThrough(lengthTransformer())
					.pipeThrough(this.impl.decompressor.transform),
			).getReader();

			while (true) {
				const { done, value } = await reader.read();
				if (done || !value) return;

				await this.impl.epoxyRead(value, writer);
			}

			// TODO cleanup
		})();

		// eagler -> process -> (hopefully) epoxy task
		(async () => {
			while (true) {
				const { done, value } = await this.processIn.read();
				if (done || !value) return;

				await this.impl.eaglerRead(value, writer);
			}
			// TODO cleanup
		})();
	}
}
