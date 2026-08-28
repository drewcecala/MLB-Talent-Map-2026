import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const root = new URL("../", import.meta.url);
const baseUrl = new URL(
  process.env.PRODUCTION_BASE_URL ?? "https://mlb-talent-map-2026.pages.dev",
);
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}
const retries = Number(args.get("--retries") ?? 1);
const delayMs = Number(args.get("--delay-ms") ?? 0);
assert.ok(Number.isInteger(retries) && retries > 0, "--retries must be a positive integer");
assert.ok(Number.isFinite(delayMs) && delayMs >= 0, "--delay-ms must be nonnegative");

const digest = (value) => createHash("sha256").update(value).digest("hex");
const cacheKey = `${Date.now()}-${process.pid}`;

const htmlRoutes = [
  {
    pathname: "/",
    localPath: "pages-dist/index.html",
    title: "The Geography of MLB Talent",
    runtimeTitle: "Interactive roster map | The Geography of MLB Talent",
    canonical: "https://mlb-talent-map-2026.pages.dev/",
    socialImage: "https://mlb-talent-map-2026.pages.dev/og.png",
    readySelector: "[data-map-ready='true']",
    links: [
      ["High school map", "/mlb-high-school-map/"],
      ["College source audit", "/mlb-college-map/"],
    ],
  },
  {
    pathname: "/mlb-talent-map/",
    localPath: "pages-dist/mlb-talent-map/index.html",
    title: "Interactive roster map | The Geography of MLB Talent",
    runtimeTitle: "Interactive roster map | The Geography of MLB Talent",
    canonical: "https://mlb-talent-map-2026.pages.dev/",
    socialImage: "https://mlb-talent-map-2026.pages.dev/og.png",
    readySelector: "[data-map-ready='true']",
    links: [
      ["High school map", "/mlb-high-school-map/"],
      ["College source audit", "/mlb-college-map/"],
    ],
  },
  {
    pathname: "/mlb-high-school-map/",
    localPath: "pages-dist/mlb-high-school-map/index.html",
    title: "High Schools Producing MLB &amp; MiLB Talent Since 2000 | MLB Talent Map 2026",
    runtimeTitle: "High Schools Producing MLB & MiLB Talent Since 2000 | MLB Talent Map 2026",
    canonical: "https://mlb-talent-map-2026.pages.dev/mlb-high-school-map/",
    socialImage: "https://mlb-talent-map-2026.pages.dev/og-high-schools.png",
    readySelector: "[data-high-school-map-ready='true']",
    links: [
      ["Roster atlas", "/mlb-talent-map/"],
      ["College source audit", "/mlb-college-map/"],
    ],
  },
  {
    pathname: "/mlb-college-map/",
    localPath: "pages-dist/mlb-college-map/index.html",
    title: "Colleges Producing MLB &amp; MiLB Talent Since 2000 | MLB Talent Map 2026",
    runtimeTitle: "Colleges Producing MLB & MiLB Talent Since 2000 | MLB Talent Map 2026",
    canonical: "https://mlb-talent-map-2026.pages.dev/mlb-college-map/",
    socialImage: "https://mlb-talent-map-2026.pages.dev/og-colleges.png",
    readySelector: "[data-college-map-ready='true']",
    links: [
      ["High school map", "/mlb-high-school-map/"],
      ["Roster atlas", "/mlb-talent-map/"],
    ],
  },
];

const staticFiles = [
  {
    pathname: "/404",
    localPath: "pages-dist/404.html",
    contentType: /text\/html/i,
  },
  {
    pathname: "/data/mlb-talent-map.json",
    localPath: "pages-dist/data/mlb-talent-map.json",
    contentType: /application\/json/i,
  },
  {
    pathname: "/data/mlb-high-school-leaders.json",
    localPath: "pages-dist/data/mlb-high-school-leaders.json",
    contentType: /application\/json/i,
  },
  {
    pathname: "/data/mlb-college-leaders.json",
    localPath: "pages-dist/data/mlb-college-leaders.json",
    contentType: /application\/json/i,
  },
  { pathname: "/og.png", localPath: "pages-dist/og.png", contentType: /image\/png/i },
  {
    pathname: "/og-high-schools.png",
    localPath: "pages-dist/og-high-schools.png",
    contentType: /image\/png/i,
  },
  {
    pathname: "/og-colleges.png",
    localPath: "pages-dist/og-colleges.png",
    contentType: /image\/png/i,
  },
  {
    pathname: "/favicon.svg",
    localPath: "pages-dist/favicon.svg",
    contentType: /image\/svg\+xml/i,
  },
  {
    pathname: "/manifest.webmanifest",
    localPath: "pages-dist/manifest.webmanifest",
    contentType: /(?:application\/manifest\+json|application\/json)/i,
  },
  {
    pathname: "/robots.txt",
    localPath: "pages-dist/robots.txt",
    contentType: /text\/plain/i,
  },
  {
    pathname: "/sitemap.xml",
    localPath: "pages-dist/sitemap.xml",
    contentType: /(?:application|text)\/xml/i,
  },
];

function assetContentType(file) {
  if (file.endsWith(".css")) return /text\/css/i;
  if (file.endsWith(".js")) return /(?:application|text)\/javascript/i;
  throw new Error(`Unexpected production asset type: ${file}`);
}

async function releaseFiles() {
  const assets = await readdir(new URL("pages-dist/assets/", root));
  return [
    ...htmlRoutes.map(({ pathname, localPath }) => ({
      pathname,
      localPath,
      contentType: /text\/html/i,
    })),
    ...staticFiles,
    ...assets.sort().map((file) => ({
      pathname: `/assets/${file}`,
      localPath: `pages-dist/assets/${file}`,
      contentType: assetContentType(file),
    })),
  ];
}

async function verifyReleaseFile(file) {
  const local = await readFile(new URL(file.localPath, root));
  const url = new URL(file.pathname, baseUrl);
  url.searchParams.set("release-check", cacheKey);
  const response = await fetch(url, { cache: "no-store", redirect: "manual" });
  assert.equal(response.status, 200, `${url.pathname} returned HTTP ${response.status}`);
  assert.match(
    response.headers.get("content-type") ?? "",
    file.contentType,
    `${url.pathname} returned an unexpected content type`,
  );
  const remote = Buffer.from(await response.arrayBuffer());
  assert.equal(digest(remote), digest(local), `${url.pathname} does not match the release commit`);
  return { body: remote, label: `${file.pathname} ${digest(local).slice(0, 12)}` };
}

function verifyHtmlMetadata(bodies) {
  for (const route of htmlRoutes) {
    const html = bodies.get(route.pathname)?.toString("utf8") ?? "";
    assert.ok(html.includes(`<title>${route.title}</title>`), `${route.pathname} has the wrong title`);
    assert.ok(
      html.includes(`<link rel="canonical" href="${route.canonical}"`),
      `${route.pathname} has the wrong canonical URL`,
    );
    assert.ok(
      html.includes(`property="og:image" content="${route.socialImage}"`),
      `${route.pathname} has the wrong social image`,
    );
    assert.ok(
      html.includes('<link rel="manifest" href="/manifest.webmanifest"'),
      `${route.pathname} is missing the web manifest`,
    );
    assert.ok(html.includes('href="/favicon.svg"'), `${route.pathname} is missing its favicon`);
  }
}

function verifyDiscoveryFiles(bodies) {
  const robots = bodies.get("/robots.txt")?.toString("utf8") ?? "";
  assert.match(robots, /^User-agent: \*\nAllow: \/\n\nSitemap: https:\/\/mlb-talent-map-2026\.pages\.dev\/sitemap\.xml\n$/);

  const sitemap = bodies.get("/sitemap.xml")?.toString("utf8") ?? "";
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(locations, [
    "https://mlb-talent-map-2026.pages.dev/",
    "https://mlb-talent-map-2026.pages.dev/mlb-high-school-map/",
    "https://mlb-talent-map-2026.pages.dev/mlb-college-map/",
  ]);

  const manifest = JSON.parse(bodies.get("/manifest.webmanifest")?.toString("utf8") ?? "");
  assert.equal(manifest.name, "The Geography of MLB Talent");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(
    manifest.icons.some(
      (icon) => icon.src === "/favicon.svg" && icon.type === "image/svg+xml",
    ),
    "manifest.webmanifest is missing the SVG favicon",
  );
}

async function verifyNotFoundResponses() {
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const paths = [
    `/missing-route-${nonce}`,
    `/mlb-talent-map/missing-${nonce}`,
    `/mlb-high-school-mapish-${nonce}`,
    `/mlb-college-map/missing-${nonce}`,
    `/assets/missing-${nonce}.js`,
  ];
  for (const pathname of paths) {
    const response = await fetch(new URL(pathname, baseUrl), {
      cache: "no-store",
      redirect: "manual",
    });
    assert.equal(response.status, 404, `${pathname} returned HTTP ${response.status}, expected 404`);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/i);
    const body = await response.text();
    assert.match(body, /That route is off the map\./);
    assert.match(body, /<meta name="robots" content="noindex" \/>/);
  }
}

async function verifyCanonicalRedirects() {
  for (const pathname of ["/mlb-talent-map", "/mlb-high-school-map", "/mlb-college-map"]) {
    const response = await fetch(new URL(pathname, baseUrl), {
      cache: "no-store",
      redirect: "manual",
    });
    assert.equal(response.status, 308, `${pathname} returned HTTP ${response.status}, expected 308`);
    const location = response.headers.get("location");
    assert.ok(location, `${pathname} is missing its redirect location`);
    assert.equal(
      new URL(location, baseUrl).href,
      new URL(`${pathname}/`, baseUrl).href,
      `${pathname} redirects to the wrong canonical path`,
    );
  }
}

async function verifyRenderedRoutes() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const productionOrigin = baseUrl.origin;

    for (const route of htmlRoutes) {
      const errors = [];
      const page = await context.newPage();
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
      page.on("requestfailed", (request) => {
        errors.push(`request: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`);
      });
      page.on("response", (response) => {
        const url = new URL(response.url());
        if (url.origin === productionOrigin && response.status() >= 400) {
          errors.push(`response: ${response.status()} ${url.pathname}`);
        }
      });
      try {
        const response = await page.goto(new URL(route.pathname, baseUrl).href, {
          waitUntil: "domcontentloaded",
        });
        assert.equal(response?.status(), 200, `${route.pathname} did not render with HTTP 200`);
        await page.locator(route.readySelector).waitFor({ state: "visible", timeout: 30_000 });
        assert.equal(await page.title(), route.runtimeTitle, `${route.pathname} has the wrong runtime title`);
        const body = await page.locator("body").innerText();
        assert.ok(body.trim().length > 500, `${route.pathname} rendered an unexpectedly empty page`);
        assert.doesNotMatch(body, /Application error|Internal Server Error|Unhandled Runtime Error/i);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        assert.ok(overflow <= 1, `${route.pathname} has ${overflow}px of horizontal overflow`);
        for (const [name, href] of route.links) {
          assert.equal(
            await page.getByRole("link", { name, exact: true }).getAttribute("href"),
            href,
            `${route.pathname} has the wrong ${name} link`,
          );
        }
        assert.deepEqual(errors, [], `Rendered production errors on ${route.pathname}:\n${errors.join("\n")}`);
      } finally {
        await page.close();
      }
    }

    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
    page.on("requestfailed", (request) => {
      errors.push(`request: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`);
    });
    await page.goto(new URL("/", baseUrl).href);
    await page.locator("[data-map-ready='true']").waitFor({ state: "visible", timeout: 30_000 });
    await page.getByLabel("Roster level").selectOption("MLB");
    await page.waitForURL(/level=MLB/);
    await page.getByRole("link", { name: "High school map", exact: true }).click();
    await page.waitForURL(new URL("/mlb-high-school-map/", baseUrl).href);
    await page.locator("[data-high-school-map-ready='true']").waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page.getByLabel("Participation period").selectOption("2020s");
    await page.waitForURL(/era=2020s/);
    await page.getByRole("link", { name: "College source audit", exact: true }).click();
    await page.waitForURL(new URL("/mlb-college-map/", baseUrl).href);
    await page.locator("[data-college-map-ready='true']").waitFor({
      state: "visible",
      timeout: 30_000,
    });
    assert.equal(
      await page.getByRole("heading", { name: "College map withheld pending source coverage" }).count(),
      1,
    );
    await page.getByRole("link", { name: "Roster atlas", exact: true }).click();
    await page.waitForURL(new URL("/mlb-talent-map/", baseUrl).href);
    await page.locator("[data-map-ready='true']").waitFor({ state: "visible", timeout: 30_000 });
    assert.deepEqual(errors, [], `Rendered production errors:\n${errors.join("\n")}`);
    await page.close();
  } finally {
    await browser.close();
  }
}

async function verify() {
  const files = await releaseFiles();
  const results = await Promise.all(files.map((file) => verifyReleaseFile(file)));
  const bodies = new Map(files.map((file, index) => [file.pathname, results[index].body]));
  verifyHtmlMetadata(bodies);
  verifyDiscoveryFiles(bodies);
  await verifyNotFoundResponses();
  await verifyCanonicalRedirects();

  const highSchools = JSON.parse(
    await readFile(new URL("public/data/mlb-high-school-leaders.json", root), "utf8"),
  );
  const colleges = JSON.parse(
    await readFile(new URL("public/data/mlb-college-leaders.json", root), "utf8"),
  );
  assert.equal(highSchools.meta.counts.affiliatedPlayers, 49_771);
  assert.equal(highSchools.meta.counts.excludedPre2000Players, 5_209);
  assert.equal(colleges.meta.publicationReady, false);
  assert.deepEqual(colleges.colleges, []);

  await verifyRenderedRoutes();
  return results.map(({ label }) => label);
}

let lastError;
let verified;
for (let attempt = 1; attempt <= retries; attempt += 1) {
  try {
    verified = await verify();
    break;
  } catch (error) {
    lastError = error;
    if (attempt < retries) {
      process.stderr.write(`Production check ${attempt}/${retries} failed: ${error.message}\n`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
if (!verified) throw lastError;
process.stdout.write(
  `Production matches this release and rendered successfully: ${verified.join(", ")}\n`,
);
