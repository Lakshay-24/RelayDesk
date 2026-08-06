import { createAdminClient } from "@/lib/supabase/admin";

type OpenRouterPayload = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { code?: string | number; message?: string };
  model?: string;
};

type GeminiPayload = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { code?: number; message?: string; status?: string };
  modelVersion?: string;
};

type ProviderResult =
  | { ok: true; summary: string; provider: "openrouter" | "gemini"; model: string }
  | { ok: false; reason: string; timedOut: boolean; status?: number };

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

function uniqueModels(models: string[]) {
  return [...new Set(models.map((model) => model.trim()).filter(Boolean))];
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
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 320,
      }),
    });

    const raw = await response.text();
    let payload: OpenRouterPayload = {};
    try { payload = raw ? JSON.parse(raw) as OpenRouterPayload : {}; } catch { payload = {}; }

    if (!response.ok) return {
      ok: false,
      timedOut: false,
      status: response.status,
      reason: payload.error?.message || raw.slice(0, 400) || response.statusText || "OpenRouter request failed",
    };

    const summary = payload.choices?.[0]?.message?.content?.trim();
    if (!summary) return { ok: false, timedOut: false, status: response.status, reason: "OpenRouter returned an empty summary" };
    return { ok: true, summary, provider: "openrouter", model: payload.model || model };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return { ok: false, timedOut, reason: timedOut ? "OpenRouter timed out" : error instanceof Error ? error.message : "OpenRouter network error" };
  }
}

async function requestGemini(apiKey: string, model: string, prompt: string): Promise<ProviderResult> {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 320,
        },
      }),
    });

    const raw = await response.text();
    let payload: GeminiPayload = {};
    try { payload = raw ? JSON.parse(raw) as GeminiPayload : {}; } catch { payload = {}; }

    if (!response.ok) return {
      ok: false,
      timedOut: false,
      status: response.status,
      reason: payload.error?.message || raw.slice(0, 400) || response.statusText || "Gemini request failed",
    };

    const summary = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!summary) return { ok: false, timedOut: false, status: response.status, reason: "Gemini returned an empty summary" };
    return { ok: true, summary, provider: "gemini", model: payload.modelVersion || model };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return { ok: false, timedOut, reason: timedOut ? "Gemini timed out" : error instanceof Error ? error.message : "Gemini network error" };
  }
}

export async function generateAndPersistSummary(conversationId: string) {
  const db = createAdminClient();
  const { data: conversation } = await db
    .from("conversations")
    .select("id,workspace_id,subject,channel")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) throw new SummaryGenerationError("Conversation not found", false);

  const { data: messages, error: messageError } = await db
    .from("messages")
    .select("sender_type,body,created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at")
    .limit(100);
  if (messageError) throw new SummaryGenerationError("Could not load conversation messages", true);
  if (!messages?.length) throw new SummaryGenerationError("Conversation is empty", false);

  const rows = messages as MessageRow[];
  const transcript = rows.map((message) => `${message.sender_type}: ${message.body}`).join("\n");
  const prompt = `Summarize this customer-support conversation in under 140 words. Use four short labeled lines: Customer goal, Key facts / attempts, Unresolved questions, Current status / next action. Never invent facts, policies, promises, dates, or completed actions. Do not repeat abusive or threatening wording; describe it neutrally when relevant. Return only the summary.\n\nSubject: ${conversation.subject ?? "Support request"}\nChannel: ${conversation.channel}\n\nConversation:\n${transcript}`;

  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const openRouterModels = uniqueModels([
    process.env.OPENROUTER_MODEL?.trim() || "openrouter/free",
    process.env.OPENROUTER_FALLBACK_MODEL?.trim() || "openrouter/free",
  ]);
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  const geminiModels = uniqueModels([
    process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
    process.env.GEMINI_FALLBACK_MODEL?.trim() || "gemini-2.0-flash",
  ]);

  let generated: { summary: string; provider: string; model: string } | null = null;

  if (openRouterKey) {
    for (let attempt = 0; attempt < openRouterModels.length; attempt += 1) {
      const result = await requestOpenRouter(openRouterKey, openRouterModels[attempt], prompt);
      if (result.ok) {
        generated = { summary: result.summary, provider: result.provider, model: result.model };
        break;
      }
      logFailure({ event: result.timedOut ? "openrouter_timeout" : "openrouter_attempt_failed", conversationId, attempt: attempt + 1, model: openRouterModels[attempt], status: result.status ?? null, message: result.reason });
    }
  } else {
    logFailure({ event: "missing_openrouter_api_key", conversationId, models: openRouterModels });
  }

  if (!generated && geminiKey) {
    for (let attempt = 0; attempt < geminiModels.length; attempt += 1) {
      const result = await requestGemini(geminiKey, geminiModels[attempt], prompt);
      if (result.ok) {
        generated = { summary: result.summary, provider: result.provider, model: result.model };
        break;
      }
      logFailure({ event: result.timedOut ? "gemini_timeout" : "gemini_attempt_failed", conversationId, attempt: attempt + 1, model: geminiModels[attempt], status: result.status ?? null, message: result.reason });
    }
  } else if (!generated && !geminiKey) {
    logFailure({ event: "missing_gemini_api_key", conversationId, models: geminiModels });
  }

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
