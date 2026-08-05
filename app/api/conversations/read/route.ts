import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ conversationId: z.string().uuid() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("memberships")
    .select("id,workspace_id")
    .limit(1)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", parsed.data.conversationId)
    .eq("workspace_id", membership.workspace_id)
    .maybeSingle();

  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const readAt = new Date().toISOString();
  const { error } = await supabase
    .from("messages")
    .update({ agent_read_at: readAt, read_at: readAt })
    .eq("conversation_id", conversation.id)
    .eq("sender_type", "contact")
    .is("agent_read_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ readAt });
}
