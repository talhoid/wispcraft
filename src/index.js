import { nativeWebSocket } from "./snapshot";
import { wispWS } from "./connection"
window.WebSocket = class {
    constructor(uri, protos) {
        if (("" + uri).toLowerCase().includes("://java://")) {
            this.impl = new wispWS(uri);
        } else {
            this.impl = new nativeWebSocket(uri, protos);
        }
    }
    get binaryType() {
        return this.impl.binaryType;
    }
    set binaryType(v) {
        this.impl.binaryType = v;
    }
    get readyState() {
        return this.impl.readyState;
    }
    get url() {
        return this.impl.url;
    }
    set onopen(v) {
        this.impl.onopen = v;
    }
    set onclose(v) {
        this.impl.onclose = v;
    }
    set onmessage(v) {
        this.impl.onmessage = v;
    }
    set onerror(v) {
        this.impl.onerror = v;
    }
    close(c) {
        return this.impl.close(c);
    }
    send(p) {
        return this.impl.send(p);
    }
    addEventListener(p1, p2) {
        return this.impl.addEventListener(p1, p2);
    }
    removeEventListener(p1, p2) {
        return this.impl.removeEventListener(p1, p2);
    }
};