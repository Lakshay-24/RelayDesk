"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function GoogleIcon() {
  return (
    <svg className="google-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.2c1.9-1.8 3.1-4.4 3.1-7.5Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.2-2.6c-.9.6-2 1-3.5 1-2.6 0-4.8-1.8-5.6-4.2H3.1v2.7A10.1 10.1 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.9a6.2 6.2 0 0 1 0-3.8V7.4H3.1a10.1 10.1 0 0 0 0 9.2l3.3-2.7Z" />
      <path fill="#EA4335" d="M12 5.9c1.6 0 3 .5 4.1 1.6l3-3A10 10 0 0 0 3.1 7.4l3.3 2.7C7.2 7.7 9.4 5.9 12 5.9Z" />
    </svg>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const oauthError = search.get("error");
    const errorCode = search.get("error_code");
    if (!oauthError) return;
    const readable = oauthError.replace(/\+/g, " ");
    setError(errorCode ? `${readable} (${errorCode})` : readable);
  }, []);

  async function signInWithGoogle() {
    setGoogleBusy(true);
    setError("");
    setNotice("");
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/complete?next=/onboarding`,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (authError) { setError(authError.message); setGoogleBusy(false); }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Google sign-in failed unexpectedly.");
      setGoogleBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const supabase = createClient();
      if (mode === "login") {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) { setError(authError.message); return; }
        if (!data.session) { setError("Sign-in succeeded but no session was created. Check your Supabase Auth configuration."); return; }
        router.replace("/inbox");
        router.refresh();
        return;
      }
      const redirectTo = `${window.location.origin}/auth/complete?next=/onboarding`;
      const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo } });
      if (authError) { setError(authError.message); return; }
      if (!data.session) { setNotice("Account created. Confirm your email to continue directly to workspace setup."); return; }
      router.replace("/onboarding");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed unexpectedly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card">
      <div className="eyebrow">RelayDesk</div>
      <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
      <p className="muted auth-intro">{mode === "login" ? "Sign in to your shared customer inbox." : "Start your support workspace in minutes."}</p>
      <form className="form-stack" onSubmit={submit}>
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} placeholder="At least 8 characters" required /></label>
        {error && <p className="form-error">{error}</p>}
        {notice && <p className="muted">{notice}</p>}
        <button className="primary-button auth-submit" disabled={busy || googleBusy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      <div className="auth-divider" role="separator"><span>or</span></div>
      <button type="button" className="google-auth-button" disabled={googleBusy || busy} onClick={signInWithGoogle}>
        <GoogleIcon />
        <span>{googleBusy ? "Opening Google…" : mode === "login" ? "Continue with Google" : "Create account with Google"}</span>
      </button>
      <p className="muted auth-switch">{mode === "login" ? <>New here? <Link href="/signup">Create an account</Link></> : <>Already registered? <Link href="/login">Sign in</Link></>}</p>
    </section>
  );
}
