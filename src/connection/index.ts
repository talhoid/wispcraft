import { EaglerProxy } from "../1.8";
import { connect_tcp, initWisp } from "./epoxy";
import { Buffer } from "../buffer";
import {
	bufferTransformer,
	bufferWriter,
	BytesReader,
	BytesWriter,
	eagerlyPoll,
	lengthTransformer,
	writeTransform,
} from "./framer";
import type { AuthStore } from "..";

function link<T>(): [ReadableStream<T>, WritableStream<T>] {
	let readController: ReadableStreamDefaultController<T>;
	let writeController: WritableStreamDefaultController;

	return [
		new ReadableStream({
			start(controller) {
				readController = controller;
			},
			cancel() {
				writeController.error("other side closed");
			},
		}),
		new WritableStream({
			start(controller) {
				writeController = controller;
			},
			write(obj) {
				readController.enqueue(obj);
			},
			close() {
				readController.close();
			},
		}),
	];
}

export class Connection {
	// used by fake websocket
	eaglerIn: WritableStream<Buffer>;
	eaglerOut: ReadableStream<Buffer | string>;

	// linked to eaglerIn, has packets the client sends
	processIn: ReadableStream<Buffer>;
	// linked to eaglerOut, has packets the server sends
	processOut: BytesWriter;

	url: URL;

	impl?: EaglerProxy;
	rawEpoxy?: BytesWriter;

	constructor(
		uri: string,
		wispurl: string,
		private authStore: AuthStore,
	) {
		initWisp(wispurl);

		const [processIn, eaglerIn] = link<Buffer>();
		this.processIn = processIn;
		this.eaglerIn = eaglerIn;

		const [eaglerOut, processOut] = link<Buffer>();
		this.eaglerOut = eaglerOut;
		this.processOut = processOut.getWriter();

		this.url = new URL(uri.slice(uri.toLowerCase().indexOf("://") + 3));
		if (!this.url.port) this.url.port = "25565";
		if (this.url.protocol != "java:") throw new Error("invalid protocol");
	}

	async forward(connectcallback: () => void) {
		let connectUrl: URL | undefined;
		try {
			const dns = await fetch(
				`https://cloudflare-dns.com/dns-query?name=_minecraft._tcp.${this.url.hostname}&type=SRV`,
				{
					headers: {
						Accept: "application/dns-json",
					},
				},
			);
			const dnsResponse = await dns.json();
			if (dnsResponse.Answer?.length) {
				const data = dnsResponse.Answer[0].data.split(" ");
				const port = data[2];
				const hostname = data[3];
				connectUrl = new URL(`java://${hostname}:${port}`);
			}
		} catch {}
		// const conn = await connect_tcp(
		// 	connectUrl ? connectUrl.host : this.url.host,
		// );

		const conn = await (new globalThis["WebSocketStream"]("wss://anura.pro/" + (connectUrl ? connectUrl.host : this.url.host))).opened;
		connectcallback();
		const writer = bufferWriter(conn.writable.getWriter());
		this.rawEpoxy = writer.getWriter();
		conn.read = conn.readable;
		
		console.log(conn.read)
		const impl = new EaglerProxy(
			this.processOut,
			writeTransform(this.rawEpoxy, async (p: Buffer) => {
				const pk = await impl.compressor.transform(p);
				let b = Buffer.new();
				b.writeVarInt(pk.length);
				b.extend(pk);
				return impl.encryptor.transform(b);
			}).getWriter(),
			this.url.hostname,
			this.url.port ? parseInt(this.url.port) : 25565,
			this.authStore,
		);

		// epoxy -> process -> (hopefully) eagler task
		(async () => {
			let backlog = 0;
			const reader = eagerlyPoll<Buffer>(
				conn.read
					.pipeThrough(bufferTransformer())
					.pipeThrough(impl.decryptor.transform)
					.pipeThrough(lengthTransformer())
					.pipeThrough(impl.decompressor.transform),
				100,
				() => backlog++,
			).getReader();

			// setInterval(() => console.log("epoxy backlog ", backlog), 1000);

			while (true) {
				const { done, value } = await reader.read();
				if (done || !value) return;

				await impl.epoxyRead(value);
				backlog--;
			}

			// TODO cleanup
		})();

		// eagler -> process -> (hopefully) epoxy task
		(async () => {
			let backlog = 0;
			const reader = eagerlyPoll<Buffer>(
				this.processIn,
				100,
				() => backlog++,
			).getReader();

			// setInterval(() => console.log("eagler backlog ", backlog), 1000);
			while (true) {
				const start = performance.now();
				const { done, value } = await reader.read();
				if (done || !value) return;
				await impl.eaglerRead(value);
				console.log("Took " + (performance.now() - start) + " to eaglerRead packet");
				backlog--;
			}

			// TODO cleanup
		})();
		this.impl = impl;
	}

	ping() {
		this.impl?.ping();
		// legacy ping (https://c4k3.github.io/wiki.vg/Server_List_Ping.html)
		// not a normal packet
		// let legacy = Buffer.new();
		// legacy.writeBytes([0xfe, 0x01, 0xfa]);
		// let magic = new Buffer(new TextEncoder().encode("MC|PingHost"));
		// legacy.writeUShort(magic.length);
		// legacy.extend(magic);
		// legacy.writeUShort(7 + 2 * this.url.hostname.length);
		// legacy.writeUShort(74);
		// legacy.writeUShort(this.url.hostname.length);
		// legacy.extend(new Buffer(new TextEncoder().encode(this.url.hostname)));
		// legacy.writeUShort(this.url.port ? parseInt(this.url.port) : 25565);
		// this.rawEpoxy?.write(legacy);
	}
}
