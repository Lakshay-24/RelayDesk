# Evaluator Runbook

This runbook separates code-complete checks from provider-dependent checks. RelayDesk does not fake external success states.

## 1. Deployment readiness

1. Sign in as the workspace admin.
2. Open **Settings → Evaluator diagnostics**.
3. Run checks.
4. Required checks must be green: authenticated admin, workspace bootstrap, SLA/migration 005, inbound address, API-key schema, inbox persistence, and knowledge schema.
5. Provider checks may remain amber until credentials are configured.

Public deployment health:

```bash
curl -i https://<deployment>/api/health
```

Automated anonymous smoke checks:

```bash
RELAYDESK_BASE_URL=https://<deployment> npm run smoke
```

## 2. Authentication and team management

- Create a fresh email/password account and workspace.
- Invite a second email as Agent.
- Accept the invitation from a separate browser profile.
- Confirm an Agent cannot access admin-only API keys, domains, diagnostics, or webhooks.
- Assign and reassign a conversation between memberships.

Google OAuth is considered passing only after a fresh production sign-in succeeds. A graceful error page is not counted as a successful integration.

## 3. Embeddable live chat

- Copy the one-script snippet from Settings into a plain HTML page.
- Open the host page and dashboard in separate browser profiles.
- Send messages in both directions without refreshing.
- Verify visitor/agent typing, online/offline presence, visitor read receipt, agent read receipt, and history after reload.
- On a phone-width viewport, confirm tapping a conversation opens the thread and the Conversations back button returns to the list.

## 4. Email channel

- Configure Resend sending and receiving domains.
- Set `RESEND_API_KEY`, `EMAIL_WEBHOOK_SECRET`, `INBOUND_EMAIL_DOMAIN`, and `OUTBOUND_EMAIL_FROM`.
- Point the Resend `email.received` event to `/api/inbound/resend`.
- Point delivery events to `/api/email/events`.
- Send a new customer email and verify a new inbox thread.
- Reply from RelayDesk and verify `In-Reply-To` and `References` in the received message.
- Reply again from the customer and confirm the same conversation is reused.
- Re-send the same webhook payload and confirm Message-ID deduplication.

## 5. Unified inbox

- Filter by chat/email, status, and assignee.
- Assign, reassign, snooze, resolve, and reopen.
- Add an internal note and confirm it never appears in the visitor thread.
- Confirm assignment/status/note events appear in the contact timeline.
- Test SLA warning and breach states by temporarily setting a short target.

## 6. Knowledge base

- Create categories, reorder them, rename one, and safely delete one.
- Create an article, use rich-text controls, preview, save draft, publish, and unpublish.
- Search from the public help centre.
- Verify published suggestions appear inside the chat widget.

## 7. AI

- Configure `OPENROUTER_API_KEY` and `GEMINI_API_KEY`.
- Configure `OPENROUTER_MODEL`, `OPENROUTER_FALLBACK_MODEL`, `GEMINI_MODEL`, and `GEMINI_FALLBACK_MODEL`.
- Confirm the provider chain tries OpenRouter primary, OpenRouter fallback, Gemini primary, then Gemini fallback until one succeeds.
- Generate a summary on a long conversation and verify customer goal, attempted actions, unresolved items, and current status/next action.
- Add another message and confirm the queued summary refresh updates the saved summary.
- Generate an AI reply draft, verify it uses conversation context and published knowledge articles, and edit it before sending.
- Temporarily use an invalid primary model and confirm a later provider/model succeeds.
- Confirm a deterministic emergency draft/summary is clearly marked only when every configured AI attempt fails.
- Verify rate-limit and provider failures include a request ID in the API response/logs.

## 8. Custom domain

- Add `help.company.com`.
- Publish the displayed TXT and CNAME records.
- Set `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, and `VERCEL_TEAM_ID` for automatic registration.
- Verify ownership in Settings.
- Confirm Vercel provisions SSL after DNS validation.
- Open the custom host and confirm `/` and article paths route to the correct workspace help centre.

## 9. API and webhooks

- Create a read-only API key and confirm write requests return `403`.
- Create a write-scoped key and update a conversation.
- Revoke the key and confirm subsequent requests return `401`.
- Add a webhook endpoint, send a test, inspect history, force a failure, and retry it.
- Configure `CRON_SECRET` and invoke `/api/internal/webhook-retries` with the bearer secret to process due deliveries.

## 10. Mobile regression pass

At phone widths (320–760px):

- Inbox list fits without horizontal scrolling.
- Conversation opens as a full thread and can return to the list.
- Composer, thread actions, summaries, typing indicators, and receipts remain visible.
- Settings cards, numbered instructions, code blocks, email/domain values, buttons, and inputs wrap inside the viewport.
- Knowledge and Analytics pages do not create document-level horizontal overflow.

Tablet and desktop layouts must remain unchanged by these phone-only rules.

## 11. Final acceptance rule

Do not claim an external integration as passing unless the real provider round trip was observed. Keep screenshots or request logs for the two-browser chat, threaded email, AI provider fallback, custom-domain TLS, Google OAuth, API revocation, and webhook retry flows.
