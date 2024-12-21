import { Buffer } from "./buffer";
import { BytesWriter, Compressor, Decompressor } from "./connection/framer";
import { makeFakeWebSocket } from "./connection/fakewebsocket";
import { offlineUUID } from "./crypto";

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
	EAG_ProfileData = 0x05,
	EAG_FinishLogin = 0x08,
	/* ==LOGIN== */
	LoginStart = 0x00,
	EncryptionResponse = 0x01,
	/* ==PLAY== */
}

enum Clientbound {
	/* ==HANDSHAKING== */
	EAG_ServerVersion = 0x02,
	EAG_AllowLogin = 0x05,
	EAG_FinishLogin = 0x09,
	/* ==LOGIN== */
	Disconnect = 0x0,
	EncryptionRequest = 0x01,
	LoginSuccess = 0x02,
	SetCompression = 0x03,
	/* ==PLAY== */
	SetCompressionPlay = 0x46,
}

const MINECRAFT_PROTOCOL_VERSION = 47;

class Packet extends Buffer {
	constructor(packetType: number) {
		super(new Uint8Array());
		this.writeVarInt(packetType);
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
	compressor = new Compressor();

	state: State = State.Handshaking;

	net: BytesWriter;
	eagler: BytesWriter;

	username: string = "";
	realUuid: string = "";

	constructor(
		eaglerOut: BytesWriter,
		epoxyOut: BytesWriter,
		public serverAddress: string,
		public serverPort: number,
	) {
		this.net = epoxyOut;
		this.eagler = eaglerOut;
	}

	// consumes packets from eagler, sends them to the upstream server
	async eaglerRead(packet: Buffer) {
		switch (this.state) {
			case State.Handshaking:
				switch (packet.readVarInt()) {
					case Serverbound.EAG_ClientVersion:
						console.log("Client version request");
						// eagler specific packet, return a fake version number
						let fakever = new Packet(Clientbound.EAG_ServerVersion);
						fakever.writeBytes([0, 3, 0, 47, 0, 0, 0, 0, 0]); // idk what these mean ayun fill this in
						this.eagler.write(fakever);
						return;
					case Serverbound.EAG_RequestLogin:
						let username = packet.readString();
						console.log("User " + username + " requested login");
						this.username = username;

						let fakelogin = new Packet(Clientbound.EAG_AllowLogin);
						fakelogin.writeString(username);
						fakelogin.writeBytes(offlineUUID(username));
						this.eagler.write(fakelogin);
						return;
					case Serverbound.EAG_FinishLogin:
						// this says finish login but it only finishes the handshake stage since eagler
						// now send the real login packets
						let handshake = new Packet(Serverbound.Handshake);
						handshake.writeVarInt(MINECRAFT_PROTOCOL_VERSION);
						handshake.writeString(this.serverAddress);
						handshake.writeUShort(this.serverPort);
						handshake.writeVarInt(State.Login);
						this.net.write(handshake);

						let loginstart = new Packet(Serverbound.LoginStart);
						loginstart.writeString(this.username);
						this.net.write(loginstart);

						this.state = State.Login;
						break;
				}
				break;
			case State.Status:
				break;
			case State.Login:
			case State.Play:
				let pk = packet.readVarInt()!;
				switch (pk) {
					default:
						let p = new Packet(pk);
						p.extend(packet);
						this.net.write(p);
						break;
				}
		}
	}

	// consumes packets from the network, sends them to eagler
	async epoxyRead(packet: Buffer) {
		const pk = packet.readVarInt();
		switch (this.state) {
			case State.Handshaking:
			case State.Status:
				break;
			case State.Login:
				console.log("Login packet: " + pk);
				switch (pk) {
					case Clientbound.Disconnect:
						console.error("Disconnect during login: " + packet.readString());
						// TODO forward to eagler
						break;
					case Clientbound.LoginSuccess:
						console.log("Login success");
						this.realUuid = packet.readString();
						this.state = State.Play;
						let eag = new Packet(Clientbound.EAG_FinishLogin);
						this.eagler.write(eag);
						break;
					case Clientbound.SetCompression:
						let threshold = packet.readVarInt()!;
						console.error("Set compression threshold: " + threshold);
						this.decompressor.compressionThresh = threshold;
						this.compressor.compressionThresh = threshold;
						break;
					default:
						console.error("Unhandled login packet: " + pk);
				}
				break;
			case State.Play:
				switch (pk) {
					case Clientbound.SetCompressionPlay:
						let threshold = packet.readVarInt();
						this.decompressor.compressionThresh = threshold;
						this.compressor.compressionThresh = threshold;
						break;
					default:
						// send rest of packet to eagler
						let eag = new Packet(pk);
						eag.extend(packet);
						this.eagler.write(eag);
				}
		}
	}
}

window.WebSocket = makeFakeWebSocket();
