import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_HIGH_SCHOOL_FILTERS,
  countUniquePlayers,
  highSchoolFiltersToQuery,
  parseHighSchoolFilters,
  rankHighSchools,
} from "../app/mlb-high-school-map/model.ts";

const schools = [
  {
    id: "nv-alpha-las-vegas",
    name: "Alpha",
    city: "Las Vegas",
    state: "NV",
    latitude: 36.1,
    longitude: -115.2,
    locationPrecision: "campus",
    locationSource: "Test",
    locationSourceUrl: "https://example.com/alpha",
    identityBasis: "mlb_reported_city",
    reportedNames: ["Alpha"],
    reportedCities: ["Las Vegas"],
    playerCount: 3,
    firstDebutYear: 2003,
    latestDebutYear: 2022,
    players: [
      { id: 1, name: "One", debutDate: "2003-04-01", debutYear: 2003, position: "P", positionGroup: "Pitcher" },
      { id: 2, name: "Two", debutDate: "2015-04-01", debutYear: 2015, position: "SS", positionGroup: "Infielder" },
      { id: 3, name: "Three", debutDate: "2022-04-01", debutYear: 2022, position: "P", positionGroup: "Pitcher" },
    ],
  },
  {
    id: "ca-beta-san-diego",
    name: "Beta",
    city: "San Diego",
    state: "CA",
    latitude: 32.8,
    longitude: -117.1,
    locationPrecision: "campus",
    locationSource: "Test",
    locationSourceUrl: "https://example.com/beta",
    identityBasis: "mlb_reported_city",
    reportedNames: ["Beta"],
    reportedCities: ["San Diego"],
    playerCount: 2,
    firstDebutYear: 2015,
    latestDebutYear: 2024,
    players: [
      { id: 2, name: "Two", debutDate: "2015-04-01", debutYear: 2015, position: "SS", positionGroup: "Infielder" },
      { id: 4, name: "Four", debutDate: "2024-04-01", debutYear: 2024, position: "C", positionGroup: "Catcher" },
    ],
  },
];

test("school rankings filter by debut era and preserve distinct-player counts", () => {
  const ranked = rankHighSchools(schools, { ...DEFAULT_HIGH_SCHOOL_FILTERS, era: "2010s" });
  assert.deepEqual(ranked.map((school) => [school.id, school.filteredCount]), [
    ["nv-alpha-las-vegas", 1],
    ["ca-beta-san-diego", 1],
  ]);
  assert.equal(countUniquePlayers(ranked), 1);
});

test("state, position, and text filters are applied together", () => {
  const ranked = rankHighSchools(schools, {
    ...DEFAULT_HIGH_SCHOOL_FILTERS,
    state: "NV",
    positionGroup: "Pitcher",
    query: "vegas",
  });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].filteredCount, 2);
});

test("URL state rejects invalid values and round-trips valid values", () => {
  const parsed = parseHighSchoolFilters("?era=2020s&state=CA&position=Catcher&school=ca-beta-san-diego", schools);
  assert.equal(parsed.era, "2020s");
  assert.equal(parsed.state, "CA");
  assert.equal(parsed.positionGroup, "Catcher");
  assert.equal(parsed.school, "ca-beta-san-diego");
  assert.equal(highSchoolFiltersToQuery(parsed).get("school"), "ca-beta-san-diego");

  const invalid = parseHighSchoolFilters("?era=1990s&state=ZZ&school=missing", schools);
  assert.equal(invalid.era, "all");
  assert.equal(invalid.state, "all");
  assert.equal(invalid.school, "");
});
