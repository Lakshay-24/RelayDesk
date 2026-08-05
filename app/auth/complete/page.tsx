"use client";

import { useEffect } from "react";

const ERROR_KEYS = ["error", "error_code", "error_description", "provider_error"] as const;

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/onboarding";
  if (value.startsWith("/auth/") || value.startsWith("/login") || value.startsWith("/signup")) return "/onboarding";
  return value;
}

export default function OAuthCompletePage() {
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errorParams = new URLSearchParams();

    for (const key of ERROR_KEYS) {
      const value = hash.get(key) || search.get(key);
      if (value) errorParams.set(key, value);
    }

    if (errorParams.has("error") || errorParams.has("error_description")) {
      window.history.replaceState(null, "", window.location.pathname);
      window.location.replace(`/login?${errorParams.toString()}`);
      return;
    }

    const code = search.get("code");
    if (!code) {
      const params = new URLSearchParams({
        error: "OAuth completion failed",
        error_code: "missing_oauth_code",
        error_description: "Supabase returned neither an authorization code nor a provider error.",
      });
      window.location.replace(`/login?${params.toString()}`);
      return;
    }

    const params = new URLSearchParams({ code, next: safeNext(search.get("next")) });
    window.history.replaceState(null, "", window.location.pathname);
    window.location.replace(`/auth/callback?${params.toString()}`);
  }, []);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="eyebrow">RelayDesk</div>
        <h1>Finishing sign-in</h1>
        <p className="muted">Connecting your account securely…</p>
      </section>
    </main>
  );
}
