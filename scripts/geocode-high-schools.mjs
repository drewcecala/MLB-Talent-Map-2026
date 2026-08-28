import { readFile, writeFile } from "node:fs/promises";

const DATA_FILE = new URL("../public/data/mlb-high-school-map.json", import.meta.url);
const OUTPUT_FILE = new URL("../data/high-school-locations.json", import.meta.url);
const MIN_PLAYERS = Number(process.argv[2] ?? 5);
const WAIT_MS = 1_100;

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(high school|secondary school|senior high school|hs)\b/gi, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function schoolQuery(school) {
  const hasSchoolKind = /\b(academy|prep|preparatory|school|college|high|hs)\b/i.test(school.name);
  const name = hasSchoolKind ? school.name : `${school.name} High School`;
  return [name, school.city, school.state, "USA"].filter(Boolean).join(", ");
}

function stateCode(result) {
  const iso = result.address?.["ISO3166-2-lvl4"] ?? result.address?.["ISO3166-2-lvl3"] ?? "";
  return iso.split("-").at(-1)?.toUpperCase() ?? "";
}

function cityValues(result) {
  return [result.address?.city, result.address?.town, result.address?.village, result.address?.municipality]
    .filter(Boolean)
    .map(normalize);
}

function scoreCandidate(school, result) {
  let score = 0;
  if (result.address?.country_code === "us") score += 4;
  if (stateCode(result) === school.state) score += 12;
  if (["school", "college", "university"].includes(result.addresstype)) score += 8;
  if (["amenity", "building"].includes(result.category)) score += 2;

  const targetTokens = new Set(normalize(school.name).split(" ").filter((token) => token.length > 2));
  const candidateName = result.namedetails?.name ?? result.name ?? result.display_name.split(",")[0];
  const candidateTokens = new Set(normalize(candidateName).split(" ").filter((token) => token.length > 2));
  const overlap = [...targetTokens].filter((token) => candidateTokens.has(token)).length;
  score += targetTokens.size ? (overlap / targetTokens.size) * 10 : 0;

  if (school.city && cityValues(result).includes(normalize(school.city))) score += 6;
  return score;
}

async function readCache() {
  try {
    return JSON.parse(await readFile(OUTPUT_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { generatedAt: null, minPlayers: MIN_PLAYERS, schools: [] };
    throw error;
  }
}

const data = JSON.parse(await readFile(DATA_FILE, "utf8"));
const cache = await readCache();
const targets = data.schools.filter((school) => school.playerCount >= MIN_PLAYERS);
const targetIds = new Set(targets.map((school) => school.id));
const cachedRows = cache.schools ?? [];
const byId = new Map(cachedRows.filter((school) => targetIds.has(school.id)).map((school) => [school.id, school]));

for (const school of targets) {
  if (byId.get(school.id)?.precision === "campus") continue;
  const reusable = cachedRows.find((row) =>
    row.precision === "campus"
    && row.state === school.state
    && normalize(row.name) === normalize(school.name)
    && (!school.city || normalize(row.reportedCity ?? row.city) === normalize(school.city)),
  );
  if (reusable) {
    byId.set(school.id, {
      ...reusable,
      id: school.id,
      name: school.name,
      reportedCity: school.city,
      city: school.city ?? reusable.city,
      geocodeReuse: reusable.id,
    });
  }
}

for (const [index, school] of targets.entries()) {
  if (byId.get(school.id)?.precision === "campus") continue;
  const query = schoolQuery(school);
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    namedetails: "1",
    countrycodes: "us",
    limit: "5",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      "User-Agent": "MLB-Talent-Map-2026/1.0 (https://github.com/heHate-Me/MLB-Talent-Map-2026)",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${query}`);
  const candidates = (await response.json()).map((result) => ({
    result,
    score: scoreCandidate(school, result),
  })).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const resolved = best && best.score >= 18 && stateCode(best.result) === school.state;
  const row = {
    id: school.id,
    name: school.name,
    reportedCity: school.city,
    city: resolved
      ? best.result.address?.city ?? best.result.address?.town ?? best.result.address?.village ?? school.city
      : school.city,
    state: school.state,
    latitude: resolved ? Number(best.result.lat) : null,
    longitude: resolved ? Number(best.result.lon) : null,
    precision: resolved ? "campus" : "unresolved",
    source: resolved ? "OpenStreetMap Nominatim" : null,
    sourceUrl: resolved ? `https://www.openstreetmap.org/${best.result.osm_type}/${best.result.osm_id}` : null,
    geocodeQuery: query,
    displayName: best?.result.display_name ?? null,
    matchScore: best ? Number(best.score.toFixed(2)) : null,
    alternatives: candidates.slice(0, 3).map(({ result, score }) => ({
      displayName: result.display_name,
      latitude: Number(result.lat),
      longitude: Number(result.lon),
      osmType: result.osm_type,
      osmId: result.osm_id,
      state: stateCode(result),
      score: Number(score.toFixed(2)),
    })),
  };
  byId.set(school.id, row);
  await writeFile(OUTPUT_FILE, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    minPlayers: MIN_PLAYERS,
    attribution: "Geocoding © OpenStreetMap contributors; ODbL 1.0.",
    schools: targets.map((target) => byId.get(target.id)).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id)),
  }, null, 2)}\n`);
  console.log(`${index + 1}/${targets.length} ${school.id}: ${row.precision} ${row.displayName ?? "no result"}`);
  await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
}

const rows = targets.map((target) => byId.get(target.id)).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
console.log(JSON.stringify({
  targets: targets.length,
  campus: rows.filter((row) => row.precision === "campus").length,
  unresolved: rows.filter((row) => row.precision === "unresolved").map((row) => ({
    id: row.id,
    query: row.geocodeQuery,
    best: row.displayName,
    score: row.matchScore,
  })),
}, null, 2));
