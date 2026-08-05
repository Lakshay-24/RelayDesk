import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ERROR_KEYS = ["error", "error_code", "error_description", "provider_error"] as const;

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/onboarding";
  if (value.startsWith("/auth/") || value.startsWith("/login") || value.startsWith("/signup")) return "/onboarding";
  return value;
}

function appOrigin(requestUrl: URL) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured?.startsWith("https://")) return configured;
  return requestUrl.origin;
}

function loginError(url: URL, values: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();
  for (const key of ERROR_KEYS) {
    const value = values[key];
    if (value) params.set(key, value);
  }
  return NextResponse.redirect(new URL(`/login?${params.toString()}`, appOrigin(url)));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const callbackError = Object.fromEntries(ERROR_KEYS.map((key) => [key, url.searchParams.get(key)]));

  if (callbackError.error || callbackError.error_description) {
    console.error("[auth.callback] Supabase/provider callback error", {
      error: callbackError.error,
      error_code: callbackError.error_code,
      error_description: callbackError.error_description,
      provider_error: callbackError.provider_error,
    });
    return loginError(url, callbackError);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    console.error("[auth.callback] Missing authorization code and provider error", { path: url.pathname });
    return loginError(url, {
      error: "OAuth completion failed",
      error_code: "missing_oauth_code",
      error_description: "Supabase returned neither an authorization code nor a provider error.",
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth.callback] Code exchange failed", { name: error.name, status: error.status, code: error.code, message: error.message });
    return loginError(url, {
      error: "OAuth code exchange failed",
      error_code: error.code || "oauth_code_exchange_failed",
      error_description: error.message,
    });
  }

  const userId = data.user?.id;
  let destination = safeNext(url.searchParams.get("next"));
  if (userId) {
    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      console.error("[auth.callback] Membership lookup failed", { user_id: userId, code: membershipError.code, message: membershipError.message });
    } else {
      destination = membership ? "/inbox" : "/onboarding";
    }
  }

  return NextResponse.redirect(new URL(destination, appOrigin(url)));
}
