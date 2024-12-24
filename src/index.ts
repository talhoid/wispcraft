import { getProfile, minecraftAuth, UserInfo } from "./auth";
import { Connection } from "./connection";
import { epoxyFetch, initWisp } from "./connection/epoxy";
import { makeFakeWebSocket } from "./connection/fakewebsocket";

export let wispUrl: string;

export type AuthStore = {
	user: UserInfo | null;
	yggToken: string;
	yggRefresh: string;
};

export type TokenStore = {
	username: string;
	token: string;
};

export let authstore: AuthStore = {
	user: null,
	yggToken: "",
	yggRefresh: "",
};

export function initMain(workeruri: string) {
	const nativeFetch = fetch;

	wispUrl =
		new URL(window.location.href).searchParams.get("wisp") ||
		localStorage["wispcraft_wispurl"] ||
		"wss://wisp.run/";

	if (localStorage["wispcraft_accounts"]) {
		const accounts = JSON.parse(
			localStorage["wispcraft_accounts"],
		) as TokenStore[];
		const account = accounts.find(
			(account) =>
				account.username === localStorage["wispcraft_last_used_account"],
		);
		if (account) {
			(async () => {
				authstore.yggToken = await minecraftAuth(account.token);
				authstore.user = await getProfile(authstore.yggToken);
			})();
		}
	}

	// replace websocket with our own
	window.WebSocket = makeFakeWebSocket(workeruri);

	// eagler will fetch texture packs, will fail if cors isn't set
	// should really fix this but whatever
	window.fetch = async function (url: RequestInfo | URL, init?: RequestInit) {
		try {
			return await nativeFetch(url, init);
		} catch (e) {
			return await epoxyFetch("" + url, init);
		}
	};

	type EaglerXOptions = any;
	let eagoptions: EaglerXOptions;
	// append settings to the server list
	const settings = { addr: "settings://", name: "Wispcraft Settings" };
	Object.defineProperty(window, "eaglercraftXOpts", {
		get() {
			if (eagoptions) {
				return eagoptions;
			}
			return { servers: [settings] };
		},
		set(v) {
			eagoptions = v;
			if (eagoptions?.servers) {
				eagoptions.servers.unshift(settings);
			} else {
				eagoptions.servers = [settings];
			}
		},
	});

	initWisp(wispUrl);
}

function initWorker() {
	let conn: Connection;

	self.onmessage = ({ data }) => {
		if (data.ping) {
			conn.ping();
			return;
		}
		if (data.close) {
			conn.eaglerOut.cancel();
			self.close();
			return;
		}

		conn = new Connection(data.uri, data.wisp, data.authstore);
		conn.forward(() => {
			self.postMessage(
				{
					type: "open",
					eaglerIn: conn.eaglerIn,
					eaglerOut: conn.eaglerOut,
				},
				// @ts-ignore
				[conn.eaglerIn, conn.eaglerOut],
			);
		});
	};
}

if ("DedicatedWorkerGlobalScope" in self) {
	initWorker();
}
