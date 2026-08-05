import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const input = z.object({ conversationId: z.string().uuid() });

export async function POST(req: Request) {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: messages } = await db
    .from("messages")
    .select("sender_type,body,created_at")
    .eq("conversation_id", parsed.data.conversationId)
    .order("created_at")
    .limit(100);

  if (!messages) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AI summaries are not configured" }, { status: 503 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const transcript = messages
      .map((message) => `${message.sender_type}: ${message.body}`)
      .join("\n");

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
      contents: `Summarize this customer-support conversation in under 120 words. Include the customer goal, key facts, actions already tried, unresolved questions, and current status. Never invent facts.\n\n${transcript}`,
      config: {
        temperature: 0.1,
        maxOutputTokens: 300,
      },
    });

    const summary = response.text?.trim();
    if (!summary) {
      return Response.json({ error: "AI summary was empty" }, { status: 502 });
    }

    await db.from("conversation_summaries").upsert({
      conversation_id: parsed.data.conversationId,
      summary,
      source_message_count: messages.length,
      updated_at: new Date().toISOString(),
    });

    return Response.json({ summary });
  } catch (error) {
    console.error("Gemini summary failed", error);
    return Response.json({ error: "AI summary temporarily unavailable" }, { status: 503 });
  }
}
