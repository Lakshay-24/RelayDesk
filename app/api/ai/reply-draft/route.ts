import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { allowRequest, rateLimitHeaders } from "@/lib/rate-limit";
import {
  GEMINI_FREE_MODELS,
  MODEL_TIMEOUT_MS,
  OPENROUTER_FREE_MODELS,
  parseRetryAfter,
  retryDelay,
  shouldStopProvider,
  sleep,
  type FailedAttempt,
} from "@/lib/ai-provider-policy";

const input = z.object({ conversationId: z.string().uuid() });

type OpenRouterPayload = {
  choices?: Array<{ message?: { content?: string | null }; text?: string | null }>;
  output_text?: string;
  error?: { code?: string | number; message?: string };
  model?: string;
};
type GeminiPayload = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { code?: number; message?: string; status?: string };
  modelVersion?: string;
};
type MessageRow = { sender_type: string; body: string; created_at: string };
type DraftSuccess = { ok: true; draft: string; model: string; provider: "openrouter" | "gemini" };
type AttemptResult = DraftSuccess | FailedAttempt;
type ModelRunResult = DraftSuccess | { ok: false; result: FailedAttempt; stopProvider: boolean };

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

async function requestOpenRouter(apiKey: string, model: string, prompt: string): Promise<AttemptResult> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://relay-desk-mjq6.vercel.app",
        "X-Title": "RelayDesk",
      },
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: 240 }),
    });
    const raw = await response.text();
    let payload: OpenRouterPayload = {};
    try { payload = raw ? JSON.parse(raw) as OpenRouterPayload : {}; } catch { payload = {}; }
    if (!response.ok) return {
      ok: false,
      timedOut: false,
      status: response.status,
      retryAfterMs: parseRetryAfter(response),
      reason: payload.error?.message || raw.slice(0, 500) || response.statusText || "OpenRouter request failed",
    };
    const draft = payload.choices?.[0]?.message?.content?.trim()
      || payload.choices?.[0]?.text?.trim()
      || payload.output_text?.trim();
    if (!draft) return { ok: false, timedOut: false, status: response.status, reason: "OpenRouter returned no reply text" };
    return { ok: true, draft, model: payload.model || model, provider: "openrouter" };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return { ok: false, timedOut, reason: timedOut ? "OpenRouter timed out after 25 seconds" : error instanceof Error ? error.message : "OpenRouter network error" };
  }
}

async function requestGemini(apiKey: string, model: string, prompt: string): Promise<AttemptResult> {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 240 },
      }),
    });
    const raw = await response.text();
    let payload: GeminiPayload = {};
    try { payload = raw ? JSON.parse(raw) as GeminiPayload : {}; } catch { payload = {}; }
    if (!response.ok) return {
      ok: false,
      timedOut: false,
      status: response.status,
      retryAfterMs: parseRetryAfter(response),
      reason: payload.error?.message || raw.slice(0, 500) || response.statusText || "Gemini request failed",
    };
    const draft = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!draft) return { ok: false, timedOut: false, status: response.status, reason: "Gemini returned no reply text" };
    return { ok: true, draft, model: payload.modelVersion || model, provider: "gemini" };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return { ok: false, timedOut, reason: timedOut ? "Gemini timed out after 25 seconds" : error instanceof Error ? error.message : "Gemini network error" };
  }
}

async function runModel(
  provider: "openrouter" | "gemini",
  model: string,
  request: () => Promise<AttemptResult>,
  requestId: string,
): Promise<ModelRunResult> {
  for (let run = 1; run <= 2; run += 1) {
    const result = await request();
    if (result.ok) return result;
    logFailure({
      event: `${provider}_${result.timedOut ? "timeout" : "attempt_failed"}`,
      requestId,
      model,
      run,
      status: result.status ?? null,
      message: result.reason,
    });
    if (shouldStopProvider(result)) return { ok: false, result, stopProvider: true };
    const delay = retryDelay(result);
    if (run === 2 || delay === null) return { ok: false, result, stopProvider: false };
    logFailure({ event: `${provider}_retry_scheduled`, requestId, model, delayMs: delay });
    await sleep(delay);
  }
  throw new Error("Unreachable AI retry state");
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

  const limited = allowRequest(`ai-reply:${user.id}`, 8, 60_000);
  if (!limited.allowed) return respond(
    { error: "AI draft limit reached. Please wait a minute and try again.", requestId },
    { status: 429, headers: rateLimitHeaders(limited) },
  );

  const { data: conversation } = await db.from("conversations")
    .select("id,workspace_id,subject,channel").eq("id", parsed.data.conversationId).maybeSingle();
  if (!conversation) return respond({ error: "Conversation not found", requestId }, { status: 404, headers: rateLimitHeaders(limited) });

  const { data: membership } = await db.from("memberships")
    .select("id").eq("workspace_id", conversation.workspace_id).eq("user_id", user.id).maybeSingle();
  if (!membership) return respond({ error: "Forbidden", requestId }, { status: 403, headers: rateLimitHeaders(limited) });

  const [{ data: messages }, { data: articles }] = await Promise.all([
    db.from("messages").select("sender_type,body,created_at").eq("conversation_id", conversation.id).order("created_at").limit(40),
    db.from("kb_articles").select("title,excerpt,body_html").eq("workspace_id", conversation.workspace_id).not("published_at", "is", null).limit(6),
  ]);
  if (!messages?.length) return respond({ error: "Conversation is empty", requestId }, { status: 404, headers: rateLimitHeaders(limited) });

  const safeFallback = fallbackDraft(messages as MessageRow[], conversation.subject);
  const transcript = messages.map((message) => `${message.sender_type}: ${message.body}`).join("\n");
  const knowledge = (articles ?? []).map((article) => `${article.title}: ${article.excerpt ?? article.body_html?.replace(/<[^>]*>/g, " ").slice(0, 400) ?? ""}`).join("\n");
  const prompt = `Draft one concise, calm customer-support reply. Do not repeat abusive or threatening language. Use only the conversation and knowledge excerpts. Do not invent policies, promises, refunds, dates, or completed actions. Ask one precise question only when necessary. Return only the reply text.\n\nSubject: ${conversation.subject ?? "Support request"}\nChannel: ${conversation.channel}\n\nConversation:\n${transcript}\n\nKnowledge excerpts:\n${knowledge || "No published knowledge article applies."}`;

  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openRouterKey) {
    for (const model of OPENROUTER_FREE_MODELS) {
      const outcome = await runModel("openrouter", model, () => requestOpenRouter(openRouterKey, model, prompt), requestId);
      if (outcome.ok) return respond({ draft: outcome.draft, fallback: false, requestId, model: outcome.model, provider: outcome.provider }, { headers: rateLimitHeaders(limited) });
      if (outcome.stopProvider) break;
    }
  } else logFailure({ event: "missing_openrouter_api_key", requestId });

  const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (geminiKey) {
    for (const model of GEMINI_FREE_MODELS) {
      const outcome = await runModel("gemini", model, () => requestGemini(geminiKey, model, prompt), requestId);
      if (outcome.ok) return respond({ draft: outcome.draft, fallback: false, requestId, model: outcome.model, provider: outcome.provider }, { headers: rateLimitHeaders(limited) });
      if (outcome.stopProvider) break;
    }
  } else logFailure({ event: "missing_gemini_api_key", requestId });

  return respond({
    draft: safeFallback,
    fallback: true,
    fallbackReason: !openRouterKey && !geminiKey ? "No AI provider key is configured" : "All configured free AI models failed",
    requestId,
  }, { headers: rateLimitHeaders(limited) });
}
