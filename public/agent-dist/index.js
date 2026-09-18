import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import os from "node:os";
import { config } from "./config.js";
const cfg = config();
const channelUrl = `${cfg.url}/functions/v1/device-channel`;
const transport = new StdioClientTransport({ command: cfg.desktopCommand, args: cfg.desktopArgs });
const desktop = new Client({ name: "relaydesk-agent", version: "0.3.0" });
await desktop.connect(transport);
const listed = await desktop.listTools();
let shuttingDown = false;
let deviceId = "";
let lastHeartbeat = 0;
class DeviceAuthError extends Error {}
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const supervised = process.argv.includes("--service");
const supervisedRestartMs = Math.max(60_000, Number(process.env.RCO_AGENT_AUTO_RESTART_MS || 86_400_000));
async function post(body, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(channelUrl, {
            method: "POST",
            headers: { "authorization": `Bearer ${cfg.deviceToken}`, "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 403)
            throw new DeviceAuthError("RelayDesk device credential was revoked or is no longer valid. Pair this device again.");
        if (!response.ok)
            throw new Error(payload.error ?? `device channel HTTP ${response.status}`);
        return payload;
    } finally { clearTimeout(timer); }
}
async function hello() {
    const result = await post({
        action: "hello", hostname: os.hostname(), platform: process.platform,
        agent_version: "0.3.0", tools: listed.tools
    });
    deviceId = result.device_id;
    lastHeartbeat = Date.now();
}
async function heartbeatIfDue() {
    if (Date.now() - lastHeartbeat < 20000) return;
    await post({ action: "heartbeat" });
    lastHeartbeat = Date.now();
}
async function complete(commandId, result, error) {
    let delay = 400;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            await post({ action: "complete", command_id: commandId, result, error: error ? String(error) : undefined });
            return;
        } catch (e) {
            if (e instanceof DeviceAuthError) throw e;
            if (attempt === 4) throw e;
            await sleep(delay);
            delay = Math.min(delay * 2, 4000);
        }
    }
}
async function shutdownAgent() {
    if (shuttingDown) return;
    shuttingDown = true;
    try { await post({ action: "offline" }, 5000); } catch {}
    await desktop.close();
}
async function execute(command) {
    try {
        if (command.tool_name === "__relaydesk_ping") {
            await complete(command.id, { content: [{ type: "text", text: JSON.stringify({ pong: true, timestamp: new Date().toISOString(), hostname: os.hostname() }) }] });
            return;
        }
        if (command.tool_name === "__relaydesk_shutdown") {
            await complete(command.id, { content: [{ type: "text", text: "Device agent shutting down." }] });
            await shutdownAgent();
            process.exit(0);
        }
        const result = await desktop.callTool({ name: command.tool_name, arguments: command.arguments ?? {} });
        await complete(command.id, result);
    } catch (error) {
        if (error instanceof DeviceAuthError) throw error;
        await complete(command.id, undefined, error instanceof Error ? error.stack ?? error.message : String(error));
    }
}
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => { await shutdownAgent(); process.exit(0); });
}
if (supervised) {
    const jitter = Math.floor(Math.random() * 15 * 60_000);
    const timer = setTimeout(async () => {
        console.log("RelayDesk supervised refresh: restarting to pick up compatible engine updates.");
        await shutdownAgent();
        process.exit(75);
    }, supervisedRestartMs + jitter);
    timer.unref();
}
await hello();
console.log(`relaydesk ready: ${os.hostname()} (${deviceId}) with ${listed.tools.length} tools`);
let transportRetryMs = 1000;
let idlePollMs = 500;
const inFlight = new Set();
let executionFatal = null;
function startExecution(command) {
    let task;
    task = execute(command)
        .catch((error) => { executionFatal = error; })
        .finally(() => { inFlight.delete(task); });
    inFlight.add(task);
}
while (!shuttingDown) {
    try {
        if (executionFatal) throw executionFatal;
        await heartbeatIfDue();
        if (inFlight.size < cfg.maxConcurrency) {
            const slots = cfg.maxConcurrency - inFlight.size;
            const polled = await post({ action: "poll", slots });
            const commands = Array.isArray(polled.commands)
                ? polled.commands
                : (polled.command ? [polled.command] : []);
            transportRetryMs = 1000;
            if (commands.length) {
                idlePollMs = 100;
                for (const command of commands.slice(0, slots))
                    startExecution(command);
                continue;
            }
        }
        idlePollMs = Math.min(Math.round(idlePollMs * 1.25), 1000);
        await sleep(idlePollMs + Math.floor(Math.random() * 100));
    } catch (error) {
        if (error instanceof DeviceAuthError) {
            console.error(error.message);
            process.exitCode = 2;
            break;
        }
        console.error("RelayDesk transport temporarily unavailable; reconnecting automatically:", error);
        await sleep(transportRetryMs + Math.floor(Math.random() * 250));
        transportRetryMs = Math.min(transportRetryMs * 2, 30000);
        try {
            await hello();
            executionFatal = null;
            transportRetryMs = 1000;
            idlePollMs = 250;
            console.log("RelayDesk connection restored.");
        } catch (reconnectError) {
            if (reconnectError instanceof DeviceAuthError) {
                console.error(reconnectError.message);
                process.exitCode = 2;
                break;
            }
        }
    }
}
await Promise.allSettled([...inFlight]);
