"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, BookOpenText, Inbox, MessageSquareText, Settings } from "lucide-react";

const items = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/knowledge", label: "Knowledge", icon: BookOpenText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      items.forEach(({ href }) => router.prefetch(href));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [router]);

  if (pathname.startsWith("/onboarding")) return <>{children}</>;

  return (
    <div className="dashboard-shell relay-shell">
      {pendingHref ? <div className="route-progress" aria-label="Loading page" /> : null}
      <aside className="sidebar relay-sidebar">
        <Link href="/inbox" className="brand relay-brand" aria-label="Open RelayDesk inbox">
          <MessageSquareText size={21} />
        </Link>

        <nav className="nav relay-nav" aria-label="Workspace navigation">
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            const pending = pendingHref === href;

            return (
              <Link
                key={href}
                href={href}
                prefetch
                aria-label={label}
                aria-current={active ? "page" : undefined}
                aria-busy={pending || undefined}
                data-label={pending ? `Opening ${label}…` : label}
                className={active ? "active" : undefined}
                onMouseEnter={() => router.prefetch(href)}
                onFocus={() => router.prefetch(href)}
                onClick={() => {
                  if (!active) setPendingHref(href);
                }}
              >
                <span className="nav-icon"><Icon size={20} /></span>
                <span className="mobile-nav-label">{pending ? "Opening…" : label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="dashboard-content">{children}</main>

      <style jsx global>{`
        .relay-shell{grid-template-columns:88px minmax(0,1fr)!important;min-height:100svh}
        .relay-sidebar{position:sticky!important;top:0!important;width:88px!important;height:100svh!important;padding:18px 12px!important;border-right:1px solid #2a2a2a;overflow:visible!important}
        .relay-brand{display:grid!important;place-items:center!important;width:52px!important;height:52px!important;margin:0 auto 24px!important;padding:0!important;border-radius:16px!important;background:#f5f5f1!important;color:#171717!important;transition:transform .16s ease,box-shadow .16s ease}
        .relay-brand:hover{transform:translateY(-1px);box-shadow:0 8px 22px rgba(0,0,0,.28)}
        .relay-nav{display:grid!important;gap:10px!important;justify-items:center}
        .relay-nav a{position:relative;display:grid!important;place-items:center;width:56px!important;height:56px!important;padding:0!important;border:1px solid transparent;border-radius:16px!important;color:#a7a7a7!important;text-decoration:none;outline:none;transition:background .14s ease,color .14s ease,border-color .14s ease,transform .14s ease,box-shadow .14s ease}
        .relay-nav a:hover{background:#232323!important;color:#fff!important;border-color:#323232;transform:translateY(-1px)}
        .relay-nav a:focus-visible{box-shadow:0 0 0 3px rgba(120,156,255,.55)}
        .relay-nav a.active{background:#f5f5f1!important;color:#171717!important;border-color:#f5f5f1;box-shadow:0 8px 24px rgba(0,0,0,.25)}
        .relay-nav a.active::before{content:"";position:absolute;left:-13px;width:3px;height:24px;border-radius:0 999px 999px 0;background:#fff}
        .nav-icon{display:grid;place-items:center}
        .mobile-nav-label{display:none}
        .relay-nav a::after{content:attr(data-label);position:absolute;z-index:20;left:66px;top:50%;transform:translateY(-50%) translateX(-4px);padding:7px 9px;border-radius:9px;background:#111;color:#fff;font-size:12px;font-weight:700;line-height:1;white-space:nowrap;opacity:0;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.3);transition:opacity .12s ease,transform .12s ease}
        .relay-nav a:hover::after,.relay-nav a:focus-visible::after{opacity:1;transform:translateY(-50%) translateX(0)}
        .route-progress{position:fixed;z-index:9999;top:0;left:0;height:3px;width:32%;background:#4f7cff;box-shadow:0 0 14px rgba(79,124,255,.7);animation:route-progress .9s ease-in-out infinite}
        @keyframes route-progress{0%{transform:translateX(-110%)}100%{transform:translateX(420%)}}

        @media(max-width:760px){
          .relay-shell{display:block!important;padding-bottom:84px}
          .relay-sidebar{position:fixed!important;z-index:100;left:10px!important;right:10px!important;bottom:10px!important;top:auto!important;width:auto!important;height:68px!important;padding:6px!important;border:1px solid #333!important;border-radius:20px;background:rgba(23,23,23,.96);backdrop-filter:blur(16px);box-shadow:0 14px 36px rgba(0,0,0,.34)}
          .relay-brand{display:none!important}
          .relay-nav{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:4px!important;width:100%;height:100%}
          .relay-nav a{width:100%!important;height:56px!important;border-radius:15px!important;gap:2px;align-content:center;transform:none!important}
          .relay-nav a::after,.relay-nav a.active::before{display:none}
          .relay-nav a.active{box-shadow:none}
          .nav-icon{height:24px}
          .mobile-nav-label{display:block;font-size:10px;font-weight:700;line-height:1}
        }

        @media(max-width:420px){
          .relay-sidebar{left:6px!important;right:6px!important;bottom:6px!important}
          .relay-nav a{height:54px!important}
          .mobile-nav-label{font-size:9px}
        }

        @media(prefers-reduced-motion:reduce){
          .relay-brand,.relay-nav a,.relay-nav a::after{transition:none!important}
          .route-progress{animation:none;width:100%}
        }
      `}</style>
    </div>
  );
}
