import { client as wisp } from "@mercuryworkshop/wisp-js/client";
import {
	ba2ab,
	makePacket,
	makeString,
	makeShort,
	makeVarInt,
	readVarInt,
	makeCompressedPacket,
} from "./packet/util";
import * as packets from "./packet/types";

export class wispWS {
	constructor(uri) {
		this.binaryType = "blob";
		this.readyState = "";
		this.url = uri;
		this.eventListeners = [];
		this.handshook = false;
		this.loggedIn = false;
		this.compression = -1;
		this.eag2wispQueue = [];
		this.username = "___";
		this.ipPort = uri.slice(uri.lastIndexOf("/") + 1).split(":", 2);
		if (this.ipPort.length < 2 || !+this.ipPort[1]) {
			this.ipPort[1] = 25565;
		}
		this.ipPort[1] = +this.ipPort[1];
		if (this.ipPort.length < 2 || !+this.ipPort[1]) {
			this.ipPort[1] = 25565;
		}
		this.ipPort[1] = +this.ipPort[1];
		const conn = new wisp.ClientConnection("wss://anura.pro/");
		conn.onopen = () => {
			let partialPacket = [];
			this.wispStream = conn.create_stream(this.ipPort[0], this.ipPort[1]);
			this.wispStream.onmessage = async (event) => {
				await navigator.locks.request("fart", async () => {
					const selfPacket = [...partialPacket, ...event.data];
					partialPacket = [];
					const res = readVarInt(selfPacket);
					if (res.length < 2) {
						partialPacket = selfPacket;
						return;
					}
					const packetLen = res[0];
					const packetOff = res[1];
					if (selfPacket.length < packetOff + packetLen) {
						partialPacket = selfPacket;
						return;
					}
					let packetIdVI, packetId, packetIdOff, packet;
					if (this.compression >= 0) {
						const dataLenVI = readVarInt(
							selfPacket.slice(packetOff, packetOff + packetLen)
						);
						if (dataLenVI.length < 2) {
							partialPacket = selfPacket;
							return;
						}
						let dataLen = dataLenVI[0];
						const dataLenOff = dataLenVI[1];
						const compressedPacket = selfPacket.slice(
							packetOff + dataLenOff,
							packetOff + packetLen
						);
						if (compressedPacket.length != packetLen - dataLenOff) {
							partialPacket = selfPacket;
							return;
						}
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
									new DecompressionStream("deflate")
								);
								for await (const chunk of decompressedStream) {
									chunks.push(...chunk);
								}
							} catch (e) {
								partialPacket = selfPacket;
								return;
							}
						}
						if (chunks.length != dataLen) {
							partialPacket = selfPacket;
							return;
						}
						packetIdVI = readVarInt(chunks.slice(0, dataLen));
						if (packetIdVI.length < 2) {
							partialPacket = selfPacket;
							return;
						}
						packetId = packetIdVI[0];
						packetIdOff = packetIdVI[1];
						packet = chunks.slice(packetIdOff, dataLen);
						partialPacket = selfPacket.slice(
							packetOff + dataLenOff + compressedPacket.length
						);
					} else {
						packetIdVI = readVarInt(
							selfPacket.slice(packetOff, packetOff + packetLen)
						);
						if (packetIdVI.length < 2) {
							partialPacket = selfPacket;
							return;
						}
						packetId = packetIdVI[0];
						packetIdOff = packetIdVI[1];
						packet = selfPacket.slice(
							packetOff + packetIdOff,
							packetOff + packetLen
						);
						partialPacket = selfPacket.slice(packetOff + packetLen);
					}
					if (this.loggedIn) {
						if (packetId == 0x46) {
							this.compression = readVarInt(packet)[0];
						} else {
							this.emit("message", {
								data: ba2ab([...makeVarInt(packetId), ...packet]),
							});
						}
					} else if (packetId == 0x03) {
						this.compression = readVarInt(packet)[0];
					} else if (packetId == 0x02) {
						this.emit("message", {
							data: ba2ab([packets.PROTOCOL_SERVER_FINISH_LOGIN]),
						});
						this.loggedIn = true;
						for (let p of this.eag2wispQueue) {
							const vi = readVarInt(p);
							if (this.compression >= 0) {
								p = new Uint8Array(
									ba2ab(
										await makeCompressedPacket(
											vi[0],
											p.slice(vi[1]),
											this.compression
										)
									)
								);
							} else {
								p = new Uint8Array(ba2ab(makePacket(vi[0], p.slice(vi[1]))));
							}
							this.wispStream.send(p);
						}
						this.eag2wispQueue = [];
					} else if (packetId == 0x00) {
						this.wispStream.close();
					}
				});
			};
			this.wispStream.onclose = (event) => {
				this.emit("close", event.code);
				conn.close();
			};
			this.emit("open", {});
		};
	}
	emit(ev, data) {
		ev = ev.toLowerCase();
		if (this["on" + ev]) {
			this["on" + ev](data);
		}
		if (this.eventListeners[ev]) {
			this.eventListeners[ev].forEach((cb) => cb(data));
		}
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
						this.emit("message", {
							data: ba2ab([
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
						});
						break;
					case packets.PROTOCOL_CLIENT_REQUEST_LOGIN:
						const bytes = p.slice(2, p[1] + 2);
						this.username = new TextDecoder().decode(bytes);
						// in line below: need to replace the 16 bytes with OfflinePlayer:(username) UUID in form of 8-byte long MSB, 8-byte long LSB
						this.emit("message", {
							data: ba2ab([
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
						});
						break;
					case packets.PROTOCOL_CLIENT_PROFILE_DATA:
						// ignore for now
						break;
					case packets.PROTOCOL_CLIENT_FINISH_LOGIN:
						this.handshook = true;
						this.wispStream.send(
							new Uint8Array(
								ba2ab(
									makePacket(0x00, [
										...makeVarInt(47),
										...makeString(this.ipPort[0]),
										...makeShort(this.ipPort[1]),
										...makeVarInt(2),
									])
								)
							)
						);
						this.wispStream.send(
							new Uint8Array(
								ba2ab(makePacket(0x00, [...makeString(this.username)]))
							)
						);
						break;
					default:
				}
				return;
			}
			if (this.loggedIn) {
				const vi = readVarInt(p);
				if (this.compression >= 0) {
					p = new Uint8Array(
						ba2ab(
							await makeCompressedPacket(
								vi[0],
								p.slice(vi[1]),
								this.compression
							)
						)
					);
				} else {
					p = new Uint8Array(ba2ab(makePacket(vi[0], p.slice(vi[1]))));
				}
				this.wispStream.send(p);
			} else {
				this.eag2wispQueue.push(p);
			}
		}
	}
	addEventListener(name, cb) {
		name = name.toLowerCase();
		if (this.eventListeners[name]) {
			this.eventListeners[name].push(callback);
		} else {
			this.eventListeners[name] = [cb];
		}
	}
	removeEventListener(name, cb) {
		name = name.toLowerCase();
		if (this.eventListeners[name]) {
			if (cb && this.eventListeners[name].includes(cb)) {
				this.eventListeners[name] = this.eventListeners[name].filter(
					(el) => el != cb
				);
				if (this.eventListeners[name].length == 0) {
					delete this.eventListeners[name];
				}
			} else if (!cb) {
				delete this.eventListeners[name];
			}
		}
	}
}
