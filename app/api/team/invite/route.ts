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

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invitation" }, { status: 400 });
  }

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

  if (!admin) {
    return NextResponse.json({ error: "Only admins can invite teammates" }, { status: 403 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 864e5).toISOString();

  const { error: insertError } = await db.from("invitations").insert({
    workspace_id: parsed.data.workspaceId,
    email,
    role: parsed.data.role,
    token_hash: tokenHash,
    expires_at: expiresAt,
    invited_by: user.id,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");
  const inviteUrl = `${appUrl}/invite/${token}`;
  const workspace = Array.isArray(admin.workspaces) ? admin.workspaces[0] : admin.workspaces;
  const authAdmin = createAdminClient();

  const { error: emailError } = await authAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteUrl,
    data: {
      relaydesk_workspace_id: parsed.data.workspaceId,
      relaydesk_workspace_name: workspace?.name ?? "RelayDesk workspace",
      relaydesk_role: parsed.data.role,
    },
  });

  if (emailError) {
    await db.from("invitations").delete().eq("token_hash", tokenHash);
    console.error("[team-invite] Supabase invite email failed", {
      workspaceId: parsed.data.workspaceId,
      code: emailError.code,
      status: emailError.status,
      message: emailError.message,
    });
    return NextResponse.json(
      { error: `Invitation email was not sent: ${emailError.message}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, delivery: "supabase-auth" });
}
