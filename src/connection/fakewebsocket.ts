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
						new MessageEvent("message", { data: value.inner })
					);
				}
				this.dispatchEvent(new Event("close"));
			} catch (err) {
				console.error(err);
				this.dispatchEvent(new Event("error"));
			}
		})();
	}

	send(chunk: Uint8Array | string) {
		if (typeof chunk == "string") return;
		console.log(chunk);
		this.inner.eaglerIn.write(new Buffer(chunk, true));
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
			if (("" + uri).toLowerCase().includes("://java://")) {
				const ws = new WispWS(uri);
				ws.start();
				return ws;
			} else {
				return new NativeWebSocket(uri, protos);
			}
		},
	});
}
