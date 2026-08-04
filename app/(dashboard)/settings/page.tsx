import { redirect } from "next/navigation";
import { getAgentContext } from "@/lib/data/inbox";
import { createClient } from "@/lib/supabase/server";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
export default async function Settings(){const context=await getAgentContext();if(!context)return redirect("/onboarding");const db=await createClient();const [{data:domains},{data:addresses},{data:members}]=await Promise.all([db.from("custom_domains").select("id,hostname,verification_token,status,verified_at").eq("workspace_id",context.workspace.id).order("created_at"),db.from("inbound_addresses").select("address").eq("workspace_id",context.workspace.id),db.from("memberships").select("id,role,created_at,user_id").eq("workspace_id",context.workspace.id)]);return <SettingsWorkspace workspace={context.workspace} membership={context.membership} initialDomains={domains??[]} inboundAddress={addresses?.[0]?.address??null} memberCount={members?.length??1}/>}
