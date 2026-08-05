"use client";

import { useEffect, useState } from "react";
import { PlugZap, Trash2 } from "lucide-react";

type Webhook = {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export function WebhooksManager({ isAdmin }: { isAdmin: boolean }) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!isAdmin) return;
    const response = await fetch("/api/webhooks", { cache: "no-store" });
    const json = await response.json();
    if (response.ok) setWebhooks(json.webhooks ?? []);
    else setNotice(json.error ?? "Could not load webhooks");
  }

  useEffect(() => { void load(); }, [isAdmin]);

  async function createWebhook() {
    if (!url.trim()) return;
    setBusy(true);
    setNotice("");
    setSecret("");
    const response = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: url.trim(),
        events: ["conversation.created", "message.created", "conversation.updated"],
      }),
    });
    const json = await response.json();
    if (response.ok) {
      setWebhooks((current) => [json.webhook, ...current]);
      setSecret(json.secret ?? "");
      setUrl("");
      setNotice("Webhook created. Copy the signing secret now; it will not be shown again.");
    } else setNotice(json.error ?? "Could not create webhook");
    setBusy(false);
  }

  async function act(webhookId: string, action: "test" | "toggle" | "delete", enabled?: boolean) {
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/webhooks", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ webhookId, action, enabled }),
    });
    const json = await response.json();
    if (response.ok) {
      if (action === "delete") setWebhooks((current) => current.filter((item) => item.id !== webhookId));
      else if (action === "toggle") setWebhooks((current) => current.map((item) => item.id === webhookId ? json.webhook : item));
      else setNotice(`Test delivered successfully with HTTP ${json.status}.`);
    } else setNotice(json.error ?? "Webhook action failed");
    setBusy(false);
  }

  if (!isAdmin) return null;

  return (
    <div className="section-card">
      <h3><PlugZap size={16} /> Webhooks</h3>
      <p className="muted">Send signed HTTPS events to your own systems.</p>
      <label>
        Endpoint URL
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/relaydesk-webhook" />
      </label>
      <button className="primary-button" disabled={busy || !url.trim()} onClick={() => void createWebhook()}>Add webhook</button>
      {notice && <p>{notice}</p>}
      {secret && <pre className="code-block">Signing secret: {secret}</pre>}
      {webhooks.map((webhook) => (
        <div className="section-card" key={webhook.id}>
          <strong>{webhook.url}</strong>
          <p className="muted">{webhook.events.join(" · ")}</p>
          <div className="filters">
            <button className="chip" disabled={busy} onClick={() => void act(webhook.id, "test")}>Send test</button>
            <button className="chip" disabled={busy} onClick={() => void act(webhook.id, "toggle", !webhook.enabled)}>{webhook.enabled ? "Disable" : "Enable"}</button>
            <button className="chip" disabled={busy} onClick={() => void act(webhook.id, "delete")}><Trash2 size={14} /> Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
