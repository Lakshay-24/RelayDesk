import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { processInboundEmail } from "@/lib/inbound-email";

const eventSchema = z.object({
  type: z.literal("email.received"),
  data: z.object({ email_id: z.string().uuid() }),
});

type ReceivedEmail = {
  id: string;
  to: string[];
  from: string;
  subject?: string | null;
  html?: string | null;
  text?: string | null;
  message_id?: string | null;
  headers?: Record<string, string> | null;
};

function splitReferences(value?: string | null) {
  return value?.match(/<[^>]+>/g) ?? [];
}

function verifyResendWebhook(payload: string, request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signatureHeader = request.headers.get("svix-signature");
  if (!secret || !id || !timestamp || !signatureHeader) return false;

  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;

  try {
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest();
    return signatureHeader.split(" ").some((entry) => {
      const [, encoded] = entry.split(",", 2);
      if (!encoded) return false;
      const actual = Buffer.from(encoded, "base64");
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    });
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const rawPayload = await request.text();
  if (!verifyResendWebhook(rawPayload, request)) {
    return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const parsed = eventSchema.safeParse(JSON.parse(rawPayload));
  if (!parsed.success) return Response.json({ error: "Invalid Resend event" }, { status: 400 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return Response.json({ error: "Resend is not configured" }, { status: 503 });

  const response = await fetch(`https://api.resend.com/emails/receiving/${parsed.data.data.email_id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!response) return Response.json({ error: "Could not retrieve received email" }, { status: 502 });

  const email = (await response.json().catch(() => null)) as ReceivedEmail | null;
  if (!response.ok || !email?.id || !email.to?.[0] || !email.from) {
    return Response.json({ error: "Received email payload was unavailable" }, { status: 502 });
  }

  const headers = email.headers ?? {};
  const from = headers.from || email.from;
  const inReplyTo = headers["in-reply-to"] || null;

  try {
    const result = await processInboundEmail({
      from,
      to: email.to[0],
      subject: email.subject ?? undefined,
      text: email.text,
      html: email.html,
      messageId: email.message_id || `<resend-${email.id}>`,
      inReplyTo,
      references: splitReferences(headers.references),
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not process inbound email";
    const status = message === "Unknown recipient" ? 404 : message === "Message has no readable content" ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
