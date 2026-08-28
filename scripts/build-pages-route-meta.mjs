import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const outputRoot = new URL("../pages-dist/", import.meta.url);
const source = await readFile(new URL("index.html", outputRoot), "utf8");

function replace(pattern, value, html) {
  assert.match(html, pattern, `metadata pattern did not match: ${pattern}`);
  return html.replace(pattern, `$1${value}$2`);
}

const routes = [
  {
    directory: "mlb-talent-map/",
    title: "Interactive roster map | The Geography of MLB Talent",
    description: "Explore U.S. birthplace geography and international origins for every player on an MLB organization roster as of August 24, 2026.",
    url: "https://mlb-talent-map-2026.pages.dev/",
    image: "https://mlb-talent-map-2026.pages.dev/og.png",
    imageWidth: "1731",
    imageHeight: "909",
    imageAlt: "The Geography of MLB Talent — 2026 roster atlas",
    themeColor: "#4d2058",
  },
  {
    directory: "mlb-high-school-map/",
    title: "High Schools Producing MLB & MiLB Talent Since 2000 | MLB Talent Map 2026",
    description: "Map and rank U.S. high schools for 49,771 players whose official MLB or affiliated MiLB careers began in 2000 or later.",
    url: "https://mlb-talent-map-2026.pages.dev/mlb-high-school-map/",
    image: "https://mlb-talent-map-2026.pages.dev/og-high-schools.png",
    imageWidth: "1200",
    imageHeight: "630",
    imageAlt: "Map of leading U.S. high schools by MLB and affiliated MiLB participants since 2000",
    themeColor: "#0d2a3d",
  },
  {
    directory: "mlb-college-map/",
    title: "Colleges Producing MLB & MiLB Talent Since 2000 | MLB Talent Map 2026",
    description: "Publication-status audit for the MLB college talent map using players whose professional careers began in 2000 or later.",
    url: "https://mlb-talent-map-2026.pages.dev/mlb-college-map/",
    image: "https://mlb-talent-map-2026.pages.dev/og-colleges.png",
    imageWidth: "1200",
    imageHeight: "630",
    imageAlt: "Map of leading U.S. colleges by MLB and affiliated MiLB participants since 2000",
    themeColor: "#241b4f",
  },
];

for (const route of routes) {
  const encodedTitle = route.title.replaceAll("&", "&amp;");
  let routeHtml = source;
  routeHtml = replace(/(<meta\s+name="description"\s+content=")[^"]*("\s*\/?>)/s, route.description, routeHtml);
  routeHtml = replace(/(<meta\s+property="og:title"\s+content=")[^"]*("\s*\/?>)/s, encodedTitle, routeHtml);
  routeHtml = replace(/(<meta\s+property="og:url"\s+content=")[^"]*("\s*\/?>)/s, route.url, routeHtml);
  routeHtml = replace(/(<meta\s+property="og:description"\s+content=")[^"]*("\s*\/?>)/s, route.description, routeHtml);
  routeHtml = replace(/(<meta\s+property="og:image"\s+content=")[^"]*("\s*\/?>)/s, route.image, routeHtml);
  routeHtml = replace(/(<meta\s+property="og:image:width"\s+content=")[^"]*("\s*\/?>)/s, route.imageWidth, routeHtml);
  routeHtml = replace(/(<meta\s+property="og:image:height"\s+content=")[^"]*("\s*\/?>)/s, route.imageHeight, routeHtml);
  routeHtml = replace(/(<meta\s+property="og:image:alt"\s+content=")[^"]*("\s*\/?>)/s, route.imageAlt, routeHtml);
  routeHtml = replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*("\s*\/?>)/s, encodedTitle, routeHtml);
  routeHtml = replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*("\s*\/?>)/s, route.description, routeHtml);
  routeHtml = replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*("\s*\/?>)/s, route.image, routeHtml);
  routeHtml = replace(/(<meta\s+name="theme-color"\s+content=")[^"]*("\s*\/?>)/s, route.themeColor, routeHtml);
  routeHtml = replace(/(<link\s+rel="canonical"\s+href=")[^"]*("\s*\/?>)/s, route.url, routeHtml);
  routeHtml = replace(/(<title>)[^<]*(<\/title>)/s, encodedTitle, routeHtml);
  const routeDirectory = new URL(route.directory, outputRoot);
  await mkdir(routeDirectory, { recursive: true });
  await writeFile(new URL("index.html", routeDirectory), routeHtml);
  for (const expected of [encodedTitle, route.description, route.url, route.image, `content="${route.imageWidth}"`, `content="${route.imageHeight}"`]) {
    assert.ok(routeHtml.includes(expected), `route metadata is missing: ${expected}`);
  }
}

process.stdout.write("Built route-specific social metadata for roster, school, and college maps.\n");
