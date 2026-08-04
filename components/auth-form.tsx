"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const router=useRouter();
  async function submit(event:React.FormEvent){
    event.preventDefault();setBusy(true);setError("");
    const supabase=createClient();
    const result=mode==="login"?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password});
    setBusy(false);
    if(result.error){setError(result.error.message);return;}
    router.push("/inbox");router.refresh();
  }
  return <section className="auth-card">
    <div className="eyebrow">RelayDesk</div>
    <h1>{mode==="login"?"Welcome back":"Create your account"}</h1>
    <p className="muted">{mode==="login"?"Sign in to your shared customer inbox.":"Start your support workspace in minutes."}</p>
    <form className="form-stack" onSubmit={submit}>
      <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" required/></label>
      <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} placeholder="At least 8 characters" required/></label>
      {error&&<p className="form-error">{error}</p>}
      <button className="primary-button" disabled={busy}>{busy?"Please wait…":mode==="login"?"Sign in":"Create account"}</button>
    </form>
    <p className="muted">{mode==="login"?<>New here? <Link href="/signup">Create an account</Link></>:<>Already registered? <Link href="/login">Sign in</Link></>}</p>
  </section>;
}
