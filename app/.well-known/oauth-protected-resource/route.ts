const RESOURCE = "https://relay-desk-mjq6.vercel.app/mcp";
const AUTH_SERVER = "https://atuvyeoctkevglimkmka.supabase.co/auth/v1";

export async function GET() {
  return Response.json({
    resource: RESOURCE,
    authorization_servers: [AUTH_SERVER],
    scopes_supported: ["openid", "email", "profile", "offline_access"],
    bearer_methods_supported: ["header"],
  }, { headers: { "cache-control": "public, max-age=300" } });
}
