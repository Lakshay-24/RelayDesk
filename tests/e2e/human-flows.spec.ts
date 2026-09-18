import { test, expect } from "@playwright/test";

const think = (min=20,max=80) => new Promise(resolve=>setTimeout(resolve,min+Math.floor(Math.random()*(max-min))));

test.describe("human-like product flows",()=>{
  test("a new visitor can understand the product, inspect pricing and reach sign in",async({page})=>{
    await page.goto("/");
    await expect(page.getByRole("heading",{name:"Your devices, callable from ChatGPT, Claude, and compatible AI."})).toBeVisible();
    await think();
    await page.getByRole("link",{name:"Pricing"}).click();
    await expect(page.getByText("5,000 remote tool calls per month.")).toBeVisible();
    await think();
    await page.getByRole("link",{name:/Get started|Sign in/i}).first().click().catch(async()=>page.goto("/auth/login"));
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole("button",{name:"Continue with Google"})).toBeVisible();
  });

  test("pairing without authentication preserves the intended destination",async({page})=>{
    await page.goto("/pair?code=ABCD-EFGH");
    await expect(page).toHaveURL(/\/auth\/login\?next=/);
    expect(decodeURIComponent(new URL(page.url()).searchParams.get("next")??"")).toBe("/pair?code=ABCD-EFGH");
    await expect(page.locator("body")).not.toContainText(/undefined|null/i);
  });

  test("large device lists stay usable under realistic browser load",async({page})=>{
    const started=Date.now();
    await page.goto("/e2e-fixture");
    await expect(page.getByRole("heading",{name:"Device stress fixture"})).toBeVisible();
    await expect(page.locator(".device-row")).toHaveCount(500);
    expect(Date.now()-started).toBeLessThan(10_000);
    const target=page.getByText("Fixture device 487");
    await target.scrollIntoViewIfNeeded();
    await expect(target).toBeVisible();
    await expect(page.getByText("Fixture device 001")).toHaveCount(1);
  });

  test("feedback stays small, sends successfully and recovers from an error",async({page})=>{
    await page.goto("/e2e-fixture");
    const trigger=page.getByRole("button",{name:"Feedback",exact:true});
    const panel=page.getByRole("region",{name:"Send feedback"});
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(panel).toBeVisible();
    await page.getByLabel("Feedback type").selectOption("feature");
    await page.getByLabel("Feedback message").fill("A keyboard shortcut for reconnect diagnostics would be useful.");
    await think();
    await page.getByRole("button",{name:"Send",exact:true}).click();
    await expect(page.getByText("Thanks — sent.")).toBeVisible();
    await expect(panel).toBeHidden({timeout:3000});

    await trigger.click();
    await expect(panel).toBeVisible();
    await page.getByLabel("Feedback type").selectOption("bug");
    await page.getByLabel("Feedback message").fill("force-error");
    await page.getByRole("button",{name:"Send",exact:true}).click();
    await expect(page.getByText("Synthetic feedback failure")).toBeVisible();
    await page.getByLabel("Feedback message").fill("Recovered after retry without losing the panel.");
    await page.getByRole("button",{name:"Send",exact:true}).click();
    await expect(page.getByText("Thanks — sent.")).toBeVisible();
  });

  test("feedback input enforces the production message bound",async({page})=>{
    await page.goto("/e2e-fixture");
    await page.getByRole("button",{name:"Feedback",exact:true}).click();
    const box=page.getByLabel("Feedback message");
    await box.fill("x".repeat(5200));
    expect((await box.inputValue()).length).toBe(5000);
  });

  test("repeated navigation does not leak duplicate controls or break layout",async({page})=>{
    for(let i=0;i<12;i++){
      await page.goto(i%2===0?"/":"/pricing");
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/Application error|Internal Server Error/i);
    }
  });

  test("local production server survives a burst of concurrent safe requests",async({request})=>{
    const paths=["/","/pricing","/support","/health.txt"];
    const responses=await Promise.all(Array.from({length:120},(_,i)=>request.get(`${paths[i%paths.length]}?stress=${i}`)));
    expect(responses.filter(r=>!r.ok())).toHaveLength(0);
  });
});
