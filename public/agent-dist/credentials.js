import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
export function credentialsPath(env = process.env) {
    if (env.RELAYDESK_CREDENTIALS_FILE)
        return env.RELAYDESK_CREDENTIALS_FILE;
    const versionedInstallCredential = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "credentials.json");
    if (fs.existsSync(versionedInstallCredential))
        return versionedInstallCredential;
    return path.join(os.homedir(), ".relaydesk", "credentials.json");
}
export function loadCredentials(env = process.env) {
    try {
        const raw = fs.readFileSync(credentialsPath(env), "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed.url || !parsed.deviceToken)
            return null;
        return { url: parsed.url, deviceToken: parsed.deviceToken, deviceId: parsed.deviceId };
    }
    catch {
        return null;
    }
}
export function saveCredentials(credentials, env = process.env) {
    const file = credentialsPath(env);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify(credentials, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    try {
        fs.chmodSync(file, 0o600);
    }
    catch { }
    return file;
}
