import { test, expect } from "@playwright/test";

test("landing and support surfaces are available", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your devices, callable from ChatGPT, Claude, and compatible AI." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Get started" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Setup & support" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pricing" })).toBeVisible();
  await page.goto("/support");
  await expect(page.getByRole("heading", { name: "Setup and support" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Terms" })).toBeVisible();
});

test("normal account sign-in surface is available", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New to RelayDesk? Create an account" })).toBeVisible();
});

test("dashboard requires authentication", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/login/);
});

test("pricing is explicit about live and planned tiers", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { name: "Start free. Pay only when you use it heavily." })).toBeVisible();
  await expect(page.getByText("5,000 remote tool calls per month.")).toBeVisible();
  await expect(page.getByText("Pro — planned")).toBeVisible();
  await expect(page.getByText(/Billing is not live yet/)).toBeVisible();
});

test("legal and health endpoints are reachable", async ({ request }) => {
  for (const path of ["/privacy", "/terms", "/health.txt"]) {
    const response = await request.get(path);
    expect(response.ok(), `${path} should be reachable`).toBeTruthy();
  }
});

test("OAuth login fails safely without an authorization request", async ({ page }) => {
  await page.goto("/oauth/login");
  await expect(page.getByRole("heading", { name: "Sign in to authorize" })).toBeVisible();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByText("Missing authorization request. Restart the connection from your AI client.")).toBeVisible();
});

test("OAuth consent rejects a missing authorization id", async ({ page }) => {
  await page.goto("/oauth/consent");
  await expect(page.getByRole("heading", { name: "Invalid authorization request" })).toBeVisible();
  await expect(page.getByText("Missing authorization_id. Restart the connection from your AI client.")).toBeVisible();
});

test("MCP endpoint advertises protected-resource auth", async ({ request }) => {
  const response = await request.post("/mcp", {
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "relaydesk-playwright", version: "1" } },
    },
  });
  expect(response.status()).toBe(401);
  expect(response.headers()["www-authenticate"]).toContain("/.well-known/oauth-protected-resource");
});

test("protected-resource metadata points at production MCP", async ({ request }) => {
  const response = await request.get("/.well-known/oauth-protected-resource");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.resource).toBe("https://relay-desk-mjq6.vercel.app/mcp");
  expect(body.authorization_servers).toContain("https://atuvyeoctkevglimkmka.supabase.co/auth/v1");
  expect(body.scopes_supported).toEqual(expect.arrayContaining(["openid", "email", "profile", "offline_access"]));
});
