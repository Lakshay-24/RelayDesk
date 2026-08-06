import { Activity, CheckCircle2, CircleAlert, Database, Mail, RefreshCw, Server, Sparkles, Webhook } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type HealthCheck = {
  label: string;
  detail: string;
  ok: boolean;
  category: "core" | "integration";
  icon: typeof Server;
};

async function getChecks(): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [
    {
      label: "Application server",
      detail: "RelayDesk is responding normally.",
      ok: true,
      category: "core",
      icon: Server,
    },
    {
      label: "Supabase configuration",
      detail: process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? "Database credentials are configured."
        : "Required Supabase configuration is missing.",
      ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      category: "core",
      icon: Database,
    },
    {
      label: "AI assistance",
      detail: process.env.AI_GATEWAY_API_KEY ? "AI drafting and summaries are configured." : "AI gateway configuration is missing.",
      ok: Boolean(process.env.AI_GATEWAY_API_KEY),
      category: "integration",
      icon: Sparkles,
    },
    {
      label: "Email delivery",
      detail: process.env.RESEND_API_KEY && process.env.OUTBOUND_EMAIL_FROM
        ? "Outbound email provider is configured."
        : "Resend API key or sender address is missing.",
      ok: Boolean(process.env.RESEND_API_KEY && process.env.OUTBOUND_EMAIL_FROM),
      category: "integration",
      icon: Mail,
    },
    {
      label: "Inbound email webhook",
      detail: process.env.RESEND_WEBHOOK_SECRET
        ? "Signed inbound email webhook is configured."
        : "Inbound webhook secret is missing.",
      ok: Boolean(process.env.RESEND_WEBHOOK_SECRET),
      category: "integration",
      icon: Webhook,
    },
  ];

  try {
    const db = createAdminClient();
    const tableChecks = await Promise.all([
      db.from("workspaces").select("id", { count: "exact", head: true }),
      db.from("conversations").select("id", { count: "exact", head: true }),
      db.from("kb_articles").select("id", { count: "exact", head: true }),
      db.from("inbound_addresses").select("id", { count: "exact", head: true }),
    ]);
    const databaseOk = tableChecks.every((result) => !result.error);
    checks.push({
      label: "Database schema",
      detail: databaseOk ? "Workspace, inbox, knowledge and inbound-email tables are reachable." : "One or more required database tables could not be reached.",
      ok: databaseOk,
      category: "core",
      icon: Database,
    });
  } catch {
    checks.push({
      label: "Database schema",
      detail: "Database connectivity check failed.",
      ok: false,
      category: "core",
      icon: Database,
    });
  }

  return checks;
}

export default async function HealthPage() {
  const checks = await getChecks();
  const coreChecks = checks.filter((check) => check.category === "core");
  const integrationChecks = checks.filter((check) => check.category === "integration");
  const healthy = coreChecks.every((check) => check.ok);
  const configured = integrationChecks.filter((check) => check.ok).length;

  return (
    <main className="health-page">
      <section className="health-shell">
        <header className="health-header">
          <div className={`health-mark ${healthy ? "healthy" : "degraded"}`}>
            {healthy ? <Activity size={24} /> : <CircleAlert size={24} />}
          </div>
          <div className="health-copy">
            <p className="health-eyebrow">RelayDesk system status</p>
            <h1>{healthy ? "All core systems operational" : "Some systems need attention"}</h1>
            <p>Public project health and evaluator diagnostics in one place. No secrets or customer content are displayed.</p>
          </div>
          <a className="health-refresh" href="/health"><RefreshCw size={16} />Refresh</a>
        </header>

        <div className="health-summary">
          <div><span>Core status</span><strong>{healthy ? "Operational" : "Degraded"}</strong></div>
          <div><span>Core checks</span><strong>{coreChecks.filter((check) => check.ok).length}/{coreChecks.length}</strong></div>
          <div><span>Integrations</span><strong>{configured}/{integrationChecks.length}</strong></div>
          <div><span>Checked</span><strong>{new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST</strong></div>
        </div>

        <section className="health-section">
          <div className="health-section-heading"><div><p>Required</p><h2>Core platform</h2></div><span>Needed for the app to operate</span></div>
          <div className="health-grid">
            {coreChecks.map((check) => <HealthCard key={check.label} check={check} />)}
          </div>
        </section>

        <section className="health-section">
          <div className="health-section-heading"><div><p>Providers</p><h2>External integrations</h2></div><span>Optional features and delivery services</span></div>
          <div className="health-grid">
            {integrationChecks.map((check) => <HealthCard key={check.label} check={check} />)}
          </div>
        </section>
      </section>
      <style>{`
        *{box-sizing:border-box}.health-page{min-height:100svh;background:#f4f4f1;color:#171717;padding:clamp(22px,4vw,58px);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.health-shell{width:min(1120px,100%);margin:auto}.health-header{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:18px;align-items:start;padding:28px;background:#171717;color:#fff;border-radius:24px;box-shadow:0 22px 60px rgba(0,0,0,.14)}.health-mark{width:54px;height:54px;border-radius:17px;display:grid;place-items:center}.health-mark.healthy{background:#dff7e5;color:#18743a}.health-mark.degraded{background:#fff0df;color:#b45309}.health-copy h1{margin:5px 0 8px;font-size:clamp(28px,4vw,48px);line-height:1.02;letter-spacing:-.04em}.health-copy>p:last-child{margin:0;color:#bdbdb8;line-height:1.55;max-width:720px}.health-eyebrow{margin:0;color:#8fa4ff;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}.health-refresh{min-height:42px;padding:0 14px;border:1px solid #3b3b3b;border-radius:12px;display:inline-flex;align-items:center;gap:8px;color:#fff;text-decoration:none;font-weight:750;background:#222}.health-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}.health-summary>div{background:#fff;border:1px solid #e1e1dc;border-radius:16px;padding:17px;display:grid;gap:6px}.health-summary span{color:#73736f;font-size:12px;font-weight:750}.health-summary strong{font-size:18px}.health-section{margin-top:30px}.health-section-heading{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:13px}.health-section-heading p{margin:0;color:#6f7fce;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.11em}.health-section-heading h2{margin:4px 0 0;font-size:25px;letter-spacing:-.025em}.health-section-heading>span{color:#777772;font-size:13px}.health-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.health-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:13px;align-items:start;padding:19px;background:#fff;border:1px solid #e1e1dc;border-radius:17px;box-shadow:0 6px 24px rgba(0,0,0,.035)}.health-card-icon{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:#f1f1ed;color:#4f4f4b}.health-card h3{margin:1px 0 5px;font-size:15px}.health-card p{margin:0;color:#71716d;font-size:13px;line-height:1.5}.health-state{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:850}.health-state.ok{background:#e6f7ea;color:#18743a}.health-state.error{background:#fff0e8;color:#b54708}@media(max-width:760px){.health-page{padding:14px}.health-header{grid-template-columns:auto 1fr;padding:21px}.health-refresh{grid-column:1/-1;width:100%;justify-content:center}.health-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.health-grid{grid-template-columns:1fr}.health-section-heading{align-items:start;flex-direction:column;gap:4px}}@media(max-width:430px){.health-header{grid-template-columns:1fr}.health-mark{width:46px;height:46px}.health-summary{grid-template-columns:1fr}.health-card{grid-template-columns:auto 1fr}.health-state{grid-column:2}}
      `}</style>
    </main>
  );
}

function HealthCard({ check }: { check: HealthCheck }) {
  const Icon = check.icon;
  return <article className="health-card">
    <span className="health-card-icon"><Icon size={19} /></span>
    <div><h3>{check.label}</h3><p>{check.detail}</p></div>
    <span className={`health-state ${check.ok ? "ok" : "error"}`}>
      {check.ok ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}{check.ok ? "Ready" : "Issue"}
    </span>
  </article>;
}
