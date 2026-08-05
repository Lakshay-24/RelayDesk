import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,50}$/),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a workspace name and a URL using 2–50 lowercase letters, numbers, or hyphens." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

  const { data: existingMembership, error: membershipError } = await supabase
    .from("memberships")
    .select("workspace_id,workspaces(id,name,slug,public_key)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("Workspace bootstrap membership lookup failed", { userId: user.id, message: membershipError.message });
    return NextResponse.json({ error: "Could not check your workspace. Please try again." }, { status: 500 });
  }

  if (existingMembership?.workspaces) {
    return NextResponse.json({ workspace: existingMembership.workspaces, existing: true });
  }

  const { data, error } = await supabase.rpc("create_workspace_with_admin", {
    workspace_name: parsed.data.name,
    workspace_slug: parsed.data.slug,
  });

  if (error) {
    const duplicate = error.code === "23505" || /duplicate|unique/i.test(error.message);
    return NextResponse.json(
      { error: duplicate ? "That workspace URL is already taken. Choose another one." : "Could not create the workspace. Please try again." },
      { status: duplicate ? 409 : 500 },
    );
  }

  return NextResponse.json({ workspace: data, existing: false });
}
