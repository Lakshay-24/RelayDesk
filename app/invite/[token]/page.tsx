"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function AcceptInvitationPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function acceptInvitation() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/team/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: params.token }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (response.status === 401) {
      setError("Sign in with the invited email address, then return to this link.");
      return;
    }
    if (!response.ok) {
      setError(payload.error || "Could not accept this invitation.");
      return;
    }

    router.push("/inbox");
    router.refresh();
  }

  return (
    <section className="auth-card">
      <div className="eyebrow">RelayDesk</div>
      <h1>Join the workspace</h1>
      <p className="muted">Accept this invitation using the same email address that received it.</p>
      {error && <p className="form-error">{error}</p>}
      <button className="primary-button" onClick={acceptInvitation} disabled={busy}>
        {busy ? "Accepting…" : "Accept invitation"}
      </button>
      <p className="muted"><Link href="/login">Sign in first</Link></p>
    </section>
  );
}
