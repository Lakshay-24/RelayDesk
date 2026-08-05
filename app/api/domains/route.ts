import { randomBytes } from "crypto";
import { promises as dns } from "dns";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createSchema=z.object({workspaceId:z.string().uuid(),hostname:z.string().trim().min(4).max(253).regex(/^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i)});
const domainSchema=z.object({domainId:z.string().uuid(),workspaceId:z.string().uuid()});
async function admin(db:Awaited<ReturnType<typeof createClient>>,workspaceId:string,userId:string){return db.from("memberships").select("id").eq("workspace_id",workspaceId).eq("user_id",userId).eq("role","admin").maybeSingle()}

export async function POST(request:Request){
 const parsed=createSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Enter a valid hostname such as help.example.com"},{status:400});
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {data:membership}=await admin(db,parsed.data.workspaceId,user.id);
 if(!membership)return NextResponse.json({error:"Only admins can add domains"},{status:403});
 const hostname=parsed.data.hostname.toLowerCase().replace(/\.$/,"");
 const token=`relaydesk-verification=${randomBytes(18).toString("hex")}`;
 const {data,error}=await db.from("custom_domains").insert({workspace_id:parsed.data.workspaceId,hostname,verification_token:token,status:"pending"}).select().single();
 if(error)return NextResponse.json({error:error.code==="23505"?"This hostname is already registered":error.message},{status:400});
 return NextResponse.json({domain:data,records:{cname:{name:hostname,value:process.env.CUSTOM_DOMAIN_CNAME_TARGET??"cname.vercel-dns.com"},txt:{name:`_relaydesk.${hostname}`,value:token}}});
}

export async function PATCH(request:Request){
 const parsed=domainSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid domain"},{status:400});
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {data:membership}=await admin(db,parsed.data.workspaceId,user.id);
 if(!membership)return NextResponse.json({error:"Only admins can verify domains"},{status:403});
 const {data:domain}=await db.from("custom_domains").select("*").eq("id",parsed.data.domainId).eq("workspace_id",parsed.data.workspaceId).maybeSingle();
 if(!domain)return NextResponse.json({error:"Domain not found"},{status:404});
 await db.from("custom_domains").update({status:"pending",updated_at:new Date().toISOString()}).eq("id",domain.id);
 try{
  const records=(await dns.resolveTxt(`_relaydesk.${domain.hostname}`)).flat();
  if(!records.includes(domain.verification_token))return NextResponse.json({error:"Verification TXT record has not propagated yet"},{status:409});
  const {data,error}=await db.from("custom_domains").update({status:"verified",verified_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",domain.id).select().single();
  if(error)throw error;
  return NextResponse.json({domain:data});
 }catch(error){
  const message=error instanceof Error&&error.message.includes("TXT")?error.message:"DNS verification is not available yet";
  await db.from("custom_domains").update({status:"failed",updated_at:new Date().toISOString()}).eq("id",domain.id);
  return NextResponse.json({error:message},{status:409});
 }
}

export async function DELETE(request:Request){
 const parsed=domainSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid domain"},{status:400});
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {data:membership}=await admin(db,parsed.data.workspaceId,user.id);
 if(!membership)return NextResponse.json({error:"Only admins can remove domains"},{status:403});
 const {error}=await db.from("custom_domains").delete().eq("id",parsed.data.domainId).eq("workspace_id",parsed.data.workspaceId);
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({ok:true});
}
