import { redirect } from "next/navigation";
import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { InboxLiveRefresh } from "@/components/inbox/inbox-live-refresh";
import { InboundEmailSync } from "@/components/inbox/inbound-email-sync";
import { getAgentContext, getInboxData } from "@/lib/data/inbox";

export default async function InboxPage() {
  const context = await getAgentContext();
  if (!context) redirect("/onboarding");
  const data = await getInboxData(context.workspace.id);
  const inboxKey = `${data.conversations.length}-${data.conversations[0]?.last_message_at ?? "empty"}`;
  return <><InboundEmailSync workspaceId={context.workspace.id}/><InboxLiveRefresh workspaceId={context.workspace.id}/><InboxWorkspace key={inboxKey} workspace={context.workspace} membership={context.membership} members={data.members} cannedResponses={data.cannedResponses} initialConversations={data.conversations} initialMessages={data.messages} /></>;
}
