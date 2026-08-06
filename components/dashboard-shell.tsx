"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, BookOpenText, Inbox, MessageSquareText, Settings } from "lucide-react";

const items = [
  { href: "/inbox", label: "Inbox", description: "Conversations", icon: Inbox },
  { href: "/knowledge", label: "Knowledge", description: "Help centre", icon: BookOpenText },
  { href: "/analytics", label: "Analytics", description: "Performance", icon: BarChart3 },
  { href: "/settings", label: "Settings", description: "Workspace", icon: Settings },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    const prefetch = () => items.forEach(({ href }) => router.prefetch(href));
    const timer = window.setTimeout(prefetch, 250);
    return () => window.clearTimeout(timer);
  }, [router]);

  // Workspace setup must not expose dashboard navigation before a workspace exists.
  if (pathname.startsWith("/onboarding")) return <>{children}</>;

  return (
    <div className="dashboard-shell relay-shell">
      {pendingHref ? <div className="route-progress" aria-label="Loading page" /> : null}
      <aside className="sidebar relay-sidebar">
        <Link href="/inbox" className="brand relay-brand" aria-label="Open RelayDesk inbox">
          <span className="brand-mark"><MessageSquareText size={20} /></span>
          <span className="brand-copy"><strong>RelayDesk</strong><small>Support workspace</small></span>
        </Link>
        <p className="nav-section-label">Workspace</p>
        <nav className="nav relay-nav" aria-label="Workspace navigation">
          {items.map(({ href, label, description, icon: Icon }) => {
            const active = pathname.startsWith(href);
            const pending = pendingHref === href;
            return (
              <Link
                key={href}
                href={href}
                prefetch
                aria-current={active ? "page" : undefined}
                aria-busy={pending || undefined}
                className={active ? "active" : undefined}
                onMouseEnter={() => router.prefetch(href)}
                onFocus={() => router.prefetch(href)}
                onClick={() => { if (!active) setPendingHref(href); }}
              >
                <span className="nav-icon"><Icon size={18} /></span>
                <span className="nav-copy"><strong>{label}</strong><small>{pending ? "Opening…" : description}</small></span>
                {active ? <span className="active-dot" /> : null}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="dashboard-content">{children}</main>
      <style jsx global>{`
        .relay-shell{grid-template-columns:224px minmax(0,1fr)!important}
        .relay-sidebar{width:224px!important;padding:20px 14px!important;border-right:1px solid #2b2b2b;overflow:hidden}
        .relay-brand{display:flex!important;align-items:center!important;gap:11px!important;min-height:48px;padding:6px 8px!important;margin-bottom:22px!important;color:#fff!important;text-decoration:none}
        .brand-mark{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:#fff;color:#171717;flex:none}
        .brand-copy,.nav-copy{display:grid;min-width:0;line-height:1.15}
        .brand-copy strong{font-size:15px}.brand-copy small{margin-top:4px;color:#999;font-size:11px;font-weight:500}
        .nav-section-label{margin:0 10px 8px;color:#747474;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
        .relay-nav{display:grid!important;gap:6px!important}
        .relay-nav a{position:relative;display:grid!important;grid-template-columns:36px minmax(0,1fr) 6px;align-items:center;gap:10px;min-height:56px;padding:8px 10px!important;border:1px solid transparent;border-radius:12px!important;color:#aaa!important;text-decoration:none;transition:background .15s ease,border-color .15s ease,color .15s ease,transform .15s ease}
        .relay-nav a:hover{background:#222!important;color:#fff!important;border-color:#303030;transform:translateX(1px)}
        .relay-nav a.active{background:#f4f4f0!important;color:#171717!important;border-color:#f4f4f0;box-shadow:0 6px 18px rgba(0,0,0,.2)}
        .nav-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:#242424;color:inherit}
        .relay-nav a.active .nav-icon{background:#deded8}
        .nav-copy strong{font-size:13px;font-weight:750}.nav-copy small{margin-top:4px;color:#747474;font-size:10px;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .relay-nav a:not(.active) .nav-copy small{color:#777}.active-dot{width:6px;height:6px;border-radius:999px;background:#171717}
        .route-progress{position:fixed;z-index:9999;top:0;left:0;height:3px;width:38%;background:#4f7cff;box-shadow:0 0 12px rgba(79,124,255,.65);animation:route-progress 1s ease-in-out infinite}
        @keyframes route-progress{0%{transform:translateX(-100%)}100%{transform:translateX(360%)}}
        @media(max-width:760px){
          .relay-shell{display:block!important;padding-bottom:76px}
          .relay-sidebar{position:fixed!important;z-index:100;left:12px!important;right:12px!important;bottom:10px!important;top:auto!important;width:auto!important;height:64px!important;padding:6px!important;border:1px solid #333!important;border-radius:18px;background:#171717;box-shadow:0 12px 32px rgba(0,0,0,.28)}
          .relay-brand,.nav-section-label{display:none!important}.relay-nav{display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:4px!important;height:100%}
          .relay-nav a{display:grid!important;grid-template-columns:1fr!important;place-items:center;min-height:0;padding:5px!important;gap:2px;border-radius:13px!important;transform:none!important}
          .nav-icon{width:28px;height:28px;background:transparent}.nav-copy strong{font-size:9px}.nav-copy small,.active-dot{display:none}.relay-nav a.active .nav-icon{background:transparent}
        }
      `}</style>
    </div>
  );
}
