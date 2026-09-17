import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const now = new Date();
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-01`;
  const [{ data: devices }, { data: usage }] = await Promise.all([
    supabase.from("devices").select("id,name,platform,status,last_seen_at,created_at").order("created_at", { ascending: true }),
    supabase.from("usage_monthly").select("tool_calls").eq("month_start", monthStart).maybeSingle(),
  ]);

  return <DashboardClient email={user.email ?? ""} initialDevices={devices ?? []} initialUsage={Number(usage?.tool_calls ?? 0)} />;
}
