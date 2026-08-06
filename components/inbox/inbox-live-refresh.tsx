"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function InboxLiveRefresh({workspaceId}:{workspaceId:string}){
  const router=useRouter();
  const supabase=useMemo(()=>createClient(),[]);
  useEffect(()=>{
    let active=true;
    let running=false;

    const processSummaryJobs=async()=>{
      if(!active||running||document.visibilityState!=="visible")return;
      running=true;
      try{
        const response=await fetch("/api/ai/summary-jobs",{
          method:"POST",
          headers:{"content-type":"application/json"},
          body:JSON.stringify({workspaceId}),
        });
        if(response.ok){
          const json=await response.json().catch(()=>null);
          if(active&&Number(json?.processedCount??0)>0)router.refresh();
        }
      }finally{running=false;}
    };

    const channel=supabase.channel(`inbox-list:${workspaceId}`)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"conversations",filter:`workspace_id=eq.${workspaceId}`},()=>router.refresh())
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"conversation_summaries"},()=>router.refresh())
      .subscribe();

    void processSummaryJobs();
    const timer=window.setInterval(()=>void processSummaryJobs(),30_000);
    const onVisibility=()=>{if(document.visibilityState==="visible")void processSummaryJobs();};
    document.addEventListener("visibilitychange",onVisibility);

    return()=>{
      active=false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange",onVisibility);
      void supabase.removeChannel(channel);
    };
  },[router,supabase,workspaceId]);
  return null;
}
