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

enum Serverbound {
	/* ==HANDSHAKING== */
	Handshake = 0x0,
	/* ==LOGIN== */
	LoginStart = 0x0,
	EncryptionResponse = 0x01,
	/* ==PLAY== */
}

enum Clientbound {
	/* --LOGIN-- */
	Disconnect = 0x0,
	EncryptionRequest = 0x01,
	LoginSuccess = 0x02,
	SetCompression = 0x03,
}

export class EaglerProxy {
	loggedIn: boolean = false;
	handshook: boolean = false;
	decompressor = new Decompressor();

	state: State = State.Handshaking;

	// consumes packets from eagler, sends them to the upstream server
	async eaglerRead(packet: Buffer, epoxyWrite: BytesWriter) {
		console.log(packet);
		switch (this.state) {
			case State.Handshaking:
				switch (packet.readVarInt()) {
					case Serverbound.Handshake:
						const protocolVersion = packet.readVarInt();
						const serverAddress = packet.readString();
						const serverPort = packet.readUShort();
						const nextState = packet.readVarInt();

						console.log("Handshake", {
							protocolVersion,
							serverAddress,
							serverPort,
							nextState,
						});

						if (nextState == State.Login) {
							this.state = State.Login;
						}
						break;
				}
				break;
			case State.Status:
				break;
			case State.Login:
			case State.Play:
		}
	}

	// consumes packets from the network, sends them to eagler
	async epoxyRead(packet: Buffer, eaglerWrite: BytesWriter) {
		console.log(packet);
	}
}

window.WebSocket = makeFakeWebSocket();
