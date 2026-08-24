import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_COLLEGE_FILTERS,
  collegeFiltersToQuery,
  countCollegePlayers,
  formatCollegeSeasons,
  parseCollegeFilters,
  rankColleges,
} from "../app/mlb-college-map/model.ts";

const players = [
  { id: 1, name: "A", firstSeason: 2001, lastSeason: 2002, seasons: [2001, 2002], reachedMlb: true, highestLevel: "MLB", mlbDebutDate: "2001-04-01", position: "P", positionGroup: "Pitcher", collegeSources: ["mlbEducation"] },
  { id: 2, name: "B", firstSeason: 2024, lastSeason: 2026, seasons: [2024, 2026], reachedMlb: false, highestLevel: "Triple-A", mlbDebutDate: null, position: "SS", positionGroup: "Infielder", collegeSources: ["mlbDraft"] },
];
const colleges = [
  { id: "one", name: "One University", city: "Austin", state: "TX", country: "USA", latitude: 30, longitude: -97, locationPrecision: "campus", locationSource: "OSM", locationSourceUrl: "https://example.com", reportedNames: ["One"], players, playerCount: 2, reachedMlbCount: 1, firstSeason: 2001, latestSeason: 2026 },
  { id: "two", name: "Two College", city: "Miami", state: "FL", country: "USA", latitude: 26, longitude: -80, locationPrecision: "campus", locationSource: "OSM", locationSourceUrl: "https://example.com", reportedNames: ["Two"], players: [players[0]], playerCount: 1, reachedMlbCount: 1, firstSeason: 2001, latestSeason: 2002 },
];

test("college season ranges retain gaps", () => {
  assert.equal(formatCollegeSeasons([2001, 2002, 2004, 2006, 2007]), "2001–2002, 2004, 2006–2007");
});

test("college ranking applies era, state, position, and search filters", () => {
  assert.deepEqual(rankColleges(colleges, { ...DEFAULT_COLLEGE_FILTERS, era: "2020s" }).map((row) => [row.id, row.filteredCount]), [["one", 1]]);
  assert.deepEqual(rankColleges(colleges, { ...DEFAULT_COLLEGE_FILTERS, state: "FL", positionGroup: "Pitcher", query: "miami" }).map((row) => row.id), ["two"]);
});

test("unique college players are not added across transfer credits", () => {
  assert.equal(countCollegePlayers(rankColleges(colleges, DEFAULT_COLLEGE_FILTERS)), 2);
});

test("college URL filters round trip and invalid values reset", () => {
  const filters = parseCollegeFilters("?era=2020s&state=TX&position=Infielder&q=one&college=one", colleges);
  assert.equal(collegeFiltersToQuery(filters).toString(), "era=2020s&state=TX&position=Infielder&q=one&college=one");
  assert.deepEqual(parseCollegeFilters("?era=1990s&state=ZZ&position=Quarterback&college=missing", colleges), DEFAULT_COLLEGE_FILTERS);
});
