import { loadCredentials } from "./credentials.js";
const DEFAULT_URL = "https://atuvyeoctkevglimkmka.supabase.co";
export function config(env = process.env) {
    const stored = loadCredentials(env);
    const defaultCommand = process.platform === "win32" ? "npx.cmd" : "npx";
    const desktopCommand = env.RCO_DESKTOP_COMMANDER_COMMAND || defaultCommand;
    let desktopArgs = ["-y", "@wonderwhy-er/desktop-commander@latest"];
    if (env.RCO_DESKTOP_COMMANDER_ARGS_JSON) {
        const parsed = JSON.parse(env.RCO_DESKTOP_COMMANDER_ARGS_JSON);
        if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
            throw new Error("RCO_DESKTOP_COMMANDER_ARGS_JSON must be a JSON array of strings");
        }
        desktopArgs = parsed;
    }
    const deviceToken = env.RCO_DEVICE_TOKEN || stored?.deviceToken;
    if (!deviceToken)
        throw new Error("RelayDesk is not paired. Run relaydesk-pair first or set RCO_DEVICE_TOKEN.");
    const parsedConcurrency = Number(env.RCO_AGENT_MAX_CONCURRENCY || 2);
    const maxConcurrency = Number.isFinite(parsedConcurrency) ? Math.max(1, Math.min(Math.trunc(parsedConcurrency), 8)) : 2;
    return {
        url: env.SUPABASE_URL || stored?.url || DEFAULT_URL,
        deviceToken,
        desktopCommand,
        desktopArgs,
        maxConcurrency
    };
}
