"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import FeedbackWidget, { type FeedbackPayload } from "./FeedbackWidget";

type Device = { id:string; name:string; platform:string|null; status:string; last_seen_at:string|null; created_at:string };
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export default function DashboardClient({ email, initialDevices, initialUsage }:{ email:string; initialDevices:Device[]; initialUsage:number }) {
  const [devices,setDevices]=useState(initialDevices);
  const [usage,setUsage]=useState(initialUsage);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [rotationToken,setRotationToken]=useState<string|null>(null);
  const usagePct = useMemo(()=>Math.min(100,Math.round((usage/10000)*100)),[usage]);

  async function session() {
    const supabase=createClient();
    const {data}=await supabase.auth.getSession();
    if(!data.session) throw new Error("Session expired");
    return {supabase,session:data.session};
  }
  async function token() { return (await session()).session.access_token; }
  async function refresh(){
    const supabase=createClient();
    const {data}=await supabase.from("devices").select("id,name,platform,status,last_seen_at,created_at").order("created_at",{ascending:true});
    setDevices((data??[]) as Device[]);
    const now=new Date();
    const monthStart=`${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-01`;
    const {data:usageRow}=await supabase.from("usage_monthly").select("tool_calls").eq("month_start",monthStart).maybeSingle();
    setUsage(Number(usageRow?.tool_calls??0));
  }
  function addDevice(){window.location.assign("/pair")}
  async function manage(deviceId:string,action:"revoke"|"delete"|"rotate"|"rename"){
    let name: string|undefined;
    if(action==="rename"){name=window.prompt("New device name")?.trim();if(!name)return;}
    if((action==="revoke"||action==="delete")&&!window.confirm(`${action==="delete"?"Delete":"Revoke"} this device?`))return;
    setBusy(true);setMessage("");setRotationToken(null);
    try{
      const access=await token();
      const response=await fetch(`${SUPABASE_URL}/functions/v1/device-manage`,{method:"POST",headers:{authorization:`Bearer ${access}`,"content-type":"application/json"},body:JSON.stringify({device_id:deviceId,action,name})});
      const body=await response.json();if(!response.ok)throw new Error(body.error??"Device update failed");
      if(action==="rotate")setRotationToken(body.device_token);
      await refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Device update failed")}finally{setBusy(false)}
  }
  async function revokeAll(){
    if(!devices.length||!window.confirm("Revoke every paired device?"))return;
    setBusy(true);setMessage("");
    try{for(const d of devices){const access=await token();await fetch(`${SUPABASE_URL}/functions/v1/device-manage`,{method:"POST",headers:{authorization:`Bearer ${access}`,"content-type":"application/json"},body:JSON.stringify({device_id:d.id,action:"revoke"})});}await refresh()}catch{setMessage("Could not revoke every device.")}finally{setBusy(false)}
  }
  async function submitFeedback(payload:FeedbackPayload){
    const access=await token();
    const response=await fetch(`${SUPABASE_URL}/functions/v1/feedback-submit`,{
      method:"POST",
      headers:{authorization:`Bearer ${access}`,"content-type":"application/json"},
      body:JSON.stringify({kind:payload.kind,message:payload.message,page:window.location.pathname,client:navigator.userAgent.slice(0,500),metadata:{viewport:`${window.innerWidth}x${window.innerHeight}`}})
    });
    if(!response.ok)throw new Error("Could not send feedback. Please try again.");
  }
  async function signOut(){const s=createClient();await s.auth.signOut();window.location.assign("/")}

  return <main className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark">R</span><span>RelayDesk</span></Link>
      <nav className="nav"><a className="active" href="#devices">Devices</a><a href="#usage">Usage</a><a href="#connections">Connections</a><a href="#settings">Settings</a></nav>
      <div className="sidebar-bottom"><div className="account-email">{email}</div><button className="text-button left" onClick={signOut}>Sign out</button></div>
    </aside>
    <section className="dashboard-content">
      <header className="dashboard-header"><div><p className="eyebrow">Remote MCP</p><h1>Devices</h1><p className="muted">Computers and servers your AI clients can reach through RelayDesk.</p></div><button className="button primary" onClick={addDevice}>+ Add device</button></header>
      {message&&<p className="notice">{message}</p>}
      {rotationToken&&<section className="pair-card"><h2>Replacement credential</h2><p>This advanced rotation secret is shown once. Update the affected agent before revoking its old local secret.</p><code>{rotationToken}</code><div className="actions"><button className="button" onClick={()=>navigator.clipboard.writeText(rotationToken)}>Copy</button><button className="text-button" onClick={()=>setRotationToken(null)}>Dismiss</button></div></section>}
      <section className="panel" id="devices"><div className="panel-title"><h2>Your devices</h2><button className="danger-link" disabled={busy||!devices.length} onClick={revokeAll}>Revoke all</button></div>{devices.length===0?<div className="empty"><p>No devices paired yet.</p><Link className="button" href="/pair">Pair your first device</Link></div>:devices.map(d=><article className="device-row" key={d.id}><div><div className="device-name"><span className={`status-dot ${d.status}`}/>{d.name}</div><div className="device-meta">{d.platform??"Platform pending"} · {d.last_seen_at?`Last seen ${new Date(d.last_seen_at).toLocaleString()}`:"Never connected"}</div></div><div className="device-actions"><span className={`status-pill ${d.status}`}>{d.status}</span><button onClick={()=>manage(d.id,"rename")}>Rename</button><button onClick={()=>manage(d.id,"rotate")}>Rotate</button><button className="danger-link" onClick={()=>manage(d.id,"revoke")}>Revoke</button><button className="danger-link" onClick={()=>manage(d.id,"delete")}>Delete</button></div></article>)}</section>
      <section className="panel" id="usage"><div className="panel-title"><div><h2>Usage</h2><p className="small">Free plan · 10,000 remote tool calls/month</p></div><strong>{usage.toLocaleString()} / 10,000</strong></div><div className="meter"><span style={{width:`${usagePct}%`}}/></div><p className="small">Monthly usage is counted independently from short-lived command history, so cleanup does not reset the meter.</p></section>
      <section className="panel" id="connections"><h2>Where you use it</h2><div className="connection-grid"><div><strong>ChatGPT</strong><p className="small">Connect RelayDesk with your RelayDesk account; your OpenAI account may be different.</p></div><div><strong>Claude & any remote MCP client</strong><p className="small">Use https://relay-desk-mjq6.vercel.app/mcp with OAuth. The client and paired device do not need to be on the same machine.</p></div></div></section>
      <section className="panel" id="settings"><h2>Settings</h2><p className="small">Device credentials survive restarts and normal network drops. Re-pair only after an explicit revoke or credential loss.</p><div className="links"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link></div></section>
    </section>
    <FeedbackWidget onSubmit={submitFeedback}/>
  </main>;
}
