"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BookOpen, MessageCircle, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Message = {
  id: string;
  conversation_id: string;
  body: string;
  sender_type: "contact" | "agent" | "system";
  read_at: string | null;
  visitor_read_at?: string | null;
  created_at: string;
};

type Article = {
  id: string;
  title: string;
  excerpt: string | null;
  url: string | null;
};

function getVisitorKey(workspaceKey: string) {
  const storageKey = `relaydesk:${workspaceKey}:visitor`;
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(storageKey, created);
  return created;
}

export default function WidgetPage() {
  const supabase = useMemo(() => createClient(), []);
  const [workspaceKey, setWorkspaceKey] = useState("");
  const [workspaceName, setWorkspaceName] = useState("Support");
  const [visitorKey, setVisitorKey] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);

  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("workspace") ?? "";
    setWorkspaceKey(key);
    if (!key) return setError("Missing workspace key.");

    const visitor = getVisitorKey(key);
    setVisitorKey(visitor);

    fetch("/api/widget/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceKey: key, visitorKey: visitor }),
    })
      .then(async (response) => ({ ok: response.ok, json: await response.json() }))
      .then(({ ok, json }) => {
        if (!ok) throw new Error(json.error ?? "Could not connect");
        setWorkspaceName(json.workspace?.name ?? "Support");
        setConversationId(json.conversationId);
        setMessages(json.messages ?? []);
        setConnected(true);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not connect"));
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`conversation:${conversationId}`, {
        config: { broadcast: { self: false }, presence: { key: visitorKey || crypto.randomUUID() } },
      })
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const message = payload as Message;
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.sender === "agent") setAgentTyping(Boolean(payload.typing));
      })
      .subscribe(async (status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") await channel.track({ role: "visitor", online_at: new Date().toISOString() });
      });

    const fallback = window.setInterval(async () => {
      const params = new URLSearchParams({ workspaceKey, visitorKey, conversationId });
      const response = await fetch(`/api/widget/messages?${params.toString()}`);
      if (response.ok) setMessages((await response.json()).messages ?? []);
    }, 10000);

    return () => {
      window.clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [conversationId, supabase, visitorKey, workspaceKey]);

  useEffect(() => {
    if (!conversationId || !messages.some((message) => message.sender_type === "agent" && !message.visitor_read_at)) return;
    void fetch("/api/widget/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceKey, visitorKey, conversationId }),
    });
  }, [conversationId, messages, visitorKey, workspaceKey]);

  useEffect(() => {
    const query = draft.trim();
    if (!workspaceKey || query.length < 3) {
      setArticles([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ workspaceKey, q: query });
      const response = await fetch(`/api/knowledge/search?${params.toString()}`);
      if (response.ok) setArticles((await response.json()).articles ?? []);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draft, workspaceKey]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy || !conversationId) return;
    setBusy(true);
    setError("");
    const body = draft.trim();
    setDraft("");
    setArticles([]);

    const response = await fetch("/api/widget/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceKey, visitorKey, conversationId, body }),
    });
    const json = await response.json();
    if (response.ok) {
      setMessages((current) => current.some((message) => message.id === json.message.id) ? current : [...current, json.message as Message]);
    } else {
      setDraft(body);
      setError(json.error ?? "Could not send");
    }
    setBusy(false);
  }

  async function broadcastTyping(typing: boolean) {
    if (!conversationId) return;
    await supabase.channel(`conversation:${conversationId}`).send({
      type: "broadcast",
      event: "typing",
      payload: { sender: "visitor", typing },
    });
  }

  return (
    <main className="widget-page">
      <section className="widget-card">
        <header className="widget-header">
          <MessageCircle size={22} />
          <h2>{workspaceName}</h2>
          <p>{connected ? "Online · We usually reply in a few minutes." : "Connecting…"}</p>
        </header>

        <div className="widget-messages">
          {messages.map((message) => (
            <div className={`message ${message.sender_type === "contact" ? "agent" : ""}`} key={message.id}>
              {message.body}
            </div>
          ))}
          {agentTyping && <div className="muted">An agent is typing…</div>}
          {!messages.length && !error && <div className="muted">Start a conversation with the team.</div>}
          {error && <div className="form-error">{error}</div>}
        </div>

        {articles.length > 0 && (
          <div className="widget-suggestions">
            <strong><BookOpen size={14} /> Suggested answers</strong>
            {articles.map((article) => (
              <a key={article.id} href={article.url ?? "#"} target="_blank" rel="noreferrer">
                <span>{article.title}</span>
                {article.excerpt && <small>{article.excerpt}</small>}
              </a>
            ))}
          </div>
        )}

        <form className="widget-form" onSubmit={send}>
          <input
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              void broadcastTyping(Boolean(event.target.value.trim()));
            }}
            onBlur={() => void broadcastTyping(false)}
            placeholder="Write a message…"
          />
          <button className="primary-button" disabled={busy || !conversationId || !draft.trim()}>
            <Send size={15} />
          </button>
        </form>
      </section>
    </main>
  );
}
