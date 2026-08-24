import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const outputRoot = new URL("../pages-dist/", import.meta.url);
const source = await readFile(new URL("index.html", outputRoot), "utf8");
const title = "High Schools Producing MLB & MiLB Talent Since 2000 | MLB Talent Map 2026";
const encodedTitle = title.replaceAll("&", "&amp;");
const description = "Map and rank U.S. high schools across 54,980 official MLB and affiliated MiLB season participants from 2000 through August 24, 2026.";
const url = "https://mlb-talent-map-2026.pages.dev/mlb-high-school-map";
const image = "https://mlb-talent-map-2026.pages.dev/og-high-schools.png";

function replace(pattern, value, html) {
  const next = html.replace(pattern, `$1${value}$2`);
  assert.notEqual(next, html, `metadata pattern did not match: ${pattern}`);
  return next;
}

let routeHtml = source;
routeHtml = replace(/(<meta\s+name="description"\s+content=")[^"]*("\s*\/?>)/s, description, routeHtml);
routeHtml = replace(/(<meta\s+property="og:title"\s+content=")[^"]*("\s*\/?>)/s, encodedTitle, routeHtml);
routeHtml = replace(/(<meta\s+property="og:url"\s+content=")[^"]*("\s*\/?>)/s, url, routeHtml);
routeHtml = replace(/(<meta\s+property="og:description"\s+content=")[^"]*("\s*\/?>)/s, description, routeHtml);
routeHtml = replace(/(<meta\s+property="og:image"\s+content=")[^"]*("\s*\/?>)/s, image, routeHtml);
routeHtml = replace(/(<meta\s+property="og:image:width"\s+content=")[^"]*("\s*\/?>)/s, "1200", routeHtml);
routeHtml = replace(/(<meta\s+property="og:image:height"\s+content=")[^"]*("\s*\/?>)/s, "630", routeHtml);
routeHtml = replace(/(<meta\s+property="og:image:alt"\s+content=")[^"]*("\s*\/?>)/s, "Map of leading U.S. high schools by MLB and affiliated MiLB participants since 2000", routeHtml);
routeHtml = replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*("\s*\/?>)/s, encodedTitle, routeHtml);
routeHtml = replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*("\s*\/?>)/s, description, routeHtml);
routeHtml = replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*("\s*\/?>)/s, image, routeHtml);
routeHtml = replace(/(<meta\s+name="theme-color"\s+content=")[^"]*("\s*\/?>)/s, "#0d2a3d", routeHtml);
routeHtml = replace(/(<link\s+rel="canonical"\s+href=")[^"]*("\s*\/?>)/s, url, routeHtml);
routeHtml = replace(/(<title>)[^<]*(<\/title>)/s, encodedTitle, routeHtml);

const routeDirectory = new URL("mlb-high-school-map/", outputRoot);
await mkdir(routeDirectory, { recursive: true });
await writeFile(new URL("index.html", routeDirectory), routeHtml);

for (const expected of [encodedTitle, description, url, image, 'content="1200"', 'content="630"']) {
  assert.ok(routeHtml.includes(expected), `route metadata is missing: ${expected}`);
}

process.stdout.write("Built route-specific social metadata for /mlb-high-school-map.\n");
