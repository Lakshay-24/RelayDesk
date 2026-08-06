import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizeHost(value: string | null) {
  return (value ?? "").split(":")[0].trim().toLowerCase().replace(/\.$/, "");
}

function isPlatformHost(hostname: string) {
  if (!hostname) return true;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (hostname.endsWith(".vercel.app")) return true;
  const configured = normalizeHost(process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "").split("/")[0] ?? null);
  return Boolean(configured && hostname === configured);
}

export async function middleware(request: NextRequest) {
  const hostname = normalizeHost(request.headers.get("x-forwarded-host") || request.headers.get("host"));
  if (isPlatformHost(hostname)) return NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.next();

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: domain } = await db
    .from("custom_domains")
    .select("hostname,status,workspaces!inner(slug)")
    .eq("hostname", hostname)
    .eq("status", "verified")
    .maybeSingle();

  const workspace = Array.isArray(domain?.workspaces) ? domain.workspaces[0] : domain?.workspaces;
  const slug = workspace?.slug;
  if (!slug) return NextResponse.next();

  const url = request.nextUrl.clone();
  const incomingPath = url.pathname === "/" ? "" : url.pathname;
  url.pathname = `/help/${encodeURIComponent(slug)}${incomingPath}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|widget|auth|invite).*)"],
};
