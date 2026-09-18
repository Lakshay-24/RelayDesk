# RelayDesk brand and SEO

## Brand mark

RelayDesk uses the same compact mark everywhere:
- browser tab / favicon via `app/icon.svg`;
- public assets via `public/relaydesk-mark.svg`;
- web-app manifest via `public/manifest.webmanifest`;
- in-product brand links should reference the same mark rather than inventing per-page icons.

## Search and social metadata

Global metadata lives in `app/layout.tsx` and includes:
- title template and site description;
- canonical URL;
- favicon / shortcut icon;
- Open Graph metadata;
- Twitter card metadata;
- search keywords;
- robots directives;
- theme color;
- SoftwareApplication JSON-LD.

Public indexing is limited to public product pages. Account, pairing, dashboard, auth and OAuth surfaces should not be indexed.

## Public positioning

RelayDesk is device-first, not ChatGPT-only. Public copy may name ChatGPT, Claude and compatible MCP clients while accurately stating current agent support: Windows, macOS and Linux computers and servers.
