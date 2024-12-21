import { Connection } from ".";
import { Buffer } from "../buffer";
import { showUI } from "../ui";

class WispWS extends EventTarget {
	inner: Connection;
	url: string;

	constructor(uri: string) {
		super();

		this.url = uri;
		this.inner = new Connection(uri);
	}

	start() {
		this.inner.forward(() => {
			this.dispatchEvent(new Event("open"));
		});
		(async () => {
			try {
				while (true) {
					const { done, value } = await this.inner.eaglerOut.read();
					if (done || !value) break;

					this.dispatchEvent(
						new MessageEvent("message", {
							data: typeof value === "string" ? value : value.inner,
						})
					);
				}
				this.dispatchEvent(new Event("close"));
			} catch (err) {
				console.error(err);
				this.dispatchEvent(new Event("error"));
			}
		})();
	}

	send(chunk: Uint8Array | ArrayBuffer | string) {
		let buf: Buffer;
		if (typeof chunk == "string") {
			if (chunk.toLowerCase() == "accept: motd") {
				this.inner.ping();
			} else {
				console.warn("IGNORING CHUNK", chunk);
			}
			return;
		} else if (chunk instanceof ArrayBuffer) {
			buf = new Buffer(new Uint8Array(chunk), true);
		} else {
			buf = new Buffer(chunk, true);
		}
		this.inner.eaglerIn.write(buf);
	}

	close() {
		try {
			this.inner.eaglerIn.close();
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
			console.log("SENDING", chunk);
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
				})
			);
			// TODO: cleanup
			let image = new Image();
			image.src =
				"data:image/png;base64,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";
			image.onload = () => {
				let canvas = document.createElement("canvas");
				canvas.width = image.width;
				canvas.height = image.height;
				let ctx = canvas.getContext("2d")!;
				ctx.drawImage(image, 0, 0);
				let pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
				this.dispatchEvent(
					new MessageEvent("message", { data: new Uint8Array(pixels) })
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
			console.log(url);
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
