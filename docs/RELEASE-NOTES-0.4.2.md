# RelayDesk production release notes — 0.4.2

Release date: 2026-09-18

## Summary

RelayDesk 0.4.2 is the current production agent release. It runs behind a stable verified launcher and connects paired Windows, macOS, and Linux machines to the RelayDesk remote MCP service.

## Reliability and lifecycle

- Added verified versioned agent releases with SHA-256 manifests.
- Added a stable launcher with atomic `current.json` activation.
- Added automatic rollback after an early release failure.
- Prevented automatic downgrades to older remote releases.
- Persist blocked bad-release state so a rolled-back version is not immediately reactivated.
- Preserved the real previous release across same-version repairs.
- Added Windows/Linux/macOS installer smoke coverage.
- Migrated service credentials into the RelayDesk install root so background services do not depend on an interactive user profile.
- Uses RelayDesk's bundled private Node/npm runtime rather than an arbitrary global Node installation.

## Command safety and recovery

- MCP command expiry now matches the request lifetime instead of the historical seven-day default.
- Expired pending commands are failed and never executed later.
- Pending commands closed by an MCP timeout cannot execute after the caller has already timed out.
- Commands claimed by an agent process are tagged with an agent instance ID.
- After a genuine agent restart, commands abandoned by the old process are marked as error with unknown execution outcome and are never automatically retried.
- Tool-level errors are persisted as errors rather than false successes.

## MCP and cross-client access

- Canonical production endpoint: `https://relay-desk-mjq6.vercel.app/mcp`.
- OAuth protected-resource discovery is available from the public RelayDesk host.
- Supabase Auth advertises authorization, token, registration, JWKS, UserInfo, PKCE and OIDC metadata.
- Added optional revocable personal MCP tokens for clients that use managed bearer/header credentials instead of interactive OAuth.
- Personal MCP tokens are random, shown once, stored only as SHA-256 hashes, owner-scoped and immediately revocable.
- Direct authenticated table access to MCP token hashes is disabled.

## Dashboard and account lifecycle

- Device inventory shows online/offline state, hostname, OS/platform, agent version and last seen time.
- Added automatic presence/reliability refresh.
- Added recent RelayDesk command activity metadata without exposing command arguments/results.
- Added installed-vs-current agent update visibility.
- Added provider-neutral connection guidance for ChatGPT, Grok, Gemini/header-based clients and other compatible MCP clients.
- Added personal MCP token management.
- Added forgot-password, reset-password and signup-confirmation resend flows.
- Added guarded permanent account deletion with subscription/dependency checks.

## Review and safety notes

- Remote sessions cannot use `set_config_value` to modify RelayDesk's protected `blockedCommands` or `allowedDirectories` boundaries.
- Desktop Commander's upstream feedback tool is not exposed by RelayDesk.
- Tool annotations explicitly provide `readOnlyHint`, `openWorldHint` and `destructiveHint`.
- `read_file` is open-world because its schema supports URL input.
- `start_search` is not marked read-only because it creates search/session state.
- Process execution tools are marked open-world/destructive-capable where arbitrary commands can produce external or irreversible effects.

## Known external activation items

- Live Razorpay credentials/webhook registration are not yet provisioned into RelayDesk, so billing remains fail-closed.
- Production Supabase Auth custom SMTP is not yet configured.
- OpenAI publisher/domain verification, current tool scan, demo recording upload and final portal submission remain external review actions.
