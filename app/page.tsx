import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

function normalizeHost(value: string | null) {
  return (value ?? "").split(":")[0].trim().toLowerCase();
}

function safeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/inbox";
  return next;
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const errorDescription = Array.isArray(params.error_description) ? params.error_description[0] : params.error_description;

  if (code) {
    const query = new URLSearchParams({ code, next: safeNext(params.next) });
    redirect(`/auth/callback?${query.toString()}`);
  }

  if (error || errorDescription) {
    const query = new URLSearchParams();
    if (error) query.set("error", error);
    if (errorDescription) query.set("error_description", errorDescription);
    redirect(`/login?${query.toString()}`);
  }

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
