import { Buffer } from "./buffer";
import { BytesWriter, Compressor, Decompressor } from "./connection/framer";
import { makeFakeWebSocket } from "./connection/fakewebsocket";
import { bytesToUuid, offlineUUID } from "./crypto";

// https://minecraft.wiki/w/Protocol?oldid=2772100
enum State {
	Handshaking = 0x0,
	Status = 0x1,
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
	/* ==STATUS== */
	StatusRequest = 0x00,
	PingRequest = 0x01,
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
	/* ==STATUS== */
	StatusResponse = 0x00,
	PongResponse = 0x01,
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

const fakever = new Packet(Clientbound.EAG_ServerVersion);
{
	const brand = new TextEncoder().encode("Wispcraft");
	fakever.writeBytes([0, 3, 0, MINECRAFT_PROTOCOL_VERSION, brand.length]);
	fakever.extend(new Buffer(brand));
	fakever.writeBytes([brand.length]);
	fakever.extend(new Buffer(brand));
	fakever.writeBytes([0, 0, 0]);
}

export class EaglerProxy {
	loggedIn: boolean = false;
	handshook: boolean = false;
	decompressor = new Decompressor();
	compressor = new Compressor();

	state: State = State.Handshaking;

	net: BytesWriter;
	eagler: WritableStreamDefaultWriter<Buffer | string>;

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
						// eagler specific packet, return server version 3
						this.eagler.write(fakever);
						return;
					case Serverbound.EAG_RequestLogin:
						let username = packet.readString();
						console.log("User " + username + " requested login");
						this.username = username;

						let fakelogin = new Packet(Clientbound.EAG_AllowLogin);
						let usernameEnc = new TextEncoder().encode(username);
						fakelogin.writeBytes([usernameEnc.length]);
						fakelogin.extend(new Buffer(usernameEnc));
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
				// eagler does not send status packets
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
				// there are no clientbound packets in the handshaking state
				break;
			case State.Status:
				switch (pk) {
					case Clientbound.StatusResponse:
						let json = packet.readString();
						console.log("Status response: " + json);
						let body = JSON.parse(json);
						let response: any = {
							name: "Java Server",
							brand: "mercuryworkshop",
							vers: "wispcraft/1.0",
							cracked: true,
							time: Date.now(),
							uuid: bytesToUuid(offlineUUID("wispcraft")),
							type: "motd",
							data: {
								cache: false,
								icon: false,
								online: body.players.online,
								max: body.players.max,
								players: [],
							},
						};

						if (body.description)
							if (typeof body.description == "string")
								response.data.motd = [body.description];
							else response.data.motd = [body.description.text];

						if (body.favicon) {
							response.data.icon = true;
							let image = new Image();
							image.src = body.favicon;
							image.onload = () => {
								let canvas = document.createElement("canvas");
								canvas.width = image.width;
								canvas.height = image.height;
								let ctx = canvas.getContext("2d")!;
								ctx.drawImage(image, 0, 0);
								let pixels = ctx.getImageData(
									0,
									0,
									canvas.width,
									canvas.height,
								).data;
								this.eagler.write(new Buffer(new Uint8Array(pixels)));
							};
						}

						this.eagler.write(JSON.stringify(response));
						break;
					case Clientbound.PongResponse:
						let time = packet.readLong();
						console.log("Pong response: " + time);
						break;
					default:
						console.error("Unhandled status packet: " + pk);
				}
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

	// pings remote server, sends json to eagler
	async ping() {
		let handshake = new Packet(Serverbound.Handshake);
		handshake.writeVarInt(MINECRAFT_PROTOCOL_VERSION);
		handshake.writeString(this.serverAddress);
		handshake.writeUShort(this.serverPort);
		handshake.writeVarInt(State.Status);
		this.net.write(handshake);

		let statusRequest = new Packet(Serverbound.StatusRequest);
		this.net.write(statusRequest);

		let pingRequest = new Packet(Serverbound.PingRequest);
		pingRequest.writeLong(Date.now());
		this.net.write(pingRequest);

		this.state = State.Status;
	}
}

window.WebSocket = makeFakeWebSocket();
