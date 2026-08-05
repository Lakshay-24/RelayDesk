"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function OAuthCompletePage() {
  const router = useRouter();
  const search = useSearchParams();

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errorDescription = hash.get("error_description") || hash.get("error") || search.get("error_description") || search.get("error");
    const errorCode = hash.get("error_code") || search.get("error_code");

    if (errorDescription) {
      const params = new URLSearchParams({
        error: errorDescription,
        ...(errorCode ? { error_code: errorCode } : {}),
      });
      router.replace(`/login?${params.toString()}`);
      return;
    }

    const code = search.get("code");
    if (!code) {
      router.replace("/login?error=Google+sign-in+did+not+return+an+authorization+code");
      return;
    }

    const next = search.get("next") || "/onboarding";
    const params = new URLSearchParams({ code, next: next.startsWith("/") ? next : "/onboarding" });
    window.location.replace(`/auth/callback?${params.toString()}`);
  }, [router, search]);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="eyebrow">RelayDesk</div>
        <h1>Finishing sign-in</h1>
        <p className="muted">Connecting your Google account securely…</p>
      </section>
    </main>
  );
}
