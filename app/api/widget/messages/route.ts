import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchWorkspaceWebhooks } from "@/lib/webhooks";
import { allowRequest, rateLimitHeaders, requestKey } from "@/lib/rate-limit";

const postSchema = z.object({ workspaceKey: z.string().uuid(), visitorKey: z.string().uuid(), conversationId: z.string().uuid(), body: z.string().trim().min(1).max(4000) });

async function verify(db: ReturnType<typeof createAdminClient>, workspaceKey: string, visitorKey: string, conversationId: string) {
  const { data } = await db.from("conversations").select("id,workspace_id,workspaces!inner(public_key),contacts!inner(visitor_key)").eq("id", conversationId).eq("workspaces.public_key", workspaceKey).eq("contacts.visitor_key", visitorKey).maybeSingle();
  return data;
}

export async function POST(request: Request) {
  const limited = allowRequest(requestKey(request, "widget-message"), 20, 60_000);
  if (!limited.allowed) return NextResponse.json({ error: "You are sending messages too quickly. Please wait a moment." }, { status: 429, headers: rateLimitHeaders(limited) });
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  const db = createAdminClient();
  const conversation = await verify(db, parsed.data.workspaceKey, parsed.data.visitorKey, parsed.data.conversationId);
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const now = new Date().toISOString();
  const { data: message, error } = await db.from("messages").insert({ workspace_id: conversation.workspace_id, conversation_id: conversation.id, sender_type: "contact", channel: "chat", body: parsed.data.body }).select("id,conversation_id,sender_type,body,read_at,agent_read_at,visitor_read_at,created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db.from("conversations").update({ last_message_at: now, updated_at: now, status: "open" }).eq("id", conversation.id);
  await db.channel(`conversation:${conversation.id}`).send({ type: "broadcast", event: "message", payload: message });
  await dispatchWorkspaceWebhooks({ workspaceId: conversation.workspace_id, event: "message.created", data: { message, conversation_id: conversation.id } });
  return NextResponse.json({ message }, { headers: rateLimitHeaders(limited) });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = z.object({ workspaceKey: z.string().uuid(), visitorKey: z.string().uuid(), conversationId: z.string().uuid() }).safeParse({ workspaceKey: url.searchParams.get("workspaceKey"), visitorKey: url.searchParams.get("visitorKey"), conversationId: url.searchParams.get("conversationId") });
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const db = createAdminClient();
  const conversation = await verify(db, parsed.data.workspaceKey, parsed.data.visitorKey, parsed.data.conversationId);
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  const { data } = await db.from("messages").select("id,conversation_id,sender_type,body,read_at,agent_read_at,visitor_read_at,created_at").eq("conversation_id", conversation.id).order("created_at");
  return NextResponse.json({ messages: data ?? [] });
}
