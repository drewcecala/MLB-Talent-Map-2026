import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { geoContains } from "d3-geo";

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
const [full, leaders, universe, locations, resolutions, states, quality] = await Promise.all([
  readJson("data/mlb-college-map-audit.json"),
  readJson("public/data/mlb-college-leaders.json"),
  readJson("data/mlb-affiliated-universe-audit.json"),
  readJson("data/college-locations.json"),
  readJson("data/college-resolutions.json"),
  readJson("public/data/us-states-2020-simplified.geojson"),
  readJson("reports/college-data-quality.json"),
]);

function checksum(payload) {
  const value = structuredClone(payload);
  delete value.meta.sha256;
  delete value.meta.generatedAt;
  return createHash("sha256").update(`${JSON.stringify(value)}\n`).digest("hex");
}

assert.equal(full.meta.snapshotDate, "2026-08-24");
assert.deepEqual(full.meta.seasonRange, { start: 2000, end: 2026 });
assert.equal(full.meta.careerStartCutoff, 2000);
assert.equal(full.meta.counts.affiliatedPlayers, 49_771);
assert.equal(full.meta.counts.mlbParticipants, 5_372);
assert.equal(full.meta.counts.minorOnlyPlayers, 44_399);
assert.equal(full.meta.counts.playersWithMlbEducationCollege, 21_513);
assert.equal(full.meta.counts.minimumPublicationCoverage, 0.9);
assert.equal(full.meta.counts.requiredResolvedPlayers, 44_794);
assert.equal(full.meta.counts.playersWithVerifiedCollege, 17_210);
assert.equal(full.meta.counts.playersWithDocumentedNoCollege, 3_640);
assert.equal(full.meta.counts.playersWithUnresolvedEducation, 28_921);
assert.equal(full.meta.counts.resolvedSigningSchoolPlayers, 20_850);
assert.equal(full.meta.counts.resolutionCoverageRate, 20_850 / 49_771);
assert.equal(
  full.meta.counts.playersWithVerifiedCollege
    + full.meta.counts.playersWithDocumentedNoCollege
    + full.meta.counts.playersWithUnresolvedEducation,
  full.meta.counts.affiliatedPlayers,
);
assert.equal(full.meta.publicationReady, false);
assert.ok(full.meta.counts.resolutionCoverageRate < full.meta.counts.minimumPublicationCoverage);
assert.equal(full.meta.sha256, checksum(full));
assert.equal(leaders.meta.sha256, checksum(leaders));
assert.equal(leaders.meta.collegeUniverseSha256, full.meta.sha256);
assert.equal(leaders.meta.publicationReady, false);
assert.deepEqual(leaders.colleges, [], "public rankings must be empty until the 90% evidence gate passes");
assert.deepEqual(quality.counts, full.meta.counts);
assert.deepEqual(quality.sourceFiles, full.meta.sourceFiles);
assert.deepEqual(quality.publicationGate, {
  ready: false,
  minimumCoverage: 0.9,
  actualCoverage: 20_850 / 49_771,
  requiredResolvedPlayers: 44_794,
  resolvedPlayers: 20_850,
});

const universeIds = new Set(universe.participants.map((row) => row[0]));
assert.equal(universeIds.size, 49_771);
assert.equal(universeIds.has(111188), false, "Barry Bonds began before 2000 and must be excluded");
assert.ok(universe.participants.every((row) => row[2] >= 2000), "every included career must begin in 2000 or later");

const resolutionIds = resolutions.rules.map((rule) => rule.canonical.id);
assert.equal(new Set(resolutionIds).size, resolutionIds.length, "canonical college IDs must be unique");
const aliases = resolutions.rules.flatMap((rule) => rule.aliases.map((alias) => alias.toLocaleLowerCase()));
assert.equal(new Set(aliases).size, aliases.length, "college aliases must resolve to one identity");

const creditedPlayerIds = [];
let credits = 0;
for (const [index, college] of full.colleges.entries()) {
  assert.ok(college.id && college.name && college.playerCount > 0);
  assert.equal(college.playerCount, college.players.length);
  assert.equal(new Set(college.players.map((player) => player.id)).size, college.players.length,
    `duplicate player credit at ${college.name}`);
  assert.equal(college.reachedMlbCount, college.players.filter((player) => player.reachedMlb).length);
  if (index) {
    const previous = full.colleges[index - 1];
    assert.ok(previous.playerCount > college.playerCount
      || (previous.playerCount === college.playerCount && previous.name.localeCompare(college.name) <= 0),
    "colleges must be sorted by player count then name");
  }
  for (const player of college.players) {
    assert.ok(universeIds.has(player.id), `college player absent from eligible universe: ${player.id}`);
    assert.ok(player.firstSeason >= 2000, `pre-2000 career credited: ${player.id}`);
    assert.ok(["signedDraftCollege", "datedLahmanCollege"].includes(player.collegeSelectionBasis));
    assert.ok(player.collegeEvidence.length > 0, `missing school evidence: ${player.id}`);
    if (player.collegeSelectionBasis === "signedDraftCollege") {
      assert.ok(player.collegeEvidence.some((row) => row.source === "mlbDraft" && Number.isInteger(row.draftYear)),
        `signing-draft selection lacks dated draft evidence: ${player.id}`);
    }
    if (player.professionalSigning) {
      assert.match(player.professionalSigning.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(player.professionalSigning.sourceUrl, /^https:\/\/statsapi\.mlb\.com\/api\/v1\/people\/\d+\?hydrate=transactions$/);
    }
    creditedPlayerIds.push(player.id);
  }
  credits += college.playerCount;
}
assert.equal(new Set(creditedPlayerIds).size, creditedPlayerIds.length,
  "a player may credit only one last school before signing");
assert.equal(credits, full.meta.counts.playersWithVerifiedCollege);
assert.equal(credits, full.meta.counts.verifiedCollegePlayerCredits);
assert.equal(creditedPlayerIds.includes(111188), false);

const stateByAbbr = new Map(states.features.map((feature) => [feature.properties.state_abbr, feature]));
for (const location of locations.colleges) {
  const college = full.colleges.find((row) => row.id === location.id);
  assert.ok(college, `location registry college absent from audit: ${location.id}`);
  assert.ok(Number.isFinite(location.latitude) && Number.isFinite(location.longitude));
  assert.ok(stateByAbbr.has(location.state));
  assert.ok(geoContains(stateByAbbr.get(location.state), [location.longitude, location.latitude]),
    `campus coordinates outside ${location.state}: ${location.id}`);
  assert.match(location.sourceUrl, /^https:\/\/www\.openstreetmap\.org\/(relation|way)\/\d+$/);
}

for (const source of Object.values(full.meta.sourceFiles)) assert.match(source.sha256, /^[a-f0-9]{64}$/);

process.stdout.write(`Validated college audit: ${credits.toLocaleString()} one-school credits; ${(full.meta.counts.resolutionCoverageRate * 100).toFixed(1)}% signing-school status coverage; public ranking withheld below 90%.\n`);
