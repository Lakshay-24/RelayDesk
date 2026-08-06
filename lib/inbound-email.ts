import { createAdminClient } from "@/lib/supabase/admin";
import { inboundText, normalizeAddress } from "@/lib/security/email";
import { RESEND_INBOUND_DOMAIN, workspaceInboundAddress } from "@/lib/inbound-address";

export type InboundEmailInput = {
  from: string;
  to: string;
  subject?: string;
  text?: string | null;
  html?: string | null;
  messageId: string;
  inReplyTo?: string | null;
  references?: string[];
};

async function resolveWorkspaceId(recipient: string) {
  const db = createAdminClient();
  const { data: address, error } = await db
    .from("inbound_addresses")
    .select("workspace_id")
    .eq("address", recipient)
    .maybeSingle();
  if (!error && address) return address.workspace_id as string;

  const [localPart, domain] = recipient.split("@");
  if (!localPart || domain !== RESEND_INBOUND_DOMAIN) return null;

  const { data: workspace } = await db
    .from("workspaces")
    .select("id,slug")
    .eq("slug", localPart)
    .maybeSingle();
  if (!workspace) return null;

  await db.from("inbound_addresses").upsert(
    { workspace_id: workspace.id, address: workspaceInboundAddress(workspace.slug) },
    { onConflict: "workspace_id" },
  );
  return workspace.id as string;
}

export async function processInboundEmail(input: InboundEmailInput) {
  const db = createAdminClient();
  const recipient = normalizeAddress(input.to);
  const sender = normalizeAddress(input.from);

  const { data: existing } = await db
    .from("messages")
    .select("conversation_id")
    .eq("external_message_id", input.messageId)
    .maybeSingle();
  if (existing) return { duplicate: true, conversationId: existing.conversation_id };

  const workspaceId = await resolveWorkspaceId(recipient);
  if (!workspaceId) throw new Error("Unknown recipient");

  const displayName = input.from.includes("<")
    ? input.from.split("<")[0].trim().replace(/^"|"$/g, "")
    : null;
  const { data: contact, error: contactError } = await db
    .from("contacts")
    .upsert(
      { workspace_id: workspaceId, email: sender, name: displayName, last_seen_at: new Date().toISOString() },
      { onConflict: "workspace_id,email" },
    )
    .select()
    .single();
  if (contactError || !contact) throw new Error("Could not resolve sender");

  let conversationId: string | undefined;
  const refs = [input.inReplyTo, ...(input.references ?? [])].filter(Boolean) as string[];
  if (refs.length) {
    const { data: parent } = await db
      .from("messages")
      .select("conversation_id")
      .in("external_message_id", refs)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    conversationId = parent?.conversation_id;
  }

  if (!conversationId) {
    const { data: conversation, error } = await db
      .from("conversations")
      .insert({
        workspace_id: workspaceId,
        contact_id: contact.id,
        channel: "email",
        subject: input.subject?.trim() || "No subject",
        status: "open",
      })
      .select()
      .single();
    if (error || !conversation) throw new Error("Could not create conversation");
    conversationId = conversation.id;
  }

  const content = inboundText(input.text ?? undefined, input.html ?? undefined);
  if (!content) throw new Error("Message has no readable content");

  const now = new Date().toISOString();
  const { error: messageError } = await db.from("messages").insert({
    workspace_id: workspaceId,
    conversation_id: conversationId,
    sender_type: "contact",
    channel: "email",
    body: content,
    external_message_id: input.messageId,
    in_reply_to: input.inReplyTo ?? null,
  });
  if (messageError) {
    if (messageError.code === "23505") return { duplicate: true, conversationId };
    throw new Error("Could not store message");
  }

  await db
    .from("conversations")
    .update({ status: "open", last_message_at: now, updated_at: now })
    .eq("id", conversationId)
    .eq("workspace_id", workspaceId);

  return { duplicate: false, conversationId };
}
