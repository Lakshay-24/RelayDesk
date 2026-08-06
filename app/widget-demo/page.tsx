"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";

export default function WidgetDemoPage() {
  const [workspaceKey, setWorkspaceKey] = useState("");

  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("workspace")?.trim() ?? "";
    setWorkspaceKey(key);
    if (!key) return;

    const existing = document.getElementById("relaydesk-demo-loader");
    if (existing) existing.remove();
    document.getElementById("relaydesk-widget-root")?.remove();

    const script = document.createElement("script");
    script.id = "relaydesk-demo-loader";
    script.src = "/widget/loader.js";
    script.dataset.workspace = key;
    script.async = true;
    document.body.appendChild(script);

    return () => {
      script.remove();
      document.getElementById("relaydesk-widget-root")?.remove();
    };
  }, []);

  return (
    <main className="demo-page">
      <nav>
        <div className="brand"><span><MessageCircle size={18}/></span>RelayDesk</div>
        <a href="/">View product</a>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">LIVE CHAT DEMO</p>
          <h1>Customer support that feels instant.</h1>
          <p className="lead">This is a regular public webpage with the RelayDesk website messenger installed. Open the floating chat button in the bottom-right and send a message.</p>
          <div className="steps">
            <span><CheckCircle2 size={17}/>Open the chat bubble</span>
            <span><CheckCircle2 size={17}/>Send a visitor message</span>
            <span><CheckCircle2 size={17}/>See it arrive in RelayDesk Inbox</span>
          </div>
          {!workspaceKey ? <div className="warning">Missing workspace key. Open this page using <code>?workspace=PUBLIC_KEY</code>.</div> : null}
        </div>

        <div className="preview-card">
          <div className="preview-top"><span/><span/><span/></div>
          <div className="preview-body">
            <span className="mini-logo"><Sparkles size={18}/></span>
            <p className="eyebrow">ACME CLOUD</p>
            <h2>Everything your team needs to move faster.</h2>
            <p>A fictional customer website used to demonstrate that RelayDesk can be installed as an embeddable support messenger.</p>
            <button type="button">Start free trial</button>
          </div>
        </div>
      </section>

      <section className="trust-row">
        <div><ShieldCheck size={20}/><span><strong>Secure workspace routing</strong><small>Messages are sent only to the workspace encoded in this demo URL.</small></span></div>
        <div><MessageCircle size={20}/><span><strong>Real-time conversation</strong><small>Visitor replies, typing status and read state use the production chat flow.</small></span></div>
      </section>

      <style jsx>{`
        .demo-page{min-height:100vh;background:linear-gradient(180deg,#f8fafc 0%,#fff 70%);color:#101828;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        nav{height:72px;display:flex;align-items:center;justify-content:space-between;max-width:1180px;margin:0 auto;padding:0 28px;border-bottom:1px solid #eaecf0}
        nav a{color:#344054;text-decoration:none;font-weight:700;font-size:14px}.brand{display:flex;align-items:center;gap:10px;font-weight:900;letter-spacing:-.02em}.brand span{width:34px;height:34px;display:grid;place-items:center;border-radius:11px;background:#111827;color:#fff}
        .hero{max-width:1180px;margin:0 auto;padding:88px 28px 70px;display:grid;grid-template-columns:minmax(0,1fr) minmax(390px,.82fr);gap:72px;align-items:center}.hero-copy h1{max-width:720px;margin:10px 0 20px;font-size:clamp(48px,6vw,78px);line-height:.98;letter-spacing:-.055em}.eyebrow{margin:0;color:#475467;font-size:12px;font-weight:900;letter-spacing:.16em}.lead{max-width:650px;color:#475467;font-size:19px;line-height:1.65}.steps{display:grid;gap:12px;margin-top:30px}.steps span{display:flex;align-items:center;gap:9px;color:#344054;font-weight:700}.steps :global(svg){color:#12b76a}.warning{margin-top:26px;padding:14px 16px;border:1px solid #fecdca;border-radius:12px;background:#fff4ed;color:#b42318;font-weight:700}.warning code{font-weight:900}
        .preview-card{border:1px solid #d0d5dd;border-radius:24px;background:#fff;box-shadow:0 30px 70px rgba(16,24,40,.14);overflow:hidden;transform:rotate(1.5deg)}.preview-top{height:42px;display:flex;align-items:center;gap:7px;padding:0 16px;border-bottom:1px solid #eaecf0;background:#f9fafb}.preview-top span{width:9px;height:9px;border-radius:50%;background:#d0d5dd}.preview-body{padding:54px 44px 60px;background:radial-gradient(circle at top right,#e0e7ff,transparent 45%),#fff}.mini-logo{width:44px;height:44px;display:grid;place-items:center;border-radius:14px;background:#eef2ff;color:#4338ca}.preview-body h2{margin:14px 0;font-size:38px;line-height:1.05;letter-spacing:-.04em}.preview-body>p:not(.eyebrow){color:#667085;line-height:1.6}.preview-body button{margin-top:18px;padding:13px 17px;border:0;border-radius:10px;background:#111827;color:#fff;font-weight:800}
        .trust-row{max-width:1180px;margin:0 auto;padding:0 28px 64px;display:grid;grid-template-columns:1fr 1fr;gap:18px}.trust-row>div{display:flex;gap:13px;padding:20px;border:1px solid #eaecf0;border-radius:16px;background:#fff}.trust-row :global(svg){flex:none;color:#475467}.trust-row span{display:grid;gap:5px}.trust-row small{color:#667085;line-height:1.45}
        @media(max-width:850px){.hero{grid-template-columns:1fr;padding-top:54px;gap:44px}.preview-card{transform:none}.trust-row{grid-template-columns:1fr}.hero-copy h1{font-size:52px}}
        @media(max-width:520px){nav{padding:0 18px}.hero{padding:42px 18px 54px}.hero-copy h1{font-size:43px}.lead{font-size:17px}.preview-body{padding:38px 26px 44px}.preview-body h2{font-size:32px}.trust-row{padding:0 18px 48px}}
      `}</style>
    </main>
  );
}
