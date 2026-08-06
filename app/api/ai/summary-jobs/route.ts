import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAndPersistSummary, SummaryGenerationError } from "@/lib/ai-summary";

const schema = z.object({ workspaceId: z.string().uuid() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid workspace" }, { status: 400 });

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await db
    .from("memberships")
    .select("id")
    .eq("workspace_id", parsed.data.workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: jobs, error: jobsError } = await admin
    .from("conversation_summary_jobs")
    .select("conversation_id,attempts")
    .eq("workspace_id", parsed.data.workspaceId)
    .lte("available_at", now)
    .is("locked_at", null)
    .order("available_at", { ascending: true })
    .limit(3);
  if (jobsError) return NextResponse.json({ error: jobsError.message }, { status: 500 });

  const processed: Array<{ conversationId: string; ok: boolean }> = [];
  for (const job of jobs ?? []) {
    const lockedAt = new Date().toISOString();
    const { data: locked } = await admin
      .from("conversation_summary_jobs")
      .update({ locked_at: lockedAt, updated_at: lockedAt })
      .eq("conversation_id", job.conversation_id)
      .is("locked_at", null)
      .select("conversation_id")
      .maybeSingle();
    if (!locked) continue;

    try {
      await generateAndPersistSummary(job.conversation_id);
      await admin.from("conversation_summary_jobs").delete().eq("conversation_id", job.conversation_id);
      processed.push({ conversationId: job.conversation_id, ok: true });
    } catch (caught) {
      const error = caught instanceof SummaryGenerationError
        ? caught
        : new SummaryGenerationError("AI summary temporarily unavailable", true);
      const attempts = Number(job.attempts ?? 0) + 1;
      const retryMinutes = Math.min(30, Math.max(1, 2 ** Math.min(attempts - 1, 4)));
      const availableAt = new Date(Date.now() + retryMinutes * 60_000).toISOString();
      await admin.from("conversation_summary_jobs").update({
        attempts,
        available_at: availableAt,
        locked_at: null,
        last_error: error.message,
        updated_at: new Date().toISOString(),
      }).eq("conversation_id", job.conversation_id);
      processed.push({ conversationId: job.conversation_id, ok: false });
    }
  }

  return NextResponse.json({ processed, processedCount: processed.length });
}
