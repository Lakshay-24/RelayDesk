"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { CheckCheck, Circle, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation, Membership } from "@/types/domain";

type PresenceEntry = { role?: string; online_at?: string };
type ReadPayload = { sender?: string; readAt?: string };
type TypingPayload = { sender?: string; typing?: boolean };

const labelFor = (conversation: Conversation) =>
  conversation.contact?.name || conversation.contact?.email || conversation.subject || "Website visitor";

export function InboxRealtimeLayer({ conversations, membership }: { conversations: Conversation[]; membership: Membership }) {
  const supabase = useMemo(() => createClient(), []);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const visitorTypingTimerRef = useRef<number | null>(null);
  const [selectedId, setSelectedId] = useState(conversations.find((item) => item.status === "open")?.id ?? conversations[0]?.id ?? "");
  const [visitorOnline, setVisitorOnline] = useState(false);
  const [visitorTyping, setVisitorTyping] = useState(false);
  const [latestSeenAt, setLatestSeenAt] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);

  const selected = conversations.find((item) => item.id === selectedId) ?? conversations[0];

  useEffect(() => {
    const findTarget = () => {
      const target = document.querySelector<HTMLElement>(".thread-identity > div");
      setHeaderTarget(target);
    };
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const card = (event.target as HTMLElement | null)?.closest(".conversation-card");
      if (!card) return;
      const text = card.textContent?.toLowerCase() ?? "";
      const match = conversations.find((conversation) => {
        const name = labelFor(conversation).toLowerCase();
        const subject = (conversation.subject ?? "").toLowerCase();
        return text.includes(name) && (!subject || text.includes(subject));
      });
      if (match) {
        setSelectedId(match.id);
        setSummaryOpen(false);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [conversations]);

  useEffect(() => {
    if (!selected?.id || selected.channel !== "chat") {
      setVisitorOnline(false);
      setVisitorTyping(false);
      return;
    }

    const channel = supabase.channel(`conversation:${selected.id}`, {
      config: { broadcast: { self: false }, presence: { key: `agent:${membership.id}` } },
    })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<PresenceEntry>();
        setVisitorOnline(Object.values(state).flat().some((entry) => entry.role === "visitor"));
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const typing = payload as TypingPayload;
        if (typing.sender !== "visitor") return;
        setVisitorTyping(Boolean(typing.typing));
        if (visitorTypingTimerRef.current) window.clearTimeout(visitorTypingTimerRef.current);
        if (typing.typing) visitorTypingTimerRef.current = window.setTimeout(() => setVisitorTyping(false), 3000);
      })
      .on("broadcast", { event: "read" }, ({ payload }) => {
        const read = payload as ReadPayload;
        if (read.sender !== "visitor") return;
        setLatestSeenAt(read.readAt ?? new Date().toISOString());
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ role: "agent", online_at: new Date().toISOString() });
      });

    channelRef.current = channel;
    void fetch("/api/conversations/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: selected.id }),
    });

    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (visitorTypingTimerRef.current) window.clearTimeout(visitorTypingTimerRef.current);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [membership.id, selected?.channel, selected?.id, supabase]);

  useEffect(() => {
    const onInput = (event: Event) => {
      if (!selected?.id || selected.channel !== "chat") return;
      const target = event.target as HTMLTextAreaElement | null;
      if (!target?.closest(".composer-card")) return;
      const channel = channelRef.current;
      if (!channel) return;
      const typing = Boolean(target.value.trim());
      void channel.send({ type: "broadcast", event: "typing", payload: { sender: "agent", typing } });
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (typing) typingTimerRef.current = window.setTimeout(() => {
        void channel.send({ type: "broadcast", event: "typing", payload: { sender: "agent", typing: false } });
      }, 2500);
    };
    document.addEventListener("input", onInput);
    return () => document.removeEventListener("input", onInput);
  }, [selected?.channel, selected?.id]);

  if (!selected || !headerTarget) return null;

  return createPortal(<div className="realtime-tools">
    <div className="realtime-status" role="status" aria-live="polite">
      <span className={visitorOnline ? "online" : ""}>
        <Circle size={8} fill="currentColor" />
        {selected.channel === "chat" ? visitorOnline ? "Visitor online" : "Visitor offline" : "Email conversation"}
      </span>
      {visitorTyping ? <strong>Visitor is typing…</strong> : latestSeenAt ? <strong><CheckCheck size={12}/>Seen {new Date(latestSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong> : null}
      <button type="button" onClick={() => setSummaryOpen((value) => !value)} aria-expanded={summaryOpen}>
        <Sparkles size={12}/>AI summary
      </button>
    </div>
    {summaryOpen ? <aside className="summary-popover">
      <div><Sparkles size={15}/><strong>Issue summary</strong><button type="button" aria-label="Close summary" onClick={() => setSummaryOpen(false)}>×</button></div>
      <p>{selected.summary || "A summary will appear after the conversation has enough context. New messages automatically queue a refresh."}</p>
      <small>Free AI models may take up to 25–30 seconds per attempt. RelayDesk moves to the next available model after a timeout or empty response.</small>
    </aside> : null}
    <style jsx>{`
      .realtime-tools{position:relative;display:inline-flex;margin-top:8px;max-width:100%}
      .realtime-status{display:flex;align-items:center;gap:8px;max-width:100%;padding:4px 5px 4px 8px;border:1px solid #e4e7ec;border-radius:10px;background:#fff;color:#667085;font-size:10px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
      .realtime-status span,.realtime-status strong,.realtime-status button{display:flex;align-items:center;gap:4px;white-space:nowrap}
      .realtime-status span.online{color:#027a48}
      .realtime-status strong{color:#344054;font-weight:700}
      .realtime-status button{height:24px;padding:0 8px;border:0;border-radius:7px;background:#17181a;color:#fff;font-size:10px;font-weight:800;cursor:pointer}
      .summary-popover{position:absolute;z-index:80;top:calc(100% + 8px);left:0;width:min(380px,calc(100vw - 40px));padding:15px;border:1px solid #e4e7ec;border-radius:14px;background:#fff;box-shadow:0 16px 40px rgba(16,24,40,.16)}
      .summary-popover>div{display:flex;align-items:center;gap:7px;color:#344054}.summary-popover>div button{margin-left:auto;border:0;background:transparent;color:#98a2b3;font-size:22px;cursor:pointer}.summary-popover p{margin:11px 0 8px;color:#475467;font-size:12px;line-height:1.55;white-space:pre-wrap}.summary-popover small{display:block;color:#667085;font-size:10px;line-height:1.45}
      @media(max-width:760px){.realtime-tools{display:flex;width:100%}.realtime-status{width:100%;justify-content:space-between;flex-wrap:wrap}.realtime-status strong{display:none}.summary-popover{right:0;left:auto;width:min(360px,calc(100vw - 32px))}}
    `}</style>
  </div>, headerTarget);
}
