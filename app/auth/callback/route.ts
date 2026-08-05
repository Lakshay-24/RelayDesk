import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") ?? "/onboarding";
  const next = requestedNext.startsWith("/") ? requestedNext : "/onboarding";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=Missing+OAuth+code", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const message = encodeURIComponent(error.message);
    return NextResponse.redirect(new URL(`/login?error=${message}`, url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
