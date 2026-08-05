import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Check = { key: string; label: string; ok: boolean; detail: string; required: boolean };

export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await db
    .from("memberships")
    .select("id,workspace_id,role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Workspace membership required" }, { status: 403 });

  const workspaceId = membership.workspace_id;
  const [
    workspace,
    sla,
    inbound,
    conversations,
    articles,
    keys,
    webhooks,
  ] = await Promise.all([
    db.from("workspaces").select("id,slug,public_key").eq("id", workspaceId).maybeSingle(),
    db.from("workspace_sla_policies").select("workspace_id,enabled,first_response_minutes,resolution_minutes,warning_minutes").eq("workspace_id", workspaceId).maybeSingle(),
    db.from("inbound_addresses").select("address").eq("workspace_id", workspaceId).limit(1).maybeSingle(),
    db.from("conversations").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    db.from("kb_articles").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).not("published_at", "is", null),
    db.from("api_keys").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("revoked_at", null),
    db.from("outbound_webhooks").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("enabled", true),
  ]);

  const checks: Check[] = [
    { key: "auth", label: "Authenticated admin session", ok: membership.role === "admin", detail: membership.role === "admin" ? "Admin access confirmed" : "Agent session; admin-only evaluator controls are hidden", required: true },
    { key: "workspace", label: "Workspace bootstrap", ok: Boolean(workspace.data?.id && workspace.data.public_key), detail: workspace.error?.message ?? (workspace.data ? `Workspace ${workspace.data.slug} is available` : "Workspace missing"), required: true },
    { key: "sla", label: "Migration 005 and SLA policy", ok: Boolean(sla.data && !sla.error), detail: sla.error?.message ?? (sla.data ? `${sla.data.first_response_minutes}m response · ${sla.data.resolution_minutes}m resolution` : "SLA policy missing"), required: true },
    { key: "inbound", label: "Workspace email address", ok: Boolean(inbound.data?.address), detail: inbound.error?.message ?? inbound.data?.address ?? "Inbound address missing", required: true },
    { key: "api", label: "API-key schema", ok: !keys.error, detail: keys.error?.message ?? `${keys.count ?? 0} active keys`, required: true },
    { key: "inbox", label: "Inbox persistence", ok: !conversations.error, detail: conversations.error?.message ?? `${conversations.count ?? 0} conversations`, required: true },
    { key: "knowledge", label: "Published knowledge", ok: !articles.error, detail: articles.error?.message ?? `${articles.count ?? 0} published articles`, required: true },
    { key: "webhooks", label: "Webhook infrastructure", ok: !webhooks.error, detail: webhooks.error?.message ?? `${webhooks.count ?? 0} enabled endpoints`, required: false },
    { key: "ai", label: "AI gateway configuration", ok: Boolean(process.env.AI_GATEWAY_API_KEY), detail: process.env.AI_GATEWAY_API_KEY ? "AI gateway key configured" : "AI_GATEWAY_API_KEY is not configured", required: false },
    { key: "email", label: "Outbound email configuration", ok: Boolean(process.env.RESEND_API_KEY && process.env.OUTBOUND_EMAIL_FROM), detail: process.env.RESEND_API_KEY && process.env.OUTBOUND_EMAIL_FROM ? "Resend and sender configured" : "RESEND_API_KEY or OUTBOUND_EMAIL_FROM missing", required: false },
    { key: "resendWebhook", label: "Signed inbound webhook", ok: Boolean(process.env.RESEND_WEBHOOK_SECRET), detail: process.env.RESEND_WEBHOOK_SECRET ? "Resend webhook secret configured" : "RESEND_WEBHOOK_SECRET missing", required: false },
    { key: "cron", label: "Webhook retry worker", ok: Boolean(process.env.CRON_SECRET), detail: process.env.CRON_SECRET ? "Retry-worker secret configured" : "CRON_SECRET missing", required: false },
  ];

  const requiredReady = checks.filter((check) => check.required).every((check) => check.ok);
  const optionalReady = checks.filter((check) => !check.required).filter((check) => check.ok).length;
  return NextResponse.json(
    { requiredReady, optionalReady, optionalTotal: checks.filter((check) => !check.required).length, checks, checkedAt: new Date().toISOString() },
    { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
  );
}
