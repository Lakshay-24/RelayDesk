# RelayDesk

RelayDesk is the public web/OAuth facade for a remote MCP service that lets users control computers they deliberately pair with ChatGPT.

The actual control plane and device relay live in Supabase. This Vercel-hosted Next.js app exists to provide the public MCP endpoint, OAuth consent/login flow, protected-resource metadata, OpenAI host-verification challenge endpoint, website, support page, privacy policy, and terms required for distribution/review.

## Public endpoints

- MCP: `https://relay-desk-mjq6.vercel.app/mcp`
- OAuth protected-resource metadata: `/.well-known/oauth-protected-resource`
- OpenAI host challenge: `/.well-known/openai-apps-challenge`
- OAuth login: `/oauth/login`
- OAuth consent: `/oauth/consent`
- Privacy: `/privacy`
- Terms: `/terms`
- Support: `/support`

## Architecture

ChatGPT / MCP client → Vercel RelayDesk facade → Supabase MCP/control plane → paired RelayDesk agent → pinned Desktop Commander 0.2.47 local MCP engine.

The Vercel `/mcp` route proxies the Supabase MCP endpoint and rewrites OAuth protected-resource discovery so clients remain on the publicly controlled Vercel host. Supabase remains the OAuth 2.1 authorization server.

## Security posture

- Users may control only computers they deliberately pair.
- Human access is authenticated with OAuth 2.1 authorization-code + PKCE.
- Each paired machine uses a separate high-entropy revocable credential.
- Raw device credentials are not stored server-side.
- Owner isolation and RLS are enforced in the Supabase control plane.
- Local filesystem/process restrictions remain enforced by the pinned Desktop Commander engine.
- Write/destructive/open-world tools remain explicitly annotated for ChatGPT approval controls.

## OpenAI host verification

When the OpenAI submission flow provides a challenge token, configure `OPENAI_APPS_CHALLENGE_TOKEN` in Vercel and redeploy. The route `/.well-known/openai-apps-challenge` returns only that configured value.

## Development

```bash
npm install
npm run build
npm run dev
```

The public production build is expected to contain only the RelayDesk MCP/OAuth/legal/support surface. The old customer-support assignment UI/API has been removed from the deployed app.
