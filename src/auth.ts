import { fetch } from "./connection/epoxy";

// https://gist.github.com/Plagiatus/ce5f18bc010395fc45d8553905e10f55
export interface UserInfo {
	id: string,
	name: string,
	skins: SkinInfo[],
	capes: CapeInfo[]
}
export interface AccessoryInfo {
	id: string,
	state: "ACTIVE" | "INACTIVE",
	url: string,
}
export interface SkinInfo extends AccessoryInfo {
	variant: string,
}
export interface CapeInfo extends AccessoryInfo {
	alias: string,
}

async function xboxAuth(msToken: string): Promise<string> {
	const res = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
		headers: {
			"Content-Type": "application/json",
			"Accept": "application/json",
		},
		method: "POST",
		body: JSON.stringify({
			"Properties": {
				"AuthMethod": "RPS",
				"SiteName": "user.auth.xboxlive.com",
				"RpsTicket": `d=${msToken}`
			},
			"RelyingParty": "https://auth.xboxlive.com",
			"TokenType": "JWT"
		})
	});
	const json = await res.json();
	if (!json["Token"]) throw new Error("xbox live did not return a token");

	return json["Token"];
}

async function xstsAuth(xboxToken: string): Promise<{ token: string, userHash: string }> {
	const res = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
		headers: {
			"Content-Type": "application/json",
			"Accept": "application/json",
		},
		method: "POST",
		body: JSON.stringify({
			"Properties": {
				"SandboxId": "RETAIL",
				"UserTokens": [xboxToken],
			},
			"RelyingParty": "rp://api.minecraftservices.com/",
			"TokenType": "JWT"
		})
	});
	const json = await res.json();

	const xboxError = json["XErr"];
	if (xboxError) {
		switch (xboxError) {
			case 2148916227:
				throw new Error("xsts says this account is banned from xbox");
			case 2148916233:
				throw new Error("xsts says this account does not have a xbox account");
			case 2148916235:
				throw new Error("xsts says xbox live is not available in this account's country");
			case 2148916236:
			case 2148916237:
				throw new Error("xsts says this account needs adult verification");
			case 2148916238:
				throw new Error("xsts says this account is under 18 and needs to be added to a family");
			case 2148916262:
			default:
				throw new Error(`xsts error: ${xboxError}`);
		}
	}

	const token = json["Token"]
	if (!token) throw new Error("xsts did not return a token");
	let userHash: string;
	try {
		userHash = json["DisplayClaims"]["xui"][0]["uhs"];
	} catch (err) { throw new Error("xsts did not return user hash"); }

	return { token, userHash, };
}

async function mcAuth(xstsToken: string, xstsHash: string): Promise<string> {
	const res = await fetch("https://api.minecraftservices.com/authentication/login_with_xbox", {
		headers: {
			"Content-Type": "application/json",
			"Accept": "application/json",
		},
		method: "POST",
		body: JSON.stringify({
			"identityToken": `XBL3.0 x=${xstsHash};${xstsToken}`,
		})
	});
	const json = await res.json();
	const token = json["access_token"];
	if (!token) throw new Error("minecraft did not return a token");

	return token;
}

async function checkOwnership(mcToken: string): Promise<boolean> {
	// TODO (get `https://api.minecraftservices.com/entitlements/mcstore` with bearer auth)
	return true;
}

export async function getProfile(mcToken: string): Promise<UserInfo> {
	const res = await fetch("https://api.minecraftservices.com/minecraft/profile", {
		headers: {
			"Authorization": `Bearer ${mcToken}`,
		},
	});
	const json = await res.json();
	if (!json["id"] || !json["name"]) throw new Error("mc did not return a profile");

	return json;
}

export async function minecraftAuth(msToken: string): Promise<string> {
	const xboxToken = await xboxAuth(msToken);
	const xstsInfo = await xstsAuth(xboxToken);
	return mcAuth(xstsInfo.token, xstsInfo.userHash);
}
