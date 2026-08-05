import { createClient } from "@/lib/supabase/server";
import type {
  CannedResponse,
  Contact,
  Conversation,
  ConversationPriority,
  ConversationStatus,
  Membership,
  Message,
  Workspace,
} from "@/types/domain";

type Relation<T> = T | T[] | null;

type RawConversation = {
  id: string;
  workspace_id: string;
  contact_id: string;
  channel: "chat" | "email";
  subject: string | null;
  status: ConversationStatus;
  assignee_id: string | null;
  last_message_at: string;
  created_at: string;
  snoozed_until?: string | null;
  first_response_at?: string | null;
  resolved_at?: string | null;
  sla_due_at?: string | null;
  priority?: ConversationPriority | null;
  contacts: Relation<Contact>;
  conversation_summaries: Relation<{ summary: string }>;
};

function firstRelation<T>(value: Relation<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function getAgentContext(): Promise<{
  workspace: Workspace;
  membership: Membership;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("memberships")
    .select("id,workspace_id,user_id,role,workspaces(id,name,slug,public_key)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!data || !data.workspaces) return null;

  const workspace = firstRelation(data.workspaces as Relation<Workspace>);
  if (!workspace) return null;

  return {
    workspace,
    membership: {
      id: data.id,
      workspace_id: data.workspace_id,
      user_id: data.user_id,
      role: data.role as Membership["role"],
      email: user.email ?? null,
    },
  };
}

export async function getInboxData(workspaceId: string): Promise<{
  conversations: Conversation[];
  messages: Message[];
  members: Membership[];
  cannedResponses: CannedResponse[];
}> {
  const supabase = await createClient();

  const { data: conversationRows, error: conversationError } = await supabase
    .from("conversations")
    .select(
      "id,workspace_id,contact_id,channel,subject,status,assignee_id,last_message_at,created_at,snoozed_until,first_response_at,resolved_at,sla_due_at,priority,contacts(id,name,email,visitor_key,last_seen_at),conversation_summaries(summary)",
    )
    .eq("workspace_id", workspaceId)
    .order("last_message_at", { ascending: false });

  if (conversationError) throw conversationError;

  const rawConversations = (conversationRows ?? []) as unknown as RawConversation[];
  const conversationIds = rawConversations.map((conversation) => conversation.id);

  let messages: Message[] = [];
  if (conversationIds.length > 0) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .in("conversation_id", conversationIds)
      .order("created_at");
    if (error) throw error;
    messages = (data ?? []) as Message[];
  }

  const { data: memberRows, error: memberError } = await supabase
    .from("memberships")
    .select("id,workspace_id,user_id,role")
    .eq("workspace_id", workspaceId);
  if (memberError) throw memberError;

  const { data: cannedRows, error: cannedError } = await supabase
    .from("canned_responses")
    .select("id,workspace_id,title,body,tags,created_at,updated_at")
    .eq("workspace_id", workspaceId)
    .order("title");
  if (cannedError) throw cannedError;

  const conversations = rawConversations.map((conversation) => {
    const summary = firstRelation(conversation.conversation_summaries)?.summary ?? null;
    return {
      ...conversation,
      priority: conversation.priority ?? "normal",
      contact: firstRelation(conversation.contacts) ?? undefined,
      summary,
    } as Conversation;
  });

  const members = (memberRows ?? []).map((member) => ({
    ...member,
    role: member.role as Membership["role"],
  })) as Membership[];

  return {
    conversations,
    messages,
    members,
    cannedResponses: (cannedRows ?? []) as CannedResponse[],
  };
}
