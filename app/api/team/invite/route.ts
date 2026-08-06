import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  workspaceId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["admin", "agent"]),
});

const revokeSchema = z.object({
  workspaceId: z.string().uuid(),
  invitationId: z.string().uuid(),
});

export async function DELETE(request: Request) {
  const parsed = revokeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid invitation." }, { status: 400 });

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: admin } = await db
    .from("memberships")
    .select("id")
    .eq("workspace_id", parsed.data.workspaceId)
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!admin) return NextResponse.json({ error: "Only workspace admins can revoke invitations." }, { status: 403 });

  const { data: invitation, error: lookupError } = await db
    .from("invitations")
    .select("id,email,accepted_at")
    .eq("id", parsed.data.invitationId)
    .eq("workspace_id", parsed.data.workspaceId)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 400 });
  if (!invitation) return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  if (invitation.accepted_at) return NextResponse.json({ error: "Accepted invitations cannot be revoked." }, { status: 409 });

  const { error } = await db
    .from("invitations")
    .delete()
    .eq("id", invitation.id)
    .eq("workspace_id", parsed.data.workspaceId)
    .is("accepted_at", null);
  if (error) return NextResponse.json({ error: `Could not revoke invitation: ${error.message}` }, { status: 400 });

  return NextResponse.json({ ok: true, message: `Invitation to ${invitation.email} revoked.` });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid teammate email and role." }, { status: 400 });

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: admin } = await db
    .from("memberships")
    .select("id,workspaces(name)")
    .eq("workspace_id", parsed.data.workspaceId)
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!admin) return NextResponse.json({ error: "Only workspace admins can invite teammates." }, { status: 403 });

  const email = parsed.data.email.trim().toLowerCase();
  if (user.email?.toLowerCase() === email) {
    return NextResponse.json({ error: "You are already a member of this workspace." }, { status: 400 });
  }

  const authAdmin = createAdminClient();
  const { data: userPage } = await authAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existingUser = userPage.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (existingUser) {
    const { data: existingMembership } = await db
      .from("memberships")
      .select("id,role")
      .eq("workspace_id", parsed.data.workspaceId)
      .eq("user_id", existingUser.id)
      .maybeSingle();
    if (existingMembership) {
      return NextResponse.json({
        error: `${email} is already an active ${existingMembership.role} in this workspace.`,
        code: "already_member",
      }, { status: 409 });
    }
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 864e5).toISOString();

  await db
    .from("invitations")
    .delete()
    .eq("workspace_id", parsed.data.workspaceId)
    .eq("email", email)
    .is("accepted_at", null);

  const { error: insertError } = await db.from("invitations").insert({
    workspace_id: parsed.data.workspaceId,
    email,
    role: parsed.data.role,
    token_hash: tokenHash,
    expires_at: expiresAt,
    invited_by: user.id,
  });
  if (insertError) return NextResponse.json({ error: `Could not save invitation: ${insertError.message}` }, { status: 400 });

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");
  const inviteUrl = `${appUrl}/invite/${token}`;
  const workspace = Array.isArray(admin.workspaces) ? admin.workspaces[0] : admin.workspaces;

  const { error: emailError } = await authAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteUrl,
    data: {
      relaydesk_workspace_id: parsed.data.workspaceId,
      relaydesk_workspace_name: workspace?.name ?? "RelayDesk workspace",
      relaydesk_role: parsed.data.role,
    },
  });

  if (emailError) {
    const registered = /already|registered|exists/i.test(emailError.message);
    if (registered) {
      return NextResponse.json({
        ok: true,
        delivery: "in-app",
        message: `${email} already has a RelayDesk account. The pending invitation is saved and will appear in their workspace switcher.`,
      });
    }

    await db.from("invitations").delete().eq("token_hash", tokenHash);
    console.error("[team-invite] Supabase Auth rejected invitation send", {
      workspaceId: parsed.data.workspaceId,
      code: emailError.code,
      status: emailError.status,
      message: emailError.message,
    });
    return NextResponse.json({
      error: `Invitation email was not accepted: ${emailError.message}. Check Supabase Authentication logs and SMTP settings.`,
    }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    delivery: "email-and-in-app",
    message: `Invitation sent to ${email}. It is also visible in their RelayDesk workspace switcher after sign-in.`,
  });
}
