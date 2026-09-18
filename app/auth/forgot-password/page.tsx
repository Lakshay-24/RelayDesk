"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPassword() {
  const [email,setEmail]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const supabase=createClient();
    try {
      await supabase.auth.resetPasswordForEmail(email.trim(),{
        redirectTo:`${window.location.origin}/auth/callback?next=/auth/reset-password`,
      });
      setMessage("If an account exists for that email, a password reset link has been sent.");
    } catch {
      setMessage("Password reset could not be requested right now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell"><section className="card auth-card">
    <Link className="brand" href="/"><img className="brand-mark" src="/relaydesk-mark.svg" alt="" width={34} height={34}/><span>RelayDesk</span></Link>
    <h1>Reset your password</h1>
    <p className="lead">Enter your account email. We’ll send a secure password-reset link if an account exists.</p>
    {message && <p className="notice" role="status">{message}</p>}
    <form className="stack" onSubmit={submit}>
      <label className="field">Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <button className="button primary wide" disabled={busy}>{busy?"Sending…":"Send reset link"}</button>
    </form>
    <Link className="text-button" href="/auth/login">Back to sign in</Link>
  </section></main>;
}
