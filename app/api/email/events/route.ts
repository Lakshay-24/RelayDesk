import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const eventSchema = z.object({
  type: z.string(),
  created_at: z.string().optional(),
  data: z.object({
    email_id: z.string().min(1),
    bounce: z.object({ message: z.string().optional() }).optional(),
  }).passthrough(),
});

export async function POST(request: Request) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-webhook-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid email event" }, { status: 400 });

  const event = parsed.data;
  if (!["email.delivered", "email.bounced", "email.failed", "email.delivery_delayed"].includes(event.type)) {
    return Response.json({ ok: true, ignored: true });
  }

  const db = createAdminClient();
  const { data: message } = await db
    .from("messages")
    .select("id,workspace_id,conversation_id")
    .eq("external_message_id", event.data.email_id)
    .maybeSingle();
  if (!message) return Response.json({ ok: true, ignored: true });

  if (event.type === "email.delivered") {
    const { error } = await db
      .from("messages")
      .update({ delivered_at: event.created_at || new Date().toISOString() })
      .eq("id", message.id);
    if (error) return Response.json({ error: "Could not update delivery state" }, { status: 500 });
    return Response.json({ ok: true });
  }

  const { data: conversation } = await db
    .from("conversations")
    .select("contact_id")
    .eq("id", message.conversation_id)
    .maybeSingle();
  if (conversation) {
    const title = event.type === "email.delivery_delayed"
      ? "Email delivery delayed"
      : event.type === "email.bounced"
        ? "Email bounced"
        : "Email delivery failed";
    await db.from("contact_events").insert({
      workspace_id: message.workspace_id,
      contact_id: conversation.contact_id,
      conversation_id: message.conversation_id,
      event_type: "email_sent",
      title,
      metadata: {
        email_id: event.data.email_id,
        event_type: event.type,
        detail: event.data.bounce?.message ?? null,
      },
    });
  }

  return Response.json({ ok: true });
}
