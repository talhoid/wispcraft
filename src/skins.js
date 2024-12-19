import { bytesToUuid } from './packet/util';

async function lookUpInCache(uuidOrUrl, isCapeNotSkin) {
    const response = await caches.match(uuidOrUrl);
    if (response !== undefined) {
        return response;
    }
    let url, slim = false;
    try {
        new URL(uuidOrUrl);
        url = uuidOrUrl;
    } catch (e) {
        // todo: look up texture URL by UUID for either skin or cape
        url = "...";
        if (!isCapeNotSkin) {
            slim = false; // todo: this too!!
        }
    }
    const domain = new URL(url).hostname.toLowerCase();
    if (isCapeNotSkin ? domain != "CAPE TEXTURE URL HERE (lowercase!!)" : domain != "textures.minecraft.net") {
        return new Response();
    }
    try {
        const response2 = await fetch(url);
        if (slim) {
            response2.statusText = "slim";
        }
        let responseClone = response2.clone();
        const cache = await caches.open("wispcraft");
        cache.put(uuidOrUrl, responseClone);
        if (uuidOrUrl != url) {
            cache.put(url, responseClone);
        }
        return response2;
    } catch (e) {
        const response2 = new Response();
        let responseClone = response2.clone();
        const cache = await caches.open("wispcraft");
        cache.put(uuidOrUrl, responseClone);
        if (uuidOrUrl != url) {
            cache.put(url, responseClone);
        }
        return response2;
    }
}

// todo: use wispConn for requests...

export async function handleSkinCape(isCapeNotSkin, wispConn, packet, callback) {
    return; // WORK IN PROGRESS!!
    if (isCapeNotSkin) {
        if (packet[0] == 0x03) {
            const uuid = bytesToUuid(packet.slice(1));
            const resp = await lookUpInCache(uuid, isCapeNotSkin);
            if (resp.body == null) {
                return;
            }
            callback([0x05, ...packet.slice(1), resp.statusText == "slim" ? 1 : 0, /* customSkin byte[16384] */]);
        } else if (packet[0] == 0x06) {
            const temp = packet.slice(17);
            const url = new TextDecoder().decode(temp.slice(2, (temp[1] << 8) | temp[0]));
            const resp = await lookUpInCache(url, isCapeNotSkin);
            if (resp.body == null) {
                return;
            }
            callback([0x05, ...packet.slice(1, 17), resp.statusText == "slim" ? 1 : 0, /* customSkin byte[16384] */]);
        }
    } else if (packet[0] == 0x03) {
        // cape by uuid
        const uuid = bytesToUuid(packet.slice(1));
        const resp = await lookUpInCache(uuid, isCapeNotSkin);
        if (resp.body == null) {
            return;
        }
        callback([0x05, ...packet.slice(1), /* customCape byte[1173] */]);
    }
}