# RelayDesk

A production-oriented Intercom-style support platform built for the Gigachad Builder assignment: multi-tenant authentication, unified live-chat/email inbox, embeddable messenger, knowledge base, AI summaries, team roles, and custom help domains.

## Architecture

- **Next.js App Router** for authenticated application, public widget and route handlers.
- **Supabase Auth + PostgreSQL + RLS** for identity, tenant isolation and persistence.
- **Supabase Realtime** for visitor/agent message delivery.
- **Resend adapter** for outbound threaded email; provider-neutral inbound webhook.
- **OpenAI adapter** for bounded, persisted conversation summaries.
- **Vercel-compatible DNS verification** for custom help-centre domains.

The browser never receives the Supabase service-role key. Visitor traffic is restricted to narrow server endpoints using a workspace public key and per-browser visitor token. Authenticated agent access is additionally protected by PostgreSQL row-level security.

## Local setup

1. Create a Supabase project and run migrations in `supabase/migrations` in numeric order.
2. Copy `.env.example` to `.env.local` and fill the required values.
3. Install dependencies with `npm install`.
4. Run `npm run dev`.
5. Sign up, create a workspace, and copy the messenger snippet from Settings.
6. Optionally run `supabase/seed.sql` after onboarding.

## Email webhook contract

`POST /api/inbound/email` with header `x-webhook-secret` and JSON:

```json
{
  "from": "Customer <customer@example.com>",
  "to": "support-address@example.com",
  "subject": "Question",
  "text": "Can you help?",
  "messageId": "<provider-message-id>",
  "inReplyTo": "<optional-parent-id>",
  "references": ["<optional-id>"]
}
```

Inbound delivery is authenticated, idempotent by Message-ID, normalized, HTML-stripped, and threaded through `In-Reply-To`/`References`.

## Evaluator flow

1. Create an account and workspace.
2. Open Settings and install the messenger snippet on any HTML page.
3. Send a visitor message; confirm it appears in Inbox without refreshing.
4. Reply as the agent; confirm the visitor receives it live.
5. Assign, resolve and reopen the conversation.
6. Generate an AI summary.
7. Create, save and publish a knowledge article.
8. Invite a second account and accept using the invited email.
9. Add a custom domain, publish the displayed DNS records and verify it.
10. Forward or POST an inbound email and reply from the unified thread.

## Honest limitations

Actual email delivery, AI generation, DNS propagation and Supabase Realtime require their respective external credentials/services. The repository does not fake successful provider results when configuration is absent.
