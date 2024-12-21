import { Connection } from ".";
import { Buffer } from "../buffer";

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
						new MessageEvent("message", { data: value.inner }),
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
			console.warn("IGNORING CHUNK", chunk);
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

const NativeWebSocket = WebSocket;
export function makeFakeWebSocket(): typeof WebSocket {
	return new Proxy(WebSocket, {
		construct(_target, [uri, protos]) {
			let url = new URL(uri);
			if (url.host == "java") {
				const ws = new WispWS(uri);
				ws.start();
				return ws;
			} else {
				return new NativeWebSocket(uri, protos);
			}
		},
	});
}
