import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { processInboundEmail } from "@/lib/inbound-email";
import { workspaceInboundAddress } from "@/lib/inbound-address";

const schema = z.object({ workspaceId: z.string().uuid() });

type ReceivedEmailSummary = {
  id: string;
  to?: string[];
  from?: string;
  subject?: string | null;
  message_id?: string | null;
};

type ReceivedEmail = ReceivedEmailSummary & {
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string> | null;
};

function splitReferences(value?: string | null) {
  return value?.match(/<[^>]+>/g) ?? [];
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid workspace." }, { status: 400 });

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await db
    .from("memberships")
    .select("id,workspaces(slug)")
    .eq("workspace_id", parsed.data.workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const workspace = Array.isArray(membership.workspaces) ? membership.workspaces[0] : membership.workspaces;
  if (!workspace?.slug) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "Inbound email is not configured." }, { status: 503 });

  const listResponse = await fetch("https://api.resend.com/emails/receiving?limit=50", {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!listResponse) return NextResponse.json({ error: "Could not reach Resend." }, { status: 502 });

  const listPayload = await listResponse.json().catch(() => null) as { data?: ReceivedEmailSummary[] } | ReceivedEmailSummary[] | null;
  if (!listResponse.ok || !listPayload) {
    return NextResponse.json({ error: "Could not list received emails.", status: listResponse.status }, { status: 502 });
  }

  const summaries = Array.isArray(listPayload) ? listPayload : (listPayload.data ?? []);
  const expectedAddress = workspaceInboundAddress(workspace.slug).toLowerCase();
  const relevant = summaries.filter((email) => email.to?.some((address) => address.toLowerCase() === expectedAddress)).slice(0, 20);

  let imported = 0;
  let duplicates = 0;
  const failures: string[] = [];

  for (const summary of relevant) {
    const response = await fetch(`https://api.resend.com/emails/receiving/${summary.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!response) { failures.push(`${summary.id}: retrieve failed`); continue; }

    const email = await response.json().catch(() => null) as ReceivedEmail | null;
    if (!response.ok || !email?.from || !email.to?.[0]) {
      failures.push(`${summary.id}: invalid payload (${response.status})`);
      continue;
    }

    const headers = email.headers ?? {};
    try {
      const result = await processInboundEmail({
        from: headers.from || email.from,
        to: email.to.find((address) => address.toLowerCase() === expectedAddress) || email.to[0],
        subject: email.subject ?? undefined,
        text: email.text,
        html: email.html,
        messageId: email.message_id || `<resend-${email.id}>`,
        inReplyTo: headers["in-reply-to"] || null,
        references: splitReferences(headers.references),
      });
      if (result.duplicate) duplicates += 1;
      else imported += 1;
    } catch (error) {
      failures.push(`${summary.id}: ${error instanceof Error ? error.message : "processing failed"}`);
    }
  }

  return NextResponse.json({ ok: true, checked: relevant.length, imported, duplicates, failures });
}
