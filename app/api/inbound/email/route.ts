import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { inboundText, normalizeAddress } from "@/lib/security/email";
const inbound=z.object({from:z.string().min(3),to:z.string().min(3),subject:z.string().max(500).optional(),text:z.string().optional(),html:z.string().optional(),messageId:z.string().min(1).max(998),inReplyTo:z.string().max(998).optional(),references:z.array(z.string()).optional()});
export async function POST(req:Request){
 if(!process.env.EMAIL_WEBHOOK_SECRET||req.headers.get("x-webhook-secret")!==process.env.EMAIL_WEBHOOK_SECRET)return Response.json({error:"Unauthorized"},{status:401});
 const body=inbound.safeParse(await req.json().catch(()=>null));if(!body.success)return Response.json({error:"Invalid payload"},{status:400});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);const recipient=normalizeAddress(body.data.to);const sender=normalizeAddress(body.data.from);
 const {data:existing}=await db.from("messages").select("conversation_id").eq("external_message_id",body.data.messageId).maybeSingle();if(existing)return Response.json({ok:true,duplicate:true,conversationId:existing.conversation_id});
 const {data:address,error:addressError}=await db.from("inbound_addresses").select("workspace_id").eq("address",recipient).maybeSingle();if(addressError||!address)return Response.json({error:"Unknown recipient"},{status:404});
 const {data:contact,error:contactError}=await db.from("contacts").upsert({workspace_id:address.workspace_id,email:sender,name:body.data.from.includes("<")?body.data.from.split("<")[0].trim().replace(/^"|"$/g,""):null,last_seen_at:new Date().toISOString()},{onConflict:"workspace_id,email"}).select().single();if(contactError||!contact)return Response.json({error:"Could not resolve sender"},{status:500});
 let conversationId:string|undefined;const refs=[body.data.inReplyTo,...(body.data.references??[])].filter(Boolean) as string[];if(refs.length){const {data:parent}=await db.from("messages").select("conversation_id").in("external_message_id",refs).limit(1).maybeSingle();conversationId=parent?.conversation_id;}
 if(!conversationId){const {data:conversation,error}=await db.from("conversations").insert({workspace_id:address.workspace_id,contact_id:contact.id,channel:"email",subject:body.data.subject?.trim()||"No subject",status:"open"}).select().single();if(error||!conversation)return Response.json({error:"Could not create conversation"},{status:500});conversationId=conversation.id;}
 const content=inboundText(body.data.text,body.data.html);if(!content)return Response.json({error:"Message has no readable content"},{status:400});
 const {error:messageError}=await db.from("messages").insert({workspace_id:address.workspace_id,conversation_id:conversationId,sender_type:"contact",channel:"email",body:content,external_message_id:body.data.messageId,in_reply_to:body.data.inReplyTo??null});if(messageError){if(messageError.code==="23505")return Response.json({ok:true,duplicate:true,conversationId});return Response.json({error:"Could not store message"},{status:500});}
 return Response.json({ok:true,conversationId});
}
