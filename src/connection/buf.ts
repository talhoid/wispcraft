export class Buffer {
	inner: Uint8Array;

	static new(): Buffer {
		return new Buffer(new Uint8Array());
	}

	constructor(inner: Uint8Array) {
		this.inner = inner;
	}

	// precious allocations...
	take(cnt: number): Buffer {
		const ret = this.inner.slice(0, cnt);
		this.inner = ret.slice(cnt);
		return new Buffer(ret);
	}

	extend(buf: Buffer) {
		this.inner.set(buf.inner, this.inner.length);
	}

	get length(): number {
		return this.inner.length;
	}

	// you can probably make this better
	readVarInt(): number | undefined {
		let index = 0;
		let result = 0;
		let shift = 0;
		let byte: number;

		do {
			if (index >= this.inner.length) {
				return;
			}
			byte = this.inner[index++];
			result |= (byte & 127) << shift;
			shift += 7;
		} while (byte >= 128);

		this.take(index);
		return result;
	}
}
