import { test, expect, type Page } from "@playwright/test";

const publicRoutes = [
  "/", "/pricing", "/support", "/install", "/auth/login",
  "/auth/forgot-password", "/auth/reset-password", "/privacy",
  "/terms", "/refunds", "/contact"
];

async function assertNoBadSurface(page: Page) {
  await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error|undefined|null/i);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("every public route renders cleanly", async ({ page }) => {
  for (const route of publicRoutes) {
    const response = await page.goto(route, { waitUntil: "networkidle" });
    expect(response?.ok(), route).toBeTruthy();
    await assertNoBadSurface(page);
  }
});

test("all user-facing public links stay inside RelayDesk", async ({ page }) => {
  for (const route of publicRoutes) {
    await page.goto(route);
    const hrefs = await page.locator("a[href]").evaluateAll(nodes =>
      nodes.map(node => (node as HTMLAnchorElement).href)
    );
    for (const href of hrefs) {
      const url = new URL(href);
      expect(url.origin, `${route} -> ${href}`).toBe(new URL(page.url()).origin);
    }
  }
});

test("every internal public link resolves", async ({ page, request }) => {
  const seen = new Set<string>();
  for (const route of publicRoutes) {
    await page.goto(route);
    const hrefs = await page.locator("a[href]").evaluateAll(nodes =>
      nodes.map(node => (node as HTMLAnchorElement).getAttribute("href") || "")
    );
    for (const href of hrefs) {
      if (!href.startsWith("/") || href.startsWith("//") || seen.has(href)) continue;
      seen.add(href);
      const response = await request.get(href, { maxRedirects: 0 });
      expect([200, 302, 303, 307, 308], href).toContain(response.status());
    }
  }
});

test("homepage and support CTAs go to RelayDesk surfaces", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/auth/login");
  await expect(page.getByRole("link", { name: "Setup & support" })).toHaveAttribute("href", "/support");
  await expect(page.getByRole("link", { name: "Source" })).toHaveCount(0);
  await page.goto("/support");
  await expect(page.getByRole("link", { name: "Open RelayDesk" })).toHaveAttribute("href", "/auth/login");
  await expect(page.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", "/contact");
  await expect(page.getByRole("link", { name: /GitHub|support issue/i })).toHaveCount(0);
});

test("auth controls behave coherently without submitting credentials", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  await page.getByRole("button", { name: "New to RelayDesk? Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/auth\/forgot-password$/);
});

test("pricing controls expose a real Pro action only when billing is ready", async ({ page }) => {
  await page.goto("/pricing");
  const status = await page.request.get("/api/billing/status");
  const body = await status.json();
  if (body.ready) {
    await expect(page.getByRole("button", { name: "Upgrade to Pro" })).toBeVisible();
  } else {
    await expect(page.getByText("Billing activation in progress")).toBeVisible();
  }
});
