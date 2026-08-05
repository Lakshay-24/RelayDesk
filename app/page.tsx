import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

function normalizeHost(value: string | null) {
  return (value ?? "").split(":")[0].trim().toLowerCase();
}

export default async function Home() {
  const requestHeaders = await headers();
  const hostname = normalizeHost(requestHeaders.get("x-forwarded-host") || requestHeaders.get("host"));
  const appHost = normalizeHost(process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).host : null);
  const isPlatformHost = !hostname || hostname === appHost || hostname.endsWith(".vercel.app") || hostname === "localhost";

  if (!isPlatformHost) {
    const db = createAdminClient();
    const { data: domain } = await db
      .from("custom_domains")
      .select("workspace_id,workspaces(slug)")
      .eq("hostname", hostname)
      .eq("status", "verified")
      .maybeSingle();

    const workspace = Array.isArray(domain?.workspaces) ? domain?.workspaces[0] : domain?.workspaces;
    if (workspace?.slug) redirect(`/help/${workspace.slug}`);
  }

  return <main className="landing">
    <div className="landing-badge">Customer support, without the bloat.</div>
    <h1>Chat, email and knowledge.<br/>One intelligent inbox.</h1>
    <p>RelayDesk gives small teams an embeddable messenger, shared email inbox, searchable help centre and continuously updated AI summaries.</p>
    <div className="landing-actions"><Link className="button primary" href="/signup">Create workspace</Link><Link className="button secondary" href="/login">Sign in</Link></div>
  </main>;
}
