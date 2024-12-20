import { connect_tcp } from "../epoxy";
import { Buffer } from "./buf";
import { bufferTransformer, bufferWriter, Decompressor, eagerlyPoll, lengthFramer } from "./framer";

type BytesReader = ReadableStreamDefaultReader<Buffer>;
type BytesWriter = WritableStreamDefaultWriter<Buffer>;

export class Connection {
	// used by fake websocket
	eaglerIn: BytesWriter;
	eaglerOut: BytesReader;

	// linked to eaglerIn, has packets the client sends
	processIn: BytesReader;
	// linked to eaglerOut, has packets the server sends
	processOut: BytesWriter;

	socketaddr: string;

	decompressor: Decompressor = new Decompressor();

	loggedIn: boolean = false;

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
	}

	async forward() {
		const conn = await connect_tcp(this.socketaddr);
		const writer = bufferWriter(conn.write).getWriter();

		// epoxy -> process -> (hopefully) eagler task
		(async () => {
			const reader = eagerlyPoll(
				conn.read
					.pipeThrough(bufferTransformer())
					.pipeThrough(lengthFramer())
					.pipeThrough(this.decompressor.transform)
			).getReader();

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
	async eaglerRead(packet: Buffer, epoxyWrite: BytesWriter) { }

	// something incoming from epoxy
	async epoxyRead(packet: Buffer, epoxyWrite: BytesWriter) {
		const packetId = packet.readVarInt();
		if (!packetId) throw new Error("packet too small");
		if (packetId == 0x3f) {
			const taglen = packet.readVarInt();
			if (!taglen) throw new Error("packet too small");
			const tag = new TextDecoder().decode(
				packet.take(taglen).inner
			);

			if (tag.startsWith("EAG|")) {
				return;
			}
		}
		if (this.loggedIn) {
			if (packetId == 0x46) {
				const compression = packet.readVarInt();
				if (!compression) throw new Error("packet too small");
				this.decompressor.compressionThresh = compression;
			} else {
				const buf = Buffer.new();
				buf.writeVarInt(packetId);
				buf.extend(packet);
				await this.processOut.write(buf);
			}
		} else if (packetId == 0x03) {
			const compression = packet.readVarInt();
			if (!compression) throw new Error("packet too small");
			this.decompressor.compressionThresh = compression;
		} else if (packetId == 0x02) {
			/* TODO write to this.processOut
			this.dispatchEvent(
				new MessageEvent("message", {
					data: Uint8Array.from([packets.PROTOCOL_SERVER_FINISH_LOGIN]),
				}),
			);
			this.loggedIn = true;
			for (let p of this.eag2wispQueue) {
				const vi = readVarInt(p);
				if (this.compression >= 0) {
					p = Uint8Array.from(
						await makeCompressedPacket(
							vi[0],
							p.slice(vi[1]),
							this.compression,
						),
					);
				} else {
					p = Uint8Array.from(makePacket(vi[0], p.slice(vi[1])));
				}
				await this.wispStream.send(p);
			}
			this.eag2wispQueue = [];
			*/
		} else if (packetId == 0x00) {
			// TODO translate this this.wispStream.close();
			// this is probably wrong
			epoxyWrite.close();
		}
	}
}
