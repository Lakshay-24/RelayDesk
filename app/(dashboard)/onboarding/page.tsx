"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, MessageSquareText, Sparkles, Users } from "lucide-react";

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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    const cleanName = name.trim();
    const cleanSlug = normalizeSlug(slug);
    if (cleanName.length < 2) {
      setError("Enter a workspace name with at least 2 characters.");
      return;
    }
    if (cleanSlug.length < 2) {
      setError("Enter a workspace URL with at least 2 letters or numbers.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workspaces/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: cleanName, slug: cleanSlug }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(json.error ?? "Could not create workspace. Please try again.");
        return;
      }
      router.replace("/inbox");
      router.refresh();
    } catch {
      setError("Could not reach RelayDesk. Check your connection and try again.");
    } finally {
      setBusy(false);
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

      <form className="onboarding-card" onSubmit={submit} noValidate>
        <span className="step-label">Step 1 of 3</span>
        <h2>Create your workspace</h2>
        <p className="muted">This is the support space your team will share.</p>
        <label>
          Workspace name
          <input
            value={name}
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
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button onboarding-submit" type="submit" disabled={busy}>
          {busy ? "Creating workspace…" : "Create workspace"}
          {!busy && <ArrowRight size={16} />}
        </button>
      </form>
    </main>
  );
}
