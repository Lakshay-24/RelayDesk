"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CheckCheck, MessageCircle, Send } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
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

type PresenceEntry = { role?: string; online_at?: string };

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
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const agentTypingTimerRef = useRef<number | null>(null);
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
  const [agentOnline, setAgentOnline] = useState(false);
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
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not connect"));
  }, []);

  useEffect(() => {
    if (!conversationId || !visitorKey) return;
    const channel = supabase
      .channel(`conversation:${conversationId}`, {
        config: { broadcast: { self: false }, presence: { key: `visitor:${visitorKey}` } },
      })
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const message = payload as Message;
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.sender !== "agent") return;
        setAgentTyping(Boolean(payload.typing));
        if (agentTypingTimerRef.current) window.clearTimeout(agentTypingTimerRef.current);
        if (payload.typing) {
          agentTypingTimerRef.current = window.setTimeout(() => setAgentTyping(false), 3000);
        }
      })
      .on("broadcast", { event: "read" }, ({ payload }) => {
        if (payload?.sender !== "agent") return;
        const readAt = typeof payload.readAt === "string" ? payload.readAt : new Date().toISOString();
        setMessages((current) => current.map((message) => message.sender_type === "contact" && !message.read_at ? { ...message, read_at: readAt } : message));
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceEntry>();
        const online = Object.values(state).flat().some((entry) => entry.role === "agent");
        setAgentOnline(online);
      })
      .subscribe(async (status) => {
        const subscribed = status === "SUBSCRIBED";
        setConnected(subscribed);
        if (subscribed) await channel.track({ role: "visitor", online_at: new Date().toISOString() });
      });

    channelRef.current = channel;
    const fallback = window.setInterval(async () => {
      const params = new URLSearchParams({ workspaceKey, visitorKey, conversationId });
      const response = await fetch(`/api/widget/messages?${params.toString()}`);
      if (response.ok) setMessages((await response.json()).messages ?? []);
    }, 10000);

    return () => {
      window.clearInterval(fallback);
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (agentTypingTimerRef.current) window.clearTimeout(agentTypingTimerRef.current);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, supabase, visitorKey, workspaceKey]);

  useEffect(() => {
    if (!conversationId || !messages.some((message) => message.sender_type === "agent" && !message.visitor_read_at)) return;
    void fetch("/api/widget/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceKey, visitorKey, conversationId }),
    }).then(async (response) => {
      if (!response.ok) return;
      const { readAt } = await response.json();
      setMessages((current) => current.map((message) => message.sender_type === "agent" && !message.visitor_read_at ? { ...message, visitor_read_at: readAt } : message));
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

  async function broadcastTyping(typing: boolean) {
    const channel = channelRef.current;
    if (!channel) return;
    await channel.send({ type: "broadcast", event: "typing", payload: { sender: "visitor", typing } });
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    void broadcastTyping(Boolean(value.trim()));
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    if (value.trim()) typingTimerRef.current = window.setTimeout(() => void broadcastTyping(false), 2500);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy || !conversationId) return;
    setBusy(true);
    setError("");
    const body = draft.trim();
    setDraft("");
    setArticles([]);
    void broadcastTyping(false);

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

  const statusText = !connected ? "Reconnecting…" : agentOnline ? "Online · We usually reply in a few minutes." : "Offline · Leave a message and we’ll reply here.";

  return (
    <main className="widget-page">
      <section className="widget-card">
        <header className="widget-header">
          <MessageCircle size={22} />
          <h2>{workspaceName}</h2>
          <p><span className={`presence-dot ${agentOnline ? "online" : ""}`} />{statusText}</p>
        </header>

        <div className="widget-messages">
          {messages.map((message) => (
            <div className={`message-wrap ${message.sender_type === "contact" ? "visitor" : "support"}`} key={message.id}>
              <div className={`message ${message.sender_type === "contact" ? "agent" : ""}`}>{message.body}</div>
              <small>
                {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {message.sender_type === "contact" ? <span><CheckCheck size={12}/>{message.read_at ? "Seen" : "Sent"}</span> : null}
              </small>
            </div>
          ))}
          {agentTyping && <div className="typing-indicator"><span/><span/><span/> Agent is typing</div>}
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
          <input value={draft} onChange={(event) => handleDraftChange(event.target.value)} onBlur={() => void broadcastTyping(false)} placeholder="Write a message…" />
          <button className="primary-button" disabled={busy || !conversationId || !draft.trim()}><Send size={15} /></button>
        </form>
      </section>
      <style jsx>{`
        .widget-header p{display:flex;align-items:center;gap:6px}.presence-dot{width:7px;height:7px;border-radius:50%;background:#98a2b3}.presence-dot.online{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.14)}
        .message-wrap{display:grid;gap:4px}.message-wrap.visitor{justify-items:end}.message-wrap small{display:flex;align-items:center;gap:7px;color:#98a2b3;font-size:10px}.message-wrap small span{display:inline-flex;align-items:center;gap:3px}.typing-indicator{display:flex;align-items:center;gap:4px;color:#667085;font-size:12px}.typing-indicator span{width:5px;height:5px;border-radius:50%;background:#98a2b3;animation:pulse 1.1s infinite}.typing-indicator span:nth-child(2){animation-delay:.15s}.typing-indicator span:nth-child(3){animation-delay:.3s}@keyframes pulse{0%,70%,100%{opacity:.35;transform:translateY(0)}35%{opacity:1;transform:translateY(-2px)}}
      `}</style>
    </main>
  );
}
