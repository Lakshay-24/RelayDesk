"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, Inbox, MessageSquareText, Settings } from "lucide-react";

const items=[{href:"/inbox",label:"Inbox",icon:Inbox},{href:"/knowledge",label:"Knowledge",icon:BookOpenText},{href:"/settings",label:"Settings",icon:Settings}];

export function DashboardShell({children}:{children:React.ReactNode}){
  const pathname=usePathname();
  return <div className="dashboard-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><MessageSquareText size={20}/><span>RelayDesk</span></Link>
      <nav className="nav">{items.map(({href,label,icon:Icon})=><Link key={href} href={href} style={{background:pathname.startsWith(href)?"#2a2a2a":undefined}}><Icon size={17}/><span className="nav-label">{label}</span></Link>)}</nav>
    </aside>
    <main className="dashboard-content">{children}</main>
  </div>;
}
