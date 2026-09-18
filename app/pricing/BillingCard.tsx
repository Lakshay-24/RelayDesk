"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

type Plan = { currency:string; amount_minor:number; interval:string };
type BillingStatus = { provider:string; ready:boolean; plans:Plan[] };

function money(plan:Plan){
  return new Intl.NumberFormat(undefined,{style:"currency",currency:plan.currency,maximumFractionDigits:2}).format(plan.amount_minor/100);
}
async function loadRazorpay(){
  if((window as any).Razorpay) return true;
  return await new Promise<boolean>((resolve)=>{
    const s=document.createElement("script");
    s.src="https://checkout.razorpay.com/v1/checkout.js";
    s.async=true;
    s.onload=()=>resolve(true);
    s.onerror=()=>resolve(false);
    document.head.appendChild(s);
  });
}

export default function BillingCard({preferredCurrency}:{preferredCurrency:string}){
  const [status,setStatus]=useState<BillingStatus|null>(null);
  const [currency,setCurrency]=useState(preferredCurrency);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  useEffect(()=>{
    fetch(`${SUPABASE_URL}/functions/v1/billing-status`,{cache:"no-store"})
      .then(r=>r.json())
      .then((x:BillingStatus)=>{
        setStatus(x);
        if(!x.plans.some(p=>p.currency===preferredCurrency)) setCurrency(x.plans.some(p=>p.currency==="USD")?"USD":x.plans[0]?.currency??preferredCurrency);
      })
      .catch(()=>setMessage("Could not load billing availability."));
  },[preferredCurrency]);

  const plan=useMemo(()=>status?.plans.find(p=>p.currency===currency)??status?.plans[0]??null,[status,currency]);

  async function upgrade(){
    setBusy(true); setMessage("");
    try{
      const supabase=createClient();
      const {data}=await supabase.auth.getSession();
      if(!data.session){window.location.assign("/auth/login?next=%2Fpricing");return;}
      const response=await fetch(`${SUPABASE_URL}/functions/v1/billing-create-subscription`,{
        method:"POST",
        headers:{authorization:`Bearer ${data.session.access_token}`,"content-type":"application/json"},
        body:JSON.stringify({currency:plan?.currency??currency})
      });
      const body=await response.json();
      if(!response.ok) throw new Error(body.error==="billing_not_configured"?"Billing activation is still being completed.":body.error??"Could not create subscription.");
      if(!(await loadRazorpay())) throw new Error("Razorpay Checkout could not load.");
      const Razorpay=(window as any).Razorpay;
      const rzp=new Razorpay({
        key:body.key_id,
        subscription_id:body.subscription_id,
        name:"RelayDesk",
        description:`RelayDesk Pro · ${money({currency:body.currency,amount_minor:body.amount_minor,interval:"monthly"})}/month`,
        prefill:{email:data.session.user.email??""},
        notes:{product:"RelayDesk Pro"},
        handler:()=>{setMessage("Payment authorized. RelayDesk Pro will activate after the verified Razorpay webhook arrives.");setTimeout(()=>window.location.assign("/dashboard"),1200);},
        modal:{ondismiss:()=>setBusy(false)}
      });
      rzp.on("payment.failed",(e:any)=>{setMessage(e?.error?.description??"Payment failed. No Pro entitlement was granted.");setBusy(false);});
      rzp.open();
    }catch(e){setMessage(e instanceof Error?e.message:"Could not start billing.");setBusy(false);}
  }

  if(!status) return <section className="price-card"><div className="eyebrow">Pro</div><div className="price">…</div><p>Loading local pricing…</p></section>;
  return <section className="price-card">
    <div className="eyebrow">Pro</div>
    {plan?<div className="price">{money(plan)} <span>/ month</span></div>:<div className="price">$9 <span>/ month</span></div>}
    <p>Higher remote usage for individual power users.</p>
    {status.plans.length>1&&<label className="field">Billing currency<select value={currency} onChange={e=>setCurrency(e.target.value)}>{status.plans.map(p=><option key={p.currency} value={p.currency}>{p.currency}</option>)}</select></label>}
    <p className="small">Currency defaults from your country when a native Razorpay plan is enabled; otherwise RelayDesk falls back to USD. The final price and recurring mandate are shown before authorization.</p>
    {status.ready?<button className="button primary" disabled={busy||!plan} onClick={upgrade}>{busy?"Opening checkout…":"Upgrade to Pro"}</button>:<span className="button" aria-disabled="true">Billing activation in progress</span>}
    {message&&<p className="notice">{message}</p>}
    <p className="small"><a href="/refunds">Cancellation & refund policy</a> · <a href="/terms">Terms</a></p>
  </section>;
}
