import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const SNAPSHOT_DATE = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const START_YEAR = 2000;
const END_YEAR = Number(SNAPSHOT_DATE.slice(0, 4));
const MLB_API = "https://statsapi.mlb.com/api/v1";
const SPORT_IDS = [1, 11, 12, 13, 14, 15, 16];
const SPORT_RANK = new Map(SPORT_IDS.map((sportId, index) => [sportId, index]));
const SPORT_LABELS = new Map([
  [1, "MLB"],
  [11, "Triple-A"],
  [12, "Double-A"],
  [13, "High-A"],
  [14, "Single-A"],
  [15, "Short-Season A"],
  [16, "Rookie"],
]);
const UNIVERSE_FIELDS = [
  "id", "name", "firstSeason", "lastSeason", "seasons", "sportIds",
  "appearedInMlb", "hasAnyHighSchool", "hasUsHighSchool",
];
const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN",
  "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV",
  "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN",
  "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

const DATA_DIR = new URL("../data/processed/", import.meta.url);
const RAW_DIR = new URL("../data/raw/", import.meta.url);
const PUBLIC_FILE = new URL("../public/data/mlb-high-school-map.json", import.meta.url);
const LEADER_FILE = new URL("../public/data/mlb-high-school-leaders.json", import.meta.url);
const UNIVERSE_FILE = new URL("../data/mlb-affiliated-universe-audit.json", import.meta.url);
const LOCATION_FILE = new URL("../data/high-school-locations.json", import.meta.url);
const RESOLUTION_FILE = new URL("../data/high-school-resolutions.json", import.meta.url);

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

function schoolId(name, state) {
  return `${state.toLowerCase()}-${normalize(name).replaceAll(" ", "-")}`;
}

function cityKey(value) {
  return normalize(value ?? "").replaceAll(" ", "-");
}

function positionGroup(person) {
  const type = person.primaryPosition?.type ?? "Unknown";
  if (type === "Pitcher") return "Pitcher";
  if (type === "Catcher") return "Catcher";
  if (type === "Infielder") return "Infielder";
  if (type === "Outfielder") return "Outfielder";
  return "Other";
}

async function fetchJson(url, attempt = 1) {
  const response = await fetch(url, {
    headers: { "User-Agent": "MLB-Talent-Map-2026/1.0 (public research visualization)" },
  });
  if (response.ok) return response.json();
  if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    return fetchJson(url, attempt + 1);
  }
  throw new Error(`${response.status} ${response.statusText}: ${url}`);
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function readLocations() {
  try {
    const payload = JSON.parse(await readFile(LOCATION_FILE, "utf8"));
    return new Map(payload.schools.map((school) => [school.id, school]));
  } catch (error) {
    if (error.code === "ENOENT") return new Map();
    throw error;
  }
}

function resolutionMatches(rule, credit) {
  if (rule.playerIds && !rule.playerIds.includes(credit.player.id)) return false;
  if (rule.state && rule.state !== credit.state) return false;
  if (rule.names && !rule.names.some((name) => normalize(name) === normalize(credit.name))) return false;
  if (rule.cities && !rule.cities.some((city) => normalize(city) === normalize(credit.city ?? ""))) return false;
  return true;
}

await mkdir(DATA_DIR, { recursive: true });
await mkdir(RAW_DIR, { recursive: true });

const years = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, index) => START_YEAR + index);
const seasonPayloads = await mapLimit(years.flatMap((year) =>
  SPORT_IDS.map((sportId) => ({ year, sportId }))), 12, async ({ year, sportId }) => {
  const query = new URLSearchParams({ season: String(year), fields: "people,id" });
  const payload = await fetchJson(`${MLB_API}/sports/${sportId}/players?${query}`);
  return { year, sportId, people: payload.people ?? [] };
});

const participationById = new Map();
for (const payload of seasonPayloads) {
  for (const person of payload.people) {
    const participation = participationById.get(person.id) ?? {
      firstSeason: payload.year,
      lastSeason: payload.year,
      seasons: new Set(),
      sportIds: new Set(),
    };
    participation.firstSeason = Math.min(participation.firstSeason, payload.year);
    participation.lastSeason = Math.max(participation.lastSeason, payload.year);
    participation.seasons.add(payload.year);
    participation.sportIds.add(payload.sportId);
    participationById.set(person.id, participation);
  }
}

const playerIds = [...participationById.keys()].sort((a, b) => a - b);
const chunks = [];
for (let index = 0; index < playerIds.length; index += 250) chunks.push(playerIds.slice(index, index + 250));

const peoplePayloads = await mapLimit(chunks, 4, async (ids) => {
  const query = new URLSearchParams({ personIds: ids.join(","), hydrate: "education" });
  return fetchJson(`${MLB_API}/people?${query}`);
});
const peopleById = new Map();
for (const person of peoplePayloads.flatMap((payload) => payload.people)) peopleById.set(person.id, person);
if (peopleById.size !== participationById.size) {
  throw new Error(`Player hydration incomplete: ${peopleById.size}/${participationById.size}`);
}

const locations = await readLocations();
const resolutions = JSON.parse(await readFile(RESOLUTION_FILE, "utf8"));
const schools = new Map();
const missingEducation = [];
const outsideScope = [];
const credits = [];

for (const person of peopleById.values()) {
  const participation = participationById.get(person.id);
  if (!participation) continue;
  const reachedMlb = participation.sportIds.has(1);
  const highestSportId = [...participation.sportIds].sort((a, b) =>
    SPORT_RANK.get(a) - SPORT_RANK.get(b))[0];
  const player = {
    id: person.id,
    name: person.fullName,
    firstSeason: participation.firstSeason,
    lastSeason: participation.lastSeason,
    seasons: [...participation.seasons].sort((a, b) => a - b),
    reachedMlb,
    highestLevel: SPORT_LABELS.get(highestSportId) ?? "Unknown",
    mlbDebutDate: person.mlbDebutDate ?? null,
    position: person.primaryPosition?.abbreviation ?? "—",
    positionGroup: positionGroup(person),
  };
  const highschools = person.education?.highschools ?? [];
  if (!highschools.length) {
    missingEducation.push(player);
    continue;
  }

  const seenForPlayer = new Set();
  for (const school of highschools) {
    const state = String(school.state ?? "").toUpperCase();
    if (!US_STATES.has(state)) {
      outsideScope.push({
        playerId: person.id,
        playerName: person.fullName,
        firstSeason: participation.firstSeason,
        lastSeason: participation.lastSeason,
        school: school.name ?? "Unknown",
        city: school.city ?? null,
        state: state || null,
      });
      continue;
    }
    const name = String(school.name ?? "").trim();
    const rawKey = `${schoolId(name, state)}-${cityKey(school.city) || "name-only"}`;
    if (!name || seenForPlayer.has(rawKey)) continue;
    seenForPlayer.add(rawKey);
    credits.push({
      name,
      city: school.city ?? null,
      state,
      player,
    });
  }
}

const identityGroups = new Map();
for (const credit of credits) {
  const resolution = resolutions.rules.find((rule) => resolutionMatches(rule, credit));
  if (resolution) {
    identityGroups.set(`${credit.player.id}|${credit.name}|${credit.state}|${credit.city ?? ""}`, {
      ...resolution.canonical,
      basis: "audited_resolution",
    });
    continue;
  }
  const baseId = schoolId(credit.name, credit.state);
  identityGroups.set(`${credit.player.id}|${credit.name}|${credit.state}|${credit.city ?? ""}`, {
    id: `${baseId}-${cityKey(credit.city) || "unresolved"}`,
    name: credit.name,
    city: credit.city,
    state: credit.state,
    basis: credit.city ? "mlb_reported_city" : "name_state_only",
  });
}

for (const credit of credits) {
  const identity = identityGroups.get(`${credit.player.id}|${credit.name}|${credit.state}|${credit.city ?? ""}`);
  const location = locations.get(identity.id);
  const row = schools.get(identity.id) ?? {
    id: identity.id,
    name: identity.name,
    city: identity.city,
    state: identity.state,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    locationPrecision: location?.precision ?? "unresolved",
    locationSource: location?.source ?? null,
    locationSourceUrl: location?.sourceUrl ?? null,
    identityBasis: identity.basis,
    reportedNames: [],
    reportedCities: [],
    players: [],
  };
  if (!row.reportedNames.includes(credit.name)) row.reportedNames.push(credit.name);
  if (credit.city && !row.reportedCities.includes(credit.city)) row.reportedCities.push(credit.city);
  if (!row.players.some((player) => player.id === credit.player.id)) row.players.push(credit.player);
  schools.set(identity.id, row);
}

const schoolRows = [...schools.values()].map((school) => ({
  ...school,
  reportedNames: school.reportedNames.sort(),
  reportedCities: school.reportedCities.sort(),
  players: school.players.sort((a, b) => a.firstSeason - b.firstSeason || a.name.localeCompare(b.name)),
  playerCount: school.players.length,
  firstSeason: Math.min(...school.players.map((player) => player.firstSeason)),
  latestSeason: Math.max(...school.players.map((player) => player.lastSeason)),
})).sort((a, b) => b.playerCount - a.playerCount || a.name.localeCompare(b.name));

const withUsHighSchool = new Set(schoolRows.flatMap((school) => school.players.map((player) => player.id)));
const withAnyEducation = [...peopleById.values()].filter((person) => (person.education?.highschools?.length ?? 0) > 0);
const withAnyEducationIds = new Set(withAnyEducation.map((person) => person.id));
const mlbParticipants = [...participationById.values()].filter((row) => row.sportIds.has(1)).length;
const mappedSchools = schoolRows.filter((school) => school.latitude !== null && school.longitude !== null);
const mappedPlayers = new Set(mappedSchools.flatMap((school) => school.players.map((player) => player.id)));
const universeParticipants = playerIds.map((id) => {
  const person = peopleById.get(id);
  const participation = participationById.get(id);
  return [
    id,
    person.fullName,
    participation.firstSeason,
    participation.lastSeason,
    [...participation.seasons].sort((a, b) => a - b),
    [...participation.sportIds].sort((a, b) => SPORT_RANK.get(a) - SPORT_RANK.get(b)),
    participation.sportIds.has(1),
    withAnyEducationIds.has(id),
    withUsHighSchool.has(id),
  ];
});
const universeUnsigned = {
  meta: {
    snapshotDate: SNAPSHOT_DATE,
    seasonRange: { start: START_YEAR, end: END_YEAR },
    sportIds: SPORT_IDS,
    participantFields: UNIVERSE_FIELDS,
    participantCount: universeParticipants.length,
    definition: "Unique people returned by MLB's official season-player endpoints for MLB and affiliated Triple-A, Double-A, High-A, Single-A, Short-Season A, and Rookie levels, deduplicated by MLB person ID.",
    seasonSportCounts: seasonPayloads.map((payload) => ({
      season: payload.year,
      sportId: payload.sportId,
      players: new Set(payload.people.map((person) => person.id)).size,
    })),
  },
  participants: universeParticipants,
};
const universeStableJson = `${JSON.stringify(universeUnsigned, null, 2)}\n`;
const universeSha256 = createHash("sha256").update(universeStableJson).digest("hex");
const universeAudit = structuredClone(universeUnsigned);
universeAudit.meta.sha256 = universeSha256;

const output = {
  meta: {
    title: "MLB and affiliated MiLB high school talent map since 2000",
    snapshotDate: SNAPSHOT_DATE,
    startDate: `${START_YEAR}-01-01`,
    generatedAt: new Date().toISOString(),
    sportIds: SPORT_IDS,
    seasonRange: { start: START_YEAR, end: END_YEAR },
    universeSha256,
    definition: "Distinct players listed by MLB's official season-player endpoints at MLB, Triple-A, Double-A, High-A, Single-A, Short-Season A, or Rookie level from 2000 through the snapshot season. Each player is credited once to every U.S. high school listed in the MLB Stats API education record.",
    sources: [
      ...SPORT_IDS.map((sportId) => `${MLB_API}/sports/${sportId}/players?season=${END_YEAR}`),
      `${MLB_API}/people?personIds=592450&hydrate=education`,
    ],
    caveats: [
      "MLB education records are not complete for every MLB or affiliated MiLB player.",
      "A player who attended multiple listed high schools is credited to each school; totals across schools are not additive.",
      "School names and cities are reported by MLB and may contain historical names, abbreviations, or missing city fields. Ambiguous name-only records remain unresolved; only documented leader aliases and campus identities are consolidated.",
      "Only U.S. high schools in the 50 states and District of Columbia are included.",
      "Affiliated minor-league seasons were canceled in 2020, so the 2020 minor-league endpoints contain no participants; MLB participants remain included for that season.",
    ],
    counts: {
      affiliatedPlayers: participationById.size,
      mlbParticipants,
      minorOnlyPlayers: participationById.size - mlbParticipants,
      hydratedPlayers: peopleById.size,
      playersWithAnyHighSchool: withAnyEducation.length,
      playersWithUsHighSchool: withUsHighSchool.size,
      playersMissingHighSchool: missingEducation.length,
      schoolPlayerCredits: schoolRows.reduce((sum, school) => sum + school.playerCount, 0),
      usHighSchoolIdentities: schoolRows.length,
      locatedHighSchools: mappedSchools.length,
      locatedPlayers: mappedPlayers.size,
      outsideScopeCredits: outsideScope.length,
    },
  },
  schools: schoolRows,
};

const checksumOutput = structuredClone(output);
delete checksumOutput.meta.generatedAt;
const stableJson = `${JSON.stringify(checksumOutput, null, 2)}\n`;
const sha256 = createHash("sha256").update(stableJson).digest("hex");
output.meta.sha256 = sha256;

const leaderOutput = {
  meta: {
    ...output.meta,
    schoolUniverseSha256: sha256,
  },
  schools: mappedSchools,
};
delete leaderOutput.meta.sha256;
const checksumLeaders = structuredClone(leaderOutput);
delete checksumLeaders.meta.generatedAt;
const leaderStableJson = `${JSON.stringify(checksumLeaders, null, 2)}\n`;
leaderOutput.meta.sha256 = createHash("sha256").update(leaderStableJson).digest("hex");

await writeFile(PUBLIC_FILE, `${JSON.stringify(output, null, 1)}\n`);
await writeFile(LEADER_FILE, `${JSON.stringify(leaderOutput, null, 2)}\n`);
await writeFile(UNIVERSE_FILE, `${JSON.stringify(universeAudit)}\n`);
await writeFile(new URL(`mlb-high-school-quality-${SNAPSHOT_DATE}.json`, DATA_DIR), `${JSON.stringify({
  ...output.meta.counts,
  sha256,
  unresolvedSchools: schoolRows.filter((school) => school.locationPrecision === "unresolved")
    .map((school) => ({ id: school.id, name: school.name, city: school.city, state: school.state, playerCount: school.playerCount })),
}, null, 2)}\n`);
await writeFile(new URL(`mlb-high-school-people-${SNAPSHOT_DATE}.json`, RAW_DIR), `${JSON.stringify({
  snapshotDate: SNAPSHOT_DATE,
  people: [...peopleById.values()],
}, null, 2)}\n`);

console.log(JSON.stringify({ ...output.meta.counts, sha256, topSchools: schoolRows.slice(0, 20).map((school) => ({
  id: school.id,
  name: school.name,
  city: school.city,
  state: school.state,
  playerCount: school.playerCount,
  players: school.players.map((player) => `${player.name} (${player.firstSeason}–${player.lastSeason}; ${player.highestLevel})`),
})) }, null, 2));
