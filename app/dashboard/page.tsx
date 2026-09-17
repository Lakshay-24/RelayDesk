import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
  const [{ data: devices }, usage] = await Promise.all([
    supabase.from("devices").select("id,name,platform,status,last_seen_at,created_at").order("created_at", { ascending: true }),
    supabase.from("commands").select("id", { count: "exact", head: true }).gte("created_at", monthStart.toISOString()),
  ]);

  return <DashboardClient email={user.email ?? ""} initialDevices={devices ?? []} initialUsage={usage.count ?? 0} />;
}
