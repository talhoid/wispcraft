import { Connection } from ".";
import { Buffer } from "../buffer";

class WispWS extends EventTarget {
	inner: Connection;

	binaryType = "arraybuffer";
	clientPacketQueue = {};
	compression = -1;
	eag2wispQueue = {};
	handshook = false;
	ipPort = ["a", 123];
	loggedIn = false;
	readyState = "";
	url: string;
	username = "___";
	wispStream = {};

	constructor(uri: string) {
		super();

		this.url = uri;
		this.inner = new Connection(uri);
	}

	start() {
		this.inner.forward(() => { this.dispatchEvent(new Event("open")); });
		(async () => {
			while (true) {
				const { done, value } = await this.inner.eaglerOut.read();
				if (done || !value) return;

				this.dispatchEvent(new MessageEvent("message", { data: value.inner }));
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
				return new Proxy(ws, {
					get(target, p, receiver) {
						console.log("get", target, p, receiver);
						const ret = Reflect.get(target, p);
						if (ret instanceof Function) {
							return ret.bind(target);
						} else {
							return ret;
						}
					},
				});
			} else {
				return new NativeWebSocket(uri, protos);
			}
		},
	});
}
