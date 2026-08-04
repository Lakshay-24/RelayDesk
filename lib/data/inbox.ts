import { createClient } from "@/lib/supabase/server";
import type { Conversation,Membership,Message,Workspace } from "@/types/domain";

export async function getAgentContext():Promise<{workspace:Workspace;membership:Membership}|null>{
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return null;
  const {data}=await supabase.from("memberships").select("id,workspace_id,user_id,role,workspaces(id,name,slug,public_key)").eq("user_id",user.id).limit(1).maybeSingle();
  if(!data||!data.workspaces)return null;
  const workspace=(Array.isArray(data.workspaces)?data.workspaces[0]:data.workspaces) as Workspace;
  return {workspace,membership:{id:data.id,workspace_id:data.workspace_id,user_id:data.user_id,role:data.role}};
}

export async function getInboxData(workspaceId:string){
  const supabase=await createClient();
  const {data:conversations,error}=await supabase.from("conversations").select("id,workspace_id,contact_id,channel,subject,status,assignee_id,last_message_at,created_at,contacts(id,name,email,visitor_key,last_seen_at)").eq("workspace_id",workspaceId).order("last_message_at",{ascending:false});
  if(error)throw error;
  const ids=(conversations??[]).map(c=>c.id);
  const {data:messages}=ids.length?await supabase.from("messages").select("*").in("conversation_id",ids).order("created_at"):{data:[]};
  return {conversations:(conversations??[]).map(c=>({...c,contact:Array.isArray(c.contacts)?c.contacts[0]:c.contacts})) as Conversation[],messages:(messages??[]) as Message[]};
}
