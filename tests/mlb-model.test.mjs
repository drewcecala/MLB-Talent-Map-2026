import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FILTERS,
  RATE_MIN_COUNT,
  buildCountyStats,
  buildCountryStats,
  filterPlayers,
  filtersToQuery,
  parseFiltersFromSearch,
} from "../app/mlb-talent-map/model.ts";

const players = [
  {
    id: "1",
    organizationId: 100,
    organization: "Alpha Club",
    currentTeamId: 100,
    currentParentOrgId: 100,
    affiliate: "Alpha Club",
    level: "MLB",
    rosterStatus: "Active",
    statusGroup: "Active",
    position: "P",
    positionGroup: "Pitcher",
    birthCountry: "USA",
    countyFips: "01001",
    geographyBasis: "federal_place_county",
    matchMethod: "gnis_official_unique",
  },
  {
    id: "2",
    organizationId: 200,
    organization: "Beta Club",
    currentTeamId: 201,
    currentParentOrgId: 200,
    affiliate: "Beta Rookie",
    level: "Rookie",
    rosterStatus: "Active",
    statusGroup: "Active",
    position: "SS",
    positionGroup: "Infielder",
    birthCountry: "Dominican Republic",
    countyFips: null,
    geographyBasis: "outside_us_map",
    matchMethod: null,
  },
];

test("filters select roster levels and international countries", () => {
  const selected = filterPlayers(players, {
    ...DEFAULT_FILTERS,
    level: "Rookie",
    country: "Dominican Republic",
  });
  assert.deepEqual(selected.map((player) => player.id), ["2"]);
});

test("URL state rejects invalid options and round-trips valid options", () => {
  const parsed = parseFiltersFromSearch(
    "?level=garbage&organization=Alpha+Club&metric=mlb&active=1",
    players,
  );
  assert.equal(parsed.level, "all");
  assert.equal(parsed.organization, "Alpha Club");
  assert.equal(parsed.metric, "mlb");
  assert.equal(parsed.activeOnly, true);
  assert.equal(filtersToQuery(parsed).get("organization"), "Alpha Club");

  const world = parseFiltersFromSearch("?view=countries&metric=per_capita", players);
  assert.equal(world.view, "countries");
  assert.equal(world.metric, "total");
  assert.equal(filtersToQuery(world).get("view"), "countries");
});

test("country aggregation assigns international players to reported birth countries", () => {
  const countries = buildCountryStats(players);
  assert.deepEqual(countries.map((country) => country.country).sort(), ["Dominican Republic", "USA"]);
  const dominicanRepublic = countries.find((country) => country.country === "Dominican Republic");
  assert.equal(dominicanRepublic.total, 1);
  assert.equal(dominicanRepublic.mlb, 0);
  assert.equal(dominicanRepublic.mostCommonPosition, "Infielder");
});

test("county aggregation separates total, MLB-level, and pitcher counts", () => {
  const counties = [{
    fips: "01001",
    name: "Autauga County",
    state: "Alabama",
    stateAbbr: "AL",
    population: 58_805,
  }];
  const rows = Array.from({ length: RATE_MIN_COUNT }, (_, index) => ({
    ...players[0],
    id: String(index + 10),
    level: index ? "Triple-A" : "MLB",
    positionGroup: index % 2 ? "Infielder" : "Pitcher",
  }));
  const [county] = buildCountyStats(counties, rows);
  assert.equal(county.total, RATE_MIN_COUNT);
  assert.equal(county.mlb, 1);
  assert.equal(county.pitcher, 5);
  assert.equal(county.rateEligible, true);
  assert.ok(county.perCapita > 0);
});
