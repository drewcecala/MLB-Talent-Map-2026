import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? []).toEqual([]);
});

async function ready(page: Page) {
  await page.goto("/mlb-college-map");
  await expect(page.locator("[data-college-map-ready='true']")).toBeVisible();
}

test("withholds rankings below the documented 90% signing-school threshold", async ({ page }) => {
  await ready(page);
  await expect(page.getByRole("heading", { name: "College map withheld pending source coverage" })).toBeVisible();
  const coverage = page.getByRole("region", { name: "College research coverage" });
  await expect(coverage).toContainText("Eligible career starters49,771");
  await expect(coverage).toContainText("Signing-school status resolved20,850");
  await expect(coverage).toContainText("Current coverage41.9%");
  await expect(coverage).toContainText("Publication requirement90.0%");
  await expect(page.getByText("No guessed colleges. No false “no college” labels.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /leads this view/ })).toHaveCount(0);
  await expect(page.getByText("Barry Bonds")).toHaveCount(0);
});

test("explains the one-school-before-signing rule", async ({ page }) => {
  await ready(page);
  await expect(page.getByText(/Each player may receive credit for one school only/)).toBeVisible();
  await expect(page.getByText(/Earlier transfer schools and unsigned draft selections receive no credit/)).toBeVisible();
  await expect(page.getByText(/Unresolved28,921/)).toBeVisible();
  await expect(page.getByText(/Required to publish44,794/)).toBeVisible();
});

test("publication hold has no serious accessibility violations or horizontal overflow", async ({ page }) => {
  await ready(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const results = await new AxeBuilder({ page }).analyze();
  const material = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical");
  expect(material).toEqual([]);
});
