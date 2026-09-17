"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function AccountLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function withGoogle() {
    setBusy(true); setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setMessage("Google sign-in could not start."); setBusy(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const supabase = createClient();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { setMessage("Invalid email or password."); setBusy(false); return; }
      window.location.assign("/dashboard");
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setMessage(error.message); setBusy(false); return; }
    if (data.session) window.location.assign("/dashboard");
    else { setMessage("Account created. Check your email if confirmation is required."); setBusy(false); }
  }

  return <main className="shell"><section className="card auth-card">
    <Link className="brand" href="/"><span className="brand-mark">R</span><span>RelayDesk</span></Link>
    <h1>{mode === "signin" ? "Sign in" : "Create your account"}</h1>
    <p className="lead">Connect and manage computers you own, then use them from compatible AI clients.</p>
    {message && <p className="notice">{message}</p>}
    <button className="button primary wide" type="button" onClick={withGoogle} disabled={busy}>Continue with Google</button>
    <div className="divider" />
    <form className="stack" onSubmit={submit}>
      <label className="field">Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label>
      <label className="field">Password<input type="password" minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} required value={password} onChange={e=>setPassword(e.target.value)} /></label>
      <button className="button wide" disabled={busy}>{busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}</button>
    </form>
    <button className="text-button" type="button" onClick={()=>{setMode(mode === "signin" ? "signup" : "signin");setMessage("")}}>
      {mode === "signin" ? "New to RelayDesk? Create an account" : "Already have an account? Sign in"}
    </button>
  </section></main>;
}
