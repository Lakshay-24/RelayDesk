"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, LoaderCircle, MessageSquareText, Sparkles, Users } from "lucide-react";

function normalizeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    router.prefetch("/inbox");
  }, [router]);

  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    const cleanName = name.trim();
    const cleanSlug = normalizeSlug(slug);
    if (cleanName.length < 2) return setError("Enter a workspace name with at least 2 characters.");
    if (cleanSlug.length < 2) return setError("Enter a workspace URL with at least 2 letters or numbers.");

    setBusy(true);
    setError("");
    setPhase("Creating your secure workspace…");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("/api/workspaces/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: cleanName, slug: cleanSlug }),
        signal: controller.signal,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Could not create workspace. Please try again.");

      setPhase("Workspace created. Opening your inbox…");
      router.replace("/inbox");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof DOMException && caught.name === "AbortError"
        ? "Workspace setup took too long. Nothing was charged or lost—please try again."
        : caught instanceof Error ? caught.message : "Could not reach RelayDesk. Check your connection and try again.");
      setPhase("");
      setBusy(false);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  return (
    <main className="onboarding-page">
      <section className="onboarding-copy">
        <span className="brand-mark"><MessageSquareText size={20} /></span>
        <p className="eyebrow">Welcome to RelayDesk</p>
        <h1>One place to support every customer.</h1>
        <p>Set up your workspace, install the messenger, and bring live chat, email, knowledge and AI assistance into one focused inbox.</p>
        <div className="onboarding-points">
          <span><Check size={16} /> Realtime website messenger</span>
          <span><Users size={16} /> Admin and agent collaboration</span>
          <span><Sparkles size={16} /> AI summaries and article suggestions</span>
        </div>
      </section>

      <form className="onboarding-card" onSubmit={submit} noValidate aria-busy={busy}>
        <span className="step-label">Step 1 of 3</span>
        <h2>Create your workspace</h2>
        <p className="muted">This usually takes a few seconds. You will see progress while RelayDesk prepares your inbox.</p>
        <label>
          Workspace name
          <input
            value={name}
            disabled={busy}
            onChange={(event) => {
              const nextName = event.target.value;
              setName(nextName);
              if (!slugEdited) setSlug(normalizeSlug(nextName));
            }}
            placeholder="Acme Support"
            autoComplete="organization"
            autoFocus
          />
        </label>
        <label>
          Workspace URL
          <div className="slug-field">
            <span>relaydesk.app/</span>
            <input
              value={slug}
              disabled={busy}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(normalizeSlug(event.target.value));
              }}
              placeholder="acme"
              inputMode="url"
              aria-describedby="workspace-url-help"
            />
          </div>
        </label>
        <small id="workspace-url-help" className="muted">Use lowercase letters, numbers, and hyphens.</small>
        {busy && <div className="onboarding-progress" role="status" aria-live="polite"><LoaderCircle size={18} className="spin"/><div><strong>{phase}</strong><small>{elapsed < 8 ? "Setting up workspace, membership and inbox…" : "Still working—please keep this tab open."}</small></div></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button onboarding-submit" type="submit" disabled={busy || name.trim().length < 2 || normalizeSlug(slug).length < 2}>
          {busy ? <><LoaderCircle size={16} className="spin"/> Creating workspace…</> : <>Create workspace <ArrowRight size={16}/></>}
        </button>
        <style jsx>{`
          .onboarding-progress{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:12px;background:#f1f4ff;color:#243b75}
          .onboarding-progress div{display:grid;gap:3px}.onboarding-progress small{color:#60709a}
          .spin{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
        `}</style>
      </form>
    </main>
  );
}
