"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const supabase = createClient();

      if (mode === "login") {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (authError) {
          setError(authError.message);
          return;
        }

        if (!data.session) {
          setError("Sign-in succeeded but no session was created. Check your Supabase Auth configuration.");
          return;
        }

        router.replace("/inbox");
        router.refresh();
        return;
      }

      const redirectTo = `${window.location.origin}/login`;
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: redirectTo },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!data.session) {
        setNotice("Account created. Check your email and confirm your address, then sign in.");
        return;
      }

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
      <p className="muted">
        {mode === "login"
          ? "Sign in to your shared customer inbox."
          : "Start your support workspace in minutes."}
      </p>
      <form className="form-stack" onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            placeholder="At least 8 characters"
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        {notice && <p className="muted">{notice}</p>}
        <button className="primary-button" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
      <p className="muted">
        {mode === "login" ? (
          <>
            New here? <Link href="/signup">Create an account</Link>
          </>
        ) : (
          <>
            Already registered? <Link href="/login">Sign in</Link>
          </>
        )}
      </p>
    </section>
  );
}
