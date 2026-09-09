import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const authorizationId = formData.get("authorization_id");
  const decision = formData.get("decision");

  if (typeof authorizationId !== "string" || !authorizationId) {
    return NextResponse.json({ error: "Missing authorization_id" }, { status: 400 });
  }
  if (decision !== "approve" && decision !== "deny") {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/oauth/login?authorization_id=${encodeURIComponent(authorizationId)}`, request.url), 303);
  }

  const result = decision === "approve"
    ? await supabase.auth.oauth.approveAuthorization(authorizationId)
    : await supabase.auth.oauth.denyAuthorization(authorizationId);

  if (result.error || !result.data?.redirect_url) {
    return NextResponse.json({ error: result.error?.message ?? "OAuth decision failed" }, { status: 400 });
  }
  return NextResponse.redirect(result.data.redirect_url, 303);
}
