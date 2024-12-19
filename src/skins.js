import { bytesToUuid } from './packet/util';

function makeImageData(width, height) {
    const canvas = new document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas.getContext("2d").getImageData(0, 0, width, height).data;
}

async function blobToImageData(blob) {
    return await new Promise((r) => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const image = new Image();
        image.onload = function() {
            canvas.width = image.width;
            canvas.height = image.height;
            ctx.drawImage(image, 0, 0);
            r(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
        }
        image.srcObject = blob;
    });
}

function copyRawPixels(imageIn, imageOut, dx1, dy1, dx2, dy2, sx1, sy1, sx2, sy2) {
    let srcX = dx1,
        srcY = sy1,
        dstX = dx2,
        dstY = dy1,
        width = sx2 - sx1,
        height = sy2 - sy1,
        imgSrcWidth = imageIn.width,
        imgDstWidth = imageOut.height,
        flip = dx1 > dx2;
        
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let srcIndex = (srcY + y) * imgSrcWidth + srcX + x;

            if (flip) {
                srcIndex = (srcY + y) * imgSrcWidth + srcX + (width - x - 1);
            }

            const i = srcIndex * 4;

            const r = imageIn.data[i],
                g = imageIn.data[i + 1],
                b = imageIn.data[i + 2],
                a = imageIn.data[i + 3];
            
            const di = ((dstY + y) * width) + ((dstX + x) * 4);
            imageOut.data[di] = r;
            imageOut.data[di + 1] = g;
            imageOut.data[di + 2] = b;
            imageOut.data[di + 3] = a;
        }
    }
    
    return imageOut;
}

async function toEaglerSkin(blob) {
    let jimpImage = await blobToImageData(blob),
        height = jimpImage.height;
    if (height != 64) {
        // assume 32 height skin
        let imageOut = makeImageData(64, 64);

        for (let i = 0; i < jimpImage.data.length; i++) {
            imageOut.data[i] = jimpImage.data[i];
        }

        imageOut = await copyRawPixels(jimpImage, imageOut, 24, 48, 20, 52, 4, 16, 8, 20);
        imageOut = await copyRawPixels(jimpImage, imageOut, 28, 48, 24, 52, 8, 16, 12, 20);
        imageOut = await copyRawPixels(jimpImage, imageOut, 20, 52, 16, 64, 8, 20, 12, 32);
        imageOut = await copyRawPixels(jimpImage, imageOut, 24, 52, 20, 64, 4, 20, 8, 32);
        imageOut = await copyRawPixels(jimpImage, imageOut, 28, 52, 24, 64, 0, 20, 4, 32);
        imageOut = await copyRawPixels(jimpImage, imageOut, 32, 52, 28, 64, 12, 20, 16, 32);
        imageOut = await copyRawPixels(jimpImage, imageOut, 40, 48, 36, 52, 44, 16, 48, 20);
        imageOut = await copyRawPixels(jimpImage, imageOut, 44, 48, 40, 52, 48, 16, 52, 20);
        imageOut = await copyRawPixels(jimpImage, imageOut, 36, 52, 32, 64, 48, 20, 52, 32);
        imageOut = await copyRawPixels(jimpImage, imageOut, 40, 52, 36, 64, 44, 20, 48, 32);
        imageOut = await copyRawPixels(jimpImage, imageOut, 44, 52, 40, 64, 40, 20, 44, 32);
        imageOut = await copyRawPixels(jimpImage, imageOut, 48, 52, 44, 64, 52, 20, 56, 32);

        jimpImage = imageOut;
    }

    const newBuff = new Uint8Array(16384);
    const bitmap = jimpImage.data;
    for (let i = 1; i < 64 ** 2; i++) {
        const bytePos = i * 4;
        // red, green, blue, alpha => alpha, blue, green, red
        newBuff[bytePos] = bitmap[bytePos + 3];
        newBuff[bytePos + 1] = bitmap[bytePos + 2];
        newBuff[bytePos + 2] = bitmap[bytePos + 1];
        newBuff[bytePos + 3] = bitmap[bytePos];
    }
    return newBuff;
}

async function lookUpInCache(uuidOrUrl, isCapeNotSkin, wispConn) {
    const response = await caches.match(uuidOrUrl);
    if (response !== undefined) {
        return response;
    }
    let url, slim = false;
    try {
        new URL(uuidOrUrl);
        url = uuidOrUrl;
    } catch (e) {
        const response = (await (await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuidOrUrl}`)).json());
        const parsed = JSON.parse(Buffer.from(response.properties[0].value, "base64").toString());
        if (isCapeNotSkin) {
            url = parsed.textures.CAPE?.url;
        } else {
            url = parsed.textures.SKIN.url;
            slim = parsed.metadata?.model == "slim";
        }
    }
    const domain = new URL(url).hostname.toLowerCase();
    if (domain != "textures.minecraft.net") {
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
            const resp = await lookUpInCache(uuid, isCapeNotSkin, wispConn);
            if (resp.body == null) {
                return;
            }
            // todo: cache these as well!!
            const skinBuff = toEaglerSkin(await resp.blob());
            callback([0x05, ...packet.slice(1), resp.statusText == "slim" ? 1 : 0, ...skinBuff]);
        } else if (packet[0] == 0x06) {
            const temp = packet.slice(17);
            const url = new TextDecoder().decode(temp.slice(2, (temp[1] << 8) | temp[0]));
            const resp = await lookUpInCache(url, isCapeNotSkin, wispConn);
            if (resp.body == null) {
                return;
            }
            // todo: cache these as well!!
            const skinBuff = toEaglerSkin(await resp.blob());
            callback([0x05, ...packet.slice(1, 17), resp.statusText == "slim" ? 1 : 0, ...skinBuff]);
        }
    } else if (packet[0] == 0x03) {
        // cape by uuid
        return; // TODO!! need to look up and convert cape format too...
        const uuid = bytesToUuid(packet.slice(1));
        const resp = await lookUpInCache(uuid, isCapeNotSkin, wispConn);
        if (resp.body == null) {
            return;
        }
        callback([0x05, ...packet.slice(1), /* customCape byte[1173] */]);
    }
}