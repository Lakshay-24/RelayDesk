import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { dispatchWorkspaceWebhooks } from "@/lib/webhooks";

const schema=z.object({conversationId:z.string().uuid(),body:z.string().trim().min(1).max(10000)});

export async function POST(request:Request){
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid reply"},{status:400});
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {data:conversation}=await supabase.from("conversations").select("id,workspace_id,channel,subject,contact_id,contacts(email),workspaces(name,slug),messages(external_message_id,created_at)").eq("id",parsed.data.conversationId).maybeSingle();
 if(!conversation)return NextResponse.json({error:"Conversation not found"},{status:404});
 const {data:membership}=await supabase.from("memberships").select("id").eq("workspace_id",conversation.workspace_id).eq("user_id",user.id).maybeSingle();
 if(!membership)return NextResponse.json({error:"Forbidden"},{status:403});

 const admin=createAdminClient();
 let externalMessageId:string|undefined;
 let inReplyTo:string|null=null;
 if(conversation.channel==="email"){
  const contact=Array.isArray(conversation.contacts)?conversation.contacts[0]:conversation.contacts;
  const workspace=Array.isArray(conversation.workspaces)?conversation.workspaces[0]:conversation.workspaces;
  if(!contact?.email)return NextResponse.json({error:"Contact has no email address"},{status:400});
  const rows=((conversation.messages??[]) as {external_message_id:string|null;created_at:string}[]).filter(item=>Boolean(item.external_message_id)).sort((a,b)=>+new Date(a.created_at)-+new Date(b.created_at));
  const references=rows.map(item=>item.external_message_id as string);
  inReplyTo=references.at(-1)??null;
  const from=process.env.OUTBOUND_EMAIL_FROM??`${workspace?.name??"RelayDesk"} <support@${process.env.INBOUND_EMAIL_DOMAIN??"example.com"}>`;
  try{
   const sent=await sendEmail({
    to:contact.email,
    from,
    subject:`Re: ${conversation.subject??"Support request"}`,
    text:parsed.data.body,
    headers:inReplyTo?{"In-Reply-To":inReplyTo,"References":references.join(" ")}:undefined,
    idempotencyKey:`relaydesk-${conversation.id}-${membership.id}-${crypto.randomUUID()}`,
   });
   externalMessageId=sent.id;
  }catch(error){
   console.error("Outbound support email failed",{conversationId:conversation.id,message:error instanceof Error?error.message:"Email delivery failed"});
   return NextResponse.json({error:error instanceof Error?error.message:"Email delivery failed"},{status:502});
  }
 }

 const now=new Date().toISOString();
 const {data:message,error}=await admin.from("messages").insert({workspace_id:conversation.workspace_id,conversation_id:conversation.id,sender_type:"agent",sender_membership_id:membership.id,channel:conversation.channel,body:parsed.data.body,external_message_id:externalMessageId,in_reply_to:inReplyTo,delivered_at:null}).select().single();
 if(error)return NextResponse.json({error:error.message},{status:500});
 await admin.from("conversations").update({last_message_at:now,updated_at:now,status:"open"}).eq("id",conversation.id);
 if(conversation.channel==="chat")await admin.channel(`conversation:${conversation.id}`).send({type:"broadcast",event:"message",payload:message});
 await dispatchWorkspaceWebhooks({workspaceId:conversation.workspace_id,event:"message.created",data:{message,conversation_id:conversation.id}});
 return NextResponse.json({message});
}
