import { Connection } from ".";
import { Buffer } from "../buffer";

class WispWS extends EventTarget {
	inner: Connection;

	constructor(uri: string) {
		super();

		this.inner = new Connection(uri);
	}

	start() {
		this.inner.forward();
		(async () => {
			while (true) {
				const { done, value } = await this.inner.eaglerOut.read();
				if (done || !value) return;

				this.dispatchEvent(new MessageEvent("message", { data: value }));
			}
			// TODO cleanup
		})();
	}

	send(chunk: Uint8Array) {
		console.log("sending", chunk);
		this.inner.eaglerIn.write(new Buffer(chunk));
	}

	close() {
		this.inner.eaglerIn.close();
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
