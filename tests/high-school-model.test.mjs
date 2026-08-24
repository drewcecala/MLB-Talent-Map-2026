import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_HIGH_SCHOOL_FILTERS,
  countUniquePlayers,
  formatSeasons,
  highSchoolFiltersToQuery,
  parseHighSchoolFilters,
  playerMatchesEra,
  rankHighSchools,
} from "../app/mlb-high-school-map/model.ts";

const player = (id, name, seasons, position, positionGroup, reachedMlb = false) => ({
  id,
  name,
  firstSeason: seasons[0],
  lastSeason: seasons.at(-1),
  seasons,
  reachedMlb,
  highestLevel: reachedMlb ? "MLB" : "Triple-A",
  mlbDebutDate: reachedMlb ? `${seasons[0]}-04-01` : null,
  position,
  positionGroup,
});

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
    firstSeason: 2003,
    latestSeason: 2022,
    players: [
      player(1, "One", [2003, 2004], "P", "Pitcher"),
      player(2, "Two", [2015, 2020], "SS", "Infielder", true),
      player(3, "Three", [2022], "P", "Pitcher"),
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
    firstSeason: 2015,
    latestSeason: 2024,
    players: [
      player(2, "Two", [2015, 2020], "SS", "Infielder", true),
      player(4, "Four", [2024], "C", "Catcher"),
    ],
  },
];

test("school rankings filter by exact participation seasons and preserve distinct-player counts", () => {
  const ranked = rankHighSchools(schools, { ...DEFAULT_HIGH_SCHOOL_FILTERS, era: "2010s" });
  assert.deepEqual(ranked.map((school) => [school.id, school.filteredCount]), [
    ["nv-alpha-las-vegas", 1],
    ["ca-beta-san-diego", 1],
  ]);
  assert.equal(countUniquePlayers(ranked), 1);
});

test("era matching does not infer participation during a gap", () => {
  const gapPlayer = player(5, "Gap", [2005, 2022], "P", "Pitcher");
  assert.equal(playerMatchesEra(gapPlayer, "2000s"), true);
  assert.equal(playerMatchesEra(gapPlayer, "2010s"), false);
  assert.equal(playerMatchesEra(gapPlayer, "2020s"), true);
});

test("season evidence preserves and compresses only consecutive years", () => {
  assert.equal(formatSeasons([2005, 2006, 2008, 2022, 2023]), "2005–2006, 2008, 2022–2023");
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
