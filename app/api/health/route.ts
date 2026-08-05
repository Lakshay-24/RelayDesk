import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const payload = {
    ok: true,
    service: "relaydesk",
    path: new URL(request.url).pathname,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    deployment: process.env.VERCEL_URL ?? null,
    region: process.env.VERCEL_REGION ?? null,
    timestamp: new Date().toISOString(),
  };

  console.log("relaydesk-health", payload);
  return NextResponse.json(payload, {
    headers: { "cache-control": "no-store" },
  });
}
