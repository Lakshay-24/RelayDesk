"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MCP_URL="https://relay-desk-mjq6.vercel.app/mcp";
const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL!;

type McpToken={
  id:string;
  name:string;
  token_prefix:string;
  created_at:string;
  last_used_at:string|null;
  revoked_at:string|null;
};

export default function ConnectionGuide(){
  const [copied,setCopied]=useState(false);
  const [tokens,setTokens]=useState<McpToken[]>([]);
  const [revealed,setRevealed]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function copy(){
    await navigator.clipboard.writeText(MCP_URL);
    setCopied(true);
    window.setTimeout(()=>setCopied(false),1500);
  }

  async function accessToken(){
    const supabase=createClient();
    const {data}=await supabase.auth.getSession();
    if(!data.session) throw new Error("Session expired");
    return data.session.access_token;
  }

  async function callTokenApi(body:Record<string,unknown>){
    const access=await accessToken();
    const response=await fetch(`${SUPABASE_URL}/functions/v1/mcp-token-manage`,{
      method:"POST",
      headers:{authorization:`Bearer ${access}`,"content-type":"application/json"},
      body:JSON.stringify(body)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error??"Token operation failed");
    return data;
  }

  async function loadTokens(){
    try{
      const data=await callTokenApi({action:"list"});
      setTokens((data.tokens??[]) as McpToken[]);
    }catch{
      // Token auth is optional. Keep the connection guide usable if the backend is not deployed yet.
    }
  }

  useEffect(()=>{ void loadTokens(); },[]);

  async function createToken(){
    const name=window.prompt("Name this AI client or integration","Gemini / custom MCP")?.trim();
    if(!name) return;
    setBusy(true);setMessage("");setRevealed(null);
    try{
      const data=await callTokenApi({action:"create",name});
      setRevealed(String(data.token));
      setMessage("Token created. Copy it now — RelayDesk will not show the full token again.");
      await loadTokens();
    }catch(e){
      setMessage(e instanceof Error?e.message:"Could not create token.");
    }finally{setBusy(false)}
  }

  async function revokeToken(id:string){
    if(!window.confirm("Revoke this MCP access token? Clients using it will stop connecting immediately.")) return;
    setBusy(true);setMessage("");setRevealed(null);
    try{
      await callTokenApi({action:"revoke",token_id:id});
      setMessage("Token revoked.");
      await loadTokens();
    }catch(e){
      setMessage(e instanceof Error?e.message:"Could not revoke token.");
    }finally{setBusy(false)}
  }

  return <section className="panel" id="connections">
    <div className="panel-title">
      <div>
        <h2>Connect your AI</h2>
        <p className="small">Pair each computer once, then connect compatible AI clients to the same RelayDesk account.</p>
      </div>
    </div>
    <div className="pair-card">
      <p className="small">Remote MCP endpoint</p>
      <code>{MCP_URL}</code>
      <div className="actions"><button className="button" type="button" onClick={copy}>{copied?"Copied":"Copy endpoint"}</button></div>
    </div>
    <div className="connection-grid">
      <div><strong>ChatGPT</strong><p className="small">Connect RelayDesk and complete RelayDesk OAuth. Your OpenAI login can be different.</p></div>
      <div><strong>Grok</strong><p className="small">Add RelayDesk as a custom MCP connector and complete OAuth when prompted.</p></div>
      <div><strong>Gemini / header-based clients</strong><p className="small">Use the same remote MCP URL with a RelayDesk personal MCP token in the Authorization bearer header.</p></div>
      <div><strong>One device agent</strong><p className="small">You do not need a different RelayDesk agent for each AI provider.</p></div>
    </div>

    <div className="panel-title">
      <div>
        <h3>Personal MCP tokens</h3>
        <p className="small">Optional for clients that cannot complete RelayDesk OAuth. Treat these tokens like passwords.</p>
      </div>
      <button className="button" type="button" disabled={busy} onClick={createToken}>Create token</button>
    </div>
    {message&&<p className="notice">{message}</p>}
    {revealed&&<div className="pair-card">
      <p className="small">Shown once</p>
      <code>{revealed}</code>
      <div className="actions"><button className="button" type="button" onClick={()=>navigator.clipboard.writeText(revealed)}>Copy token</button><button className="text-button" type="button" onClick={()=>setRevealed(null)}>Hide</button></div>
    </div>}
    {tokens.length===0?<p className="small">No personal MCP tokens created.</p>:tokens.map(t=><article className="device-row" key={t.id}>
      <div>
        <div className="device-name">{t.name}</div>
        <div className="device-meta">{t.token_prefix}… · Created {new Date(t.created_at).toLocaleDateString()}{t.last_used_at?` · Last used ${new Date(t.last_used_at).toLocaleString()}`:" · Never used"}</div>
      </div>
      <div className="device-actions">
        <span className={`status-pill ${t.revoked_at?"offline":"online"}`}>{t.revoked_at?"revoked":"active"}</span>
        {!t.revoked_at&&<button className="danger-link" type="button" disabled={busy} onClick={()=>revokeToken(t.id)}>Revoke</button>}
      </div>
    </article>)}
  </section>;
}
