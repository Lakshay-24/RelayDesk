import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { allowRequest, rateLimitHeaders, requestKey } from "@/lib/rate-limit";
import { dispatchWorkspaceWebhooks } from "@/lib/webhooks";

const schema = z.object({
  workspaceKey: z.string().uuid(),
  visitorKey: z.string().uuid(),
  name: z.string().trim().max(100).optional(),
  email: z.string().email().optional(),
});

export async function POST(request: Request) {
  const limited = allowRequest(requestKey(request, "widget-session"), 30, 60_000);
  if (!limited.allowed) return NextResponse.json({ error: "Too many connection attempts. Please wait a moment." }, { status: 429, headers: rateLimitHeaders(limited) });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid widget session" }, { status: 400 });
  const db = createAdminClient();
  const { data: workspace } = await db.from("workspaces").select("id,name,public_key").eq("public_key", parsed.data.workspaceKey).maybeSingle();
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  let { data: contact } = await db.from("contacts").select("*").eq("workspace_id", workspace.id).eq("visitor_key", parsed.data.visitorKey).maybeSingle();
  if (!contact) {
    const result = await db.from("contacts").insert({ workspace_id: workspace.id, visitor_key: parsed.data.visitorKey, name: parsed.data.name ?? null, email: parsed.data.email ?? null, last_seen_at: new Date().toISOString() }).select().single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
    contact = result.data;
  } else {
    await db.from("contacts").update({ last_seen_at: new Date().toISOString(), name: parsed.data.name ?? contact.name, email: parsed.data.email ?? contact.email }).eq("id", contact.id);
  }

  let { data: conversation } = await db.from("conversations").select("*").eq("workspace_id", workspace.id).eq("contact_id", contact.id).eq("channel", "chat").in("status", ["open", "snoozed"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  let created = false;
  if (!conversation) {
    const result = await db.from("conversations").insert({ workspace_id: workspace.id, contact_id: contact.id, channel: "chat", subject: "Website conversation" }).select().single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
    conversation = result.data;
    created = true;
  }

  if (created) await dispatchWorkspaceWebhooks({ workspaceId: workspace.id, event: "conversation.created", data: { conversation, contact } });
  const { data: messages } = await db.from("messages").select("id,conversation_id,sender_type,body,read_at,agent_read_at,visitor_read_at,created_at").eq("conversation_id", conversation.id).order("created_at");
  return NextResponse.json({ workspace: { name: workspace.name }, conversationId: conversation.id, messages: messages ?? [] }, { headers: rateLimitHeaders(limited) });
}
