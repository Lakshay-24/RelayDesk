"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const INTERNAL_RELAYDESK_EMAIL = "lakshaygoel12@gmail.com";

function OAuthLoginForm() {
  const search = useSearchParams();
  const authorizationId = search.get("authorization_id") ?? "";
  const started = useRef(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  async function continueWithGoogle() {
    if (!authorizationId) {
      setError("Missing authorization_id");
      setBusy(false);
      return;
    }

    setBusy(true);
    setError("");
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/oauth/callback?authorization_id=${encodeURIComponent(authorizationId)}`;
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { login_hint: INTERNAL_RELAYDESK_EMAIL },
      },
    });

    if (authError) {
      setError(authError.message);
      setBusy(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void continueWithGoogle();
  }, [authorizationId]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section className="auth-card">
        <div className="eyebrow">RelayDesk</div>
        <h1>Connecting to ChatGPT</h1>
        <p className="muted auth-intro">Continuing as <strong>{INTERNAL_RELAYDESK_EMAIL}</strong>.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="button" className="primary-button auth-submit" disabled={busy} onClick={continueWithGoogle}>
          {busy ? "Opening Google…" : "Try again"}
        </button>
      </section>
    </main>
  );
}

export default function OAuthLoginPage() {
  return <Suspense fallback={null}><OAuthLoginForm /></Suspense>;
}
