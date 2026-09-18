"use client";

import { useState } from "react";

const MCP_URL="https://relay-desk-mjq6.vercel.app/mcp";

export default function ConnectionGuide(){
  const [copied,setCopied]=useState(false);
  async function copy(){
    await navigator.clipboard.writeText(MCP_URL);
    setCopied(true);
    window.setTimeout(()=>setCopied(false),1500);
  }
  return <section className="panel" id="connections">
    <div className="panel-title">
      <div>
        <h2>Connect your AI</h2>
        <p className="small">RelayDesk is a standard remote MCP service. Pair each computer once, then connect compatible AI clients to the same RelayDesk account.</p>
      </div>
    </div>
    <div className="pair-card">
      <p className="small">Remote MCP endpoint</p>
      <code>{MCP_URL}</code>
      <div className="actions"><button className="button" type="button" onClick={copy}>{copied?"Copied":"Copy endpoint"}</button></div>
    </div>
    <div className="connection-grid">
      <div><strong>ChatGPT</strong><p className="small">Connect RelayDesk and sign in with your RelayDesk account. Your OpenAI login can be different.</p></div>
      <div><strong>Grok / custom MCP</strong><p className="small">Add the RelayDesk remote MCP URL as a custom connector and complete RelayDesk OAuth.</p></div>
      <div><strong>Claude & other MCP clients</strong><p className="small">Use the same endpoint when the client supports remote MCP with OAuth.</p></div>
      <div><strong>One device agent</strong><p className="small">You do not need a different RelayDesk agent for each AI provider. The same paired device is available through your RelayDesk account.</p></div>
    </div>
  </section>;
}
