# RelayDesk

RelayDesk is a production-oriented Intercom-style customer-support platform built for the Gigachad Builder assignment. It combines a multi-tenant agent dashboard, embeddable realtime messenger, threaded support email, searchable knowledge base, AI assistance, custom help domains, SLA tracking, webhooks, analytics, and a scoped REST API.

## Assignment coverage

### Mandatory

- Authentication, invitations, Admin/Agent roles, and agent assignment
- One-script embeddable live chat
- Realtime messages, typing, presence, read receipts, and persistent history
- Unified chat/email inbox with filtering, assignment, snooze, resolve, and reopen
- Threaded inbound/outbound email using Message-ID, In-Reply-To, and References
- Knowledge-base CRUD, categories, rich-text controls, publishing, public search, and widget suggestions
- Persisted AI issue summaries and AI reply drafts
- Custom-domain ownership verification and host-based help-centre routing

### Stand-out

- Canned responses
- Contact timeline and internal notes
- Configurable SLA tracking and breach warnings
- Signed webhooks with history and bounded retries
- Scoped, revocable REST API keys
- Workload, response-time, resolution, busiest-hour, channel, priority, and agent analytics

## Architecture

- **Next.js 15 App Router** for dashboard, public help centre, widget, REST API, and provider webhooks
- **Supabase Auth + PostgreSQL + RLS** for identity, tenant isolation, persistence, and realtime
- **Resend** for outbound and native inbound email retrieval
- **Vercel AI Gateway** for bounded summaries and reply drafts with model fallback
- **Vercel custom domains** for SSL provisioning after RelayDesk TXT verification

The browser never receives the Supabase service-role key. Visitor traffic uses narrow workspace-public-key endpoints and a per-browser visitor token. Agent access is protected by authenticated route checks plus PostgreSQL RLS. API keys are stored only as SHA-256 hashes and are permanently scoped to one workspace.

## Setup

1. Create a Supabase project.
2. Run every file in `supabase/migrations` in numeric order.
3. Copy `.env.example` to `.env.local` and configure required values.
4. Install dependencies with `npm install`.
5. Run `npm run dev`.
6. Sign up, create a workspace, and copy the messenger snippet from Settings.

## Verification

Local build verification:

```bash
npm run verify
```

Deployment smoke checks:

```bash
RELAYDESK_BASE_URL=https://<deployment> npm run smoke
```

Authenticated administrators can also run **Settings → Evaluator diagnostics**, which performs non-destructive checks against the deployed workspace, migration 005, SLA policy, API-key schema, inbox, knowledge base, inbound address, and optional provider configuration.

Detailed runbooks:

- [`docs/EVALUATOR.md`](docs/EVALUATOR.md)
- [`docs/API.md`](docs/API.md)

## Public REST API

Create a scoped key in Settings and send it as:

```http
Authorization: Bearer rd_live_...
```

Implemented endpoints:

- `GET /api/v1/conversations`
- `GET /api/v1/conversations/:conversationId`
- `PATCH /api/v1/conversations/:conversationId`
- `GET /api/v1/contacts`
- `GET /api/v1/messages`

## Email routes

- Generic normalized inbound provider: `POST /api/inbound/email`
- Native signed Resend receiving: `POST /api/inbound/resend`
- Resend delivery/bounce/delay events: `POST /api/email/events`

Inbound delivery is authenticated, idempotent by Message-ID, HTML-normalized, and threaded through In-Reply-To and References. Outbound provider acceptance is not falsely presented as delivery; `delivered_at` is set only after the delivery webhook confirms it.

## Webhook reliability

RelayDesk signs outbound webhook bodies with HMAC-SHA256, stores every attempt, exposes delivery history, supports manual retry, and schedules bounded exponential retries. The protected worker endpoint is:

```http
POST /api/internal/webhook-retries
Authorization: Bearer <CRON_SECRET>
```

## Honest external limitations

The code and schema do not manufacture provider success. The following require real configuration and round-trip testing before being labelled operational:

- Google OAuth provider exchange in Supabase
- Resend sending/receiving domains and signed webhook events
- Vercel project-domain registration and issued TLS certificate
- AI Gateway credentials and live model response

See the evaluator runbook for the exact evidence required for each external integration.
