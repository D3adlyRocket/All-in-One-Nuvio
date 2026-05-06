import { NETMIRROR_URL, BASE_HEADERS } from './constants.js';

let globalCookie = "";
let cookieTimestamp = 0;
const COOKIE_EXPIRY = 54000000; // 15 hours

export async function bypass() {
    const now = Date.now();
    if (globalCookie && now - cookieTimestamp < COOKIE_EXPIRY) {
        return globalCookie;
    }

    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });

    const headers = {
        ...BASE_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://net22.cc",
        "Referer": "https://net22.cc/verify2"
    };

    const response = await fetch(`${NETMIRROR_URL}/verify.php`, {
        method: 'POST',
        headers,
        body: `g-recaptcha-response=${uuid}`,
        redirect: 'manual'
    });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
        const match = setCookie.match(/t_hash_t=([^;]+)/);
        if (match) {
            globalCookie = match[1];
            cookieTimestamp = Date.now();
            return globalCookie;
        }
    }
    throw new Error("Failed to extract t_hash_t cookie");
}

export function getUnixTime() {
    return Math.floor(Date.now() / 1000);
}

export function convertRuntimeToMinutes(runtime) {
    if (!runtime) return 0;
    let totalMinutes = 0;
    const parts = runtime.toString().split(" ");
    for (const part of parts) {
        if (part.endsWith("h")) {
            totalMinutes += (parseInt(part.replace("h", "")) || 0) * 60;
        } else if (part.endsWith("m")) {
            totalMinutes += parseInt(part.replace("m", "")) || 0;
        }
    }
    return totalMinutes;
}
