import { z } from "zod";
import { apiJson, authenticateApiKey } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const querySchema = z.object({
  status: z.enum(["open", "snoozed", "resolved"]).optional(),
  channel: z.enum(["chat", "email"]).optional(),
  assigneeId: z.string().uuid().optional(),
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: Request) {
  const principal = await authenticateApiKey(request, "conversations:read");
  if (!principal) return apiJson({ error: "Invalid API key or missing scope" }, { status: 401 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return apiJson({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });

  const db = createAdminClient();
  let query = db.from("conversations")
    .select("id,workspace_id,contact_id,channel,subject,status,assignee_id,priority,snoozed_until,first_response_at,resolved_at,sla_due_at,last_message_at,created_at,updated_at,contacts(id,name,email,last_seen_at)")
    .eq("workspace_id", principal.workspaceId)
    .order("last_message_at", { ascending: false })
    .limit(parsed.data.limit + 1);
  if (parsed.data.status) query = query.eq("status", parsed.data.status);
  if (parsed.data.channel) query = query.eq("channel", parsed.data.channel);
  if (parsed.data.assigneeId) query = query.eq("assignee_id", parsed.data.assigneeId);
  if (parsed.data.cursor) query = query.lt("last_message_at", parsed.data.cursor);

  const { data, error } = await query;
  if (error) return apiJson({ error: "Could not load conversations" }, { status: 500 });
  const rows = data ?? [];
  const hasMore = rows.length > parsed.data.limit;
  const items = rows.slice(0, parsed.data.limit);
  return apiJson({
    data: items,
    pagination: { has_more: hasMore, next_cursor: hasMore ? items.at(-1)?.last_message_at ?? null : null },
  });
}
