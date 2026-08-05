import { redirect } from "next/navigation";
import { getAgentContext } from "@/lib/data/inbox";
import { createClient } from "@/lib/supabase/server";

function minutesBetween(start: string, end: string | null | undefined) {
  if (!end) return null;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

export default async function AnalyticsPage() {
  const context = await getAgentContext();
  if (!context) redirect("/onboarding");

  const db = await createClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: conversations }, { data: messages }] = await Promise.all([
    db
      .from("conversations")
      .select("id,channel,status,priority,created_at,first_response_at,resolved_at,sla_due_at")
      .eq("workspace_id", context.workspace.id)
      .gte("created_at", since),
    db
      .from("messages")
      .select("id,sender_type,channel,created_at")
      .eq("workspace_id", context.workspace.id)
      .gte("created_at", since),
  ]);

  const rows = conversations ?? [];
  const responseMinutes = rows
    .map((item) => minutesBetween(item.created_at, item.first_response_at))
    .filter((value): value is number => value !== null);
  const resolutionMinutes = rows
    .map((item) => minutesBetween(item.created_at, item.resolved_at))
    .filter((value): value is number => value !== null);
  const breached = rows.filter((item) => !item.first_response_at && item.sla_due_at && new Date(item.sla_due_at) < new Date()).length;
  const respondedOnTime = rows.filter((item) => item.first_response_at && item.sla_due_at && new Date(item.first_response_at) <= new Date(item.sla_due_at)).length;
  const measured = rows.filter((item) => item.sla_due_at && (item.first_response_at || new Date(item.sla_due_at) < new Date())).length;
  const slaRate = measured ? Math.round((respondedOnTime / measured) * 100) : null;
  const agentReplies = (messages ?? []).filter((item) => item.sender_type === "agent").length;
  const customerMessages = (messages ?? []).filter((item) => item.sender_type === "contact").length;

  const metrics = [
    ["Conversations", rows.length.toString(), "Created in the last 30 days"],
    ["Open now", rows.filter((item) => item.status === "open").length.toString(), `${rows.filter((item) => item.status === "snoozed").length} snoozed`],
    ["Avg. first response", average(responseMinutes) === null ? "—" : `${average(responseMinutes)} min`, `${responseMinutes.length} measured`],
    ["Avg. resolution", average(resolutionMinutes) === null ? "—" : `${average(resolutionMinutes)} min`, `${resolutionMinutes.length} resolved`],
    ["SLA attainment", slaRate === null ? "—" : `${slaRate}%`, `${breached} currently breached`],
    ["Message volume", (agentReplies + customerMessages).toString(), `${customerMessages} customer · ${agentReplies} agent`],
  ];

  return (
    <section className="settings-page">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">{context.workspace.name}</p>
          <h1>Analytics</h1>
          <p className="muted">A 30-day view of inbox volume, responsiveness and SLA health.</p>
        </div>
      </div>

      <div className="settings-grid">
        {metrics.map(([label, value, detail]) => (
          <div className="section-card" key={label}>
            <p className="muted">{label}</p>
            <h2>{value}</h2>
            <p>{detail}</p>
          </div>
        ))}
      </div>

      <div className="section-card">
        <h3>Channel mix</h3>
        <p>Chat: {rows.filter((item) => item.channel === "chat").length}</p>
        <p>Email: {rows.filter((item) => item.channel === "email").length}</p>
      </div>

      <div className="section-card">
        <h3>Priority mix</h3>
        {(["urgent", "high", "normal", "low"] as const).map((priority) => (
          <p key={priority}>{priority}: {rows.filter((item) => item.priority === priority).length}</p>
        ))}
      </div>
    </section>
  );
}
