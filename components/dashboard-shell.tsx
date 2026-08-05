"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpenText, Inbox, MessageSquareText, Settings } from "lucide-react";

const items = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/knowledge", label: "Knowledge", icon: BookOpenText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Workspace setup must not expose dashboard navigation before a workspace exists.
  if (pathname.startsWith("/onboarding")) return <>{children}</>;

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <Link href="/inbox" className="brand" aria-label="Open RelayDesk inbox">
          <MessageSquareText size={20} />
          <span>RelayDesk</span>
        </Link>
        <nav className="nav" aria-label="Workspace navigation">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname.startsWith(href) ? "page" : undefined}
              style={{ background: pathname.startsWith(href) ? "#2a2a2a" : undefined }}
            >
              <Icon size={17} />
              <span className="nav-label">{label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <main className="dashboard-content">{children}</main>
    </div>
  );
}
