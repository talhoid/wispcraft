import { WispConnection } from "./lib/wisp.mjs";
import {
	makePacket,
	makeString,
	makeShort,
	makeVarInt,
	readVarInt,
	makeCompressedPacket,
} from "./packet/util";
import * as packets from "./packet/types";
import { handleSkinCape } from "./skins";
import { AsyncQueue } from "./asyncqueue";
import { wispurl } from ".";

export class wispWS extends EventTarget {
	constructor(uri) {
		super();
		this.binaryType = "blob";
		this.readyState = "";
		this.url = "java://" + uri;
		this.handshook = false;
		this.loggedIn = false;
		this.compression = -1;
		this.eag2wispQueue = [];
		this.username = "___";
		this.ipPort = uri;
		let ti = this.ipPort.indexOf("/");
		if (ti != -1) {
			this.ipPort = this.ipPort.slice(0, i);
		}
		ti = this.ipPort.lastIndexOf("]");
		if (ti == -1) {
			ti = this.ipPort.lastIndexOf(":");
		} else {
			ti = this.ipPort.slice(ti).lastIndexOf(":");
		}
		if (ti == -1) {
			this.ipPort += ":25565";
			ti = this.ipPort.lastIndexOf(":");
		}
		ti = this.ipPort.slice(0, ti);
		this.ipPort = [ti, +this.ipPort.slice(ti.length + 1)];
		const conn = new WispConnection(wispurl);
		const packetQueue = new AsyncQueue(1);
		this.clientPacketQueue = new AsyncQueue(1);
		conn.addEventListener("open", async () => {
			this.wispStream = conn.create_stream(this.ipPort[0], this.ipPort[1]);
			this.wispStream.addEventListener("message", (event) => {
				packetQueue.put(event.data);
			});
			let isOpen = true;
			this.wispStream.addEventListener("close", (event) => {
				isOpen = false;
				packetQueue.close();
				this.dispatchEvent(new CloseEvent("close", event));
				conn.ws.close();
			});
			this.dispatchEvent(new Event("open"));
			let partialPacket = [];
			while (isOpen) {
				const selfPacket = [...partialPacket];
				partialPacket = [];
				const res = readVarInt(selfPacket);
				if (res.length < 2) {
					const data = (await packetQueue.get()) || [];
					selfPacket.push(...data);
					partialPacket = selfPacket;
					continue;
				}
				const packetLen = res[0];
				const packetOff = res[1];
				while (selfPacket.length < packetOff + packetLen) {
					const data = (await packetQueue.get()) || [];
					selfPacket.push(...data);
				}
				if (selfPacket.length > packetOff + packetLen) {
					partialPacket = selfPacket.slice(packetOff + packetLen);
				}
				(async () => {
					let packetId, packet;
					if (this.compression >= 0) {
						const dataLenVI = readVarInt(
							selfPacket.slice(packetOff, packetOff + packetLen),
						);
						let dataLen = dataLenVI[0];
						const dataLenOff = dataLenVI[1];
						const compressedPacket = selfPacket.slice(
							packetOff + dataLenOff,
							packetOff + packetLen,
						);
						const chunks = [];
						if (dataLen == 0) {
							dataLen = packetLen - dataLenOff;
							chunks.push(...compressedPacket);
						} else {
							const stream = new Blob([
								new Uint8Array(compressedPacket),
							]).stream();
							try {
								const decompressedStream = stream.pipeThrough(
									new DecompressionStream("deflate"),
								);
								for await (const chunk of decompressedStream) {
									chunks.push(...chunk);
								}
							} catch (e) {
								console.error(e);
							}
						}
						const packetIdVI = readVarInt(chunks.slice(0, dataLen));
						packetId = packetIdVI[0];
						const packetIdOff = packetIdVI[1];
						packet = chunks.slice(packetIdOff, dataLen);
					} else {
						const packetIdVI = readVarInt(
							selfPacket.slice(packetOff, packetOff + packetLen),
						);
						packetId = packetIdVI[0];
						const packetIdOff = packetIdVI[1];
						packet = selfPacket.slice(
							packetOff + packetIdOff,
							packetOff + packetLen,
						);
					}
					if (packetId == 0x3f) {
						const vivi = readVarInt(packet);
						const tag = new TextDecoder().decode(
							Uint8Array.from(packet.slice(vivi[1], vivi[1] + vivi[0])),
						);
						if (tag.startsWith("EAG|")) {
							return;
						}
					}
					if (this.loggedIn) {
						if (packetId == 0x46) {
							this.compression = readVarInt(packet)[0];
						} else {
							this.dispatchEvent(
								new MessageEvent("message", {
									data: Uint8Array.from([...makeVarInt(packetId), ...packet]),
								}),
							);
						}
					} else if (packetId == 0x03) {
						this.compression = readVarInt(packet)[0];
					} else if (packetId == 0x02) {
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
					} else if (packetId == 0x00) {
						this.wispStream.close();
					}
				})();
			}
		});
	}
	close(c) {
		if (this.wispStream) {
			this.wispStream.close(c);
		}
	}
	async send(p) {
		if (this.wispStream) {
			if (!this.handshook) {
				switch (p[0]) {
					case packets.PROTOCOL_CLIENT_VERSION:
						this.dispatchEvent(
							new MessageEvent("message", {
								data: Uint8Array.from([
									packets.PROTOCOL_SERVER_VERSION,
									0,
									3,
									0,
									47,
									0,
									0,
									0,
									0,
									0,
								]),
							}),
						);
						break;
					case packets.PROTOCOL_CLIENT_REQUEST_LOGIN:
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
						break;
					case packets.PROTOCOL_CLIENT_PROFILE_DATA:
						// ignore for now
						break;
					case packets.PROTOCOL_CLIENT_FINISH_LOGIN:
						this.handshook = true;
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
						break;
					default:
				}
				return;
			}
			const vi = readVarInt(p);
			if (vi[0] == 0x17) {
				const vivi = readVarInt(p);
				const tag = new TextDecoder().decode(
					Uint8Array.from(p.slice(vivi[1], vivi[1] + vivi[0])),
				);
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
			}
			if (this.loggedIn) {
				if (this.compression >= 0) {
					p = Uint8Array.from(
						await makeCompressedPacket(vi[0], p.slice(vi[1]), this.compression),
					);
				} else {
					p = Uint8Array.from(makePacket(vi[0], p.slice(vi[1])));
				}
				await this.wispStream.send(p);
			} else {
				this.eag2wispQueue.push(p);
			}
		}
	}
}
