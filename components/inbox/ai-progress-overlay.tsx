"use client";

import { useEffect, useRef, useState } from "react";
import { Clock3, Sparkles } from "lucide-react";

type ActiveRequest = {
  kind: "draft" | "summary";
  startedAt: number;
};

const isAiUrl = (input: RequestInfo | URL) => {
  const value = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  if (value.includes("/api/ai/reply-draft")) return "draft" as const;
  if (value.includes("/api/ai/summary")) return "summary" as const;
  return null;
};

export function AiProgressOverlay() {
  const [active, setActive] = useState<ActiveRequest | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const requestCount = useRef(0);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const kind = isAiUrl(input);
      if (!kind) return originalFetch(input, init);

      requestCount.current += 1;
      const startedAt = Date.now();
      setActive({ kind, startedAt });
      setElapsed(0);

      try {
        return await originalFetch(input, init);
      } finally {
        requestCount.current = Math.max(0, requestCount.current - 1);
        if (requestCount.current === 0) {
          window.setTimeout(() => setActive((current) => current?.startedAt === startedAt ? null : current), 700);
        }
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const update = () => setElapsed(Math.floor((Date.now() - active.startedAt) / 1000));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  if (!active) return null;

  const phase = elapsed < 25
    ? "Trying the current free model"
    : elapsed < 50
      ? "The first model may have timed out — trying another model"
      : "Continuing through available OpenRouter and Gemini fallbacks";

  return <div className="ai-progress" role="status" aria-live="polite">
    <span className="icon"><Sparkles size={15}/></span>
    <span className="copy">
      <strong>Generating AI {active.kind === "draft" ? "draft" : "summary"} · {elapsed}s</strong>
      <small>{phase}. Free models can take up to 25–30 seconds per attempt; results appear immediately when any model succeeds.</small>
    </span>
    <Clock3 size={15}/>
    <style jsx>{`
      .ai-progress{position:fixed;z-index:120;right:20px;bottom:20px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;width:min(430px,calc(100vw - 32px));padding:12px 14px;border:1px solid #d0d5dd;border-radius:14px;background:rgba(255,255,255,.98);box-shadow:0 18px 48px rgba(16,24,40,.18);color:#475467;backdrop-filter:blur(12px)}
      .icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#17181a;color:#fff}.copy{display:grid;gap:3px;min-width:0}.copy strong{color:#101828;font-size:12px}.copy small{color:#667085;font-size:10px;line-height:1.4}
      @media(max-width:760px){.ai-progress{right:16px;bottom:96px}}
    `}</style>
  </div>;
}
