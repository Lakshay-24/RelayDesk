import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ workspaceId: z.string().uuid() });

export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await db
    .from("memberships")
    .select("id,workspace_id,role,workspaces(id,name,slug,public_key)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const store = await cookies();
  const selected = store.get("relaydesk_workspace")?.value ?? null;
  const workspaces = (data ?? []).map((row) => {
    const workspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
    return workspace ? { ...workspace, membershipId: row.id, role: row.role } : null;
  }).filter(Boolean);
  const activeWorkspaceId = workspaces.some((item) => item?.id === selected) ? selected : workspaces[0]?.id ?? null;

  return NextResponse.json({ workspaces, activeWorkspaceId });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid workspace" }, { status: 400 });

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: membership } = await db.from("memberships").select("id").eq("workspace_id", parsed.data.workspaceId).eq("user_id", user.id).maybeSingle();
  if (!membership) return NextResponse.json({ error: "You do not have access to this workspace" }, { status: 403 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set("relaydesk_workspace", parsed.data.workspaceId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return response;
}
