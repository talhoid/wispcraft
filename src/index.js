import { nativeWebSocket } from "./snapshot";
import { wispWS } from "./connection";
import epoxy, {
	EpoxyClient,
	EpoxyClientOptions,
} from "@mercuryworkshop/epoxy-tls/minimal-epoxy-bundled";
import { createUI, showUI } from "./ui";

export const wispurl = (new URL(window.location.href)).searchParams.get("wisp") || "wss://anura.pro/";

export let epoxyClient;
epoxy().then(() => {
	let options = new EpoxyClientOptions();
	epoxyClient = new EpoxyClient(wispurl, options);
});

createUI()

window.WebSocket = new Proxy(WebSocket, {
	construct(target, [uri, protos]) {
		if (("" + uri).toLowerCase().includes("://java://")) {
			return new wispWS(uri);
		} else if (("" + uri).toLowerCase().includes("://internal://settings")) {
      showUI();
      return new WebSocket(null);
		} else {
			return new nativeWebSocket(uri, protos);
		}
	},
});
