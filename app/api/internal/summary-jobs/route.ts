import { createAdminClient } from "@/lib/supabase/admin";
import { generateAndPersistSummary, SummaryGenerationError } from "@/lib/ai-summary";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const now = new Date().toISOString();
  const { data: jobs, error } = await db
    .from("conversation_summary_jobs")
    .select("conversation_id,workspace_id,requested_message_count,attempts")
    .lte("available_at", now)
    .or(`locked_at.is.null,locked_at.lt.${new Date(Date.now() - 5 * 60_000).toISOString()}`)
    .order("available_at")
    .limit(5);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results: Array<{ conversationId: string; status: string; error?: string }> = [];
  for (const job of jobs ?? []) {
    const lockTime = new Date().toISOString();
    const { data: locked } = await db
      .from("conversation_summary_jobs")
      .update({ locked_at: lockTime, updated_at: lockTime })
      .eq("conversation_id", job.conversation_id)
      .eq("attempts", job.attempts)
      .select("conversation_id")
      .maybeSingle();
    if (!locked) continue;

    try {
      const generated = await generateAndPersistSummary(job.conversation_id);
      const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", job.conversation_id);
      if ((count ?? 0) > generated.sourceMessageCount) {
        await db.from("conversation_summary_jobs").update({
          requested_message_count: count ?? generated.sourceMessageCount,
          attempts: 0,
          available_at: new Date(Date.now() + 20_000).toISOString(),
          locked_at: null,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("conversation_id", job.conversation_id);
        results.push({ conversationId: job.conversation_id, status: "requeued" });
      } else {
        await db.from("conversation_summary_jobs").delete().eq("conversation_id", job.conversation_id);
        results.push({ conversationId: job.conversation_id, status: "updated" });
      }
    } catch (caught) {
      const summaryError = caught instanceof SummaryGenerationError ? caught : new SummaryGenerationError("Summary refresh failed", true);
      const attempts = job.attempts + 1;
      if (!summaryError.retryable || attempts >= 5) {
        await db.from("conversation_summary_jobs").delete().eq("conversation_id", job.conversation_id);
        results.push({ conversationId: job.conversation_id, status: "discarded", error: summaryError.message });
      } else {
        const delayMinutes = Math.min(60, 2 ** attempts);
        await db.from("conversation_summary_jobs").update({
          attempts,
          available_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
          locked_at: null,
          last_error: summaryError.message.slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq("conversation_id", job.conversation_id);
        results.push({ conversationId: job.conversation_id, status: "retry_scheduled", error: summaryError.message });
      }
    }
  }

  return Response.json({ processed: results.length, results, checkedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
