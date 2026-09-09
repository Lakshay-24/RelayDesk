"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function OAuthLoginForm() {
  const search = useSearchParams();
  const router = useRouter();
  const authorizationId = search.get("authorization_id") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const consentPath = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!authorizationId) return setError("Missing authorization_id");
    setBusy(true); setError("");
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError || !data.session) {
      setError(authError?.message ?? "Sign-in failed");
      setBusy(false);
      return;
    }
    router.replace(consentPath);
    router.refresh();
  }

  async function google() {
    if (!authorizationId) return setError("Missing authorization_id");
    setBusy(true); setError("");
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/oauth/callback?authorization_id=${encodeURIComponent(authorizationId)}`;
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (authError) { setError(authError.message); setBusy(false); }
  }

  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
    <section className="auth-card">
      <div className="eyebrow">RelayDesk</div>
      <h1>Sign in to authorize</h1>
      <p className="muted auth-intro">Authenticate before approving this OAuth request.</p>
      <form className="form-stack" onSubmit={submit}>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button auth-submit" disabled={busy}>{busy ? "Please wait…" : "Sign in"}</button>
      </form>
      <div className="auth-divider" role="separator"><span>or</span></div>
      <button type="button" className="google-auth-button" disabled={busy} onClick={google}>Continue with Google</button>
    </section>
  </main>;
}

export default function OAuthLoginPage() {
  return <Suspense fallback={null}><OAuthLoginForm /></Suspense>;
}
