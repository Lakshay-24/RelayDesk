import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({ workspaceId: z.string().uuid(), name: z.string().trim().min(2).max(80) });
const updateSchema = z.object({ workspaceId: z.string().uuid(), id: z.string().uuid(), name: z.string().trim().min(2).max(80).optional(), position: z.number().int().min(0).optional() });
const deleteSchema = z.object({ workspaceId: z.string().uuid(), id: z.string().uuid() });

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function authorize(workspaceId: string) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: membership } = await db.from("memberships").select("id").eq("workspace_id", workspaceId).eq("user_id", user.id).maybeSingle();
  if (!membership) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { db };
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  const auth = await authorize(parsed.data.workspaceId);
  if (auth.error) return auth.error;
  const { data: last } = await auth.db.from("kb_categories").select("position").eq("workspace_id", parsed.data.workspaceId).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await auth.db.from("kb_categories").insert({ workspace_id: parsed.data.workspaceId, name: parsed.data.name, slug: slugify(parsed.data.name), position: (last?.position ?? -1) + 1 }).select("id,name,slug,position").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "A category with that name already exists" : error.message }, { status: 400 });
  return NextResponse.json({ category: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.name === undefined && parsed.data.position === undefined)) return NextResponse.json({ error: "Invalid category update" }, { status: 400 });
  const auth = await authorize(parsed.data.workspaceId);
  if (auth.error) return auth.error;
  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) { patch.name = parsed.data.name; patch.slug = slugify(parsed.data.name); }
  if (parsed.data.position !== undefined) patch.position = parsed.data.position;
  const { data, error } = await auth.db.from("kb_categories").update(patch).eq("id", parsed.data.id).eq("workspace_id", parsed.data.workspaceId).select("id,name,slug,position").maybeSingle();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "A category with that name already exists" : error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  return NextResponse.json({ category: data });
}

export async function DELETE(request: Request) {
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  const auth = await authorize(parsed.data.workspaceId);
  if (auth.error) return auth.error;
  await auth.db.from("kb_articles").update({ category_id: null }).eq("workspace_id", parsed.data.workspaceId).eq("category_id", parsed.data.id);
  const { error, count } = await auth.db.from("kb_categories").delete({ count: "exact" }).eq("id", parsed.data.id).eq("workspace_id", parsed.data.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!count) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
