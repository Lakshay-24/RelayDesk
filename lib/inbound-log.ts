import { createAdminClient } from "@/lib/supabase/admin";

export async function logInboundEvent(input:{workspaceId?:string|null;source:"webhook"|"sync";stage:string;status:"info"|"success"|"error";externalId?:string|null;detail?:string|null}){
  try{await createAdminClient().from("inbound_email_events").insert({workspace_id:input.workspaceId??null,source:input.source,stage:input.stage,status:input.status,external_id:input.externalId??null,detail:input.detail?.slice(0,500)??null});}catch(error){console.error("inbound-log",input.stage,error);}
}
