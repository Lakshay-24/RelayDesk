import { randomBytes } from "crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiKeyHash } from "@/lib/api-auth";

const allowedScopes = ["conversations:read", "conversations:write", "contacts:read", "messages:read"] as const;
const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.enum(allowedScopes)).min(1).max(4),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});
const revokeSchema = z.object({ keyId: z.string().uuid() });

async function adminContext() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const { data: membership } = await db.from("memberships").select("id,workspace_id,role").eq("user_id", user.id).eq("role", "admin").limit(1).maybeSingle();
  if (!membership) return { error: Response.json({ error: "Admin access required" }, { status: 403 }) } as const;
  return { db, user, membership } as const;
}

export async function GET() {
  const context = await adminContext();
  if ("error" in context) return context.error;
  const { data, error } = await context.db.from("api_keys").select("id,name,key_prefix,scopes,last_used_at,expires_at,revoked_at,created_at").eq("workspace_id", context.membership.workspace_id).order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ apiKeys: data ?? [] }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid API key request", details: parsed.error.flatten() }, { status: 400 });
  const context = await adminContext();
  if ("error" in context) return context.error;

  const plainKey = `rd_live_${randomBytes(32).toString("base64url")}`;
  const expiresAt = parsed.data.expiresInDays ? new Date(Date.now() + parsed.data.expiresInDays * 86400000).toISOString() : null;
  const { data, error } = await context.db.from("api_keys").insert({
    workspace_id: context.membership.workspace_id,
    name: parsed.data.name,
    key_prefix: plainKey.slice(0, 16),
    key_hash: apiKeyHash(plainKey),
    scopes: [...new Set(parsed.data.scopes)],
    created_by: context.user.id,
    expires_at: expiresAt,
  }).select("id,name,key_prefix,scopes,last_used_at,expires_at,revoked_at,created_at").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ apiKey: data, secret: plainKey }, { status: 201 });
}

export async function DELETE(request: Request) {
  const parsed = revokeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid API key" }, { status: 400 });
  const context = await adminContext();
  if ("error" in context) return context.error;
  const { data, error } = await context.db.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", parsed.data.keyId).eq("workspace_id", context.membership.workspace_id).select("id").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  if (!data) return Response.json({ error: "API key not found" }, { status: 404 });
  return Response.json({ ok: true });
}
