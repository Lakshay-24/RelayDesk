import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type WebhookEvent = "conversation.created" | "conversation.updated" | "message.created";

type DeliveryPayload = {
  workspaceId: string;
  event: WebhookEvent;
  data: Record<string, unknown>;
};

export async function dispatchWorkspaceWebhooks({ workspaceId, event, data }: DeliveryPayload) {
  const db = createAdminClient();
  const { data: hooks, error } = await db
    .from("outbound_webhooks")
    .select("id,url,secret,events")
    .eq("workspace_id", workspaceId)
    .eq("enabled", true)
    .contains("events", [event]);

  if (error || !hooks?.length) return;

  const payload = {
    id: crypto.randomUUID(),
    event,
    created_at: new Date().toISOString(),
    data,
  };
  const raw = JSON.stringify(payload);

  await Promise.allSettled(hooks.map(async (hook) => {
    const { data: delivery } = await db
      .from("webhook_deliveries")
      .insert({ webhook_id: hook.id, event, payload, attempts: 1 })
      .select("id")
      .single();

    try {
      const signature = createHmac("sha256", hook.secret).update(raw).digest("hex");
      const response = await fetch(hook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-relaydesk-event": event,
          "x-relaydesk-signature": `sha256=${signature}`,
          "user-agent": "RelayDesk-Webhooks/1.0",
        },
        body: raw,
        signal: AbortSignal.timeout(8000),
      });

      await db.from("webhook_deliveries").update({
        status: response.ok ? "delivered" : "failed",
        response_status: response.status,
        delivered_at: response.ok ? new Date().toISOString() : null,
        last_error: response.ok ? null : `HTTP ${response.status}`,
      }).eq("id", delivery?.id);
    } catch (caught) {
      await db.from("webhook_deliveries").update({
        status: "failed",
        last_error: caught instanceof Error ? caught.message : "Webhook delivery failed",
      }).eq("id", delivery?.id);
    }
  }));
}
