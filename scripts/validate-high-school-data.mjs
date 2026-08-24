import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { geoContains } from "d3-geo";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const unique = (values, label) => assert.equal(new Set(values).size, values.length, `${label} must be unique`);
const sortedUnique = (values, label) => {
  unique(values, label);
  assert.deepEqual(values, [...values].sort((a, b) => a - b), `${label} must be sorted`);
};
const digestWithoutMetaSha = (payload) => {
  const unsigned = structuredClone(payload);
  delete unsigned.meta.sha256;
  delete unsigned.meta.generatedAt;
  return createHash("sha256").update(`${JSON.stringify(unsigned, null, 2)}\n`).digest("hex");
};

const [data, leaders, universe, states, locations, resolutions, audit] = await Promise.all([
  readJson("public/data/mlb-high-school-map.json"),
  readJson("public/data/mlb-high-school-leaders.json"),
  readJson("data/mlb-affiliated-universe-audit.json"),
  readJson("public/data/us-states-2020-simplified.geojson"),
  readJson("data/high-school-locations.json"),
  readJson("data/high-school-resolutions.json"),
  readJson("reports/high-school-data-quality.json"),
]);

const expectedSportIds = [1, 11, 12, 13, 14, 15, 16];
const expectedParticipantFields = [
  "id", "name", "firstSeason", "lastSeason", "seasons", "sportIds",
  "appearedInMlb", "hasAnyHighSchool", "hasUsHighSchool",
];
const expectedCounts = {
  affiliatedPlayers: 54_980,
  mlbParticipants: 7_380,
  minorOnlyPlayers: 47_600,
  hydratedPlayers: 54_980,
  playersWithAnyHighSchool: 18_642,
  playersWithUsHighSchool: 16_800,
  playersMissingHighSchool: 36_338,
  schoolPlayerCredits: 16_800,
  usHighSchoolIdentities: 7_048,
  locatedHighSchools: 25,
  locatedPlayers: 621,
  outsideScopeCredits: 1_842,
};

assert.equal(data.meta.snapshotDate, "2026-08-24");
assert.equal(data.meta.startDate, "2000-01-01");
assert.deepEqual(data.meta.sportIds, expectedSportIds);
assert.deepEqual(data.meta.seasonRange, { start: 2000, end: 2026 });
assert.deepEqual(data.meta.counts, expectedCounts);
assert.equal(data.schools.length, expectedCounts.usHighSchoolIdentities);
assert.equal(data.meta.counts.playersWithAnyHighSchool + data.meta.counts.playersMissingHighSchool, data.meta.counts.affiliatedPlayers);
assert.equal(data.meta.counts.mlbParticipants + data.meta.counts.minorOnlyPlayers, data.meta.counts.affiliatedPlayers);

assert.equal(universe.meta.snapshotDate, "2026-08-24");
assert.deepEqual(universe.meta.seasonRange, { start: 2000, end: 2026 });
assert.deepEqual(universe.meta.sportIds, expectedSportIds);
assert.deepEqual(universe.meta.participantFields, expectedParticipantFields);
assert.equal(universe.meta.participantCount, expectedCounts.affiliatedPlayers);
assert.equal(universe.participants.length, expectedCounts.affiliatedPlayers);
assert.equal(universe.meta.seasonSportCounts.length, 27 * expectedSportIds.length);
unique(universe.meta.seasonSportCounts.map((row) => `${row.season}|${row.sportId}`), "season/sport source row");
assert.deepEqual(
  universe.meta.seasonSportCounts.filter((row) => row.season === 2020).map((row) => [row.sportId, row.players]),
  [[1, 1289], [11, 0], [12, 0], [13, 0], [14, 0], [15, 0], [16, 0]],
);

assert.ok(universe.participants.every((row) => Array.isArray(row) && row.length === expectedParticipantFields.length), "universe rows must match the declared compact schema");
const universeParticipants = universe.participants.map((row) => Object.fromEntries(
  expectedParticipantFields.map((field, index) => [field, row[index]]),
));
unique(universeParticipants.map((player) => player.id), "universe player id");
const universeById = new Map();
for (const player of universeParticipants) {
  assert.ok(Number.isInteger(player.id) && player.id > 0, `invalid player id: ${player.id}`);
  assert.ok(player.name, `missing player name: ${player.id}`);
  sortedUnique(player.seasons, `seasons for ${player.id}`);
  sortedUnique(player.sportIds, `sport ids for ${player.id}`);
  assert.ok(player.seasons.every((season) => season >= 2000 && season <= 2026), `season outside scope: ${player.id}`);
  assert.ok(player.sportIds.every((sportId) => expectedSportIds.includes(sportId)), `sport outside scope: ${player.id}`);
  assert.equal(player.firstSeason, player.seasons[0], `first season mismatch: ${player.id}`);
  assert.equal(player.lastSeason, player.seasons.at(-1), `last season mismatch: ${player.id}`);
  assert.equal(player.appearedInMlb, player.sportIds.includes(1), `MLB flag mismatch: ${player.id}`);
  if (player.hasUsHighSchool) assert.equal(player.hasAnyHighSchool, true, `U.S. school without education: ${player.id}`);
  universeById.set(player.id, player);
}
assert.equal(universeParticipants.filter((player) => player.appearedInMlb).length, expectedCounts.mlbParticipants);
assert.equal(universeParticipants.filter((player) => !player.appearedInMlb).length, expectedCounts.minorOnlyPlayers);
assert.equal(universeParticipants.filter((player) => player.hasAnyHighSchool).length, expectedCounts.playersWithAnyHighSchool);
assert.equal(universeParticipants.filter((player) => player.hasUsHighSchool).length, expectedCounts.playersWithUsHighSchool);

const universeDigest = digestWithoutMetaSha(universe);
assert.equal(universe.meta.sha256, universeDigest, "embedded universe checksum must match content");
assert.equal(data.meta.universeSha256, universeDigest, "map must reference the exact audited universe");

unique(data.schools.map((school) => school.id), "school id");
assert.deepEqual(data.schools.slice(0, 5).map((school) => [school.id, school.playerCount]), [
  ["fl-img-academy-bradenton", 47],
  ["fl-american-heritage-plantation", 33],
  ["ca-rancho-bernardo-san-diego", 31],
  ["fl-jesuit-tampa", 30],
  ["fl-sarasota", 30],
]);

const levelBySportId = new Map([
  [1, "MLB"], [11, "Triple-A"], [12, "Double-A"], [13, "High-A"],
  [14, "Single-A"], [15, "Short-Season A"], [16, "Rookie"],
]);
let playerCredits = 0;
for (const [index, school] of data.schools.entries()) {
  assert.ok(school.id && school.name && school.state, `school identity incomplete: ${school.id}`);
  assert.equal(school.players.length, school.playerCount, `player count mismatch: ${school.id}`);
  unique(school.players.map((player) => player.id), `player id within ${school.id}`);
  assert.equal(school.firstSeason, Math.min(...school.players.map((player) => player.firstSeason)));
  assert.equal(school.latestSeason, Math.max(...school.players.map((player) => player.lastSeason)));
  for (const player of school.players) {
    const audited = universeById.get(player.id);
    assert.ok(audited, `school player absent from universe: ${player.id}`);
    assert.equal(audited.hasUsHighSchool, true, `school player lacks U.S. school flag: ${player.id}`);
    assert.equal(player.name, audited.name, `player name mismatch: ${player.id}`);
    assert.deepEqual(player.seasons, audited.seasons, `player seasons mismatch: ${player.id}`);
    assert.equal(player.firstSeason, audited.firstSeason, `player first season mismatch: ${player.id}`);
    assert.equal(player.lastSeason, audited.lastSeason, `player last season mismatch: ${player.id}`);
    assert.equal(player.reachedMlb, audited.appearedInMlb, `player MLB flag mismatch: ${player.id}`);
    assert.equal(player.highestLevel, levelBySportId.get(audited.sportIds[0]), `player level mismatch: ${player.id}`);
    assert.ok(player.mlbDebutDate === null || /^\d{4}-\d{2}-\d{2}$/.test(player.mlbDebutDate), `invalid MLB debut date: ${player.id}`);
  }
  if (index) {
    const previous = data.schools[index - 1];
    assert.ok(previous.playerCount > school.playerCount
      || (previous.playerCount === school.playerCount && previous.name.localeCompare(school.name) <= 0), "schools must be count/name sorted");
  }
  playerCredits += school.playerCount;
}
assert.equal(playerCredits, data.meta.counts.schoolPlayerCredits);

const stateByAbbr = new Map(states.features.map((feature) => [feature.properties.state_abbr, feature]));
const mapped = data.schools.filter((school) => school.latitude !== null || school.longitude !== null);
assert.equal(mapped.length, 25);
assert.ok(data.schools.every((school) => (school.playerCount >= 20) === (school.latitude !== null && school.longitude !== null)), "the audited 20+ threshold must exactly match the mapped set");
for (const school of mapped) {
  assert.ok(Number.isFinite(school.latitude) && Number.isFinite(school.longitude), `invalid coordinate: ${school.id}`);
  assert.ok(stateByAbbr.has(school.state), `missing state geometry: ${school.id}`);
  assert.ok(geoContains(stateByAbbr.get(school.state), [school.longitude, school.latitude]), `coordinate outside reported state: ${school.id}`);
  assert.ok(school.locationSource && school.locationSourceUrl?.startsWith("https://"), `missing location evidence: ${school.id}`);
}

assert.equal(leaders.schools.length, 25);
assert.deepEqual(leaders.meta.counts, expectedCounts);
assert.equal(leaders.meta.schoolUniverseSha256, data.meta.sha256, "client bundle must reference the full school-universe checksum");
assert.deepEqual(leaders.schools, mapped, "client bundle must contain the exact audited leader set");
assert.equal(leaders.meta.sha256, digestWithoutMetaSha(leaders), "embedded leader-bundle checksum must match content");

assert.equal(locations.minPlayers, 20);
assert.equal(locations.schools.length, 25);
unique(locations.schools.map((school) => school.id), "location id");
assert.ok(locations.schools.every((school) => school.precision === "campus"));
assert.deepEqual([...locations.schools.map((school) => school.id)].sort(), [...mapped.map((school) => school.id)].sort());
assert.ok(resolutions.rules.length > 0);
assert.ok(resolutions.rules.every((rule) => rule.canonical?.id && rule.canonical?.state));

for (const source of data.meta.sources) assert.match(source, /^https:\/\//);
for (const [label, passed] of Object.entries(audit.checks)) assert.equal(passed, true, `audit check failed: ${label}`);
assert.equal(audit.counts.affiliatedPlayers, expectedCounts.affiliatedPlayers);
assert.equal(audit.counts.locationAuditedPrograms, 25);
assert.equal(audit.counts.schoolIdentities, expectedCounts.usHighSchoolIdentities);

const dataDigest = digestWithoutMetaSha(data);
assert.equal(data.meta.sha256, dataDigest, "embedded high-school data checksum must match content");

process.stdout.write(`High-school data validation passed: 54,980 official participants, 7,048 U.S. school identities, 25 campus-audited leaders, sha256 ${dataDigest}\n`);
