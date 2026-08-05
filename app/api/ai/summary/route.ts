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

export async function POST(req: Request) {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: conversation } = await db
    .from("conversations")
    .select("id,workspace_id")
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

  const { data: messages } = await db
    .from("messages")
    .select("sender_type,body,created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at")
    .limit(100);
  if (!messages?.length) return Response.json({ error: "Conversation is empty" }, { status: 404 });

  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return Response.json({ error: "AI summaries are not configured" }, { status: 503 });

  const transcript = messages.map((message) => `${message.sender_type}: ${message.body}`).join("\n");

  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.AI_GATEWAY_MODEL || "openai/gpt-5.4-mini",
        input: [{
          type: "message",
          role: "user",
          content: `Summarize this customer-support conversation in under 120 words. Include the customer goal, key facts, actions already tried, unresolved questions, and current status. Never invent facts.\n\n${transcript}`,
        }],
        temperature: 0.1,
        max_output_tokens: 300,
        providerOptions: { gateway: { models: [
          process.env.AI_GATEWAY_MODEL || "openai/gpt-5.4-mini",
          "google/gemini-3.1-flash-lite-preview",
          "anthropic/claude-haiku-4.5",
        ] } },
      }),
    });

    const payload = await response.json() as GatewayPayload;
    if (!response.ok) {
      console.error("AI Gateway summary failed", payload);
      return Response.json({ error: "AI summary temporarily unavailable" }, { status: 503 });
    }

    const summary = extractText(payload);
    if (!summary) return Response.json({ error: "AI summary was empty" }, { status: 502 });

    await db.from("conversation_summaries").upsert({
      conversation_id: conversation.id,
      summary,
      source_message_count: messages.length,
      updated_at: new Date().toISOString(),
    });
    return Response.json({ summary });
  } catch (error) {
    console.error("AI Gateway summary failed", error);
    return Response.json({ error: "AI summary temporarily unavailable" }, { status: 503 });
  }
}
