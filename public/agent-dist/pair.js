import os from "node:os";
import { spawn } from "node:child_process";
import { saveCredentials } from "./credentials.js";
const DEFAULT_URL = "https://atuvyeoctkevglimkmka.supabase.co";
const endpoint = (url) => `${url}/functions/v1/device-pair-code`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function post(url, body) {
    const response = await fetch(endpoint(url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
}
function tryOpen(url) {
    try {
        const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
        const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
        const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
        child.unref();
        return true;
    }
    catch {
        return false;
    }
}
function arg(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
}
async function main() {
    const url = process.env.SUPABASE_URL || DEFAULT_URL;
    const deviceName = arg("--name") || os.hostname();
    const started = await post(url, {
        action: "start",
        device_name: deviceName,
        hostname: os.hostname(),
        platform: process.platform,
    });
    if (!started.response.ok)
        throw new Error(started.payload.error || `pair start HTTP ${started.response.status}`);
    const { device_code, user_code, verification_uri_complete, expires_in, interval } = started.payload;
    console.log("\nRelayDesk device pairing\n");
    console.log(`Device: ${deviceName}`);
    console.log(`Code:   ${user_code}`);
    console.log(`Open:   ${verification_uri_complete}\n`);
    if (!process.env.RELAYDESK_NO_BROWSER)
        tryOpen(verification_uri_complete);
    console.log("Waiting for approval in your browser…");
    const deadline = Date.now() + Number(expires_in || 600) * 1000;
    const pollMs = Math.max(2000, Number(interval || 3) * 1000);
    while (Date.now() < deadline) {
        await sleep(pollMs);
        const exchanged = await post(url, { action: "exchange", device_code });
        if (exchanged.response.ok) {
            const file = saveCredentials({
                url: exchanged.payload.supabase_url || url,
                deviceToken: exchanged.payload.device_token,
                deviceId: exchanged.payload.device_id,
            });
            console.log(`\nPaired successfully. Credentials saved to ${file}`);
            console.log("Start RelayDesk normally; re-pairing is only required after an explicit revoke.\n");
            return;
        }
        if (exchanged.response.status === 428 && exchanged.payload.error === "authorization_pending")
            continue;
        if (exchanged.response.status === 410)
            throw new Error("Pairing code expired. Run pairing again.");
        if (exchanged.response.status === 409 && exchanged.payload.error === "already_consumed") {
            throw new Error("This pairing request was already used. Run pairing again.");
        }
        throw new Error(exchanged.payload.error || `pair exchange HTTP ${exchanged.response.status}`);
    }
    throw new Error("Pairing code expired. Run pairing again.");
}
main().catch((error) => {
    console.error(`RelayDesk pairing failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
