# OpenAI review package — RelayDesk

Last updated: 2026-09-18

Production site: https://relay-desk-mjq6.vercel.app  
Production MCP endpoint: https://atuvyeoctkevglimkmka.supabase.co/functions/v1/mcp

## What RelayDesk is

RelayDesk lets an authenticated user connect an explicitly paired computer to ChatGPT through a remote MCP server. The remote MCP facade authenticates the user, lists only that user's paired devices, queues commands for a selected device, and returns the device result. The local RelayDesk agent executes the selected Desktop Commander-compatible tool on that paired machine.

The MCP server does not expose arbitrary unpaired machines. Every device operation requires a paired device UUID owned by the authenticated user.

## Reviewer setup

1. Sign in to RelayDesk with the reviewer account supplied in the submission.
2. Pair the reviewer test device through the public install flow.
3. In ChatGPT, connect the production RelayDesk MCP integration.
4. Call `list_devices` and select the explicitly paired reviewer device.
5. Use only disposable files/processes created for review when exercising write/process tools.

Public support/legal endpoints expected to remain live:
- `/`
- `/install`
- `/pricing`
- `/privacy`
- `/terms`
- `/refunds`
- `/contact`
- `/support`

## Five positive review cases

### Positive 1 — device discovery
Prompt: "List my RelayDesk devices."

Expected:
- `list_devices` succeeds.
- Only devices owned by the authenticated RelayDesk user are returned.
- Each result contains the paired device id/name/platform/live status.
- No command is queued on a device.

### Positive 2 — local read
Prompt: "On my paired reviewer device, read the disposable RelayDesk test text file."

Expected:
- ChatGPT first resolves the selected paired device.
- `read_file` returns the requested local content.
- No file is modified.
- For URL input, `read_file` is marked `openWorldHint: true`; for ordinary local files it remains a read-only operation.

### Positive 3 — controlled write
Prompt: "Create a disposable folder under the RelayDesk review workspace and write hello.txt containing 'RelayDesk review'."

Expected:
- `create_directory` creates only the requested directory.
- `write_file` writes only the requested disposable file.
- The target device is explicit in each call.
- The user/client can apply confirmation because the write tool advertises non-read-only/destructive hints where appropriate.

### Positive 4 — process execution
Prompt: "On the reviewer device, run a harmless command that prints the installed Git version."

Expected:
- `start_process` executes on the selected paired machine.
- Output is returned to ChatGPT.
- `start_process` is advertised as non-read-only, destructive-capable, and open-world because the command can cause external or irreversible effects depending on user input.
- If the local execution engine rejects a command, RelayDesk returns a tool error instead of recording a false success.

### Positive 5 — search workflow
Prompt: "Search the disposable RelayDesk review folder for files containing 'hello', show the results, then stop the search."

Expected:
- `start_search` creates search/session state and therefore advertises `readOnlyHint: false`.
- `get_more_search_results` retrieves results.
- `stop_search` terminates the search session.
- The operation stays scoped to the selected paired device.

## Three negative review cases

### Negative 1 — unowned or invalid device
Attempt a tool call with a random/unowned `device_id`.

Expected:
- RelayDesk rejects it as device not found/not owned.
- No command is created for another user's device.

### Negative 2 — remote safety-boundary weakening
Attempt:
`set_config_value(key="blockedCommands", ...)`
or
`set_config_value(key="allowedDirectories", ...)`

Expected:
- MCP rejects the request before it reaches the device.
- A remote AI session cannot alter its own command/filesystem safety boundary.
- Other ordinary configuration keys remain available where appropriate.

### Negative 3 — blocked local command
Run a command rejected by the paired device's local command policy (review environment example: a blocked service-control command).

Expected:
- The local engine rejects the command.
- RelayDesk persists/returns an error, not `done`.
- RelayDesk does not automatically disable or weaken the device policy to make the command pass.

## Annotation rationale

RelayDesk supplies all three required behavior hints on its MCP tools.

- `readOnlyHint: true` only for tools that retrieve data without changing state.
- `read_file` is read-only but `openWorldHint: true` because its schema can accept a URL and therefore can access the public internet.
- `start_search` is `readOnlyHint: false` because it starts search/session state.
- File writes, edits, moves, process termination, and configuration writes are marked destructive where irreversible/overwriting effects are possible.
- `start_process` and `interact_with_process` are open-world/destructive-capable because arbitrary user-requested commands can access external systems or produce irreversible effects.
- Private paired-device reads that cannot access an unbounded external entity are `openWorldHint: false`.

The server-side annotations are the source of truth; reviewer justifications should describe these values rather than trying to override them in prose.

## Production review checklist

Before submission:
- Production remote MCP endpoint is deployed and reachable.
- Publisher/domain verification is completed in the OpenAI dashboard.
- Run **Scan tools** against the production MCP endpoint after the final MCP deployment.
- Confirm every scanned tool reports accurate `readOnlyHint`, `destructiveHint`, and `openWorldHint`.
- Complete the annotation justifications in the submission UI.
- Confirm public privacy, terms, support/contact and other required URLs are reachable.
- Supply reviewer credentials/access that can operate the dedicated reviewer device without exposing unrelated user machines.
- Enter the five positive and three negative cases above (or equivalent final wording).
- Re-run tool scan after any MCP schema/annotation change before submission.
- If the dashboard reports external frame domains, explain each one; do not add screenshots unless the current tool scan reports a UI output template.
- Complete the current OpenAI domain-verification challenge at `/.well-known/openai-apps-challenge` when the dashboard provides the exact token.

Current OpenAI references:
- https://developers.openai.com/plugins/deploy/app-review
- https://developers.openai.com/plugins/deploy/submission-errors

## Known external blockers

### Razorpay live billing
Billing remains intentionally fail-closed until RelayDesk's own live Razorpay API key/secret are securely provisioned and the production webhook is registered. After provisioning, validate one controlled lifecycle:
1. authenticated subscription creation,
2. signed webhook receipt,
3. Pro entitlement update,
4. cancellation / period-end state.

Do not copy credentials from another product or commit secrets to the repository.

### OpenAI dashboard actions
Tool scanning, domain/publisher verification and final submission are dashboard actions. Engineering changes should be deployed before the final scan; any later MCP schema/annotation change requires another scan.
