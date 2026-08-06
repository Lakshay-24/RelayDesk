"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, BookOpenText, Building2, Inbox, LogOut, MessageSquareText, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DashboardUiPolish } from "@/components/dashboard-ui-polish";

const items=[
  {href:"/inbox",label:"Inbox",icon:Inbox},
  {href:"/knowledge",label:"Knowledge",icon:BookOpenText},
  {href:"/analytics",label:"Analytics",icon:BarChart3},
  {href:"/settings",label:"Settings",icon:Settings},
];

export function DashboardShell({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  const router=useRouter();
  const supabase=useMemo(()=>createClient(),[]);
  const [pendingHref,setPendingHref]=useState<string|null>(null);
  const [signingOut,setSigningOut]=useState(false);
  const [inviteCount,setInviteCount]=useState(0);

  useEffect(()=>setPendingHref(null),[pathname]);
  useEffect(()=>{
    fetch("/api/team/pending",{cache:"no-store"})
      .then(response=>response.ok?response.json():null)
      .then(json=>setInviteCount(json?.invitations?.length??0))
      .catch(()=>undefined);
  },[pathname]);

  async function signOut(){
    if(signingOut)return;
    setSigningOut(true);
    const {error}=await supabase.auth.signOut();
    if(error){setSigningOut(false);window.alert(`Could not sign out: ${error.message}`);return;}
    router.replace("/login");
    router.refresh();
  }

  if(pathname.startsWith("/onboarding"))return <>{children}</>;

  return <div className="dashboard-shell relay-shell">
    <DashboardUiPolish/>
    {pendingHref||signingOut?<div className="route-progress"/>:null}
    <aside className="sidebar relay-sidebar">
      <div className="brand relay-logo" aria-label="RelayDesk">
        <MessageSquareText size={20}/><span className="brand-dot"/>
      </div>
      <nav className="nav relay-nav" aria-label="Workspace navigation">
        {items.map(({href,label,icon:Icon})=>{
          const active=pathname.startsWith(href);
          return <Link key={href} href={href} data-label={label} aria-label={label} aria-current={active?"page":undefined} className={active?"active":undefined} onClick={()=>{if(!active)setPendingHref(href)}}>
            <Icon size={20}/><span className="mobile-nav-label">{label}</span>
          </Link>;
        })}
      </nav>
      <div className="sidebar-bottom">
        <Link href="/workspaces" className={`workspace-switch ${pathname.startsWith("/workspaces")?"active":""}`} aria-label="Switch workspace" aria-current={pathname.startsWith("/workspaces")?"page":undefined} onClick={()=>setPendingHref("/workspaces")}>
          <span className="switch-icon"><Building2 size={20}/>{inviteCount>0?<span className="invite-dot">{inviteCount}</span>:null}</span><strong>Switch</strong>
        </Link>
        <button type="button" className="relay-signout" data-label={signingOut?"Signing out…":"Sign out"} aria-label={signingOut?"Signing out":"Sign out"} disabled={signingOut} onClick={signOut}>
          <LogOut size={20}/><span className="mobile-nav-label">Sign out</span>
        </button>
      </div>
    </aside>
    <main className="dashboard-content">{children}</main>
    <style jsx global>{`
      .relay-shell{grid-template-columns:76px minmax(0,1fr)!important;min-height:100svh}
      .relay-sidebar{position:sticky!important;top:0!important;width:76px!important;height:100svh!important;padding:16px 10px!important;border-right:1px solid #292929!important;background:#171717!important;overflow:visible!important;display:flex!important;flex-direction:column!important}
      .relay-logo{position:relative;display:grid!important;place-items:center!important;width:46px!important;height:46px!important;margin:2px auto 22px!important;padding:0!important;border:1px solid #343434!important;border-radius:14px!important;background:#202020!important;color:#f5f5f1!important}
      .brand-dot{position:absolute;right:7px;bottom:7px;width:6px;height:6px;border-radius:50%;background:#6f8cff;box-shadow:0 0 0 3px #202020}
      .relay-nav{display:grid!important;gap:8px!important;justify-items:center!important}
      .relay-nav a,.relay-signout{position:relative;display:grid!important;place-items:center!important;width:48px!important;height:48px!important;padding:0!important;border:1px solid transparent!important;border-radius:14px!important;color:#979797!important;background:transparent!important;text-decoration:none!important;transition:background .16s ease,color .16s ease,border-color .16s ease,transform .16s ease!important}
      .relay-nav a:hover,.relay-signout:hover{background:#222!important;color:#fff!important;border-color:#303030!important;transform:translateY(-1px)}
      .relay-nav a.active{background:#f5f5f1!important;color:#171717!important;border-color:#f5f5f1!important;box-shadow:0 5px 18px rgba(0,0,0,.2)}
      .sidebar-bottom{margin-top:auto!important;display:grid!important;justify-items:center!important;gap:8px!important}
      .workspace-switch{display:grid!important;place-items:center!important;gap:2px!important;width:54px!important;min-height:52px!important;padding:5px 3px!important;border:1px solid transparent!important;border-radius:14px!important;color:#aaa!important;text-decoration:none!important;font-size:9px!important;font-weight:800!important;transition:.16s ease!important}
      .workspace-switch:hover,.workspace-switch.active{background:#222!important;border-color:#303030!important;color:#fff!important}
      .switch-icon{position:relative;display:grid;place-items:center;width:34px;height:28px}
      .invite-dot{position:absolute;right:-5px;top:-5px;display:grid;place-items:center;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:#e5484d;color:#fff;font-size:9px}
      .mobile-nav-label{display:none}
      .relay-nav a::after,.relay-signout::after{content:attr(data-label);position:absolute;z-index:30;left:58px;top:50%;transform:translateY(-50%);padding:7px 9px;border-radius:8px;background:#111;color:#fff;font-size:12px;font-weight:700;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .12s ease}
      .relay-nav a:hover::after,.relay-signout:hover::after{opacity:1}
      .route-progress{position:fixed;z-index:9999;top:0;left:0;height:3px;width:30%;background:#5f7cff;animation:route-progress .9s ease-in-out infinite}
      @keyframes route-progress{0%{transform:translateX(-110%)}100%{transform:translateX(440%)}}
      @media(max-width:760px){
        .relay-shell{display:block!important;padding-bottom:82px!important}
        .relay-sidebar{position:fixed!important;z-index:100!important;left:10px!important;right:10px!important;bottom:10px!important;top:auto!important;width:auto!important;height:64px!important;padding:5px!important;border:1px solid #333!important;border-radius:18px!important;display:grid!important;grid-template-columns:minmax(0,1fr) 104px!important;gap:4px!important;box-shadow:0 14px 36px rgba(0,0,0,.28)}
        .relay-logo{display:none!important}.relay-nav{grid-template-columns:repeat(4,minmax(0,1fr))!important;width:100%!important;gap:2px!important}
        .relay-nav a,.relay-signout{width:100%!important;height:52px!important;border-radius:13px!important;display:flex!important;flex-direction:column!important;gap:3px!important}
        .mobile-nav-label{display:block!important;font-size:9px!important;font-weight:700!important;line-height:1!important}
        .sidebar-bottom{margin:0!important;display:grid!important;grid-template-columns:52px 52px!important;gap:0!important}
        .workspace-switch{width:52px!important;height:52px!important;min-height:52px!important;padding:2px!important}.workspace-switch strong{font-size:9px!important}
        .relay-nav a::after,.relay-signout::after{display:none!important}
      }
    `}</style>
  </div>;
}
