import { nativeWebSocket } from "./snapshot";
import { wispWS } from "./connection";
import epoxy, {
	EpoxyClient,
	EpoxyClientOptions,
} from "@mercuryworkshop/epoxy-tls/minimal-epoxy-bundled";
import { createUI, showUI } from "./ui";

export const wispurl =
	new URL(window.location.href).searchParams.get("wisp") || "wss://anura.pro/";

export let epoxyClient;
epoxy().then(() => {
	let options = new EpoxyClientOptions();
	epoxyClient = new EpoxyClient(wispurl, options);
});

const regex = /^wss?:\/\/([a-z0-9_-]+):\/\/(.*)$/i;

window.WebSocket = new Proxy(WebSocket, {
	construct(target, [uri, protos]) {
		const matches = ("" + uri).match(regex);
		if (matches != null && matches.length > 1) {
			switch (matches[1].toLowerCase()) {
				case "java":
					if (matches.length < 3) break;
					return new wispWS(matches[2]);
				case "settings":
					showUI(matches.length > 2 ? matches[2] : null);
					uri = protos = null;
					break;
			}
		}
		return new nativeWebSocket(uri, protos);
	},
});
