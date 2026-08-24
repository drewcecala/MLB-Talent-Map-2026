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

test("default view reports the reconciled college universe", async ({ page }) => {
  await ready(page);
  const coverage = page.getByRole("region", { name: "College research coverage" });
  await expect(coverage).toContainText("MLB/MiLB participants54,980");
  await expect(coverage).toContainText("Verified college24,720");
  await expect(coverage).toContainText("Gaps filled825");
  await expect(coverage).toContainText("Leader programs mapped26");
  await expect(page.getByRole("heading", { name: "Arizona State University leads this view" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Selected college detail" })).toContainText("Barry Bonds");
});

test("era and position filters update the rankings and URL", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Participation period").selectOption("2020s");
  await page.getByLabel("Primary position group").selectOption("Pitcher");
  await expect(page).toHaveURL(/era=2020s/);
  await expect(page).toHaveURL(/position=Pitcher/);
  await expect(page.getByText("2020–2026 official participants")).toBeVisible();
  await expect(page.getByRole("heading", { name: /leads this view/ })).toBeVisible();
});

test("college selector exposes source-backed player records", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Inspect a mapped college").selectOption("college-louisiana-state");
  await expect(page).toHaveURL(/college=college-louisiana-state/);
  const detail = page.getByRole("region", { name: "Selected college detail" });
  await expect(detail).toContainText("Louisiana State University");
  await expect(detail).toContainText("Albert Belle");
  await expect(detail).toContainText("Evidence:");
  await expect(detail.getByRole("link", { name: "Verify campus location" })).toHaveAttribute("href", /^https:\/\/www\.openstreetmap\.org\//);
});

test("invalid college URL state is safely normalized", async ({ page }) => {
  await page.goto("/mlb-college-map?era=1990s&state=ZZ&position=Quarterback&college=missing");
  await expect(page.locator("[data-college-map-ready='true']")).toBeVisible();
  await expect(page).toHaveURL(/\/mlb-college-map$/);
  await expect(page.getByLabel("Participation period")).toHaveValue("all");
});

test("college map has no serious accessibility violations or horizontal overflow", async ({ page }) => {
  await ready(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const results = await new AxeBuilder({ page }).analyze();
  const material = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical");
  expect(material).toEqual([]);
});

test("mobile order presents the college map before controls", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "mobile-only DOM-order assertion");
  await ready(page);
  const classes = await page.locator(".college-workspace-grid > *").evaluateAll((nodes) => nodes.map((node) => node.className));
  expect(classes[0]).toContain("college-map-panel");
  expect(classes[1]).toContain("college-filter-panel");
  expect(classes[2]).toContain("college-ranking-panel");
});
