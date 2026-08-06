import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const actionSchema = z.object({
  invitationId: z.string().uuid(),
  action: z.enum(["accept", "decline"]),
});

async function currentUser() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  return user;
}

export async function GET() {
  const user = await currentUser();
  const email = user?.email?.trim().toLowerCase();
  if (!user || !email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("invitations")
    .select("id,workspace_id,role,expires_at,created_at,workspaces(name,slug)")
    .eq("email", email)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const invitations = (data ?? []).map((item) => {
    const workspace = Array.isArray(item.workspaces) ? item.workspaces[0] : item.workspaces;
    return {
      id: item.id,
      workspaceId: item.workspace_id,
      workspaceName: workspace?.name ?? "RelayDesk workspace",
      workspaceSlug: workspace?.slug ?? null,
      role: item.role,
      expiresAt: item.expires_at,
      createdAt: item.created_at,
    };
  });

  return NextResponse.json({ invitations });
}

export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid invitation action" }, { status: 400 });

  const user = await currentUser();
  const email = user?.email?.trim().toLowerCase();
  if (!user || !email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: invitation, error: invitationError } = await admin
    .from("invitations")
    .select("id,workspace_id,email,role,expires_at,accepted_at")
    .eq("id", parsed.data.invitationId)
    .maybeSingle();

  if (invitationError) return NextResponse.json({ error: invitationError.message }, { status: 400 });
  if (!invitation || invitation.email.trim().toLowerCase() !== email) {
    return NextResponse.json({ error: "Invitation not found for this account" }, { status: 404 });
  }
  if (invitation.accepted_at) return NextResponse.json({ error: "Invitation has already been accepted" }, { status: 409 });
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });
  }

  if (parsed.data.action === "decline") {
    const { error } = await admin.from("invitations").delete().eq("id", invitation.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, action: "declined" });
  }

  const { error: membershipError } = await admin.from("memberships").upsert(
    { workspace_id: invitation.workspace_id, user_id: user.id, role: invitation.role },
    { onConflict: "workspace_id,user_id", ignoreDuplicates: false },
  );
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 400 });

  const { error: updateError } = await admin
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  return NextResponse.json({ ok: true, action: "accepted", workspaceId: invitation.workspace_id });
}
