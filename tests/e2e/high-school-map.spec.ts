import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? []).toEqual([]);
});

async function ready(page: Page) {
  await page.goto("/mlb-high-school-map");
  await expect(page.locator("[data-high-school-map-ready='true']")).toBeVisible();
}

test("default view reports the audited post-2000 school universe", async ({ page }) => {
  await ready(page);
  const coverage = page.getByRole("region", { name: "High school research coverage" });
  await expect(coverage).toContainText("MLB debuts reviewed6,225");
  await expect(coverage).toContainText("With U.S. high school3,979");
  await expect(coverage).toContainText("Leader programs mapped76");
  await expect(coverage).toContainText("Most from one school12");
  await expect(page.getByRole("heading", { name: "Bishop Gorman leads this view" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Selected high school detail" })).toContainText("Joey Gallo");
});

test("debut-era filters update rankings and the shareable URL", async ({ page }) => {
  await ready(page);
  await page.getByLabel("MLB debut period").selectOption("2020s");
  await expect(page).toHaveURL(/era=2020s/);
  await expect(page.getByRole("heading", { name: "Calvary Christian Academy leads this view" })).toBeVisible();
  await expect(page.getByText("2020–2026 MLB debuts")).toBeVisible();
});

test("state and position filters combine without estimating records", async ({ page }) => {
  await ready(page);
  await page.getByLabel("School state").selectOption("CA");
  await page.getByLabel("MLB position group").selectOption("Pitcher");
  await expect(page).toHaveURL(/state=CA/);
  await expect(page).toHaveURL(/position=Pitcher/);
  await expect(page.getByRole("heading", { name: /leads this view/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /U.S. map locating leading high schools/ })).toBeVisible();
});

test("school selector exposes underlying player records and URL state", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Inspect a mapped high school").selectOption("ca-rancho-bernardo-san-diego");
  await expect(page).toHaveURL(/school=ca-rancho-bernardo-san-diego/);
  const detail = page.getByRole("region", { name: "Selected high school detail" });
  await expect(detail).toContainText("Rancho Bernardo");
  await expect(detail).toContainText("Cole Hamels");
  await expect(detail.getByRole("link", { name: "Verify campus location" })).toHaveAttribute("href", /^https:\/\//);
});

test("invalid URL state is safely normalized", async ({ page }) => {
  await page.goto("/mlb-high-school-map?era=1990s&state=ZZ&position=Quarterback&school=missing");
  await expect(page.locator("[data-high-school-map-ready='true']")).toBeVisible();
  await expect(page).toHaveURL(/\/mlb-high-school-map$/);
  await expect(page.getByLabel("MLB debut period")).toHaveValue("all");
});

test("the high-school map has no serious accessibility violations or horizontal overflow", async ({ page }) => {
  await ready(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const results = await new AxeBuilder({ page }).analyze();
  const material = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );
  expect(material).toEqual([]);
});

test("mobile order presents the high-school map before controls", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "mobile-only DOM-order assertion");
  await ready(page);
  const order = await page.locator(".hs-workspace-grid > *").evaluateAll((nodes) => nodes.map((node) => node.className));
  expect(order).toEqual([
    "map-panel hs-map-panel",
    "filter-panel hs-filter-panel",
    "ranking-panel hs-ranking-panel",
  ]);
});
