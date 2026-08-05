import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid internal note" }, { status: 400 });

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: conversation, error: conversationError } = await db
    .from("conversations")
    .select("id,workspace_id,contact_id")
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

  const { data: event, error } = await db
    .from("contact_events")
    .insert({
      workspace_id: conversation.workspace_id,
      contact_id: conversation.contact_id,
      conversation_id: conversation.id,
      event_type: "note",
      title: "Internal note added",
      metadata: { body: parsed.data.body, actor_membership_id: membership.id },
    })
    .select("id,workspace_id,contact_id,conversation_id,event_type,title,metadata,created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ event }, { status: 201 });
}
