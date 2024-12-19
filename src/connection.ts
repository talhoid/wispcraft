import { connect_tcp } from "./epoxy";

type BytesReader = ReadableStreamDefaultReader<Uint8Array>;
type BytesWriter = WritableStreamDefaultWriter<Uint8Array>;

export class Connection {
	// used by fake websocket
	eaglerIn: BytesWriter;
	eaglerOut: BytesReader;

	// linked to eaglerIn, has packets the client sends
	processIn: BytesReader;
	// linked to eaglerOut, has packets the server sends
	processOut: BytesWriter;

	socketaddr: string;

	partial: number[][] = [];

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
			}
		}).getWriter();

		let outController: ReadableStreamDefaultController<Uint8Array>;
		this.eaglerOut = new ReadableStream({
			start(controller) {
				outController = controller;
			}
		}).getReader();
		this.processOut = new WritableStream({
			write(chunk) {
				outController.enqueue(chunk);
			}
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
	}

	async forward() {
		const conn = await connect_tcp(this.socketaddr);
		const writer = conn.write.getWriter();

		// epoxy -> process -> (hopefully) eagler task
		(async () => {
			const reader = conn.read.getReader();
			while (true) {
				const { done, value } = await reader.read();
				if (done || !value) return;

				await this.epoxyRead(value, writer);
			}

			// TODO cleanup
		})();

		// eagler -> process -> (hopefully) epoxy task
		(async () => {
			while (true) {
				const { done, value } = await this.processIn.read();
				if (done || !value) return;

				await this.eaglerRead(value, writer);
			}
			// TODO cleanup
		})();
	}

	// something incoming from eagler
	async eaglerRead(packet: Uint8Array, epoxyWrite: BytesWriter) {

	}

	// something incoming from epoxy
	async epoxyRead(packet: Uint8Array, epoxyWrite: BytesWriter) {

	}
}
