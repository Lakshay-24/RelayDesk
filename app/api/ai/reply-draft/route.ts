import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { allowRequest, rateLimitHeaders } from "@/lib/rate-limit";

const input = z.object({ conversationId: z.string().uuid() });

type OpenRouterPayload = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { code?: string | number; message?: string };
  model?: string;
};
type MessageRow = { sender_type: string; body: string; created_at: string };

function fallbackDraft(messages: MessageRow[], subject?: string | null) {
  const latestCustomer = [...messages].reverse().find((message) => message.sender_type === "contact")?.body.trim();
  const topic = subject?.trim() && subject !== "Website conversation" ? subject.trim() : "your message";
  if (!latestCustomer) return `Thanks for reaching out about ${topic}. I’m reviewing this now and will help you with the next step.`;
  const compact = latestCustomer.replace(/\s+/g, " ").slice(0, 180);
  return /\?$/.test(compact)
    ? `Thanks for reaching out. I understand you’re asking: “${compact}” I’m checking the details now and will give you a clear answer shortly.`
    : `Thanks for sharing this. I understand the issue is: “${compact}” I’m reviewing it now and will help you with the next step.`;
}

function logFailure(details: Record<string, unknown>) {
  console.error(`[ai-reply-draft] ${JSON.stringify(details)}`);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const respond = (body: unknown, init?: ResponseInit) => Response.json(body, {
    ...init,
    headers: { "x-request-id": requestId, ...(init?.headers ?? {}) },
  });

  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return respond({ error: "Invalid request", requestId }, { status: 400 });

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return respond({ error: "Unauthorized", requestId }, { status: 401 });

  const limited = allowRequest(`ai-reply:${user.id}`, 15, 60_000);
  if (!limited.allowed) return respond(
    { error: "AI draft limit reached. Please wait a minute and try again.", requestId },
    { status: 429, headers: rateLimitHeaders(limited) },
  );

  const { data: conversation } = await db
    .from("conversations")
    .select("id,workspace_id,subject,channel")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();
  if (!conversation) return respond({ error: "Conversation not found", requestId }, { status: 404, headers: rateLimitHeaders(limited) });

  const { data: membership } = await db
    .from("memberships")
    .select("id")
    .eq("workspace_id", conversation.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return respond({ error: "Forbidden", requestId }, { status: 403, headers: rateLimitHeaders(limited) });

  const [{ data: messages }, { data: articles }] = await Promise.all([
    db.from("messages")
      .select("sender_type,body,created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at")
      .limit(60),
    db.from("kb_articles")
      .select("title,excerpt,body_html")
      .eq("workspace_id", conversation.workspace_id)
      .not("published_at", "is", null)
      .limit(8),
  ]);

  if (!messages?.length) return respond({ error: "Conversation is empty", requestId }, { status: 404, headers: rateLimitHeaders(limited) });

  const safeFallback = fallbackDraft(messages as MessageRow[], conversation.subject);
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const model = process.env.OPENROUTER_MODEL?.trim() || "openrouter/free";
  if (!apiKey) {
    logFailure({ event: "missing_openrouter_api_key", requestId, model });
    return respond({ draft: safeFallback, fallback: true, fallbackReason: "OPENROUTER_API_KEY is missing", requestId }, { headers: rateLimitHeaders(limited) });
  }

  const transcript = messages.map((message) => `${message.sender_type}: ${message.body}`).join("\n");
  const knowledge = (articles ?? [])
    .map((article) => `${article.title}: ${article.excerpt ?? article.body_html?.replace(/<[^>]*>/g, " ").slice(0, 500) ?? ""}`)
    .join("\n");
  const prompt = `Draft a concise, warm customer-support reply. Answer only from the conversation and knowledge excerpts. Do not invent policies, promises, refunds, dates, or completed actions. Ask one precise question when essential information is missing. Return only the reply text.\n\nSubject: ${conversation.subject ?? "Support request"}\nChannel: ${conversation.channel}\n\nConversation:\n${transcript}\n\nKnowledge excerpts:\n${knowledge || "No relevant published articles available."}`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://relay-desk-mjq6.vercel.app",
        "X-Title": "RelayDesk",
      },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 350,
      }),
    });

    const raw = await response.text();
    let payload: OpenRouterPayload = {};
    try { payload = raw ? JSON.parse(raw) as OpenRouterPayload : {}; } catch { payload = {}; }

    if (!response.ok) {
      const message = payload.error?.message || raw.slice(0, 500) || response.statusText || "Unknown OpenRouter error";
      logFailure({ event: "openrouter_http_error", requestId, status: response.status, code: payload.error?.code ?? null, message, model });
      return respond({ draft: safeFallback, fallback: true, fallbackReason: message, requestId }, { headers: rateLimitHeaders(limited) });
    }

    const draft = payload.choices?.[0]?.message?.content?.trim();
    if (!draft) {
      logFailure({ event: "empty_openrouter_response", requestId, status: response.status, model, responsePreview: raw.slice(0, 500) });
      return respond({ draft: safeFallback, fallback: true, fallbackReason: "OpenRouter returned no reply text", requestId }, { headers: rateLimitHeaders(limited) });
    }

    return respond({ draft, fallback: false, requestId, model: payload.model || model }, { headers: rateLimitHeaders(limited) });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    const message = error instanceof Error ? error.message : "Unknown network error";
    logFailure({ event: timedOut ? "openrouter_timeout" : "openrouter_exception", requestId, timedOut, message, model });
    return respond({ draft: safeFallback, fallback: true, fallbackReason: timedOut ? "OpenRouter timed out" : message, requestId }, { headers: rateLimitHeaders(limited) });
  }
}
