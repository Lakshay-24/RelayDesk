import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const responseFields = "id,workspace_id,title,body,tags,created_at,updated_at";

const contentSchema = z.object({
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(5000),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});

const updateSchema = contentSchema.extend({ id: z.string().uuid() });
const deleteSchema = z.object({ id: z.string().uuid() });

async function getMembership() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, membership: null };

  const { data: membership } = await supabase
    .from("memberships")
    .select("id,workspace_id,user_id,role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  return { supabase, membership };
}

export async function GET() {
  const { supabase, membership } = await getMembership();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("canned_responses")
    .select(responseFields)
    .eq("workspace_id", membership.workspace_id)
    .order("title");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ responses: data ?? [] });
}

export async function POST(request: Request) {
  const parsed = contentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid canned response" }, { status: 400 });
  }

  const { supabase, membership } = await getMembership();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("canned_responses")
    .insert({
      workspace_id: membership.workspace_id,
      created_by: membership.user_id,
      title: parsed.data.title,
      body: parsed.data.body,
      tags: parsed.data.tags,
    })
    .select(responseFields)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ response: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid canned response" }, { status: 400 });
  }

  const { supabase, membership } = await getMembership();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("canned_responses")
    .update({
      title: parsed.data.title,
      body: parsed.data.body,
      tags: parsed.data.tags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("workspace_id", membership.workspace_id)
    .select(responseFields)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Saved reply not found" }, { status: 404 });
  return NextResponse.json({ response: data });
}

export async function DELETE(request: Request) {
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid saved reply" }, { status: 400 });

  const { supabase, membership } = await getMembership();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error, count } = await supabase
    .from("canned_responses")
    .delete({ count: "exact" })
    .eq("id", parsed.data.id)
    .eq("workspace_id", membership.workspace_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Saved reply not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
