import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema=z.object({token:z.string().min(32).max(256)});
export async function POST(request:Request){
 const parsed=schema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:"Invalid invitation token"},{status:400});
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return NextResponse.json({error:"Sign in before accepting the invitation"},{status:401});
 const hash=createHash("sha256").update(parsed.data.token).digest("hex");
 const {data,error}=await db.rpc("accept_workspace_invitation",{invite_token_hash:hash});
 if(error)return NextResponse.json({error:error.message},{status:400});
 return NextResponse.json({ok:true,workspaceId:data});
}
