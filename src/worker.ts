import { Connection } from "./connection";

let conn: Connection;

self.onmessage = ({ data }) => {
	if (data.ping) {
		conn.ping();
		return;
	}
	if (data.close) {
		conn.eaglerIn.close();
		return;
	}

	console.log(data);
	conn = new Connection(data.uri, data.wisp, data.authstore);
	conn.forward(() => {
		self.postMessage(
			{
				type: "open",
				eaglerIn: conn.eaglerIn,
				eaglerOut: conn.eaglerOut,
			},
			// @ts-ignore
			[conn.eaglerIn, conn.eaglerOut],
		);
	});
};
