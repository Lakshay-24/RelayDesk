import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  firstResponseMinutes: z.number().int().min(1).max(10080),
  resolutionMinutes: z.number().int().min(1).max(43200),
  warningMinutes: z.number().int().min(1).max(1440),
  enabled: z.boolean(),
});

async function context() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const { data: membership } = await db.from("memberships").select("workspace_id,role").eq("user_id", user.id).limit(1).maybeSingle();
  if (!membership) return { error: Response.json({ error: "Workspace not found" }, { status: 404 }) } as const;
  return { db, membership } as const;
}

export async function GET() {
  const result = await context();
  if ("error" in result) return result.error;
  const { data, error } = await result.db.from("workspace_sla_policies").select("workspace_id,first_response_minutes,resolution_minutes,warning_minutes,enabled,updated_at").eq("workspace_id", result.membership.workspace_id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ policy: data ?? { workspace_id: result.membership.workspace_id, first_response_minutes: 60, resolution_minutes: 1440, warning_minutes: 15, enabled: true } }, { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid SLA policy", details: parsed.error.flatten() }, { status: 400 });
  const result = await context();
  if ("error" in result) return result.error;
  if (result.membership.role !== "admin") return Response.json({ error: "Only admins can update SLA policy" }, { status: 403 });
  const { data, error } = await result.db.from("workspace_sla_policies").upsert({
    workspace_id: result.membership.workspace_id,
    first_response_minutes: parsed.data.firstResponseMinutes,
    resolution_minutes: parsed.data.resolutionMinutes,
    warning_minutes: parsed.data.warningMinutes,
    enabled: parsed.data.enabled,
    updated_at: new Date().toISOString(),
  }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ policy: data });
}
