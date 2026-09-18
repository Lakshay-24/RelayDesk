#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const launcherCandidates = [
    process.env.RELAYDESK_LAUNCHER_PATH,
    path.resolve(here, "..", "..", "..", "launcher.js"),
    path.resolve(here, "..", "launcher.js"),
    path.join(here, "launcher.js")
].filter(Boolean);
const launcherEntry = launcherCandidates.find((value) => fs.existsSync(value)) ?? launcherCandidates[0];
const nodePath = process.execPath;
const action = (process.argv[2] || "install").toLowerCase();
const SERVICE_ARG = "--service";
function escXml(value) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function systemdArg(value) { return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }
function run(command, args) {
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}
function tryRun(command, args) { return spawnSync(command, args, { stdio: "ignore" }).status === 0; }
function ensureAgent() { if (!launcherEntry || !fs.existsSync(launcherEntry)) throw new Error(`RelayDesk launcher not found. Checked: ${launcherCandidates.join(", ")}`); }
function installLinux() {
    const root = typeof process.getuid === "function" && process.getuid() === 0;
    const dir = root ? "/etc/systemd/system" : path.join(os.homedir(), ".config", "systemd", "user");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "relaydesk-agent.service");
    fs.writeFileSync(file, `[Unit]\nDescription=RelayDesk background agent\nAfter=network-online.target\nWants=network-online.target\nStartLimitIntervalSec=0\n\n[Service]\nType=simple\nExecStart=${systemdArg(nodePath)} ${systemdArg(launcherEntry)} ${SERVICE_ARG}\nRestart=on-failure\nRestartSec=5\nEnvironment=NODE_ENV=production\n\n[Install]\nWantedBy=${root ? "multi-user.target" : "default.target"}\n`);
    const prefix = root ? [] : ["--user"];
    run("systemctl", [...prefix, "daemon-reload"]);
    run("systemctl", [...prefix, "enable", "--now", "relaydesk-agent.service"]);
    if (!root) tryRun("loginctl", ["enable-linger", os.userInfo().username]);
    console.log(`RelayDesk is running as a ${root ? "system" : "user"} systemd service with automatic restart and refresh.`);
}
function uninstallLinux() {
    const root = typeof process.getuid === "function" && process.getuid() === 0;
    const prefix = root ? [] : ["--user"];
    spawnSync("systemctl", [...prefix, "disable", "--now", "relaydesk-agent.service"], { stdio: "inherit" });
    const file = root ? "/etc/systemd/system/relaydesk-agent.service" : path.join(os.homedir(), ".config", "systemd", "user", "relaydesk-agent.service");
    try { fs.unlinkSync(file); } catch {}
    spawnSync("systemctl", [...prefix, "daemon-reload"], { stdio: "ignore" });
}
function installMac() {
    const dir = path.join(os.homedir(), "Library", "LaunchAgents"); fs.mkdirSync(dir, { recursive: true });
    const logs = path.join(os.homedir(), "Library", "Logs", "RelayDesk"); fs.mkdirSync(logs, { recursive: true });
    const file = path.join(dir, "com.relaydesk.agent.plist");
    fs.writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>com.relaydesk.agent</string><key>ProgramArguments</key><array><string>${escXml(nodePath)}</string><string>${escXml(launcherEntry)}</string><string>${SERVICE_ARG}</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ProcessType</key><string>Background</string><key>StandardOutPath</key><string>${escXml(path.join(logs, "agent.log"))}</string><key>StandardErrorPath</key><string>${escXml(path.join(logs, "agent-error.log"))}</string></dict></plist>`);
    const uid = process.getuid?.() ?? 0;
    spawnSync("launchctl", ["bootout", `gui/${uid}`, file], { stdio: "ignore" });
    run("launchctl", ["bootstrap", `gui/${uid}`, file]);
    console.log("RelayDesk is running as a macOS LaunchAgent with automatic restart and refresh.");
}
function uninstallMac() {
    const file = path.join(os.homedir(), "Library", "LaunchAgents", "com.relaydesk.agent.plist");
    const uid = process.getuid?.() ?? 0;
    spawnSync("launchctl", ["bootout", `gui/${uid}`, file], { stdio: "ignore" });
    try { fs.unlinkSync(file); } catch {}
}
function installWindows() {
    const taskName = "RelayDesk Agent";
    const envUser = String(process.env.USERNAME || "");
    const envDomain = String(process.env.USERDOMAIN || "");
    const detectedUser = [envDomain, envUser].filter(Boolean).join("\\") || os.userInfo().username;
    const serviceAccount = /^(SYSTEM|LOCAL SERVICE|NETWORK SERVICE)$/i.test(envUser) || envUser.endsWith("$");
    if (serviceAccount) {
        const psQuote = (value) => value.replace(/'/g, "''");
        const temp = path.join(os.tmpdir(), `relaydesk-agent-${process.pid}.ps1`);
        const script = `$ErrorActionPreference='Stop'
$action=New-ScheduledTaskAction -Execute '${psQuote(nodePath)}' -Argument '"${psQuote(launcherEntry)}" ${SERVICE_ARG}'
$trigger=New-ScheduledTaskTrigger -AtStartup
$principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName '${taskName}' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName '${taskName}'
`;
        fs.writeFileSync(temp, script, { encoding: "utf8" });
        try {
            spawnSync("schtasks.exe", ["/End", "/TN", taskName], { stdio: "ignore" });
            run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", temp]);
        } finally { try { fs.unlinkSync(temp); } catch {} }
        console.log("RelayDesk is running as a hidden Windows SYSTEM scheduled task with restart-on-failure, boot recovery and automatic refresh.");
        return;
    }
    const user = detectedUser;
    const temp = path.join(os.tmpdir(), `relaydesk-agent-${process.pid}.xml`);
    const xml = `<?xml version="1.0" encoding="UTF-16"?>\r\n<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><RegistrationInfo><Description>RelayDesk persistent background agent</Description></RegistrationInfo><Triggers><BootTrigger><Enabled>true</Enabled><Delay>PT2M</Delay></BootTrigger><LogonTrigger><Enabled>true</Enabled><UserId>${escXml(user)}</UserId><Delay>PT30S</Delay></LogonTrigger></Triggers><Principals><Principal id="Author"><UserId>${escXml(user)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>HighestAvailable</RunLevel></Principal></Principals><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>true</AllowHardTerminate><StartWhenAvailable>true</StartWhenAvailable><RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable><IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings><AllowStartOnDemand>true</AllowStartOnDemand><Enabled>true</Enabled><Hidden>true</Hidden><RunOnlyIfIdle>false</RunOnlyIfIdle><WakeToRun>false</WakeToRun><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><Priority>7</Priority><RestartOnFailure><Interval>PT1M</Interval><Count>5</Count></RestartOnFailure></Settings><Actions Context="Author"><Exec><Command>${escXml(nodePath)}</Command><Arguments>${escXml(`"${launcherEntry}" ${SERVICE_ARG}`)}</Arguments></Exec></Actions></Task>`;
    fs.writeFileSync(temp, "\ufeff" + xml, { encoding: "utf16le" });
    try {
        spawnSync("schtasks.exe", ["/End", "/TN", taskName], { stdio: "ignore" });
        run("schtasks.exe", ["/Create", "/F", "/TN", taskName, "/XML", temp]);
        run("schtasks.exe", ["/Run", "/TN", taskName]);
    } finally { try { fs.unlinkSync(temp); } catch {} }
    console.log("RelayDesk is running as a hidden Windows scheduled task with restart-on-failure, boot/logon recovery and automatic refresh.");
}
function uninstallWindows() {
    spawnSync("schtasks.exe", ["/End", "/TN", "RelayDesk Agent"], { stdio: "ignore" });
    spawnSync("schtasks.exe", ["/Delete", "/F", "/TN", "RelayDesk Agent"], { stdio: "inherit" });
}
ensureAgent();
try {
    const remove = action === "uninstall" || action === "remove";
    if (process.platform === "win32") remove ? uninstallWindows() : installWindows();
    else if (process.platform === "darwin") remove ? uninstallMac() : installMac();
    else remove ? uninstallLinux() : installLinux();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
