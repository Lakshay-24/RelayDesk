import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const now = new Date();
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-01`;
  const [{ data: devices }, { data: usage }, { data: reliabilityRows }, { data: billing }] = await Promise.all([
    supabase.from("devices").select("id,name,hostname,platform,status,last_seen_at,created_at,agent_version").order("created_at", { ascending: true }),
    supabase.from("usage_monthly").select("tool_calls").eq("month_start", monthStart).maybeSingle(),
    supabase.rpc("get_relaydesk_reliability", { window_hours: 24 }),
    supabase.from("billing_subscriptions").select("plan,status,currency,amount_minor,current_period_end,cancel_at_period_end").maybeSingle(),
  ]);
  const reliability = reliabilityRows?.[0] ?? null;

  return <DashboardClient email={user.email ?? ""} initialDevices={devices ?? []} initialUsage={Number(usage?.tool_calls ?? 0)} initialReliability={reliability} initialBilling={billing ?? null} />;
}
