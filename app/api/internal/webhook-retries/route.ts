import { createAdminClient } from "@/lib/supabase/admin";
import { deliverWebhook } from "@/lib/webhook-delivery";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("webhook_deliveries")
    .select("id,event,payload,attempts,outbound_webhooks!inner(id,url,secret,enabled)")
    .eq("status", "failed")
    .lte("next_attempt_at", now)
    .lt("attempts", 6)
    .eq("outbound_webhooks.enabled", true)
    .order("next_attempt_at", { ascending: true })
    .limit(25);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results = await Promise.all((data ?? []).map(async (delivery) => {
    const hook = Array.isArray(delivery.outbound_webhooks) ? delivery.outbound_webhooks[0] : delivery.outbound_webhooks;
    if (!hook) return { id: delivery.id, ok: false, error: "Webhook unavailable" };
    const result = await deliverWebhook(
      { id: hook.id, url: hook.url, secret: hook.secret },
      { id: delivery.id, event: delivery.event, payload: delivery.payload as Record<string, unknown>, attempts: delivery.attempts },
    );
    return { id: delivery.id, ...result };
  }));

  return Response.json({ processed: results.length, results });
}
