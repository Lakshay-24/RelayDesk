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

## 4. Email channel

- Configure Resend sending and receiving domains.
- Set `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and `OUTBOUND_EMAIL_FROM`.
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

- Configure `AI_GATEWAY_API_KEY`.
- Generate a summary on a long conversation and verify goal, attempted actions, unresolved items, and current state.
- Generate an AI reply draft and edit it before sending.
- Verify rate-limit and timeout errors are visible and include a request ID.

## 8. Custom domain

- Add `help.company.com`.
- Publish the displayed TXT and CNAME records.
- Verify ownership in Settings.
- Register the hostname with the Vercel project; Vercel provisions SSL after DNS validation.
- Open the custom host and confirm it routes to the correct workspace help centre.

## 9. API and webhooks

- Create a read-only API key and confirm write requests return `403`.
- Create a write-scoped key and update a conversation.
- Revoke the key and confirm subsequent requests return `401`.
- Add a webhook endpoint, send a test, inspect history, force a failure, and retry it.
- Configure `CRON_SECRET` and invoke `/api/internal/webhook-retries` with the bearer secret to process due deliveries.

## 10. Final acceptance rule

Do not claim an external integration as passing unless the real provider round trip was observed. Keep screenshots or request logs for the two-browser chat, threaded email, custom-domain TLS, Google OAuth, API revocation, and webhook retry flows.
