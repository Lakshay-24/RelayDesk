"use client";

import { useEffect, useState } from "react";
import { MessageSquareText, Plus, Trash2 } from "lucide-react";
import type { CannedResponse } from "@/types/domain";

export function CannedResponsesManager() {
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/canned-responses", { cache: "no-store" });
    const json = await response.json();
    if (!response.ok) {
      setError(json.error ?? "Could not load saved replies");
      return;
    }
    setResponses(json.responses ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createResponse() {
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    setError("");

    const response = await fetch("/api/canned-responses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        body: body.trim(),
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      }),
    });
    const json = await response.json();

    if (response.ok) {
      setResponses((current) => [...current, json.response].sort((a, b) => a.title.localeCompare(b.title)));
      setTitle("");
      setBody("");
      setTags("");
    } else {
      setError(json.error ?? "Could not save reply");
    }
    setBusy(false);
  }

  async function deleteResponse(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");

    const response = await fetch("/api/canned-responses", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await response.json();

    if (response.ok) setResponses((current) => current.filter((item) => item.id !== id));
    else setError(json.error ?? "Could not delete reply");
    setBusy(false);
  }

  return (
    <div className="section-card">
      <h3><MessageSquareText size={16} /> Saved replies</h3>
      <p className="muted">Create reusable responses that agents can insert from the inbox composer.</p>

      {error && <div className="form-error">{error}</div>}

      <label>
        Name
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Refund policy" />
      </label>
      <label>
        Reply
        <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Thanks for reaching out…" />
      </label>
      <label>
        Tags
        <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="billing, refund" />
      </label>
      <button className="primary-button" disabled={busy || !title.trim() || !body.trim()} onClick={createResponse}>
        <Plus size={14} /> Add saved reply
      </button>

      <div>
        {responses.map((item) => (
          <div className="team-row" key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <p className="muted">{item.body.length > 100 ? `${item.body.slice(0, 100)}…` : item.body}</p>
              {item.tags.length > 0 && <small>{item.tags.join(" · ")}</small>}
            </div>
            <button className="chip" disabled={busy} onClick={() => void deleteResponse(item.id)}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        ))}
        {!responses.length && <p className="muted">No saved replies yet.</p>}
      </div>
    </div>
  );
}
