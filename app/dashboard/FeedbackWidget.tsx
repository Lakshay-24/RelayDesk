"use client";

import { useState } from "react";

export type FeedbackPayload = {
  kind: "feedback" | "bug" | "feature" | "other";
  message: string;
};

export default function FeedbackWidget({ onSubmit }:{ onSubmit:(payload:FeedbackPayload)=>Promise<void> }) {
  const [open,setOpen]=useState(false);
  const [kind,setKind]=useState<FeedbackPayload["kind"]>("feedback");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState("");

  async function submit(event:React.FormEvent){
    event.preventDefault();
    const clean=message.trim();
    if(!clean)return;
    setBusy(true);setStatus("");
    try{
      await onSubmit({kind,message:clean});
      setMessage("");setStatus("Thanks — sent.");
      setTimeout(()=>{setOpen(false);setStatus("")},900);
    }catch(e){setStatus(e instanceof Error?e.message:"Could not send feedback.")}
    finally{setBusy(false)}
  }

  return <div className={`feedback-widget ${open?"open":""}`}>
    {open&&<section className="feedback-popover" aria-label="Send feedback">
      <div className="feedback-head"><div><strong>Write to us</strong><p>Quick feedback, bug or idea.</p></div><button className="feedback-close" aria-label="Close feedback" onClick={()=>setOpen(false)}>×</button></div>
      <form onSubmit={submit}>
        <select aria-label="Feedback type" value={kind} onChange={e=>setKind(e.target.value as FeedbackPayload["kind"])}>
          <option value="feedback">Feedback</option><option value="bug">Bug</option><option value="feature">Feature idea</option><option value="other">Other</option>
        </select>
        <textarea aria-label="Feedback message" maxLength={5000} placeholder="Tell us what happened or what would make RelayDesk better…" value={message} onChange={e=>setMessage(e.target.value)} />
        <div className="feedback-foot"><span>{status}</span><button className="button primary" disabled={busy||!message.trim()}>{busy?"Sending…":"Send"}</button></div>
      </form>
    </section>}
    <button className="feedback-trigger" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>Feedback</button>
  </div>;
}
