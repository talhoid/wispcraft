export class AsyncQueue {
	constructor(max_size) {
		this.max_size = max_size;
		this.queue = [];
		this.put_callbacks = [];
		this.get_callbacks = [];
	}

	put_now(data) {
		this.queue.push(data);
		this.get_callbacks.shift()?.();
	}

	async put(data) {
		if (this.size <= this.max_size) {
			this.put_now(data);
			return;
		}

		//wait until there is a place to put the item
		await new Promise((resolve) => {
			this.put_callbacks.push(resolve);
		});
		this.put_now(data);
	}

	get_now() {
		this.put_callbacks.shift()?.();
		return this.queue.shift();
	}

	async get() {
		if (this.size > 0) {
			return this.get_now();
		}

		//wait until there is an item available in the queue
		await new Promise((resolve) => {
			this.get_callbacks.push(resolve);
		});
		return this.get_now();
	}

	close() {
		this.queue = [];
		let callback;
		//resolve all pending operations
		while ((callback = this.get_callbacks.shift())) callback();
		while ((callback = this.put_callbacks.shift())) callback();
	}

	get size() {
		return this.queue.length;
	}
}
