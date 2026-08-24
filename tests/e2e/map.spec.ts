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
  await page.goto("/mlb-talent-map");
  await expect(page.locator("[data-map-ready='true']")).toBeVisible();
}

test("default view reports the complete audited roster snapshot", async ({ page }) => {
  await ready(page);
  const coverage = page.getByRole("region", { name: "Current roster coverage" });
  await expect(coverage).toContainText("Rostered players8,440");
  await expect(coverage).toContainText("U.S.-born records4,280");
  await expect(coverage).toContainText("U.S. place mapped3,912 · 91.4%");
  await expect(coverage).toContainText("International / territory4,159");
});

test("level filters update the map and shareable URL", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Roster level").selectOption("MLB");
  await expect(page).toHaveURL(/level=MLB/);
  const coverage = page.getByRole("region", { name: "Current roster coverage" });
  await expect(coverage).not.toContainText("Rostered players8,440");
  await expect(page.getByText(/players are assigned to representative U.S. counties/)).toBeAttached();
});

test("international country filter opens the country map at the reported birthplace", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Birth country").selectOption("Dominican Republic");
  await expect(page).toHaveURL(/country=Dominican\+Republic/);
  await expect(page).toHaveURL(/view=countries/);
  await expect(page.getByRole("button", { name: "Birth countries" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("img", { name: /World map shaded by rostered players/ })).toBeVisible();
  await expect(page.getByText("1,757 players mapped")).toBeVisible();
  await page.getByLabel("Inspect a birth country").selectOption("Dominican Republic");
  await expect(page.getByText("Birth-country detail")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dominican Republic" })).toBeVisible();
});

test("world view maps every known birth country and preserves unknown records", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Birth countries" }).click();
  await expect(page).toHaveURL(/view=countries/);
  await expect(page.getByText("8,439 players mapped")).toBeVisible();
  await expect(page.getByText("43 countries / territories · 1 unknown")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top birth countries" })).toBeVisible();
});

test("metric tabs update state and reliability note", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Players per 100,000" }).click();
  await expect(page).toHaveURL(/metric=per_capita/);
  await expect(page.getByText(/Counties need at least 10 mapped players/)).toBeVisible();
  await expect(page.getByText("1–9 mapped (rate withheld)")).toBeVisible();
});

test("county selector exposes keyboard-accessible detail", async ({ page }) => {
  await ready(page);
  const selector = page.getByLabel("Inspect a mapped county");
  const firstValue = await selector.locator("option").nth(1).getAttribute("value");
  expect(firstValue).toBeTruthy();
  await selector.selectOption(firstValue!);
  await expect(page.getByText("County detail")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close county detail" })).toBeVisible();
});

test("reset restores defaults and clears county detail", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Roster level").selectOption("Triple-A");
  const selector = page.getByLabel("Inspect a mapped county");
  const firstValue = await selector.locator("option").nth(1).getAttribute("value");
  await selector.selectOption(firstValue!);
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByLabel("Roster level")).toHaveValue("all");
  await expect(page.getByText("Select a county", { exact: true })).toBeVisible();
});

test("invalid URL state is safely normalized", async ({ page }) => {
  await page.goto("/mlb-talent-map?level=garbage&metric=war&organization=XYZ");
  await expect(page.locator("[data-map-ready='true']")).toBeVisible();
  await expect(page).toHaveURL(/\/mlb-talent-map$/);
  await expect(page.getByLabel("Roster level")).toHaveValue("all");
});

test("the product has no serious accessibility violations or horizontal overflow", async ({ page }) => {
  await ready(page);
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  const results = await new AxeBuilder({ page }).analyze();
  const material = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );
  expect(material).toEqual([]);
});

test("mobile order presents the map before controls", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "mobile-only DOM-order assertion");
  await ready(page);
  const order = await page.locator(".workspace-grid > *").evaluateAll((nodes) =>
    nodes.map((node) => node.className),
  );
  expect(order).toEqual(["map-panel", "filter-panel", "ranking-panel"]);
});
