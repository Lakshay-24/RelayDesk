import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const agentRoot = path.dirname(here);
const defaultBase = "https://relay-desk-mjq6.vercel.app/agent-dist";
const allowed = new Set(["config.js","credentials.js","index.js","pair.js","service.js","update.js","package.json"]);
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
function target(name) { return name === "package.json" ? path.join(agentRoot, name) : path.join(here, name); }
function npmCliPath() { return path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"); }
async function remoteManifest(base) {
  const r = await fetch(`${base}/manifest.json`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`manifest HTTP ${r.status}`);
  const m = await r.json();
  if (!m?.version || !m.files || typeof m.files !== "object") throw new Error("invalid update manifest");
  for (const [name,digest] of Object.entries(m.files)) {
    if (!allowed.has(name) || !/^[a-f0-9]{64}$/.test(String(digest))) throw new Error("invalid manifest entry");
  }
  return m;
}
function localVersion() {
  try { return JSON.parse(fs.readFileSync(path.join(here,"manifest.json"),"utf8")).version; } catch { return ""; }
}
export async function maybeSelfUpdate(env = process.env) {
  const base = env.RELAYDESK_UPDATE_BASE || defaultBase;
  const manifest = await remoteManifest(base);
  if (localVersion() === manifest.version) return false;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),"relaydesk-update-"));
  const staged = new Map();
  const backups = new Map();
  try {
    for (const [name,digest] of Object.entries(manifest.files)) {
      const r = await fetch(`${base}/${name}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`${name} HTTP ${r.status}`);
      const data = Buffer.from(await r.arrayBuffer());
      if (hash(data) !== digest) throw new Error(`${name} checksum mismatch`);
      const file = path.join(temp,name);
      fs.writeFileSync(file,data,{mode:0o600});
      staged.set(name,file);
    }
    let installDependencies = false;
    const stagedPackage = staged.get("package.json");
    if (stagedPackage) {
      const currentPackage = target("package.json");
      if (!fs.existsSync(currentPackage)) installDependencies = true;
      else {
        try {
          const current = JSON.parse(fs.readFileSync(currentPackage,"utf8"));
          const next = JSON.parse(fs.readFileSync(stagedPackage,"utf8"));
          installDependencies = JSON.stringify(current.dependencies ?? {}) !== JSON.stringify(next.dependencies ?? {});
        } catch { installDependencies = true; }
      }
    }
    for (const [name,file] of staged) {
      const dest = target(name);
      if (fs.existsSync(dest) && hash(fs.readFileSync(dest)) === hash(fs.readFileSync(file))) continue;
      const backup = `${dest}.relaydesk-backup-${process.pid}`;
      if (fs.existsSync(dest)) { fs.copyFileSync(dest,backup); backups.set(dest,backup); }
      fs.copyFileSync(file,`${dest}.new`);
      fs.renameSync(`${dest}.new`,dest);
    }
    if (installDependencies) {
      const npmCli = npmCliPath();
      if (!fs.existsSync(npmCli)) throw new Error(`npm CLI not found beside RelayDesk Node runtime: ${npmCli}`);
      const install = spawnSync(process.execPath,[npmCli,"install","--omit=dev","--no-audit","--no-fund"],{cwd:agentRoot,stdio:"inherit"});
      if (install.status !== 0) throw new Error(`dependency install failed with exit ${install.status}`);
    }
    fs.writeFileSync(path.join(here,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",{mode:0o600});
    for (const backup of backups.values()) try { fs.unlinkSync(backup); } catch {}
    return true;
  } catch (error) {
    for (const [dest,backup] of [...backups.entries()].reverse()) {
      try { if (fs.existsSync(backup)) { fs.copyFileSync(backup,dest); fs.unlinkSync(backup); } } catch {}
    }
    throw error;
  } finally { try { fs.rmSync(temp,{recursive:true,force:true}); } catch {} }
}
