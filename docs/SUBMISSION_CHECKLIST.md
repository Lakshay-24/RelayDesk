# RelayDesk Submission Checklist

Status meanings:

- **Implemented** — code and UI exist in `dev`.
- **Configuration required** — implementation exists, but a real provider/domain credential is needed.
- **Verification required** — must be tested after deployment with the real external service.

## Core product

| Requirement | Status | Evidence / notes |
|---|---|---|
| Authentication and workspace setup | Implemented | Email/password auth, workspace onboarding, memberships and workspace switching exist. |
| Shared inbox for chat and email | Implemented | Unified conversation list, filters, assignment, statuses and persistent messages. |
| Conversation assignment | Implemented | Assign/reassign to workspace memberships. |
| Snooze, resolve and reopen | Implemented | Conversation status workflows and snooze undo are present. |
| Internal notes | Implemented | Notes are stored as internal contact events and are not sent to visitors. |
| Contact activity timeline | Implemented | Page views, messages, email and support actions appear in the customer panel. |
| SLA warning/breach state | Implemented | SLA due state and priority controls are shown in the inbox. |
| Mobile inbox navigation | Implemented in `dev` | Phone list → thread → Conversations back navigation; desktop/tablet rules unchanged. |

## Live chat

| Requirement | Status | Evidence / notes |
|---|---|---|
| Embeddable one-script widget | Implemented | Install snippet and live demo are exposed in Settings. |
| Realtime visitor/agent messages | Implemented | Supabase database changes and conversation broadcasts. |
| Visitor and agent typing | Implemented in `dev` | Shared `typing` broadcast protocol. |
| Visitor and agent online/offline | Implemented in `dev` | Conversation presence tracking. |
| Read receipts | Implemented in `dev` | Persistent `agent_read_at` and `visitor_read_at`, plus realtime read broadcasts. |
| Persistent history | Implemented | Widget session reloads stored conversation messages. |
| Two-browser production verification | Verification required | Test after promoting and deploying `dev`. |

## Email

| Requirement | Status | Evidence / notes |
|---|---|---|
| Inbound email ingestion | Implemented | Resend webhook creates/reuses contacts, conversations and messages. |
| Threading and deduplication | Implemented | Message-ID, `In-Reply-To` and `References` handling. |
| Outbound replies | Implemented | Reply route sends through Resend using a verified sender. |
| Receiving address | Configuration required | Set the Resend-managed inbound domain/address. |
| Arbitrary-recipient sending | Configuration required | Set `OUTBOUND_EMAIL_FROM` to a sender on a verified owned domain. |
| Real round-trip test | Verification required | Send inbound → reply → customer reply and inspect message headers. |

## AI

| Requirement | Status | Evidence / notes |
|---|---|---|
| Reply drafts from conversation context | Implemented in `dev` | Uses up to 40 messages. |
| Reply drafts use published KB articles | Implemented in `dev` | Published article excerpts/body are supplied to the prompt. |
| Multi-provider/model routing | Implemented in `dev` | OpenRouter primary → OpenRouter fallback → Gemini primary → Gemini fallback. |
| Safe emergency draft | Implemented | Used only after all configured AI attempts fail and returned as `fallback: true`. |
| Long-conversation summary | Implemented in `dev` | Goal, facts/attempts, unresolved questions, status/next action. |
| Automatic summary updates | Implemented in `dev` | New messages queue jobs; inbox processes and refreshes saved summaries. |
| Visible summary panel | Implemented in `dev` | Agent realtime layer displays current summary. |
| Real provider fallback test | Verification required | Add both API keys and intentionally fail the primary model once. |

Required environment values:

```env
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free
OPENROUTER_FALLBACK_MODEL=openrouter/free
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_FALLBACK_MODEL=gemini-2.0-flash
```

## Knowledge base

| Requirement | Status | Evidence / notes |
|---|---|---|
| Create and edit articles | Implemented | Article workspace and save API. |
| Rich text controls | Implemented | Heading, bold, italic, list and link controls, plus preview. |
| Draft, publish and unpublish | Implemented | Published state controls and public filtering. |
| Categories/sections | Implemented | Create, rename, reorder and delete categories. |
| Public help centre | Implemented | Workspace help centre and article routes. |
| Public article search | Implemented | Search endpoint/page uses published articles. |
| Widget article suggestions | Implemented | Debounced suggestions after visitor enters a question. |
| Phone-width overflow | Fixed in `dev` | Mobile-only wrapping and width constraints. |

## Custom domains

| Requirement | Status | Evidence / notes |
|---|---|---|
| Add workspace help-domain | Implemented | Settings/API stores hostname and ownership token. |
| DNS instructions | Implemented | Exact TXT and CNAME records returned. |
| DNS ownership verification | Implemented | Server-side TXT resolution. |
| Hosting registration | Implemented | Vercel project-domain API integration. |
| SSL provisioning approach | Implemented/documented | Vercel provisions TLS after verified DNS. |
| Host-based help-centre routing | Implemented in `dev` | Verified hostname rewrites to the correct workspace help centre and article path. |
| Real DNS/TLS test | Configuration and verification required | Needs an owned domain plus Vercel credentials. |

## API, webhooks and operations

| Requirement | Status | Evidence / notes |
|---|---|---|
| Scoped API keys | Implemented | Key creation, scopes, revocation and API authentication. |
| Outgoing webhooks | Implemented | Endpoint setup, signed delivery, history, test and retry support. |
| Retry worker | Implemented | Internal retry endpoint protected by `CRON_SECRET`. |
| Analytics | Implemented | Conversation/message/channel/agent metrics and charts. |
| Diagnostics | Implemented | Evaluator diagnostics distinguish code readiness from provider configuration. |

## Required final passes before submission

1. Promote the reviewed `dev` commit to `main` only after approval.
2. Apply all pending Supabase migrations in production.
3. Add both AI provider keys and test provider fallback.
4. Add a verified outbound email domain and run a real threaded email test.
5. Test live chat in two browser profiles, including typing, presence and read receipts.
6. Test phone widths at 320px, 360px, 390px and 430px.
7. Connect one real help subdomain and confirm HTTPS plus article routing.
8. Run typecheck/build/smoke checks and capture the final commit SHA, deployment URL and test evidence.

No external integration should be labelled verified until its real round trip succeeds.
