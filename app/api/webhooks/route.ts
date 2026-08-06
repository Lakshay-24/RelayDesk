import { createHmac, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  url: z.string().url().refine((value) => value.startsWith("https://"), "Webhook URLs must use HTTPS"),
  events: z.array(z.enum(["conversation.created", "message.created", "conversation.updated"])).min(1).max(3),
});

const actionSchema = z.object({
  webhookId: z.string().uuid(),
  action: z.enum(["test", "toggle", "delete"]),
  enabled: z.boolean().optional(),
});

async function getMemberContext() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { db, user: null, membership: null };
  const { data: membership } = await db
    .from("memberships")
    .select("id,workspace_id,role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  return { db, user, membership };
}

export async function GET() {
  const { db, membership } = await getMemberContext();
  if (!membership) return NextResponse.json({ error: "Workspace access required" }, { status: 403 });
  const { data, error } = await db
    .from("outbound_webhooks")
    .select("id,url,events,enabled,created_at,updated_at")
    .eq("workspace_id", membership.workspace_id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ webhooks: data ?? [] });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid webhook" }, { status: 400 });
  const { db, membership } = await getMemberContext();
  if (!membership) return NextResponse.json({ error: "Workspace access required" }, { status: 403 });

  const secret = randomBytes(32).toString("hex");
  const { data, error } = await db
    .from("outbound_webhooks")
    .insert({ workspace_id: membership.workspace_id, url: parsed.data.url, events: parsed.data.events, secret })
    .select("id,url,events,enabled,created_at,updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ webhook: data, secret }, { status: 201 });
}

export async function PATCH(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid webhook action" }, { status: 400 });
  const { db, membership } = await getMemberContext();
  if (!membership) return NextResponse.json({ error: "Workspace access required" }, { status: 403 });

  const { data: webhook } = await db
    .from("outbound_webhooks")
    .select("id,url,secret,events,enabled")
    .eq("id", parsed.data.webhookId)
    .eq("workspace_id", membership.workspace_id)
    .maybeSingle();
  if (!webhook) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });

  if (parsed.data.action === "delete") {
    const { error } = await db.from("outbound_webhooks").delete().eq("id", webhook.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "toggle") {
    const { data, error } = await db
      .from("outbound_webhooks")
      .update({ enabled: parsed.data.enabled ?? !webhook.enabled, updated_at: new Date().toISOString() })
      .eq("id", webhook.id)
      .select("id,url,events,enabled,created_at,updated_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ webhook: data });
  }

  const payload = {
    id: crypto.randomUUID(),
    event: "relaydesk.test",
    created_at: new Date().toISOString(),
    data: { workspace_id: membership.workspace_id, message: "RelayDesk webhook test" },
  };
  const raw = JSON.stringify(payload);
  const signature = createHmac("sha256", webhook.secret).update(raw).digest("hex");
  const delivery = await db
    .from("webhook_deliveries")
    .insert({ webhook_id: webhook.id, event: "relaydesk.test", payload, attempts: 1 })
    .select("id")
    .single();

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relaydesk-event": "relaydesk.test",
        "x-relaydesk-signature": `sha256=${signature}`,
      },
      body: raw,
      signal: AbortSignal.timeout(10000),
    });
    await db.from("webhook_deliveries").update({
      status: response.ok ? "delivered" : "failed",
      response_status: response.status,
      delivered_at: response.ok ? new Date().toISOString() : null,
      last_error: response.ok ? null : `HTTP ${response.status}`,
    }).eq("id", delivery.data?.id);
    if (!response.ok) return NextResponse.json({ error: `Endpoint returned HTTP ${response.status}` }, { status: 502 });
    return NextResponse.json({ ok: true, status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook delivery failed";
    await db.from("webhook_deliveries").update({ status: "failed", last_error: message }).eq("id", delivery.data?.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
