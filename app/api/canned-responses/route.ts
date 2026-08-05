import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(5000),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});

async function getMembership() {
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("memberships")
    .select("id,workspace_id,user_id")
    .limit(1)
    .maybeSingle();
  return { supabase, membership };
}

export async function GET() {
  const { supabase, membership } = await getMembership();
  if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("canned_responses")
    .select("id,title,body,tags,created_at,updated_at")
    .eq("workspace_id", membership.workspace_id)
    .order("title");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ responses: data ?? [] });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid canned response" }, { status: 400 });

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
    .select("id,title,body,tags,created_at,updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ response: data }, { status: 201 });
}
