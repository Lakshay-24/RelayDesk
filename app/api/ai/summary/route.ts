import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { allowRequest, rateLimitHeaders } from "@/lib/rate-limit";
import { generateAndPersistSummary, SummaryGenerationError } from "@/lib/ai-summary";

const input = z.object({ conversationId: z.string().uuid() });

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

  try {
    const generated = await generateAndPersistSummary(conversation.id);
    await db.from("conversation_summary_jobs").delete().eq("conversation_id", conversation.id);
    return respond(
      { summary: generated.summary, sourceMessageCount: generated.sourceMessageCount, updatedAt: generated.updatedAt, requestId },
      { headers: rateLimitHeaders(limited) },
    );
  } catch (caught) {
    const error = caught instanceof SummaryGenerationError ? caught : new SummaryGenerationError("AI summary temporarily unavailable", true);
    console.error("AI summary failed", { requestId, retryable: error.retryable, message: error.message });
    const status = error.message === "AI summaries are not configured" ? 503
      : error.message === "Conversation is empty" ? 404
      : error.message === "Conversation not found" ? 404
      : 503;
    return respond({ error: error.message, requestId }, { status, headers: rateLimitHeaders(limited) });
  }
}
