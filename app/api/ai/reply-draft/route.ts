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
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return respond({ error: "AI replies are not configured", requestId }, { status: 503, headers: rateLimitHeaders(limited) });

  const transcript = messages.map((message) => `${message.sender_type}: ${message.body}`).join("\n");
  const knowledge = (articles ?? [])
    .map((article) => `${article.title}: ${article.excerpt ?? article.body_html?.replace(/<[^>]*>/g, " ").slice(0, 500) ?? ""}`)
    .join("\n");
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
          content: `Draft a concise, warm customer-support reply. Answer only from the conversation and knowledge excerpts. Do not invent policies, promises, refunds, dates, or completed actions. Ask one precise question when essential information is missing. Return only the reply text.\n\nSubject: ${conversation.subject ?? "Support request"}\nChannel: ${conversation.channel}\n\nConversation:\n${transcript}\n\nKnowledge excerpts:\n${knowledge || "No relevant published articles available."}`,
        }],
        temperature: 0.2,
        max_output_tokens: 350,
        providerOptions: { gateway: { models: [preferredModel, "google/gemini-3.1-flash-lite-preview", "anthropic/claude-haiku-4.5"] } },
      }),
    });

    const payload = await response.json().catch(() => ({})) as GatewayPayload;
    if (!response.ok) {
      console.error("AI Gateway reply draft failed", { requestId, status: response.status });
      return respond({ error: "AI reply temporarily unavailable", requestId }, { status: 503, headers: rateLimitHeaders(limited) });
    }

    const draft = extractText(payload);
    if (!draft) return respond({ error: "AI reply was empty", requestId }, { status: 502, headers: rateLimitHeaders(limited) });
    return respond({ draft, requestId }, { headers: rateLimitHeaders(limited) });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    console.error("AI Gateway reply draft failed", { requestId, timedOut });
    return respond({ error: timedOut ? "AI reply timed out. Please try again." : "AI reply temporarily unavailable", requestId }, { status: 503, headers: rateLimitHeaders(limited) });
  }
}
