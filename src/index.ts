import { Buffer } from "./buffer";
import { BytesWriter, Decompressor } from "./connection/framer";
import { makeFakeWebSocket } from "./connection/fakewebsocket";

// https://minecraft.wiki/w/Protocol?oldid=2772100
enum State {
	Handshaking = 0x0,
	Status = 0x1, // unused
	Login = 0x2,
	Play = 0x3,
}

// EAG_ prefixed are nonstandard
enum Serverbound {
	/* ==HANDSHAKING== */
	Handshake = 0x00,
	EAG_ClientVersion = 0x01,
	EAG_RequestLogin = 0x04,
	/* ==LOGIN== */
	LoginStart = 0x00,
	EncryptionResponse = 0x01,
	/* ==PLAY== */
}

enum Clientbound {
	/* ==HANDSHAKING== */
	EAG_ServerVersion = 0x02,
	EAG_AllowLogin = 0x05,
	/* ==LOGIN== */
	Disconnect = 0x0,
	EncryptionRequest = 0x01,
	LoginSuccess = 0x02,
	SetCompression = 0x03,
}

class Packet extends Buffer {
	constructor(packetType: number) {
		super(new Uint8Array());
		this.writeVarInt(packetType);
	}

	transmit(writer: BytesWriter, sendlength = false) {
		if (sendlength) {
			let buffer = new Buffer(new Uint8Array());
			buffer.writeVarInt(this.inner.length);
			writer.write(buffer);
		}
		writer.write(this);
	}
}

const serverboundNonstandard = [
	Serverbound.EAG_ClientVersion,
	Serverbound.EAG_RequestLogin,
];

export class EaglerProxy {
	loggedIn: boolean = false;
	handshook: boolean = false;
	decompressor = new Decompressor();

	state: State = State.Handshaking;

	net: BytesWriter;
	eagler: BytesWriter;

	constructor(eaglerOut: BytesWriter, epoxyOut: BytesWriter) {
		this.net = epoxyOut;
		this.eagler = eaglerOut;
	}

	// consumes packets from eagler, sends them to the upstream server
	async eaglerRead(packet: Buffer) {
		console.log(packet);
		console.log(packet.toArray(), packet.toStr());
		switch (this.state) {
			case State.Handshaking:
				switch (packet.readVarInt()) {
					case Serverbound.EAG_ClientVersion:
						console.log("Client version request");
						// eagler specific packet, return a fake version number
						let ver = new Packet(Clientbound.EAG_ServerVersion);
						ver.writeBytes([0, 3, 0, 47, 0, 0, 0, 0, 0]); // idk what these mean ayun fill this in
						ver.transmit(this.eagler);
						return;
					case Serverbound.EAG_RequestLogin:
						console.log(packet);
						console.log(packet.get(1));
						let username = packet.readString();
						console.log("User " + username + " requested login");
						return;
				}
				break;
			case State.Status:
				break;
			case State.Login:
			case State.Play:
		}
	}

	// consumes packets from the network, sends them to eagler
	async epoxyRead(packet: Buffer) {
		console.log(packet.toArray(), packet.toStr());
	}
}

window.WebSocket = makeFakeWebSocket();
