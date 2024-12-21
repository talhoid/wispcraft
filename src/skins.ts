import { Buffer } from "./buffer";
import { fetch } from "./connection/epoxy";
import { bytesToUuid } from "./crypto";

export async function handleSkinCape(
	isCapeNotSkin: boolean,
	packet: Buffer
): Promise<Buffer> {
	const id = packet.take(1).get(0);
	if (isCapeNotSkin) {
		if (id == 0x03) {
			const uuid = bytesToUuid(packet.take(16).toArray());
			// todo: look up uuid in cache, return skin
			return Buffer.new();
		} else if (id == 0x06) {
			const uuid = bytesToUuid(packet.take(16).toArray());
			const url = packet.readString();
			// todo: look up url in cache, return skin
			return Buffer.new();
		}
	} else if (id == 0x03) {
		const uuid = bytesToUuid(packet.take(16).toArray());
		// todo: look up uuid in cache, return cape
		return Buffer.new();
	}
	return Buffer.new();
}
