import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const INTERNAL_RELAYDESK_EMAIL = "lakshaygoel12@gmail.com";

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: authorizationId } = await searchParams;
  if (!authorizationId) {
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}><section className="auth-card"><h1>Invalid authorization request</h1><p className="muted">Missing authorization_id.</p></section></main>;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email?.toLowerCase() !== INTERNAL_RELAYDESK_EMAIL) {
    if (user) await supabase.auth.signOut();
    redirect(`/oauth/login?authorization_id=${encodeURIComponent(authorizationId)}&email=${encodeURIComponent(INTERNAL_RELAYDESK_EMAIL)}`);
  }

  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !details) {
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}><section className="auth-card"><h1>Authorization unavailable</h1><p className="form-error">{error?.message ?? "Invalid or expired authorization request."}</p></section></main>;
  }

  if (!("authorization_id" in details)) redirect(details.redirect_url);
  const scopes = details.scope?.trim() ? details.scope.trim().split(/\s+/) : [];

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section className="auth-card" style={{ maxWidth: 560 }}>
        <div className="eyebrow">RelayDesk</div>
        <h1>Authorize {details.client.name}</h1>
        <p className="muted auth-intro">This application is requesting access to your RelayDesk identity.</p>
        <div className="form-stack">
          <p><strong>Signed in as:</strong> {user.email}</p>
          <p><strong>Client:</strong> {details.client.name}</p>
          <p style={{ overflowWrap: "anywhere" }}><strong>Redirect URI:</strong> {details.redirect_uri}</p>
          {scopes.length > 0 && <div><strong>Requested permissions:</strong><ul>{scopes.map((scope) => <li key={scope}>{scope}</li>)}</ul></div>}
        </div>
        <form action="/api/oauth/decision" method="POST" className="form-stack" style={{ marginTop: 20 }}>
          <input type="hidden" name="authorization_id" value={authorizationId} />
          <button className="primary-button auth-submit" type="submit" name="decision" value="approve">Approve</button>
          <button type="submit" name="decision" value="deny">Deny</button>
        </form>
      </section>
    </main>
  );
}
