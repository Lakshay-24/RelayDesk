import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: conversation } = await db
    .from("conversations")
    .select("id,workspace_id,subject,channel")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();
  if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });

  const { data: membership } = await db
    .from("memberships")
    .select("id")
    .eq("workspace_id", conversation.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return Response.json({ error: "Forbidden" }, { status: 403 });

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

  if (!messages?.length) return Response.json({ error: "Conversation is empty" }, { status: 404 });
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return Response.json({ error: "AI replies are not configured" }, { status: 503 });

  const transcript = messages.map((message) => `${message.sender_type}: ${message.body}`).join("\n");
  const knowledge = (articles ?? []).map((article) => `${article.title}: ${article.excerpt ?? article.body_html?.replace(/<[^>]*>/g, " ").slice(0, 500) ?? ""}`).join("\n");

  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.AI_GATEWAY_MODEL || "openai/gpt-5.4-mini",
        input: [{
          type: "message",
          role: "user",
          content: `Draft a concise, warm customer-support reply. Answer only from the conversation and knowledge excerpts. Do not invent policies, promises, refunds, dates, or completed actions. Ask one precise question when essential information is missing. Return only the reply text.\n\nSubject: ${conversation.subject ?? "Support request"}\nChannel: ${conversation.channel}\n\nConversation:\n${transcript}\n\nKnowledge excerpts:\n${knowledge || "No relevant published articles available."}`,
        }],
        temperature: 0.2,
        max_output_tokens: 350,
        providerOptions: { gateway: { models: [
          process.env.AI_GATEWAY_MODEL || "openai/gpt-5.4-mini",
          "google/gemini-3.1-flash-lite-preview",
          "anthropic/claude-haiku-4.5",
        ] } },
      }),
    });
    const payload = await response.json() as GatewayPayload;
    if (!response.ok) {
      console.error("AI Gateway reply draft failed", payload);
      return Response.json({ error: "AI reply temporarily unavailable" }, { status: 503 });
    }
    const draft = extractText(payload);
    if (!draft) return Response.json({ error: "AI reply was empty" }, { status: 502 });
    return Response.json({ draft });
  } catch (error) {
    console.error("AI Gateway reply draft failed", error);
    return Response.json({ error: "AI reply temporarily unavailable" }, { status: 503 });
  }
}
