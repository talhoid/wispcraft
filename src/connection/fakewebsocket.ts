import { Connection } from ".";
import { Buffer } from "../buffer";
import { showUI } from "../ui";
// @ts-ignore typescript sucks
import wispcraft from "./wispcraft.png";

class WispWS extends EventTarget {
	url: string;
	worker: Worker;

	eaglerIn?: WritableStreamDefaultWriter<Buffer>;
	eaglerOut?: ReadableStreamDefaultReader<Buffer | string>;

	constructor(uri: string) {
		super();

		this.url = uri;
		this.worker = new Worker("./dist/worker.js");

		this.worker.onmessage = async ({ data }) => {
			this.eaglerIn = data.eaglerIn.getWriter();
			this.eaglerOut = data.eaglerOut.getReader();

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
				this.dispatchEvent(new Event("close"));
			} catch (err) {
				console.error(err);
				this.dispatchEvent(new Event("error"));
			}
		};
	}

	start() {
		this.worker.postMessage({ uri: this.url });
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
		try {
			this.worker.postMessage({ close: true });
			// terminate too?
		} catch (err) {}
	}
}
class SettingsWS extends EventTarget {
	constructor() {
		super();
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
			showUI(null);
			this.dispatchEvent(new CloseEvent("close"));
		}
	}
	close() {}
}

const NativeWebSocket = WebSocket;
export function makeFakeWebSocket(): typeof WebSocket {
	return new Proxy(WebSocket, {
		construct(_target, [uri, protos]) {
			let url = new URL(uri);
			if (url.host == "java") {
				const ws = new WispWS(uri);
				ws.start();
				return ws;
			} else if (url.host == "settings") {
				return new SettingsWS();
			} else {
				return new NativeWebSocket(uri, protos);
			}
		},
	});
}
