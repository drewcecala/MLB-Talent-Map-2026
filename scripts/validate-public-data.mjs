import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));

function unique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}

const [data, countyGeo, stateGeo, worldGeo, countyReference, quality, worldQuality] = await Promise.all([
  readJson("public/data/mlb-talent-map.json"),
  readJson("public/data/us-counties-2020-simplified.geojson"),
  readJson("public/data/us-states-2020-simplified.geojson"),
  readJson("public/data/world-countries-50m.geojson"),
  readJson("public/data/county-reference-2020.json"),
  readJson("reports/data-quality.json"),
  readJson("reports/world-geometry-audit.json"),
]);

assert.deepEqual(Object.keys(data).sort(), ["counties", "meta", "players", "summaries"]);
assert.equal(data.meta.snapshotDate, "2026-08-24");
assert.equal(data.players.length, 8_440);
assert.equal(data.counties.length, 3_143);
assert.equal(countyGeo.features.length, 3_143);
assert.equal(stateGeo.features.length, 51);
assert.equal(worldGeo.features.length, 242);
assert.equal(worldGeo.metadata.version, "5.1.1");
assert.equal(countyReference.county_count, 3_143);

unique(data.players.map((row) => row.id), "MLB person id");
unique(data.counties.map((row) => row.fips), "county FIPS");

const countyFips = new Set(data.counties.map((row) => row.fips));
const geographyValues = new Set([
  "federal_place_county",
  "outside_us_map",
  "ambiguous_place",
  "unresolved",
]);
const levelValues = new Set([
  "MLB", "Triple-A", "Double-A", "High-A", "Single-A", "Rookie", "Unassigned / unknown",
]);

for (const row of data.players) {
  assert.match(row.id, /^\d+$/);
  assert.ok(row.organizationId > 0, `invalid organization: ${row.id}`);
  assert.ok(levelValues.has(row.level), `invalid level: ${row.id}`);
  assert.ok(geographyValues.has(row.geographyBasis), `invalid geography: ${row.id}`);
  assert.equal(row.countyFips !== null, row.geographyBasis === "federal_place_county");
  if (row.countyFips) {
    assert.match(row.countyFips, /^\d{5}$/);
    assert.ok(countyFips.has(row.countyFips), `unknown county: ${row.id}`);
  }
  for (const forbidden of ["fullName", "name", "birthCity", "birthStateProvince"]) {
    assert.ok(!(forbidden in row), `public row exposes ${forbidden}`);
  }
}

for (const county of data.counties) {
  assert.match(county.fips, /^\d{5}$/);
  assert.ok(county.population > 0, `invalid population: ${county.fips}`);
}

const geoFips = countyGeo.features.map((feature) => String(feature.id));
unique(geoFips, "county geometry FIPS");
assert.deepEqual([...geoFips].sort(), [...countyFips].sort());

const basisCounts = Object.fromEntries(
  [...geographyValues].map((basis) => [
    basis,
    data.players.filter((row) => row.geographyBasis === basis).length,
  ]),
);
assert.deepEqual(basisCounts, {
  federal_place_county: 3_912,
  outside_us_map: 4_159,
  ambiguous_place: 325,
  unresolved: 44,
});

assert.equal(data.meta.totalPlayers, 8_440);
assert.equal(data.meta.usBirthPlayers, 4_280);
assert.equal(data.meta.mappedUsPlayers, 3_912);
assert.equal(data.meta.unresolvedUsPlayers, 368);
assert.equal(data.meta.outsideUsMapPlayers, 4_159);
assert.equal(data.summaries.organizations.length, 30);
assert.equal(data.summaries.levels.reduce((sum, row) => sum + row.count, 0), 8_440);
assert.ok(data.summaries.countries.every((row) =>
  !["DOM", "VEN", "CUB", "MEX", "PAN", "COL", "PUR"].includes(row.country),
));

const knownRosterCountries = data.summaries.countries
  .map((row) => row.country)
  .filter((country) => country !== "Unknown");
const mappedBirthCountries = new Set(
  worldGeo.features.map((feature) => feature.properties.birthCountry).filter(Boolean),
);
assert.equal(knownRosterCountries.length, 43);
assert.ok(knownRosterCountries.every((country) => mappedBirthCountries.has(country)));
assert.equal(
  data.players.filter((row) => mappedBirthCountries.has(row.birthCountry)).length,
  8_439,
);
for (const [label, passed] of Object.entries(worldQuality.checks)) {
  assert.equal(passed, true, `world geometry check failed: ${label}`);
}

assert.equal(quality.unresolvedDuplicateAssignments, 0);
for (const [label, check] of Object.entries(quality.checks)) {
  assert.equal(check.pass, true, `quality check failed: ${label}`);
}

for (const source of data.meta.sources) {
  assert.ok(source.label.trim());
  assert.match(source.url, /^https:\/\//);
}

const digest = createHash("sha256")
  .update(await readFile(new URL("public/data/mlb-talent-map.json", root)))
  .digest("hex");
process.stdout.write(
  `Public data validation passed: 8,440 rostered players, 3,143 counties, 43 birth-country geometries, sha256 ${digest}\n`,
);
