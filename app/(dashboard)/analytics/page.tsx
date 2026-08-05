import { redirect } from "next/navigation";
import { getAgentContext } from "@/lib/data/inbox";
import { createClient } from "@/lib/supabase/server";

function minutesBetween(start: string, end: string | null | undefined) {
  if (!end) return null;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}
function average(values: number[]) { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null; }
function dayKey(value: string) { return value.slice(0, 10); }

export default async function AnalyticsPage() {
  const context = await getAgentContext();
  if (!context) redirect("/onboarding");
  const db = await createClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: conversations }, { data: messages }, { data: memberships }] = await Promise.all([
    db.from("conversations").select("id,channel,status,priority,assignee_id,created_at,first_response_at,resolved_at,sla_due_at").eq("workspace_id", context.workspace.id).gte("created_at", since),
    db.from("messages").select("id,sender_type,sender_membership_id,channel,created_at").eq("workspace_id", context.workspace.id).gte("created_at", since),
    db.from("memberships").select("id,user_id,role").eq("workspace_id", context.workspace.id),
  ]);

  const rows = conversations ?? [];
  const messageRows = messages ?? [];
  const responseMinutes = rows.map((item) => minutesBetween(item.created_at, item.first_response_at)).filter((value): value is number => value !== null);
  const resolutionMinutes = rows.map((item) => minutesBetween(item.created_at, item.resolved_at)).filter((value): value is number => value !== null);
  const breached = rows.filter((item) => !item.first_response_at && item.sla_due_at && new Date(item.sla_due_at) < new Date()).length;
  const respondedOnTime = rows.filter((item) => item.first_response_at && item.sla_due_at && new Date(item.first_response_at) <= new Date(item.sla_due_at)).length;
  const measured = rows.filter((item) => item.sla_due_at && (item.first_response_at || new Date(item.sla_due_at) < new Date())).length;
  const slaRate = measured ? Math.round((respondedOnTime / measured) * 100) : null;
  const agentReplies = messageRows.filter((item) => item.sender_type === "agent").length;
  const customerMessages = messageRows.filter((item) => item.sender_type === "contact").length;

  const metrics = [
    ["Conversations", rows.length.toString(), "Created in the last 30 days"],
    ["Open now", rows.filter((item) => item.status === "open").length.toString(), `${rows.filter((item) => item.status === "snoozed").length} snoozed`],
    ["Avg. first response", average(responseMinutes) === null ? "—" : `${average(responseMinutes)} min`, `${responseMinutes.length} measured`],
    ["Avg. resolution", average(resolutionMinutes) === null ? "—" : `${average(resolutionMinutes)} min`, `${resolutionMinutes.length} resolved`],
    ["SLA attainment", slaRate === null ? "—" : `${slaRate}%`, `${breached} currently breached`],
    ["Message volume", (agentReplies + customerMessages).toString(), `${customerMessages} customer · ${agentReplies} agent`],
  ];

  const days = Array.from({ length: 14 }, (_, index) => { const date = new Date(Date.now() - (13 - index) * 86400000); return dayKey(date.toISOString()); });
  const daily = days.map((day) => ({ day, conversations: rows.filter((item) => dayKey(item.created_at) === day).length, messages: messageRows.filter((item) => dayKey(item.created_at) === day).length }));
  const maxDaily = Math.max(1, ...daily.map((item) => Math.max(item.conversations, item.messages)));
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: messageRows.filter((item) => new Date(item.created_at).getHours() === hour).length }));
  const busiest = [...hours].sort((a, b) => b.count - a.count).slice(0, 5);
  const maxHour = Math.max(1, ...hours.map((item) => item.count));
  const agentStats = (memberships ?? []).map((member, index) => ({
    id: member.id,
    label: member.id === context.membership.id ? "You" : `Agent ${index + 1}`,
    role: member.role,
    replies: messageRows.filter((item) => item.sender_type === "agent" && item.sender_membership_id === member.id).length,
    assigned: rows.filter((item) => item.assignee_id === member.id).length,
    resolved: rows.filter((item) => item.assignee_id === member.id && item.status === "resolved").length,
  })).sort((a, b) => b.replies - a.replies);

  return <section className="settings-page"><div className="page-title-row"><div><p className="eyebrow">{context.workspace.name}</p><h1>Analytics</h1><p className="muted">A 30-day view of inbox volume, responsiveness and SLA health.</p></div></div>
    <div className="settings-grid">{metrics.map(([label,value,detail])=><div className="section-card" key={label}><p className="muted">{label}</p><h2>{value}</h2><p>{detail}</p></div>)}</div>
    <div className="section-card"><h3>14-day workload trend</h3><div className="trend-chart" aria-label="Daily conversations and messages">{daily.map((item)=><div className="trend-column" key={item.day}><div className="trend-bars"><span className="trend-bar conversations" style={{height:`${Math.max(3,(item.conversations/maxDaily)*100)}%`}} title={`${item.conversations} conversations`}/><span className="trend-bar messages-bar" style={{height:`${Math.max(3,(item.messages/maxDaily)*100)}%`}} title={`${item.messages} messages`}/></div><small>{item.day.slice(5)}</small></div>)}</div><p className="muted">Dark bars: conversations · Light bars: messages</p></div>
    <div className="analytics-two-column"><div className="section-card"><h3>Busiest hours</h3>{busiest.map((item)=><div className="metric-row" key={item.hour}><span>{String(item.hour).padStart(2,"0")}:00</span><div className="metric-track"><span style={{width:`${(item.count/maxHour)*100}%`}}/></div><strong>{item.count}</strong></div>)}{!messageRows.length&&<p className="muted">Message activity will appear here.</p>}</div><div className="section-card"><h3>Channel mix</h3><p>Chat: {rows.filter((item)=>item.channel==="chat").length}</p><p>Email: {rows.filter((item)=>item.channel==="email").length}</p><h3>Priority mix</h3>{(["urgent","high","normal","low"] as const).map((priority)=><p key={priority}>{priority}: {rows.filter((item)=>item.priority===priority).length}</p>)}</div></div>
    <div className="section-card"><h3>Agent performance</h3><div className="agent-table"><div className="agent-table-row header"><span>Agent</span><span>Role</span><span>Replies</span><span>Assigned</span><span>Resolved</span></div>{agentStats.map((agent)=><div className="agent-table-row" key={agent.id}><strong>{agent.label}</strong><span>{agent.role}</span><span>{agent.replies}</span><span>{agent.assigned}</span><span>{agent.resolved}</span></div>)}</div></div>
  </section>;
}
