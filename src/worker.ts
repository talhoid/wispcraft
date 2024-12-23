import { Connection } from "./connection";

let conn: Connection;

export const authInfo = { yggToken: "", user: { id: "" } };

self.onmessage = ({ data }) => {
	if (data.ping) {
		conn.ping();
		return;
	}
	if (data.close) {
		conn.eaglerIn.close();
		return;
	}
	if (data.userProfile) {
		authInfo.yggToken = data.userProfile.yggToken;
		authInfo.user = data.userProfile.user;
		console.log("Got userinfo: ", authInfo);
	}

	conn = new Connection(data.uri);
	conn.forward(() => {
		self.postMessage(
			{
				type: "open",
				eaglerIn: conn.eaglerIn,
				eaglerOut: conn.eaglerOut,
			},
			// @ts-ignore
			[conn.eaglerIn, conn.eaglerOut]
		);
	});
};
