"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function InboxLiveRefresh({workspaceId}:{workspaceId:string}){
  const router=useRouter();
  const supabase=useMemo(()=>createClient(),[]);
  useEffect(()=>{
    const channel=supabase.channel(`inbox-list:${workspaceId}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"conversations",filter:`workspace_id=eq.${workspaceId}`},()=>router.refresh())
      .subscribe();
    return()=>{void supabase.removeChannel(channel)};
  },[router,supabase,workspaceId]);
  return null;
}
