function ba2ab(byteArray) {
	const arrayBuffer = new ArrayBuffer(byteArray.length);
	const uint8Array = new Uint8Array(arrayBuffer);

	for (let i = 0; i < byteArray.length; i++) {
		uint8Array[i] = byteArray[i];
	}

	return arrayBuffer;
}
function makePacket(packetId, dataByteArray) {
	const packetIdVarInt = makeVarInt(packetId);
	return [
		...makeVarInt(packetIdVarInt.length + dataByteArray.length),
		...packetIdVarInt,
		...dataByteArray,
	];
}
function makeString(str) {
	const bytes = new TextEncoder().encode(str);
	return [...makeVarInt(bytes.length), ...bytes];
}
function makeShort(x) {
	return [x & 0xff, (x >> 8) & 0xff];
}
function makeVarInt(value) {
	const buffer = [];
	while (value > 127) {
		buffer.push((value & 127) | 128);
		value >>>= 7;
	}
	buffer.push(value);
	return buffer;
}
function readVarInt(buffer) {
	let index = 0;
	let result = 0;
	let shift = 0;
	let byte;

	do {
		if (index >= buffer.length) {
			return [];
		}
		byte = buffer[index++];
		result |= (byte & 127) << shift;
		shift += 7;
	} while (byte >= 128);

	return [result, index];
}
async function makeCompressedPacket(packetId, dataByteArray, thresh) {
	const toCompress = [...makeVarInt(packetId), ...dataByteArray];
	if (thresh >= 0 && toCompress.length > thresh) {
		const lenUncompressed = makeVarInt(toCompress.length);
		const stream = new Blob([new Uint8Array(ba2ab(toCompress))]).stream();
		const compressedStream = stream.pipeThrough(
			new CompressionStream("deflate")
		);
		const chunks = [];
		for await (const chunk of compressedStream) {
			chunks.push(...chunk);
		}
		return [
			...makeVarInt(lenUncompressed.length + chunks.length),
			...lenUncompressed,
			...chunks,
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

export {
	ba2ab,
	makePacket,
	makeString,
	makeShort,
	makeVarInt,
	readVarInt,
	makeCompressedPacket,
};
