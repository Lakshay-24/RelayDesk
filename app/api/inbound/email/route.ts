import { z } from "zod";
import { processInboundEmail } from "@/lib/inbound-email";

const inbound = z.object({
  from: z.string().min(3),
  to: z.string().min(3),
  subject: z.string().max(500).optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  messageId: z.string().min(1).max(998),
  inReplyTo: z.string().max(998).optional(),
  references: z.array(z.string().max(998)).optional(),
});

export async function POST(request: Request) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-webhook-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = inbound.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid payload" }, { status: 400 });

  try {
    const result = await processInboundEmail(parsed.data);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not process inbound email";
    const status = message === "Unknown recipient" ? 404 : message === "Message has no readable content" ? 400 : 500;
    console.error("inbound email processing failed", { message });
    return Response.json({ error: message }, { status });
  }
}
