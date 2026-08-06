"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

export function MobileInboxNavigation(){
  const [threadOpen,setThreadOpen]=useState(false);

  useEffect(()=>{
    const root=document.documentElement;
    const media=window.matchMedia("(max-width: 760px)");
    const sync=()=>{
      if(!media.matches){
        root.classList.remove("mobile-inbox-thread-open");
        setThreadOpen(false);
      }
    };
    const onClick=(event:MouseEvent)=>{
      if(!media.matches)return;
      const target=event.target as HTMLElement|null;
      if(!target?.closest(".conversation-card"))return;
      root.classList.add("mobile-inbox-thread-open");
      setThreadOpen(true);
      window.scrollTo({top:0,behavior:"auto"});
    };
    document.addEventListener("click",onClick);
    media.addEventListener("change",sync);
    sync();
    return()=>{
      document.removeEventListener("click",onClick);
      media.removeEventListener("change",sync);
      root.classList.remove("mobile-inbox-thread-open");
    };
  },[]);

  function back(){
    document.documentElement.classList.remove("mobile-inbox-thread-open");
    setThreadOpen(false);
    window.scrollTo({top:0,behavior:"auto"});
  }

  if(!threadOpen)return null;
  return <button type="button" className="mobile-thread-back" onClick={back} aria-label="Back to conversations"><ArrowLeft size={20}/>Conversations</button>;
}
