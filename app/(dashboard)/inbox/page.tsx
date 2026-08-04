import { redirect } from "next/navigation";
import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { getAgentContext, getInboxData } from "@/lib/data/inbox";

export default async function InboxPage() {
  const context = await getAgentContext();
  if (!context) redirect("/onboarding");
  const data = await getInboxData(context.workspace.id);
  return <InboxWorkspace workspace={context.workspace} membership={context.membership} initialConversations={data.conversations} initialMessages={data.messages} />;
}
