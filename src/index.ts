import { Buffer } from "./buffer";
import { BytesWriter, Compressor, Decompressor } from "./connection/framer";
import { makeFakeWebSocket } from "./connection/fakewebsocket";
import {
	bytesToUuid,
	Decryptor,
	Encryptor,
	encryptRSA,
	loadKey,
	makeSharedSecret,
	mchash,
	offlineUUID,
} from "./connection/crypto";
import { handleSkinCape } from "./skins";
import "./auth";
import { joinServer } from "./auth";
import { epoxyFetch } from "./connection/epoxy";

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
	PluginMessage = 0x17,
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
	PluginMessage = 0x3f,
}

const MINECRAFT_PROTOCOL_VERSION = 47;

class Packet extends Buffer {
	constructor(packetType: number) {
		super(new Uint8Array());
		this.writeVarInt(packetType);
	}
}

const fakever = new Packet(Clientbound.EAG_ServerVersion);
{
	const brand = new TextEncoder().encode("Wispcraft");
	fakever.writeBytes([0, 3, 0, MINECRAFT_PROTOCOL_VERSION, brand.length]);
	fakever.extend(new Buffer(brand));
	fakever.writeBytes([brand.length]);
	fakever.extend(new Buffer(brand));
	fakever.writeBytes([0, 0, 0]);
}

type ChatSchema = {
	text: string;
	color?: string;
	underlined?: boolean;
	strikethrough?: boolean;
	obfuscated?: boolean;
	bold?: boolean;
	italic?: boolean;
	extra?: ChatSchema[];
};

const colorMap: { [key: string]: string } = {
	black: "0",
	dark_blue: "1",
	dark_green: "2",
	dark_aqua: "3",
	dark_red: "4",
	dark_purple: "5",
	gold: "6",
	gray: "7",
	dark_gray: "8",
	blue: "9",
	green: "a",
	aqua: "b",
	red: "c",
	light_purple: "d",
	yellow: "e",
	white: "f",
};
function chatToLegacyString(chat: ChatSchema) {
	let special = "§";
	let str = "";
	if (chat.color) str += special + colorMap[chat.color];
	if (chat.bold) str += special + "l";
	if (chat.italic) str += special + "o";
	if (chat.underlined) str += special + "n";

	str += chat.text;
	if (chat.extra) {
		for (let i = 0; i < chat.extra.length; i++) {
			str += chatToLegacyString(chat.extra[i]);
		}
	}
	return str;
}

export class EaglerProxy {
	loggedIn: boolean = false;
	handshook: boolean = false;
	decompressor = new Decompressor();
	compressor = new Compressor();
	decryptor = new Decryptor();
	encryptor = new Encryptor();

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
						// eagler specific packet, return server version 3
						this.eagler.write(fakever);
						return;
					case Serverbound.EAG_RequestLogin:
						let username = packet.readString();
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
						this.state = State.Login;

						let handshake = new Packet(Serverbound.Handshake);
						handshake.writeVarInt(MINECRAFT_PROTOCOL_VERSION);
						handshake.writeString(this.serverAddress);
						handshake.writeUShort(this.serverPort);
						handshake.writeVarInt(State.Login);
						this.net.write(handshake);

						let loginstart = new Packet(Serverbound.LoginStart);
						loginstart.writeString(this.username);
						this.net.write(loginstart);
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
					case Serverbound.PluginMessage:
						let tag = packet.readString();
						if (tag.startsWith("EAG|")) {
							if (tag == "EAG|Skins-1.8" || tag == "EAG|Capes-1.8") {
								let isCape = tag[4] == "C";
								let data = packet.take(packet.length);
								handleSkinCape(isCape, data).then((buf) => {
									if (buf.length == 0) {
										return;
									}
									let resp = new Packet(Clientbound.PluginMessage);
									resp.writeString(tag);
									resp.extend(buf);
									this.eagler.write(resp);
								});
							}
							break;
						}
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
							else if (body.description.extra) {
								response.data.motd = [chatToLegacyString(body.description)];
							} else response.data.motd = [body.description.text];

						if (body.favicon) {
							response.data.icon = true;
							let image = new Image();
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
							image.src = body.favicon;
						}

						this.eagler.write(JSON.stringify(response));
						break;
					case Clientbound.PongResponse:
						let time = packet.readLong();
						break;
					default:
						console.error("Unhandled status packet: " + pk);
				}
				break;
			case State.Login:
				switch (pk) {
					case Clientbound.Disconnect:
						console.error("Disconnect during login: " + packet.readString());
						// TODO forward to eagler
						break;
					case Clientbound.LoginSuccess:
						this.realUuid = packet.readString();
						this.state = State.Play;
						let eag = new Packet(Clientbound.EAG_FinishLogin);
						this.eagler.write(eag);
						break;
					case Clientbound.SetCompression:
						let threshold = packet.readVarInt()!;
						this.decompressor.compressionThresh = threshold;
						this.compressor.compressionThresh = threshold;
						break;
					case Clientbound.EncryptionRequest:
						{
							packet.readString();
							let publicKey = packet.readVariableData();
							let verifyToken = packet.readVariableData();

							let sharedSecret = makeSharedSecret();
							let digest = await mchash(new Uint8Array([...sharedSecret, ...publicKey.inner]));

							const [modulus, exponent] = await loadKey(publicKey.inner);
							let encrypedSecret = encryptRSA(sharedSecret, modulus, exponent);
							let encryptedChallenge = encryptRSA(
								verifyToken.inner,
								modulus,
								exponent,
							);

							await joinServer(
								"token_here",
								digest,
								"uuid_no_dashes_here",
							);

							let response = new Packet(Serverbound.EncryptionResponse);
							response.writeVariableData(new Buffer(encrypedSecret));
							response.writeVariableData(new Buffer(encryptedChallenge));
							await this.net.write(response);

							this.encryptor.seed(sharedSecret);
							this.decryptor.seed(sharedSecret);
						}
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
					case Clientbound.PluginMessage:
						let fard = Buffer.new();
						fard.extend(packet);
						let tag = fard.readString();
						if (tag.startsWith("EAG|")) {
							break;
						}
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

const nativeFetch = fetch;
window.fetch = async function(url: RequestInfo | URL, init?: RequestInit) {
	try {
		return await nativeFetch(url, init);
	} catch (e) {
		return await epoxyFetch("" + url, init);
	}
};

let eagoptions;
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
