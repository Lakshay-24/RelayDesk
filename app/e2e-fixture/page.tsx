import { notFound } from "next/navigation";
import FeedbackWidget from "@/app/dashboard/FeedbackWidget";

const devices=Array.from({length:500},(_,i)=>({
  id:`fixture-${i+1}`,
  name:`Fixture device ${String(i+1).padStart(3,"0")}`,
  platform:i%3===0?"win32":i%3===1?"darwin":"linux",
  status:i%4===0?"offline":"online",
  lastSeen:new Date(Date.now()-i*60_000).toISOString(),
}));

export default function E2EFixture(){
  if(process.env.RELAYDESK_E2E_FIXTURES!=="1")notFound();
  return <main className="shell" style={{maxWidth:1100}}>
    <div className="eyebrow">E2E fixture</div><h1>Device stress fixture</h1><p className="muted">Synthetic browser-only data for GitHub Playwright. Never enabled in production.</p>
    <section className="panel"><div className="panel-title"><h2>Your devices</h2><strong>{devices.length}</strong></div>{devices.map(d=><article className="device-row" key={d.id}><div><div className="device-name"><span className={`status-dot ${d.status}`}/>{d.name}</div><div className="device-meta">{d.platform} · {d.lastSeen}</div></div><span className={`status-pill ${d.status}`}>{d.status}</span></article>)}</section>
    <FeedbackWidget onSubmit={async(payload)=>{if(payload.message.includes("force-error"))throw new Error("Synthetic feedback failure");await new Promise(r=>setTimeout(r,80));}}/>
  </main>;
}
