export class Buffer {
	inner: Uint8Array;

	static new(): Buffer {
		return new Buffer(new Uint8Array());
	}

	constructor(inner: Uint8Array | number[]) {
		if (inner instanceof Uint8Array) {
			this.inner = inner;
		} else {
			this.inner = Uint8Array.from(inner);
		}
	}

	// precious allocations...
	take(cnt: number): Buffer {
		if (this.length < cnt) throw new Error("data too small");

		const ret = this.inner.slice(0, cnt);
		this.inner = ret.slice(cnt);
		return new Buffer(ret);
	}

	extend(buf: Buffer) {
		this.inner.set(buf.inner, this.inner.length);
	}

	get(idx: number): number {
		return this.inner[idx];
	}

	get length(): number {
		return this.inner.length;
	}

	readString(): string {
		const len = this.readVarInt();
		if (!len) throw new Error("data too small");
		const ret = new TextDecoder().decode(this.take(len).inner);
		return ret;
	}

	writeString(str: string) {
		const data = new TextEncoder().encode(str);
		this.writeVarInt(data.length);
		this.extend(new Buffer(data));
	}

	readUShort(): number {
		const ret = this.inner[0] | (this.inner[1] << 8);
		this.take(2);
		return ret;
	}
	writeUShort(num: number) {
		this.extend(new Buffer([num & 0xff, (num >> 8) & 0xff]));
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

	readVariableData(): Buffer {
		const len = this.readVarInt();
		if (!len) throw new Error("data too small");
		return this.take(len);
	}

	writeVarInt(num: number) {
		const buffer: number[] = [];
		while (num > 127) {
			buffer.push((num & 127) | 128);
			num >>>= 7;
		}
		buffer.push(num);
		this.extend(new Buffer(Uint8Array.from(buffer)));
	}

	writeVariableData(data: Buffer) {
		this.writeVarInt(data.length);
		this.extend(data);
	}
}
