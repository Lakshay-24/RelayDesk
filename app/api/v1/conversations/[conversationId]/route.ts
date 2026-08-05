import { z } from "zod";
import { apiJson, authenticateApiKey } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const patchSchema = z.object({
  status: z.enum(["open", "snoozed", "resolved"]).optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  snoozed_until: z.string().datetime().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "No changes supplied");

type Context = { params: Promise<{ conversationId: string }> };

export async function GET(request: Request, context: Context) {
  const principal = await authenticateApiKey(request, "conversations:read");
  if (!principal) return apiJson({ error: "Invalid API key or missing scope" }, { status: 401 });
  const { conversationId } = await context.params;
  if (!z.string().uuid().safeParse(conversationId).success) return apiJson({ error: "Invalid conversation ID" }, { status: 400 });

  const db = createAdminClient();
  const { data, error } = await db.from("conversations")
    .select("id,workspace_id,contact_id,channel,subject,status,assignee_id,priority,snoozed_until,first_response_at,resolved_at,sla_due_at,last_message_at,created_at,updated_at,contacts(id,name,email,last_seen_at),messages(id,sender_type,sender_membership_id,channel,body,external_message_id,in_reply_to,delivered_at,visitor_read_at,agent_read_at,created_at)")
    .eq("id", conversationId)
    .eq("workspace_id", principal.workspaceId)
    .maybeSingle();
  if (error) return apiJson({ error: "Could not load conversation" }, { status: 500 });
  if (!data) return apiJson({ error: "Conversation not found" }, { status: 404 });
  return apiJson({ data });
}

export async function PATCH(request: Request, context: Context) {
  const principal = await authenticateApiKey(request, "conversations:write");
  if (!principal) return apiJson({ error: "Invalid API key or missing scope" }, { status: 401 });
  const { conversationId } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(conversationId).success || !parsed.success) return apiJson({ error: "Invalid conversation update" }, { status: 400 });

  const db = createAdminClient();
  if (parsed.data.assignee_id) {
    const { data: member } = await db.from("memberships").select("id").eq("id", parsed.data.assignee_id).eq("workspace_id", principal.workspaceId).maybeSingle();
    if (!member) return apiJson({ error: "Assignee is not in this workspace" }, { status: 400 });
  }
  const patch = { ...parsed.data };
  if (patch.status === "snoozed" && !patch.snoozed_until) patch.snoozed_until = new Date(Date.now() + 3600000).toISOString();
  if (patch.status && patch.status !== "snoozed") patch.snoozed_until = null;

  const { data, error } = await db.from("conversations").update(patch).eq("id", conversationId).eq("workspace_id", principal.workspaceId).select("id,status,assignee_id,priority,snoozed_until,resolved_at,updated_at").maybeSingle();
  if (error) return apiJson({ error: error.message }, { status: 400 });
  if (!data) return apiJson({ error: "Conversation not found" }, { status: 404 });
  return apiJson({ data });
}
