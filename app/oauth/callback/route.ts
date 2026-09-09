import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const authorizationId = url.searchParams.get("authorization_id");
  const code = url.searchParams.get("code");

  if (!authorizationId || !code) {
    return NextResponse.redirect(new URL(`/oauth/login?authorization_id=${encodeURIComponent(authorizationId ?? "")}&error=oauth_callback_failed`, url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/oauth/login?authorization_id=${encodeURIComponent(authorizationId)}&error=${encodeURIComponent(error.message)}`, url.origin));
  }

  return NextResponse.redirect(new URL(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`, url.origin));
}
