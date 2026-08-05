import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function configuredAppHost(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return request.nextUrl.hostname.toLowerCase();

  try {
    const normalized = /^https?:\/\//i.test(configured)
      ? configured
      : `https://${configured}`;
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return request.nextUrl.hostname.toLowerCase();
  }
}

async function customDomainRewrite(request: NextRequest) {
  const host = (request.headers.get("host") ?? "")
    .split(":")[0]
    .toLowerCase();

  // Never perform custom-domain lookup for normal Vercel/local requests.
  if (!host || host.endsWith(".vercel.app") || host === "localhost") return null;

  const appHost = configuredAppHost(request);
  if (host === appHost) return null;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return null;

  try {
    const response = await fetch(
      `${base}/rest/v1/custom_domains?hostname=eq.${encodeURIComponent(host)}&status=eq.verified&select=workspaces(slug)&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        next: { revalidate: 60 },
      },
    );

    if (!response.ok) return null;

    const rows = (await response.json()) as Array<{
      workspaces: { slug: string } | Array<{ slug: string }>;
    }>;
    const linked = rows[0]?.workspaces;
    const slug = Array.isArray(linked) ? linked[0]?.slug : linked?.slug;
    if (!slug) return null;

    const url = request.nextUrl.clone();
    url.pathname =
      request.nextUrl.pathname === "/"
        ? `/help/${slug}`
        : `/help/${slug}${request.nextUrl.pathname}`;
    return NextResponse.rewrite(url);
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  try {
    const rewrite = await customDomainRewrite(request);
    if (rewrite) return rewrite;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.next();

    let response = NextResponse.next({ request });
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items: CookieToSet[]) => {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          items.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (
      !user &&
      ["/inbox", "/knowledge", "/settings"].some((path) =>
        request.nextUrl.pathname.startsWith(path),
      )
    ) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    return response;
  } catch (error) {
    console.error("Middleware failed safely", error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|widget/).*)"],
};
