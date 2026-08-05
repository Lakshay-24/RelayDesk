const base = (process.env.RELAYDESK_BASE_URL || process.argv[2] || "").replace(/\/$/, "");
if (!base) {
  console.error("Usage: RELAYDESK_BASE_URL=https://example.vercel.app npm run smoke");
  process.exit(2);
}

const checks = [
  { name: "landing", path: "/", statuses: [200] },
  { name: "health", path: "/api/health", statuses: [200] },
  { name: "login", path: "/login", statuses: [200] },
  { name: "signup", path: "/signup", statuses: [200] },
  { name: "protected inbox", path: "/inbox", statuses: [200, 307, 308] },
  { name: "API rejects missing key", path: "/api/v1/conversations", statuses: [401] },
  { name: "diagnostics rejects anonymous", path: "/api/diagnostics", statuses: [401] },
  { name: "retry worker rejects anonymous", path: "/api/internal/webhook-retries", statuses: [401, 405] },
];

let failed = 0;
for (const check of checks) {
  const started = Date.now();
  try {
    const response = await fetch(`${base}${check.path}`, {
      redirect: "manual",
      headers: { "user-agent": "RelayDesk-Smoke/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    const elapsed = Date.now() - started;
    const ok = check.statuses.includes(response.status);
    console.log(`${ok ? "PASS" : "FAIL"} ${check.name} ${response.status} ${elapsed}ms`);
    if (!ok) failed += 1;
    if (check.name === "health" && response.ok) {
      const body = await response.json().catch(() => null);
      if (!body?.ready) {
        console.log("FAIL health payload reports degraded readiness");
        failed += 1;
      }
    }
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${check.name} ${error instanceof Error ? error.message : "request failed"}`);
  }
}

if (failed) {
  console.error(`Smoke checks failed: ${failed}`);
  process.exit(1);
}
console.log(`All ${checks.length} smoke checks passed for ${base}`);
