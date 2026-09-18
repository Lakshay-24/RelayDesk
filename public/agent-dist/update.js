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
function npmPath() { return path.join(path.dirname(process.execPath), process.platform === "win32" ? "npm.cmd" : "npm"); }
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
    for (const [name,file] of staged) {
      const dest = target(name);
      const backup = `${dest}.relaydesk-backup-${process.pid}`;
      if (fs.existsSync(dest)) { fs.copyFileSync(dest,backup); backups.set(dest,backup); }
      fs.copyFileSync(file,`${dest}.new`);
      fs.renameSync(`${dest}.new`,dest);
    }
    const packageChanged = manifest.files["package.json"] && backups.has(path.join(agentRoot,"package.json"));
    if (packageChanged) {
      const npm = npmPath();
      const install = spawnSync(npm,["install","--omit=dev","--no-audit","--no-fund"],{cwd:agentRoot,stdio:"inherit",shell:process.platform==="win32"});
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
