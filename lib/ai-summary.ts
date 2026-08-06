import { createAdminClient } from "@/lib/supabase/admin";
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
type SummarySuccess = { ok: true; summary: string; provider: "openrouter" | "gemini"; model: string };
type ProviderResult = SummarySuccess | FailedAttempt;
type ModelRunResult = SummarySuccess | { ok: false; result: FailedAttempt; stopProvider: boolean };
type MessageRow = { sender_type: string; body: string; created_at: string };

export class SummaryGenerationError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = "SummaryGenerationError";
  }
}

function logFailure(details: Record<string, unknown>) {
  console.error(`[ai-summary] ${JSON.stringify(details)}`);
}

function emergencySummary(messages: MessageRow[]) {
  const customerMessages = messages.filter((message) => message.sender_type === "contact");
  const agentMessages = messages.filter((message) => message.sender_type === "agent");
  const latestCustomer = customerMessages.at(-1)?.body.replace(/\s+/g, " ").trim().slice(0, 260);
  const latestAgent = agentMessages.at(-1)?.body.replace(/\s+/g, " ").trim().slice(0, 220);
  return [
    latestCustomer ? `Customer wants/help needed: ${latestCustomer}` : "Customer goal is not yet clear.",
    latestAgent ? `Latest agent action: ${latestAgent}` : "No agent response has been recorded yet.",
    `Current status: ${customerMessages.length} customer message${customerMessages.length === 1 ? "" : "s"} and ${agentMessages.length} agent response${agentMessages.length === 1 ? "" : "s"}. Review the latest message for the next action.`,
  ].join("\n");
}

async function requestOpenRouter(apiKey: string, model: string, prompt: string): Promise<ProviderResult> {
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
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.1, max_tokens: 320 }),
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
    const summary = payload.choices?.[0]?.message?.content?.trim()
      || payload.choices?.[0]?.text?.trim()
      || payload.output_text?.trim();
    if (!summary) return { ok: false, timedOut: false, status: response.status, reason: "OpenRouter returned an empty summary" };
    return { ok: true, summary, provider: "openrouter", model: payload.model || model };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return { ok: false, timedOut, reason: timedOut ? "OpenRouter timed out after 25 seconds" : error instanceof Error ? error.message : "OpenRouter network error" };
  }
}

async function requestGemini(apiKey: string, model: string, prompt: string): Promise<ProviderResult> {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 320 },
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
    const summary = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!summary) return { ok: false, timedOut: false, status: response.status, reason: "Gemini returned no reply text" };
    return { ok: true, summary, provider: "gemini", model: payload.modelVersion || model };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return { ok: false, timedOut, reason: timedOut ? "Gemini timed out after 25 seconds" : error instanceof Error ? error.message : "Gemini network error" };
  }
}

async function runModel(
  provider: "openrouter" | "gemini",
  model: string,
  request: () => Promise<ProviderResult>,
  conversationId: string,
): Promise<ModelRunResult> {
  for (let run = 1; run <= 2; run += 1) {
    const result = await request();
    if (result.ok) return result;
    logFailure({
      event: `${provider}_${result.timedOut ? "timeout" : "attempt_failed"}`,
      conversationId,
      model,
      run,
      status: result.status ?? null,
      message: result.reason,
    });
    if (shouldStopProvider(result)) return { ok: false, result, stopProvider: true };
    const delay = retryDelay(result);
    if (run === 2 || delay === null) return { ok: false, result, stopProvider: false };
    logFailure({ event: `${provider}_retry_scheduled`, conversationId, model, delayMs: delay });
    await sleep(delay);
  }
  throw new Error("Unreachable AI retry state");
}

export async function generateAndPersistSummary(conversationId: string) {
  const db = createAdminClient();
  const { data: conversation } = await db.from("conversations")
    .select("id,workspace_id,subject,channel").eq("id", conversationId).maybeSingle();
  if (!conversation) throw new SummaryGenerationError("Conversation not found", false);

  const { data: messages, error: messageError } = await db.from("messages")
    .select("sender_type,body,created_at").eq("conversation_id", conversation.id).order("created_at").limit(100);
  if (messageError) throw new SummaryGenerationError("Could not load conversation messages", true);
  if (!messages?.length) throw new SummaryGenerationError("Conversation is empty", false);

  const rows = messages as MessageRow[];
  const transcript = rows.map((message) => `${message.sender_type}: ${message.body}`).join("\n");
  const prompt = `Summarize this customer-support conversation in under 140 words. Use four short labeled lines: Customer goal, Key facts / attempts, Unresolved questions, Current status / next action. Never invent facts, policies, promises, dates, or completed actions. Do not repeat abusive or threatening wording; describe it neutrally when relevant. Return only the summary.\n\nSubject: ${conversation.subject ?? "Support request"}\nChannel: ${conversation.channel}\n\nConversation:\n${transcript}`;

  let generated: { summary: string; provider: string; model: string } | null = null;
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openRouterKey) {
    for (const model of OPENROUTER_FREE_MODELS) {
      const outcome = await runModel("openrouter", model, () => requestOpenRouter(openRouterKey, model, prompt), conversationId);
      if (outcome.ok) {
        generated = { summary: outcome.summary, provider: outcome.provider, model: outcome.model };
        break;
      }
      if (outcome.stopProvider) break;
    }
  } else logFailure({ event: "missing_openrouter_api_key", conversationId });

  const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!generated && geminiKey) {
    for (const model of GEMINI_FREE_MODELS) {
      const outcome = await runModel("gemini", model, () => requestGemini(geminiKey, model, prompt), conversationId);
      if (outcome.ok) {
        generated = { summary: outcome.summary, provider: outcome.provider, model: outcome.model };
        break;
      }
      if (outcome.stopProvider) break;
    }
  } else if (!generated && !geminiKey) logFailure({ event: "missing_gemini_api_key", conversationId });

  const summary = generated?.summary || emergencySummary(rows);
  const updatedAt = new Date().toISOString();
  const { error: saveError } = await db.from("conversation_summaries").upsert({
    conversation_id: conversation.id,
    summary,
    source_message_count: rows.length,
    updated_at: updatedAt,
  });
  if (saveError) throw new SummaryGenerationError("Summary generated but could not be saved", true);

  return {
    summary,
    sourceMessageCount: rows.length,
    updatedAt,
    workspaceId: conversation.workspace_id,
    provider: generated?.provider || "deterministic",
    model: generated?.model || null,
    fallback: !generated,
  };
}
