import { createAdminClient } from "@/lib/supabase/admin";
import { deliverWebhook } from "@/lib/webhook-delivery";

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

  await Promise.allSettled(hooks.map(async (hook) => {
    const { data: delivery, error: insertError } = await db
      .from("webhook_deliveries")
      .insert({ webhook_id: hook.id, event, payload, attempts: 0, status: "pending" })
      .select("id,event,payload,attempts")
      .single();
    if (insertError || !delivery) return;
    await deliverWebhook(
      { id: hook.id, url: hook.url, secret: hook.secret },
      { id: delivery.id, event: delivery.event, payload: delivery.payload as Record<string, unknown>, attempts: delivery.attempts },
    );
  }));
}
