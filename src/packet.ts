const encoder = new TextEncoder();

export enum Protocol {
	ClientVersion = 0x01,
	ServerVersion = 0x02,
	ClientRequestLogin = 0x04,
	ServerAllowLogin = 0x05,
	ClientProfileData = 0x07,
	ClientFinishLogin = 0x08,
	ServerFinishLogin = 0x09,
}

export function makePacket(packetId: number, dataByteArray: number[]) {
	const packetIdVarInt = makeVarInt(packetId);
	return [
		...makeVarInt(packetIdVarInt.length + dataByteArray.length),
		...packetIdVarInt,
		...dataByteArray,
	];
}

export function makeString(str: string): number[] {
	const bytes = encoder.encode(str);
	return [...makeVarInt(bytes.length), ...bytes];
}

export function makeShort(x: number): number[] {
	return [x & 0xff, (x >> 8) & 0xff];
}

export function makeVarInt(value: number): number[] {
	const buffer: number[] = [];
	while (value > 127) {
		buffer.push((value & 127) | 128);
		value >>>= 7;
	}
	buffer.push(value);
	return buffer;
}

export function readVarInt(buffer: number[]): [number, number] | undefined {
	let index = 0;
	let result = 0;
	let shift = 0;
	let byte: number;

	do {
		if (index >= buffer.length) {
			return;
		}
		byte = buffer[index++];
		result |= (byte & 127) << shift;
		shift += 7;
	} while (byte >= 128);

	return [result, index];
}

export async function makeCompressedPacket(packetId: number, dataByteArray: number[], thresh: number) {
	const toCompress = [...makeVarInt(packetId), ...dataByteArray];
	if (thresh >= 0 && toCompress.length > thresh) {
		const lenUncompressed = makeVarInt(toCompress.length);
		const compressor = new CompressionStream("deflate");

		compressor.writable.getWriter().write(Uint8Array.from(toCompress));

		const data: number[] = [];

		const reader = compressor.readable.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done || !value) break;

			data.push(...value);
		}

		return [
			...makeVarInt(lenUncompressed.length + data.length),
			...lenUncompressed,
			...data,
		];
	} else {
		const lenUncompressed = makeVarInt(0);
		return [
			...makeVarInt(lenUncompressed.length + toCompress.length),
			...lenUncompressed,
			...toCompress,
		];
	}
}

export function bytesToUuid(byteArray: number[]): string {
	let hexString = "";
	for (let i = 0; i < 16; i++) {
		const hex = byteArray[i].toString(16).padStart(2, "0");
		hexString += hex;
	}

	const uuid = `${hexString.slice(0, 8)}-${hexString.slice(8, 12)}-${hexString.slice(12, 16)}-${hexString.slice(16, 20)}-${hexString.slice(20)}`;

	return uuid;
}
