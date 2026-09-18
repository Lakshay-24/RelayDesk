"use client";

import { useEffect,useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ResetPassword() {
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const [ready,setReady]=useState<boolean|null>(null);
  const [message,setMessage]=useState("");

  useEffect(()=>{
    const supabase=createClient();
    supabase.auth.getUser().then(({data,error})=>setReady(!error && !!data.user));
  },[]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if(password!==confirm){setMessage("Passwords do not match.");return;}
    setBusy(true); setMessage("");
    const supabase=createClient();
    const {error}=await supabase.auth.updateUser({password});
    if(error){setMessage("Password could not be updated. Request a new reset link and try again.");setBusy(false);return;}
    setMessage("Password updated. You can now sign in with your new password.");
    setBusy(false);
  }

  return <main className="shell"><section className="card auth-card">
    <Link className="brand" href="/"><img className="brand-mark" src="/relaydesk-mark.svg" alt="" width={34} height={34}/><span>RelayDesk</span></Link>
    <h1>Choose a new password</h1>
    {ready===null && <p className="lead">Checking your reset session…</p>}
    {ready===false && <>
      <p className="notice">This reset link is missing, invalid, or expired.</p>
      <Link className="button wide" href="/auth/forgot-password">Request a new reset link</Link>
    </>}
    {ready===true && <>
      {message && <p className="notice" role="status">{message}</p>}
      <form className="stack" onSubmit={submit}>
        <label className="field">New password<input type="password" minLength={8} autoComplete="new-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <label className="field">Confirm password<input type="password" minLength={8} autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
        <button className="button primary wide" disabled={busy}>{busy?"Updating…":"Update password"}</button>
      </form>
    </>}
    <Link className="text-button" href="/auth/login">Back to sign in</Link>
  </section></main>;
}
