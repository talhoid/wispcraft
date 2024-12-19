import { nativeWebSocket } from "./snapshot";
import { wispWS } from "./connection";
import epoxy, {
	EpoxyClient,
	EpoxyClientOptions,
} from "@mercuryworkshop/epoxy-tls/minimal-epoxy-bundled";

export const wispurl = "ws://localhost:6001/";

export let epoxyClient;
epoxy().then(() => {
	let options = new EpoxyClientOptions();
	epoxyClient = new EpoxyClient(wispurl, options);
});

window.WebSocket = new Proxy(WebSocket, {
	construct(target, [uri, protos]) {
		if (("" + uri).toLowerCase().includes("://java://")) {
			return new wispWS(uri);
		} else {
			return new nativeWebSocket(uri, protos);
		}
	},
});
