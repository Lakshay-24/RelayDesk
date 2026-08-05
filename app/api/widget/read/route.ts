import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  workspaceKey: z.string().uuid(),
  visitorKey: z.string().uuid(),
  conversationId: z.string().uuid(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const { data: conversation } = await db
    .from("conversations")
    .select("id,workspace_id,workspaces!inner(public_key),contacts!inner(visitor_key)")
    .eq("id", parsed.data.conversationId)
    .eq("workspaces.public_key", parsed.data.workspaceKey)
    .eq("contacts.visitor_key", parsed.data.visitorKey)
    .maybeSingle();

  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const readAt = new Date().toISOString();
  const { error } = await db
    .from("messages")
    .update({ visitor_read_at: readAt, read_at: readAt })
    .eq("conversation_id", conversation.id)
    .eq("sender_type", "agent")
    .is("visitor_read_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.channel(`conversation:${conversation.id}`).send({
    type: "broadcast",
    event: "read",
    payload: { sender: "visitor", readAt },
  });

  return NextResponse.json({ readAt });
}
