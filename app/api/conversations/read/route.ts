import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ conversationId: z.string().uuid() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id,workspace_id")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("workspace_id", conversation.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const readAt = new Date().toISOString();
  const admin = createAdminClient();
  const { error } = await admin
    .from("messages")
    .update({ agent_read_at: readAt, read_at: readAt })
    .eq("conversation_id", conversation.id)
    .eq("sender_type", "contact")
    .is("agent_read_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.channel(`conversation:${conversation.id}`).send({
    type: "broadcast",
    event: "read",
    payload: { sender: "agent", readAt },
  });

  return NextResponse.json({ readAt });
}
