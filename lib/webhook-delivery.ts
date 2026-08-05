import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type StoredWebhook = { id:string; url:string; secret:string };
export type StoredDelivery = { id:string; event:string; payload:Record<string,unknown>; attempts:number };

export async function deliverWebhook(webhook:StoredWebhook, delivery:StoredDelivery){
 const db=createAdminClient();const raw=JSON.stringify(delivery.payload);const signature=createHmac("sha256",webhook.secret).update(raw).digest("hex");
 try{
  const response=await fetch(webhook.url,{method:"POST",headers:{"content-type":"application/json","x-relaydesk-event":delivery.event,"x-relaydesk-signature":`sha256=${signature}`,"user-agent":"RelayDesk-Webhooks/1.0"},body:raw,signal:AbortSignal.timeout(10000)});
  const responseBody=(await response.text().catch(()=>"")).slice(0,2000);const attempts=delivery.attempts+1;const delivered=response.ok;
  await db.from("webhook_deliveries").update({status:delivered?"delivered":"failed",response_status:response.status,response_body:responseBody||null,attempts,delivered_at:delivered?new Date().toISOString():null,last_error:delivered?null:`HTTP ${response.status}`,next_attempt_at:delivered?null:new Date(Date.now()+Math.min(60,2**attempts)*60000).toISOString()}).eq("id",delivery.id);
  return {ok:delivered,status:response.status,error:delivered?null:`HTTP ${response.status}`};
 }catch(error){
  const attempts=delivery.attempts+1;const message=error instanceof Error?error.message:"Webhook delivery failed";
  await db.from("webhook_deliveries").update({status:"failed",attempts,last_error:message,next_attempt_at:new Date(Date.now()+Math.min(60,2**attempts)*60000).toISOString()}).eq("id",delivery.id);
  return {ok:false,status:null,error:message};
 }
}
