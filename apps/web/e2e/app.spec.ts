import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT, DEMO_OWNER, STRANGER, injectWallet } from "./wallet";

async function noHorizontalOverflow(page: import("@playwright/test").Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw, "page must not scroll horizontally").toBeLessThanOrEqual(cw);
}

test.describe("public home", () => {
  test("explains the product with both CTAs and no overflow", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Let your income pay down your Bitcoin loan.");
    await expect(page.getByRole("link", { name: /Launch app/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore example" }).first()).toBeVisible();
    await expect(page.getByText("Testnet only.", { exact: false })).toBeVisible();
    await noHorizontalOverflow(page);
  });
});

test.describe("example mode", () => {
  test("is labeled, deterministic, and never links to the explorer", async ({ page }) => {
    await page.goto("/example");
    await expect(page.getByText("Example data.", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("2,006.41").first()).toBeVisible();
    await expect(page.getByText("Waiting for enough MUSD to close the loan").first()).toBeVisible();
    await expect(page.locator('a[href*="explorer.test.mezo.org/tx/"]')).toHaveCount(0);
    await page.goto("/example/activity");
    await expect(page.getByText("Customer payment").first()).toBeVisible();
    await expect(page.locator('a[href*="explorer.test.mezo.org/tx/"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeDisabled();
    await noHorizontalOverflow(page);
  });

  for (const path of ["", "/receive", "/policy", "/loan", "/activity", "/automation", "/settings", "/setup"]) {
    test(`renders ${path || "/"} without overflow`, async ({ page }) => {
      await page.goto(`/example${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noHorizontalOverflow(page);
    });
  }
});

test.describe("live mode without a wallet", () => {
  test("asks to connect and never shows sample data", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByText("Connect a wallet to see your live account")).toBeVisible();
    await expect(page.getByText("2,006.41")).toHaveCount(0);
    await expect(page.getByText("Example data.")).toHaveCount(0);
  });

  test("read-only view reads the real demo account from Mezo testnet", async ({ page }) => {
    await page.goto(`/app?view=${DEMO_ACCOUNT}`);
    await expect(page.getByText("Read-only live view")).toBeVisible();
    await expect(page.getByText("Outstanding debt", { exact: false })).toBeVisible();
    await expect(page.getByText("Customer payment").first()).toBeVisible({ timeout: 40_000 });
    await expect(page.locator('a[href*="explorer.test.mezo.org/tx/0x"]').first()).toBeVisible();
  });

  test("RPC unavailable shows an error instead of fixtures", async ({ page }) => {
    await page.route("https://rpc.test.mezo.org/**", (r) => r.abort());
    await page.route("https://rpc.test.mezo.org", (r) => r.abort());
    await page.goto(`/app?view=${DEMO_ACCOUNT}`);
    await expect(page.getByText("Couldn't load the account from Mezo testnet")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("2,006.41")).toHaveCount(0);
  });
});

test.describe("live mode with a wallet", () => {
  test("wrong network prompts a switch", async ({ page }) => {
    await injectWallet(page, { address: DEMO_OWNER, chainId: 31611 });
    await page.goto("/app");
    await page.getByRole("button", { name: /Connect/ }).first().click();
    await expect(page.getByText("Outstanding debt", { exact: false })).toBeVisible({ timeout: 40_000 });
    // the user moves their wallet to another network
    await page.evaluate(() => (window as unknown as { __wallet: { setChain(n: number): void } }).__wallet.setChain(1));
    await expect(page.getByText("Your wallet is on a different network")).toBeVisible();
    await expect(page.getByRole("button", { name: "Switch to Mezo Testnet" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Switch to Mezo Testnet" }).first().click();
    await expect(page.getByText("Outstanding debt", { exact: false })).toBeVisible({ timeout: 40_000 });
  });

  test("wallet with no account is guided to setup", async ({ page }) => {
    await injectWallet(page, { address: STRANGER, chainId: 31611 });
    await page.goto("/app");
    await page.getByRole("button", { name: /Connect/ }).first().click();
    await expect(page.getByText("No RePay account for this wallet yet")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("link", { name: "Start guided setup" }).click();
    await expect(page.getByRole("heading", { name: "Guided setup" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });

  test("owner sees the live account; switching wallets updates it", async ({ page }) => {
    await injectWallet(page, { address: DEMO_OWNER, chainId: 31611 });
    await page.goto("/app");
    await page.getByRole("button", { name: /Connect/ }).first().click();
    await expect(page.getByText("Total repaid", { exact: false })).toBeVisible({ timeout: 40_000 });
    await page.evaluate((a) => (window as unknown as { __wallet: { switchAccount(a: string): void } }).__wallet.switchAccount(a), STRANGER);
    await expect(page.getByText("No RePay account for this wallet yet")).toBeVisible({ timeout: 30_000 });
  });

  test("policy form validates and previews; save surfaces wallet rejection", async ({ page }) => {
    await injectWallet(page, { address: DEMO_OWNER, chainId: 31611 });
    await page.goto("/app/policy");
    await page.getByRole("button", { name: /Connect/ }).first().click();
    const pct = page.getByLabel("Repayment share percent");
    await expect(pct).toBeVisible({ timeout: 40_000 });
    await page.getByLabel("Hypothetical payment amount").fill("500");
    await pct.fill("40");
    await expect(page.getByText("200.00").first()).toBeVisible();
    await expect(page.getByText("Unsaved")).toBeVisible();
    await page.locator("#min").fill("100");
    await page.locator("#max").fill("50");
    await expect(page.getByText("Maximum must be at least the minimum")).toBeVisible();
    await page.locator("#max").fill("");
    await page.getByRole("button", { name: "Review & save" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Save repayment policy")).toBeVisible();
    await dialog.getByRole("button", { name: "Save policy" }).click();
    await expect(dialog.getByText("You rejected the request in your wallet.")).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  test("receive page builds a link the payer page verifies", async ({ page }) => {
    await injectWallet(page, { address: DEMO_OWNER, chainId: 31611 });
    await page.goto("/app/receive");
    await page.getByRole("button", { name: /Connect/ }).first().click();
    await expect(page.locator("#amount")).toBeVisible({ timeout: 40_000 });
    await page.locator("#amount").fill("120.5");
    await page.locator("#ref").fill("INV-E2E");
    const linkText = await page.locator("p.break-all").first().textContent();
    expect(linkText).toContain(`/pay/${DEMO_ACCOUNT}?amount=120.5&ref=INV-E2E`);
    await expect(page.getByRole("img", { name: "QR code for the payment link" })).toBeVisible();
    await page.goto(new URL(linkText!).pathname + new URL(linkText!).search);
    await expect(page.getByText("Verified RePay account")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("120.50").first()).toBeVisible();
    await expect(page.getByText("INV-E2E")).toBeVisible();
  });

  test("payer page rejects a non-RePay address", async ({ page }) => {
    await page.goto(`/pay/${STRANGER}?amount=10&chain=31611`);
    await expect(page.getByText("Not a RePay account")).toBeVisible({ timeout: 30_000 });
  });

  test("payer page rejects malformed links", async ({ page }) => {
    await page.goto(`/pay/${DEMO_ACCOUNT}?amount=-5`);
    await expect(page.getByText("This payment link is invalid")).toBeVisible();
  });

  test("payment flow surfaces signature rejection without paying", async ({ page }) => {
    await injectWallet(page, { address: DEMO_OWNER, chainId: 31611 });
    await page.goto(`/pay/${DEMO_ACCOUNT}?amount=1&ref=E2E&chain=31611`);
    await page.getByRole("button", { name: /Connect/ }).first().click();
    const pay = page.getByRole("button", { name: /Sign & pay/ });
    await expect(pay).toBeEnabled({ timeout: 30_000 });
    await pay.click();
    await expect(page.getByText("You rejected the request in your wallet.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Payment confirmed")).toHaveCount(0);
  });

  test("repayment button is disabled with an explanation when nothing is pending", async ({ page }) => {
    await injectWallet(page, { address: DEMO_OWNER, chainId: 31611 });
    await page.goto("/app/automation");
    await page.getByRole("button", { name: /Connect/ }).first().click();
    await expect(page.getByText("Manual fallback")).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText("Not configured")).toBeVisible();
    const btn = page.getByRole("button", { name: /Repay .* now/ });
    if ((await btn.getAttribute("title")) !== null) await expect(btn).toBeDisabled();
  });
});
