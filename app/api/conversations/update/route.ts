import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  conversationId: z.string().uuid(),
  patch: z.object({
    status: z.enum(["open", "snoozed", "resolved"]).optional(),
    assignee_id: z.string().uuid().nullable().optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    snoozed_until: z.string().datetime().nullable().optional(),
  }).refine((value) => Object.keys(value).length > 0, "No changes supplied"),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid conversation update" }, { status: 400 });

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: conversation, error: conversationError } = await db
    .from("conversations")
    .select("id,workspace_id,contact_id,status,assignee_id,priority,snoozed_until")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();
  if (conversationError) return NextResponse.json({ error: conversationError.message }, { status: 500 });
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const { data: membership } = await db
    .from("memberships")
    .select("id")
    .eq("workspace_id", conversation.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (parsed.data.patch.assignee_id) {
    const { data: assignee } = await db
      .from("memberships")
      .select("id")
      .eq("id", parsed.data.patch.assignee_id)
      .eq("workspace_id", conversation.workspace_id)
      .maybeSingle();
    if (!assignee) return NextResponse.json({ error: "Assignee is not a member of this workspace" }, { status: 400 });
  }

  const patch = { ...parsed.data.patch };
  if (patch.status === "snoozed" && !patch.snoozed_until) {
    patch.snoozed_until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  }
  if (patch.status && patch.status !== "snoozed") patch.snoozed_until = null;

  const { data: updated, error: updateError } = await db
    .from("conversations")
    .update(patch)
    .eq("id", conversation.id)
    .eq("workspace_id", conversation.workspace_id)
    .select("id,status,assignee_id,priority,snoozed_until,resolved_at,updated_at")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  const events: Array<Record<string, unknown>> = [];
  if (Object.prototype.hasOwnProperty.call(patch, "assignee_id") && patch.assignee_id !== conversation.assignee_id) {
    events.push({
      workspace_id: conversation.workspace_id,
      contact_id: conversation.contact_id,
      conversation_id: conversation.id,
      event_type: "assigned",
      title: patch.assignee_id ? "Conversation assigned" : "Conversation unassigned",
      metadata: { previous_assignee_id: conversation.assignee_id, assignee_id: patch.assignee_id, actor_membership_id: membership.id },
    });
  }
  if (patch.status && patch.status !== conversation.status) {
    events.push({
      workspace_id: conversation.workspace_id,
      contact_id: conversation.contact_id,
      conversation_id: conversation.id,
      event_type: "status_changed",
      title: `Conversation marked ${patch.status}`,
      metadata: { previous_status: conversation.status, status: patch.status, actor_membership_id: membership.id },
    });
  }
  if (events.length) {
    const { error: eventError } = await db.from("contact_events").insert(events);
    if (eventError) console.error("conversation audit event insert failed", { conversationId: conversation.id, message: eventError.message });
  }

  return NextResponse.json({ conversation: updated });
}
