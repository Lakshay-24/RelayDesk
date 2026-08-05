# RelayDesk API

## Authentication

Create an API key in **Settings → API access**. Send the one-time secret as a bearer token:

```http
Authorization: Bearer rd_live_...
```

Keys are stored as SHA-256 hashes, can be scoped, expired, and revoked, and are permanently restricted to their workspace.

## Scopes

- `conversations:read`
- `conversations:write`
- `contacts:read`
- `messages:read`

## Endpoints

### List conversations

```http
GET /api/v1/conversations?status=open&channel=email&limit=25&cursor=<ISO timestamp>
```

Returns a bounded page and `nextCursor` when more records exist.

### Conversation detail

```http
GET /api/v1/conversations/:conversationId
```

Returns the workspace-scoped conversation, contact, and ordered messages.

### Update a conversation

```http
PATCH /api/v1/conversations/:conversationId
Content-Type: application/json

{
  "status": "resolved",
  "priority": "high",
  "assigneeId": "membership-uuid-or-null",
  "snoozedUntil": "2026-08-06T10:00:00.000Z"
}
```

Assignees are validated against the same workspace. Unsupported fields are rejected.

### List contacts

```http
GET /api/v1/contacts?q=customer@example.com&limit=25&cursor=<ISO timestamp>
```

### List messages

```http
GET /api/v1/messages?conversationId=<uuid>&limit=50&cursor=<ISO timestamp>
```

## Error model

```json
{
  "error": "Human-readable error"
}
```

Common statuses: `400` invalid request, `401` missing/invalid/revoked key, `403` missing scope, `404` workspace-scoped record not found, `429` rate limit, `500` server failure.

## Outbound webhooks

Supported events:

- `conversation.created`
- `conversation.updated`
- `message.created`

RelayDesk signs the exact raw JSON body using HMAC-SHA256:

```http
x-relaydesk-event: message.created
x-relaydesk-signature: sha256=<hex digest>
```

Verify the digest using the one-time signing secret shown when the webhook is created. Failed deliveries are persisted, exposed in Settings, and retried with bounded exponential backoff up to six attempts.

## Inbound email

Generic providers can send normalized payloads to `/api/inbound/email` using `x-webhook-secret`. Native Resend receiving should use `/api/inbound/resend`, which verifies the Svix signature, retrieves the full message from Resend, then applies Message-ID deduplication and `In-Reply-To`/`References` threading.
