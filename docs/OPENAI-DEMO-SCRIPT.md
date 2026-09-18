# RelayDesk review demo recording script

Target length: about 3–5 minutes.

Use only the dedicated reviewer account and disposable reviewer device/workspace.

## 1. Product and device control plane

1. Open the RelayDesk production site.
2. Sign in with the reviewer account.
3. Open the dashboard.
4. Show the paired reviewer device:
   - online status,
   - hostname/platform,
   - agent version,
   - last seen,
   - recent command activity.
5. Briefly show **Add device** and the install page without pairing another machine.

Narration point: one persistent RelayDesk agent can be reused by multiple authorized MCP clients; it does not require a different local agent for each AI provider.

## 2. Connect the production MCP server

Use the canonical production endpoint:

`https://relay-desk-mjq6.vercel.app/mcp`

Show the OAuth connection flow in the supported review client and finish signing in to the reviewer RelayDesk account.

## 3. Positive reviewer flows

### Device discovery
Prompt: **List my RelayDesk devices.**

Show that only the reviewer-owned device is returned.

### Read
Prompt: **On the reviewer device, read the disposable RelayDesk review text file.**

Show the returned local file content.

### Controlled write
Prompt: **Create a disposable RelayDesk review folder and write hello.txt containing “RelayDesk review”.**

Show successful creation/write.

### Process execution
Prompt: **Run a harmless command on the reviewer device that prints the installed Git version.**

Show the command output.

### Search lifecycle
Prompt: **Search the disposable review folder for files containing “hello”, show the results, then stop the search.**

Show search creation, results and stop.

## 4. Safety/error behavior

Show one negative case, preferably the protected configuration boundary:

Attempt to remotely change `blockedCommands` or `allowedDirectories`.

Show that RelayDesk rejects the request rather than weakening its own remote safety boundary.

Optionally show a locally blocked harmless service-control command and that RelayDesk records/returns an error rather than a false success.

## 5. Dashboard evidence

Return to the RelayDesk dashboard and refresh.

Show that the reviewer device remains online and that the recent activity section contains the just-executed tool names/statuses without exposing raw command payloads.

## Recording hygiene

- Do not reveal device credentials, OAuth tokens, personal MCP tokens, environment variables or payment secrets.
- Use only disposable review files/processes.
- Do not show unrelated user machines.
- Avoid screenshots in the submission unless the current OpenAI MCP scan reports a UI output template; provide the recorded-demo URL separately as required.
