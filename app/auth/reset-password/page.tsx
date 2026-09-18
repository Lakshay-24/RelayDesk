"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage(){
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function submit(event:React.FormEvent){
    event.preventDefault();
    setMessage("");
    if(password.length<8){setMessage("Use at least 8 characters.");return;}
    if(password!==confirm){setMessage("Passwords do not match.");return;}
    setBusy(true);
    try{
      const supabase=createClient();
      const {error}=await supabase.auth.updateUser({password});
      if(error) throw error;
      setMessage("Password updated. You can continue to your dashboard.");
    }catch{
      setMessage("This reset session is invalid or expired. Request a new reset link.");
    }finally{
      setBusy(false);
    }
  }

  return <main className="shell"><section className="card auth-card">
    <Link className="brand" href="/"><img className="brand-mark" src="/relaydesk-mark.svg" alt="" width={34} height={34}/><span>RelayDesk</span></Link>
    <h1>Choose a new password</h1>
    <p className="lead">Set a new password for your RelayDesk account.</p>
    {message&&<p className="notice">{message}</p>}
    <form className="stack" onSubmit={submit}>
      <label className="field">New password<input type="password" minLength={8} autoComplete="new-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <label className="field">Confirm password<input type="password" minLength={8} autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
      <button className="button primary wide" disabled={busy}>{busy?"Updating…":"Update password"}</button>
    </form>
    <Link className="text-button" href="/dashboard">Continue to dashboard</Link>
    <Link className="text-button" href="/auth/forgot-password">Request another reset link</Link>
  </section></main>;
}
