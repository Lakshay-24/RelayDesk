# RelayDesk

RelayDesk is a small public MCP facade for securely operating computers that a user explicitly pairs with their own RelayDesk account.

Production MCP: `https://relay-desk-mjq6.vercel.app/mcp`

Public pages: `/`, `/support`, `/privacy`, `/terms`.
OAuth consent: `/oauth/consent` (entered only from a valid OAuth authorization request).

The hosted control plane and device command bus live in Supabase. This repository intentionally contains only the public Vercel facade and OAuth UI. The previous helpdesk application is preserved on the `legacy-helpdesk-preserved` branch and is not part of production.

Never commit service-role keys, OAuth tokens, device tokens, passwords, or browser credentials.
