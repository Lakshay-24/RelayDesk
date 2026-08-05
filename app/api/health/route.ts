export const dynamic = "force-dynamic";

export async function GET() {
  const required = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
  const ready = Object.values(required).every(Boolean);
  return Response.json(
    {
      status: ready ? "ok" : "degraded",
      ready,
      service: "relaydesk",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      region: process.env.VERCEL_REGION ?? null,
      required,
      optional: {
        ai: Boolean(process.env.AI_GATEWAY_API_KEY),
        resend: Boolean(process.env.RESEND_API_KEY),
        resendWebhook: Boolean(process.env.RESEND_WEBHOOK_SECRET),
        retryWorker: Boolean(process.env.CRON_SECRET),
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
