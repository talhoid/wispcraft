import { EpoxyIoStream } from "@mercuryworkshop/epoxy-tls";
import initEpoxy, {
	EpoxyClient,
	EpoxyClientOptions,
} from "@mercuryworkshop/epoxy-tls/minimal-epoxy-bundled";

let connectedwisp = "";

let epoxy: EpoxyClient | null = null;

let resolver;
let initpromise = new Promise((r) => (resolver = r));

export async function initWisp(wisp: string) {
	await initEpoxy();

	const options = new EpoxyClientOptions();
	options.wisp_v2 = false;
	options.udp_extension_required = false;
	connectedwisp = wisp;
	epoxy = new EpoxyClient(wisp, options);
	resolver();
}

export async function epoxyFetch(url: string, opts?: any): Promise<Response> {
	await initpromise;

	// create() inits epoxy
	return await epoxy!.fetch(url, opts);
}

export async function connect_tcp(socket: string): Promise<EpoxyIoStream> {
	await initpromise;

	// create() inits epoxy
	return await epoxy!.connect_tcp(socket);
}

export function set_wisp_server(wisp_url: string) {
	initpromise = new Promise((r) => (resolver = r));
	initWisp(wisp_url);
}

export async function reconnect() {
	await initpromise;

	await epoxy!.replace_stream_provider();
}
