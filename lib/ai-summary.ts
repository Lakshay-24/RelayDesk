import { createAdminClient } from "@/lib/supabase/admin";

type GatewayContent = { text?: string; value?: string };
type GatewayOutput = { content?: GatewayContent[] };
type GatewayPayload = { output_text?: string; output?: GatewayOutput[] };

function extractText(payload: GatewayPayload): string | null {
  if (typeof payload.output_text === "string") return payload.output_text.trim();
  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((item) => item.text ?? item.value ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || null;
}

export class SummaryGenerationError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = "SummaryGenerationError";
  }
}

export async function generateAndPersistSummary(conversationId: string) {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new SummaryGenerationError("AI summaries are not configured", false);

  const db = createAdminClient();
  const { data: conversation } = await db
    .from("conversations")
    .select("id,workspace_id")
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

  const transcript = messages.map((message) => `${message.sender_type}: ${message.body}`).join("\n");
  const preferredModel = process.env.AI_GATEWAY_MODEL || "openai/gpt-5.4-mini";
  let response: Response;
  try {
    response = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: preferredModel,
        input: [{
          type: "message",
          role: "user",
          content: `Summarize this customer-support conversation in under 120 words. Include the customer goal, key facts, actions already tried, unresolved questions, and current status. Never invent facts.\n\n${transcript}`,
        }],
        temperature: 0.1,
        max_output_tokens: 300,
        providerOptions: { gateway: { models: [preferredModel, "google/gemini-3.1-flash-lite-preview", "anthropic/claude-haiku-4.5"] } },
      }),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new SummaryGenerationError(timedOut ? "AI summary timed out" : "AI summary temporarily unavailable", true);
  }

  const payload = await response.json().catch(() => ({})) as GatewayPayload;
  if (!response.ok) throw new SummaryGenerationError(`AI gateway returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
  const summary = extractText(payload);
  if (!summary) throw new SummaryGenerationError("AI summary was empty", true);

  const updatedAt = new Date().toISOString();
  const { error: saveError } = await db.from("conversation_summaries").upsert({
    conversation_id: conversation.id,
    summary,
    source_message_count: messages.length,
    updated_at: updatedAt,
  });
  if (saveError) throw new SummaryGenerationError("Summary generated but could not be saved", true);

  return { summary, sourceMessageCount: messages.length, updatedAt, workspaceId: conversation.workspace_id };
}
