import { authstore, type AuthStore } from "..";
import { Buffer } from "../buffer";
import { showUI } from "../ui";
// @ts-ignore typescript sucks
import wispcraft from "./wispcraft.png";
import DataWorker from "./loader";

class WispWS extends EventTarget {
	url: string;
	worker: Worker;

	eaglerIn?: WritableStreamDefaultWriter<Buffer>;
	eaglerOut?: ReadableStreamDefaultReader<Buffer | string>;
	readyState: number;

	constructor(uri: string) {
		super();

		this.url = uri;
		this.worker = new Worker("data:text/javascript;base64," + DataWorker);

		this.readyState = WebSocket.CONNECTING;
		this.worker.onmessage = async ({ data }) => {
			this.eaglerIn = data.eaglerIn.getWriter();
			this.eaglerOut = data.eaglerOut.getReader();

			this.readyState = WebSocket.OPEN;
			this.dispatchEvent(new Event("open"));

			try {
				while (true) {
					const { done, value } = await this.eaglerOut!.read();
					if (done || !value) break;

					this.dispatchEvent(
						new MessageEvent("message", {
							data: typeof value === "string" ? value : value.inner,
						}),
					);
				}
				this.readyState = WebSocket.CLOSING;
				this.dispatchEvent(new Event("close"));
				this.readyState = WebSocket.CLOSED;
			} catch (err) {
				console.error(err);
				this.dispatchEvent(new Event("error"));
			}
		};
	}

	start() {
		this.worker.postMessage({
			uri: this.url,
			wisp: new URL(window.location.href).searchParams.get("wisp") || localStorage["wispcraft_wispurl"] || "wss://wisp.run/",
			authstore,
		});
	}

	send(chunk: Uint8Array | ArrayBuffer | string) {
		let buf: Buffer;
		if (typeof chunk == "string") {
			if (chunk.toLowerCase() == "accept: motd") {
				this.worker.postMessage({ ping: true });
			}
			return;
		} else if (chunk instanceof ArrayBuffer) {
			buf = new Buffer(new Uint8Array(chunk), true);
		} else {
			buf = new Buffer(chunk, true);
		}
		if (!this.eaglerIn) throw new Error("not connected");
		this.eaglerIn.write(buf);
	}

	close() {
		if (
			this.readyState == WebSocket.CLOSING ||
			this.readyState == WebSocket.CLOSED
		) {
			return;
		}
		this.readyState = WebSocket.CLOSING;
		try {
			this.worker.postMessage({ close: true });
			// terminate too?
		} catch (err) {}
		this.readyState = WebSocket.CLOSED;
	}
}
class SettingsWS extends EventTarget {
	readyState: number;
	constructor() {
		super();
		this.readyState = WebSocket.CLOSED;
		setTimeout(() => {
			this.dispatchEvent(new Event("open"));
		});
	}
	send(chunk: Uint8Array | ArrayBuffer | string) {
		if (typeof chunk === "string" && chunk.toLowerCase() === "accept: motd") {
			this.dispatchEvent(
				new MessageEvent("message", {
					data: JSON.stringify({
						name: "Settings",
						brand: "mercuryworkshop",
						vers: "wispcraft/1.0",
						cracked: true,
						time: Date.now(),
						uuid: "00000000-0000-0000-0000-000000000000",
						type: "motd",
						data: {
							cache: false,
							icon: true,
							online: 0,
							max: 0,
							players: [],
							motd: ["Sign in with Microsoft", "Configure Proxy URL"],
						},
					}),
				}),
			);
			let image = new Image();
			image.src = wispcraft;
			image.onload = () => {
				let canvas = document.createElement("canvas");
				canvas.width = image.width;
				canvas.height = image.height;
				let ctx = canvas.getContext("2d")!;
				ctx.drawImage(image, 0, 0);
				let pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
				this.dispatchEvent(
					new MessageEvent("message", { data: new Uint8Array(pixels) }),
				);
			};
		} else {
			showUI();
			let str = "Settings UI launched.";
			let enc = new TextEncoder().encode(str);
			let eag = Uint8Array.from([0xff, 0x08, enc.length, ...enc]);
			this.dispatchEvent(new MessageEvent("message", { data: eag }));
			this.dispatchEvent(new CloseEvent("close"));
		}
	}
	close() {}
}

class AutoWS extends EventTarget {
	inner: WebSocket | WispWS | null;
	url: string;

	constructor(uri: string, protocols?: string | string[]) {
		super();
		const url = new URL(uri);
		this.inner = null;
		this.url = url.protocol + "//java://" + url.hostname;
		const el = (event: Event) => {
			switch (event.type.toLowerCase()) {
				case "close":
					this.dispatchEvent(new CloseEvent("close", event));
					break;
				case "message":
					this.dispatchEvent(new MessageEvent("message", event));
					break;
				default:
					this.dispatchEvent(new Event(event.type, event));
			}
		};
		let flag = false;
		const el3 = (event: Event) => {
			if (this.inner != null) {
				this.inner.removeEventListener("close", el2);
				this.inner.removeEventListener("error", el2);
				this.inner.addEventListener("close", el);
				this.inner.addEventListener("error", el);
				flag = true;
			}
			el(event);
		};
		let ti = -1;
		let called = false;
		const el2 = () => {
			if (called) {
				return;
			}
			called = true;
			if (ti != -1) {
				clearInterval(ti);
			}
			if (this.inner != null) {
				if (flag) {
					this.inner.removeEventListener("close", el);
					this.inner.removeEventListener("error", el);
				} else {
					this.inner.removeEventListener("close", el2);
					this.inner.removeEventListener("error", el2);
				}
				this.inner.removeEventListener("open", el3);
				this.inner.removeEventListener("message", el);
			}
			this.inner = new WispWS(this.url);
			this.inner.addEventListener("close", el);
			this.inner.addEventListener("error", el);
			this.inner.addEventListener("open", el);
			this.inner.addEventListener("message", el);
			this.inner.start();
		};
		ti = setTimeout(el2, 3500);
		try {
			const ws = new NativeWebSocket(uri, protocols);
			if (this.inner != null) {
				ws.close();
				return;
			}
			this.inner = ws;
			this.inner.addEventListener("close", el2);
			this.inner.addEventListener("error", el2);
			this.inner.addEventListener("open", el3);
			this.inner.addEventListener("message", el);
		} catch (e) {
			el2();
		}
	}

	send(chunk: Uint8Array | ArrayBuffer | string) {
		if (this.inner != null) {
			return this.inner.send(chunk);
		}
	}

	close() {
		if (this.inner != null) {
			try {
				return this.inner.close();
			} catch (e) {}
		}
	}

	get binaryType() {
		if (this.inner != null && this.inner instanceof WebSocket) {
			return this.inner.binaryType;
		}
		return "arraybuffer";
	}

	get readyState() {
		if (this.inner != null) {
			return this.inner.readyState;
		}
		return WebSocket.CONNECTING;
	}

	set binaryType(binaryType: BinaryType) {
		if (this.inner != null && this.inner instanceof WebSocket) {
			this.inner.binaryType = binaryType;
		}
	}
}

const NativeWebSocket = WebSocket;
export function makeFakeWebSocket(): typeof WebSocket {
	return new Proxy(WebSocket, {
		construct(_target, [uri, protos]) {
			let url = new URL(uri);
			let isCustomProtocol = url.port == "" && url.pathname.startsWith("//");
			if (isCustomProtocol && url.hostname == "java") {
				const ws = new WispWS(uri);
				ws.start();
				return ws;
			} else if (isCustomProtocol && url.hostname == "settings") {
				return new SettingsWS();
			} else {
				return new AutoWS(uri, protos);
			}
		},
	});
}
