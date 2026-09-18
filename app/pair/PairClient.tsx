"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
type DeviceInfo = { user_code:string; device_name:string; hostname:string|null; platform:string|null; expires_at:string; approved:boolean };

function normalize(value:string){
  const raw=value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
  return raw.length>4?`${raw.slice(0,4)}-${raw.slice(4)}`:raw;
}

export default function PairClient({ initialCode, email }:{ initialCode:string; email:string }) {
  const [code,setCode]=useState(normalize(initialCode));
  const [device,setDevice]=useState<DeviceInfo|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [approved,setApproved]=useState(false);

  async function accessToken(){
    const supabase=createClient();
    const {data}=await supabase.auth.getSession();
    if(!data.session) throw new Error("Session expired. Sign in again.");
    return data.session.access_token;
  }

  async function request(action:"inspect"|"approve", selected=code){
    const token=await accessToken();
    const response=await fetch(`${SUPABASE_URL}/functions/v1/device-pair-code`,{
      method:"POST",
      headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},
      body:JSON.stringify({action,user_code:selected})
    });
    const body=await response.json();
    if(!response.ok) throw new Error(body.error==="pairing_not_found"?"Pairing code not found.":body.error==="pairing_expired"?"This pairing code expired. Start pairing again on the device.":body.error??"Pairing request failed.");
    return body;
  }

  async function inspect(selected=code){
    if(selected.replace(/-/g,"").length!==8){setDevice(null);setMessage("Enter the 8-character code shown on the device.");return;}
    setBusy(true);setMessage("");setApproved(false);
    try{setDevice(await request("inspect",selected))}catch(e){setDevice(null);setMessage(e instanceof Error?e.message:"Pairing request failed.")}finally{setBusy(false)}
  }

  useEffect(()=>{if(code.replace(/-/g,"").length===8)void inspect(code)},[]); // eslint-disable-line react-hooks/exhaustive-deps

  async function approve(){
    setBusy(true);setMessage("");
    try{await request("approve");setApproved(true);setMessage("Approved. The device will finish connecting automatically.")}catch(e){setMessage(e instanceof Error?e.message:"Could not approve device.")}finally{setBusy(false)}
  }

  async function anotherAccount(){
    const supabase=createClient();
    await supabase.auth.signOut();
    window.location.assign(`/auth/login?next=${encodeURIComponent(`/pair?code=${code}`)}`);
  }

  return <main className="shell"><section className="card auth-card">
    <Link className="brand" href="/"><img className="brand-mark" src="/relaydesk-mark.svg" alt="" width={34} height={34} /><span>RelayDesk</span></Link>
    <p className="eyebrow">Pair a device</p>
    <h1>Connect this device</h1>
    <p className="lead">Enter the short code shown by the RelayDesk agent on the device you want to connect.</p>
    <p className="small">Need the agent first? <Link href="/install">Install RelayDesk on Windows, macOS, or Linux.</Link></p>
    <label className="field">Pairing code<input value={code} onChange={e=>setCode(normalize(e.target.value))} placeholder="ABCD-EFGH" autoCapitalize="characters" autoComplete="one-time-code" /></label>
    <button className="button" disabled={busy||code.replace(/-/g,"").length!==8} onClick={()=>inspect()}>{busy?"Checking…":"Check code"}</button>
    {message&&<p className="notice">{message}</p>}
    {device&&!approved&&<div className="pair-card">
      <h2>{device.device_name}</h2>
      <p className="small">{device.platform??"Unknown platform"}{device.hostname?` · ${device.hostname}`:""}</p>
      <p>Pair this device to <strong>{email}</strong>?</p>
      <div className="actions"><button className="button primary" disabled={busy} onClick={approve}>Approve device</button><button className="button" onClick={anotherAccount}>Use another account</button></div>
      <p className="small">Code {device.user_code}. Approval expires at {new Date(device.expires_at).toLocaleTimeString()}.</p>
    </div>}
    {approved&&<div className="pair-card"><h2>Device approved</h2><p>You can close this page. RelayDesk will complete pairing on the device and keep its machine credential for future reconnects.</p><Link className="button" href="/dashboard">View devices</Link></div>}
    <div className="divider" />
    <p className="small">Signed in as {email}</p>
    <button className="text-button" onClick={anotherAccount}>Use another RelayDesk account</button>
  </section></main>;
}
