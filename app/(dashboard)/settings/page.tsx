import { redirect } from "next/navigation";
import { getAgentContext } from "@/lib/data/inbox";
import { createClient } from "@/lib/supabase/server";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { workspaceInboundAddress } from "@/lib/inbound-address";

export default async function Settings() {
  const context = await getAgentContext();
  if (!context) return redirect("/onboarding");

  const db = await createClient();
  const [{ data: domains }, { data: members }] = await Promise.all([
    db.from("custom_domains").select("id,hostname,verification_token,status,verified_at").eq("workspace_id", context.workspace.id).order("created_at"),
    db.from("memberships").select("id,role,created_at,user_id").eq("workspace_id", context.workspace.id),
  ]);

  return (
    <SettingsWorkspace
      workspace={context.workspace}
      membership={context.membership}
      initialDomains={domains ?? []}
      inboundAddress={workspaceInboundAddress(context.workspace.slug)}
      inboundConnected={Boolean(process.env.RESEND_API_KEY && process.env.RESEND_WEBHOOK_SECRET)}
      memberCount={members?.length ?? 1}
    />
  );
}
