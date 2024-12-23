import { getProfile, minecraftAuth, UserInfo } from "./auth";
import { epoxyFetch } from "./connection/epoxy";
import { makeFakeWebSocket } from "./connection/fakewebsocket";

const nativeFetch = fetch;
export type AuthStore = {
	user: UserInfo | null;
	yggToken: string;
	yggRefresh: string;
};

export type TokenStore = {
    username: string
    token: string
};

export let authstore: AuthStore = {
	user: null,
	yggToken: "",
	yggRefresh: ""
};

if (localStorage["wispcraft_accounts"]) {
	const accounts = JSON.parse(localStorage["wispcraft_accounts"]) as TokenStore[];
	const account = accounts.find((account) => account.username === localStorage["wispcraft_last_used_account"])
	if (account) {
		authstore.yggToken = await minecraftAuth(account.token);
		authstore.user = await getProfile(authstore.yggToken);
	}
};

// replace websocket with our own
window.WebSocket = makeFakeWebSocket();

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
const settings = { addr: "settings", name: "Wispcraft Settings" };
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
