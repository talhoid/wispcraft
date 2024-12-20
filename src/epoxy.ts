import { EpoxyIoStream } from "@mercuryworkshop/epoxy-tls";
import initEpoxy, {
	EpoxyClient,
	EpoxyClientOptions,
} from "@mercuryworkshop/epoxy-tls/minimal-epoxy-bundled";

export let wisp = "ws://localhost:6001/";
let connectedwisp = "";

let initted = false;
let epoxy: EpoxyClient | null = null;

async function create() {
	if (!initted) {
		initEpoxy();
		initted = false;
	}

	if (!epoxy || wisp != connectedwisp) {
		const options = new EpoxyClientOptions();
		options.wisp_v2 = false;
		options.udp_extension_required = false;
		connectedwisp = wisp;
		return (epoxy = new EpoxyClient(wisp, options));
	}
}

export async function fetch(url: string, opts: any): Promise<Response> {
	create();

	// create() inits epoxy
	return epoxy!.fetch(url, opts);
}

export async function connect_tcp(socket: string): Promise<EpoxyIoStream> {
	create();

	// create() inits epoxy
	return epoxy!.connect_tcp(socket);
}

export async function reconnect() {
	create();

	// create() inits epoxy
	await epoxy!.replace_stream_provider();
}
