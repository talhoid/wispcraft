import { nativeWebSocket } from "./snapshot";
import { wispWS } from "./connection";
import epoxy, {
	EpoxyClient,
	EpoxyClientOptions,
} from "@mercuryworkshop/epoxy-tls/minimal-epoxy-bundled";

export const wispurl = (new URL(window.location.href)).searchParams.get("wisp") || "wss://anura.pro/";

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
