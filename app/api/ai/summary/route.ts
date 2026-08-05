import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { allowRequest, rateLimitHeaders } from "@/lib/rate-limit";

const input = z.object({ conversationId: z.string().uuid() });

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

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const respond = (body: unknown, init?: ResponseInit) => Response.json(body, {
    ...init,
    headers: { "x-request-id": requestId, ...(init?.headers ?? {}) },
  });

  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return respond({ error: "Invalid request", requestId }, { status: 400 });

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return respond({ error: "Unauthorized", requestId }, { status: 401 });

  const limited = allowRequest(`ai-summary:${user.id}`, 10, 60_000);
  if (!limited.allowed) return respond(
    { error: "AI summary limit reached. Please wait a minute and try again.", requestId },
    { status: 429, headers: rateLimitHeaders(limited) },
  );

  const { data: conversation } = await db
    .from("conversations")
    .select("id,workspace_id")
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

  const { data: messages } = await db
    .from("messages")
    .select("sender_type,body,created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at")
    .limit(100);
  if (!messages?.length) return respond({ error: "Conversation is empty", requestId }, { status: 404, headers: rateLimitHeaders(limited) });

  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return respond({ error: "AI summaries are not configured", requestId }, { status: 503, headers: rateLimitHeaders(limited) });

  const transcript = messages.map((message) => `${message.sender_type}: ${message.body}`).join("\n");
  const preferredModel = process.env.AI_GATEWAY_MODEL || "openai/gpt-5.4-mini";

  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
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

    const payload = await response.json().catch(() => ({})) as GatewayPayload;
    if (!response.ok) {
      console.error("AI Gateway summary failed", { requestId, status: response.status });
      return respond({ error: "AI summary temporarily unavailable", requestId }, { status: 503, headers: rateLimitHeaders(limited) });
    }

    const summary = extractText(payload);
    if (!summary) return respond({ error: "AI summary was empty", requestId }, { status: 502, headers: rateLimitHeaders(limited) });

    const { error: saveError } = await db.from("conversation_summaries").upsert({
      conversation_id: conversation.id,
      summary,
      source_message_count: messages.length,
      updated_at: new Date().toISOString(),
    });
    if (saveError) {
      console.error("AI summary persistence failed", { requestId, code: saveError.code });
      return respond({ error: "Summary generated but could not be saved", requestId }, { status: 500, headers: rateLimitHeaders(limited) });
    }

    return respond({ summary, sourceMessageCount: messages.length, requestId }, { headers: rateLimitHeaders(limited) });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    console.error("AI Gateway summary failed", { requestId, timedOut });
    return respond({ error: timedOut ? "AI summary timed out. Please try again." : "AI summary temporarily unavailable", requestId }, { status: 503, headers: rateLimitHeaders(limited) });
  }
}
