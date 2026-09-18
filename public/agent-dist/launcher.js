#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const agentRoot=process.env.RELAYDESK_AGENT_ROOT || here;
const releasesRoot=path.join(agentRoot,"releases");
const currentFile=path.join(agentRoot,"current.json");
const baseUrl=process.env.RELAYDESK_UPDATE_BASE || "https://relay-desk-mjq6.vercel.app/agent-dist";
const allowed=new Set(["package.json","config.js","credentials.js","index.js","pair.js","service.js"]);
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=(data)=>crypto.createHash("sha256").update(data).digest("hex");

function target(root,name){return name==="package.json"?path.join(root,name):path.join(root,"dist",name);}
function readCurrent(){try{const value=JSON.parse(fs.readFileSync(currentFile,"utf8"));return value?.version?value:null;}catch{return null;}}
function writeCurrent(value){
  fs.mkdirSync(agentRoot,{recursive:true});
  const temp=`${currentFile}.new-${process.pid}`;
  fs.writeFileSync(temp,JSON.stringify(value,null,2)+"\n",{mode:0o600});
  fs.renameSync(temp,currentFile);
}
function npmCliPath(){return path.join(path.dirname(process.execPath),"node_modules","npm","bin","npm-cli.js");}
async function fetchManifest(){
  const response=await fetch(`${baseUrl}/manifest.json`,{cache:"no-store",signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error(`manifest HTTP ${response.status}`);
  const manifest=await response.json();
  if(!manifest?.version||!/^[0-9]+[.][0-9]+[.][0-9]+$/.test(manifest.version)||!manifest.files) throw new Error("invalid update manifest");
  const names=Object.keys(manifest.files).sort();
  const expected=[...allowed].sort();
  if(JSON.stringify(names)!==JSON.stringify(expected)) throw new Error("unexpected release file set");
  for(const digest of Object.values(manifest.files)) if(!/^[a-f0-9]{64}$/.test(String(digest))) throw new Error("invalid release checksum");
  return manifest;
}
function verifyRelease(root,manifest){
  for(const [name,digest] of Object.entries(manifest.files)){
    const file=target(root,name);
    if(!fs.existsSync(file)||hash(fs.readFileSync(file))!==digest) return false;
  }
  return true;
}
async function installRelease(manifest){
  const releaseRoot=path.join(releasesRoot,manifest.version);
  const manifestPath=path.join(releaseRoot,"dist","manifest.json");
  try{
    const local=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
    if(local.version===manifest.version&&verifyRelease(releaseRoot,manifest)) return releaseRoot;
  }catch{}
  fs.mkdirSync(releasesRoot,{recursive:true});
  const staging=path.join(agentRoot,`.staging-${manifest.version}-${process.pid}`);
  fs.rmSync(staging,{recursive:true,force:true});
  fs.mkdirSync(path.join(staging,"dist"),{recursive:true});
  try{
    for(const [name,digest] of Object.entries(manifest.files)){
      const response=await fetch(`${baseUrl}/${name}`,{cache:"no-store",signal:AbortSignal.timeout(20000)});
      if(!response.ok) throw new Error(`${name} HTTP ${response.status}`);
      const data=Buffer.from(await response.arrayBuffer());
      if(hash(data)!==digest) throw new Error(`${name} checksum mismatch`);
      fs.writeFileSync(target(staging,name),data,{mode:0o600});
    }
    const npmCli=npmCliPath();
    if(!fs.existsSync(npmCli)) throw new Error(`npm CLI not found beside RelayDesk runtime: ${npmCli}`);
    const install=spawnSync(process.execPath,[npmCli,"install","--omit=dev","--no-audit","--no-fund"],{cwd:staging,stdio:"inherit"});
    if(install.status!==0) throw new Error(`dependency install failed with exit ${install.status}`);
    fs.writeFileSync(path.join(staging,"dist","manifest.json"),JSON.stringify(manifest,null,2)+"\n",{mode:0o600});
    if(!verifyRelease(staging,manifest)) throw new Error("staged release verification failed");
    fs.rmSync(releaseRoot,{recursive:true,force:true});
    fs.renameSync(staging,releaseRoot);
    return releaseRoot;
  }catch(error){fs.rmSync(staging,{recursive:true,force:true});throw error;}
}
async function refresh(){
  const remote=await fetchManifest();
  const current=readCurrent();
  if(current?.version===remote.version){
    const root=path.join(releasesRoot,current.version);
    if(verifyRelease(root,remote)) return false;
  }
  await installRelease(remote);
  writeCurrent({version:remote.version,previous:current?.version??null});
  return true;
}
function childEntry(version){return path.join(releasesRoot,version,"dist","index.js");}
function childEnv(){
  const env={...process.env};
  const credential=path.join(agentRoot,"credentials.json");
  if(fs.existsSync(credential)) env.RELAYDESK_CREDENTIALS_FILE=credential;
  const runtimeDir=path.dirname(process.execPath);
  env.PATH=env.PATH?runtimeDir+path.delimiter+env.PATH:runtimeDir;
  return env;
}
function runChild(entry){
  return new Promise((resolve,reject)=>{
    const started=Date.now();
    const child=spawn(process.execPath,[entry,"--service"],{stdio:"inherit",env:{...childEnv(),RELAYDESK_LAUNCHED:"1"}});
    child.once("error",reject);
    child.once("exit",(code)=>resolve({code,runtime:Date.now()-started}));
  });
}
function cleanup(current){
  const keep=new Set([current.version,current.previous].filter(Boolean));
  try{for(const name of fs.readdirSync(releasesRoot)) if(!keep.has(name)) fs.rmSync(path.join(releasesRoot,name),{recursive:true,force:true});}catch{}
}

let backoff=1000;
let rolledBack=false;
while(true){
  try{if(await refresh()) console.log("RelayDesk launcher activated a verified release.");}
  catch(error){console.error("RelayDesk update check failed safely; using the current release:",error);}
  const current=readCurrent();
  if(!current) throw new Error("RelayDesk has no verified current release.");
  cleanup(current);
  const entry=childEntry(current.version);
  if(!fs.existsSync(entry)) throw new Error(`RelayDesk current release is missing: ${entry}`);
  const result=await runChild(entry);
  if(result.code===0) process.exit(0);
  if(result.code===75){backoff=1000;rolledBack=false;continue;}
  if(result.runtime<15000&&current.previous&&!rolledBack&&fs.existsSync(childEntry(current.previous))){
    console.error(`RelayDesk release ${current.version} exited early; rolling back to ${current.previous}.`);
    writeCurrent({version:current.previous,previous:current.version});
    rolledBack=true;
    continue;
  }
  console.error(`RelayDesk agent exited with code ${result.code}; restarting in ${backoff}ms.`);
  await sleep(backoff);
  backoff=Math.min(backoff*2,30000);
}
