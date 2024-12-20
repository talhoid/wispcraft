import { connect_tcp } from "../epoxy";
import { Protocol } from "../packet";
import { Buffer } from "./buf";
import {
	bufferTransformer,
	bufferWriter,
	Decompressor,
	eagerlyPoll,
	lengthTransformer,
} from "./framer";

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
	handshook: boolean = false;

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
					.pipeThrough(lengthTransformer())
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
	async eaglerRead(packet: Buffer, epoxyWrite: BytesWriter) {
		if (!this.handshook) {
			switch (packet.get(0)) {
				case Protocol.ClientVersion:
					await this.processOut.write(
						new Buffer([Protocol.ServerVersion, 0, 3, 0, 47, 0, 0, 0, 0, 0])
					);
					break;
				case Protocol.ClientRequestLogin:
					/* TODO looks cursed not doing this
					const bytes = p.slice(2, p[1] + 2);
					this.username = new TextDecoder().decode(Uint8Array.from(bytes));
					// in line below: need to replace the 16 bytes with OfflinePlayer:(username) UUID in form of 8-byte long MSB, 8-byte long LSB
					this.dispatchEvent(
						new MessageEvent("message", {
							data: Uint8Array.from([
								packets.PROTOCOL_SERVER_ALLOW_LOGIN,
								this.username.length,
								...bytes,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
								0,
							]),
						}),
					);
					*/
					break;
				case Protocol.ClientProfileData:
					// ignore for now
					break;
				case Protocol.ClientFinishLogin:
					this.handshook = true;
					/* TODO
						await this.wispStream.send(
							Uint8Array.from(
								makePacket(0x00, [
									...makeVarInt(47),
									...makeString(this.ipPort[0]),
									...makeShort(this.ipPort[1]),
									...makeVarInt(2),
								]),
							),
						);
						await this.wispStream.send(
							Uint8Array.from(makePacket(0x00, [...makeString(this.username)])),
						);
					*/
					break;
				default:
			}
			return;
		}
		const vi = packet.readVarInt();
		if (!vi) throw new Error("packet too small");
		if (vi == 0x17) {
			const tag = new TextDecoder().decode(packet.readVariableData().inner);
			/* TODO what
			if (tag.startsWith("EAG|")) {
				if (tag == "EAG|Skins-1.8" || tag == "EAG|Capes-1.8") {
					const vivivi = readVarInt(p.slice(vivi[1] + vivi[0]));
					handleSkinCape(
						tag[4] == "C",
						conn,
						p.slice(
							vivi[1] + vivi[0] + vivivi[1],
							vivi[1] + vivi[0] + vivivi[1] + vivivi[0],
						),
						(resp) => {
							this.dispatchEvent(
								new MessageEvent("message", {
									data: Uint8Array.from([
										...makeVarInt(0x3f),
										...makeVarInt(tag.length),
										...new TextEncoder().encode(tag),
										...makeVarInt(resp.length),
										...resp,
									]),
								}),
							);
						},
					);
				}
				return;
			}
			*/
		}
		if (this.loggedIn) {
			/* TODO
			if (this.decompressor.compressionThresh >= 0) {
				p = Uint8Array.from(
					await makeCompressedPacket(vi[0], p.slice(vi[1]), this.compression),
				);
			} else {
				p = Uint8Array.from(makePacket(vi[0], p.slice(vi[1])));
			}
			await this.wispStream.send(p);
			*/
		} else {
			/* TODO
			this.eag2wispQueue.push(p);
			*/
		}
	}

	// something incoming from epoxy
	async epoxyRead(packet: Buffer, epoxyWrite: BytesWriter) {
		const packetId = packet.readVarInt();
		if (!packetId) throw new Error("packet too small");
		if (packetId == 0x3f) {
			const taglen = packet.readVarInt();
			if (!taglen) throw new Error("packet too small");
			const tag = new TextDecoder().decode(packet.take(taglen).inner);

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
