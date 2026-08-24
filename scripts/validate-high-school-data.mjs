import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { geoContains } from "d3-geo";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const unique = (values, label) => assert.equal(new Set(values).size, values.length, `${label} must be unique`);

const [data, states, locations, resolutions, audit] = await Promise.all([
  readJson("public/data/mlb-high-school-map.json"),
  readJson("public/data/us-states-2020-simplified.geojson"),
  readJson("data/high-school-locations.json"),
  readJson("data/high-school-resolutions.json"),
  readJson("reports/high-school-data-quality.json"),
]);

assert.equal(data.meta.snapshotDate, "2026-08-24");
assert.equal(data.meta.startDate, "2000-01-01");
assert.equal(data.meta.counts.mlbPlayers, 6_225);
assert.equal(data.meta.counts.playersWithAnyHighSchool, 4_472);
assert.equal(data.meta.counts.playersWithUsHighSchool, 3_979);
assert.equal(data.meta.counts.playersMissingHighSchool, 1_753);
assert.equal(data.meta.counts.outsideScopeCredits, 493);
assert.equal(data.meta.counts.usHighSchoolIdentities, 2_656);
assert.equal(data.meta.counts.locatedHighSchools, 76);
assert.equal(data.meta.counts.locatedPlayers, 463);
assert.equal(data.schools.length, 2_656);
assert.equal(data.meta.counts.playersWithAnyHighSchool + data.meta.counts.playersMissingHighSchool, data.meta.counts.mlbPlayers);
assert.equal(data.meta.counts.playersWithUsHighSchool + data.meta.counts.outsideScopeCredits, data.meta.counts.playersWithAnyHighSchool);

unique(data.schools.map((school) => school.id), "school id");
assert.deepEqual(data.schools.slice(0, 3).map((school) => [school.id, school.playerCount]), [
  ["nv-bishop-gorman-las-vegas", 12],
  ["ca-rancho-bernardo-san-diego", 10],
  ["ca-william-s-hart", 10],
]);

let playerCredits = 0;
for (const [index, school] of data.schools.entries()) {
  assert.ok(school.id && school.name && school.state, `school identity incomplete: ${school.id}`);
  assert.equal(school.players.length, school.playerCount, `player count mismatch: ${school.id}`);
  unique(school.players.map((player) => player.id), `player id within ${school.id}`);
  assert.equal(school.firstDebutYear, Math.min(...school.players.map((player) => player.debutYear)));
  assert.equal(school.latestDebutYear, Math.max(...school.players.map((player) => player.debutYear)));
  assert.ok(school.players.every((player) => player.debutDate >= "2000-01-01" && player.debutDate <= "2026-08-24"));
  if (index) assert.ok(data.schools[index - 1].playerCount >= school.playerCount, "schools must be count-sorted");
  playerCredits += school.playerCount;
}
assert.equal(playerCredits, data.meta.counts.schoolPlayerCredits);

const stateByAbbr = new Map(states.features.map((feature) => [feature.properties.state_abbr, feature]));
const mapped = data.schools.filter((school) => school.latitude !== null || school.longitude !== null);
assert.equal(mapped.length, 76);
assert.ok(data.schools.every((school) => (school.playerCount >= 5) === (school.latitude !== null && school.longitude !== null)), "the audited 5+ threshold must exactly match the mapped set");
for (const school of mapped) {
  assert.ok(Number.isFinite(school.latitude) && Number.isFinite(school.longitude), `invalid coordinate: ${school.id}`);
  assert.ok(stateByAbbr.has(school.state), `missing state geometry: ${school.id}`);
  assert.ok(geoContains(stateByAbbr.get(school.state), [school.longitude, school.latitude]), `coordinate outside reported state: ${school.id}`);
  assert.ok(school.locationSource && school.locationSourceUrl?.startsWith("https://"), `missing location evidence: ${school.id}`);
}

assert.equal(locations.schools.length, 76);
unique(locations.schools.map((school) => school.id), "location id");
assert.ok(locations.schools.every((school) => school.precision === "campus"));
assert.deepEqual(
  [...locations.schools.map((school) => school.id)].sort(),
  [...mapped.map((school) => school.id)].sort(),
);
assert.ok(resolutions.rules.length > 0);
assert.ok(resolutions.rules.every((rule) => rule.canonical?.id && rule.canonical?.state));

for (const source of data.meta.sources) assert.match(source, /^https:\/\//);
for (const [label, passed] of Object.entries(audit.checks)) assert.equal(passed, true, `audit check failed: ${label}`);
assert.equal(audit.counts.locationAuditedPrograms, 76);
assert.equal(audit.counts.schoolIdentities, 2_656);

const unsigned = structuredClone(data);
delete unsigned.meta.sha256;
const digest = createHash("sha256").update(`${JSON.stringify(unsigned, null, 2)}\n`).digest("hex");
assert.equal(data.meta.sha256, digest, "embedded high-school data checksum must match content");

process.stdout.write(`High-school data validation passed: 6,225 MLB debuts, 2,656 school identities, 76 campus-audited leaders, sha256 ${digest}\n`);
