import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const mutationSchema = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(["admin", "agent"]).optional(),
  action: z.enum(["update", "remove"]),
});

async function getAdminContext() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: membership } = await db
    .from("memberships")
    .select("id,workspace_id,role")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!membership) return { error: NextResponse.json({ error: "Workspace not found" }, { status: 404 }) };
  return { db, user, membership };
}

export async function GET() {
  const context = await getAdminContext();
  if ("error" in context) return context.error;

  const { db, membership } = context;
  const { data: members, error } = await db
    .from("memberships")
    .select("id,user_id,role,created_at")
    .eq("workspace_id", membership.workspace_id)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const admin = createAdminClient();
  const enriched = await Promise.all((members ?? []).map(async (member) => {
    const { data } = await admin.auth.admin.getUserById(member.user_id);
    return {
      ...member,
      email: data.user?.email ?? null,
      name: data.user?.user_metadata?.full_name ?? data.user?.user_metadata?.name ?? null,
    };
  }));

  const { data: invitations } = await db
    .from("invitations")
    .select("id,email,role,expires_at,accepted_at,created_at")
    .eq("workspace_id", membership.workspace_id)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  return NextResponse.json({ members: enriched, invitations: invitations ?? [], currentMembershipId: membership.id });
}

export async function PATCH(request: Request) {
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid team change" }, { status: 400 });

  const context = await getAdminContext();
  if ("error" in context) return context.error;
  const { db, membership } = context;
  if (membership.role !== "admin") return NextResponse.json({ error: "Only admins can manage the team" }, { status: 403 });

  const { data: target } = await db
    .from("memberships")
    .select("id,workspace_id,role")
    .eq("id", parsed.data.membershipId)
    .eq("workspace_id", membership.workspace_id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Team member not found" }, { status: 404 });

  const { count: adminCount } = await db
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", membership.workspace_id)
    .eq("role", "admin");

  if (target.role === "admin" && (adminCount ?? 0) <= 1 && (parsed.data.action === "remove" || parsed.data.role === "agent")) {
    return NextResponse.json({ error: "A workspace must keep at least one admin" }, { status: 400 });
  }

  if (parsed.data.action === "remove") {
    if (target.id === membership.id) return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
    const { error } = await db.from("memberships").delete().eq("id", target.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!parsed.data.role) return NextResponse.json({ error: "Role is required" }, { status: 400 });
  const { data: updated, error } = await db
    .from("memberships")
    .update({ role: parsed.data.role })
    .eq("id", target.id)
    .select("id,role")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ member: updated });
}
