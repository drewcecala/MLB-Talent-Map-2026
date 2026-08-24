import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { geoContains } from "d3-geo";

const full = JSON.parse(await readFile(new URL("../data/mlb-college-map-audit.json", import.meta.url), "utf8"));
const leaders = JSON.parse(await readFile(new URL("../public/data/mlb-college-leaders.json", import.meta.url), "utf8"));
const locations = JSON.parse(await readFile(new URL("../data/college-locations.json", import.meta.url), "utf8"));
const resolutions = JSON.parse(await readFile(new URL("../data/college-resolutions.json", import.meta.url), "utf8"));
const states = JSON.parse(await readFile(new URL("../public/data/us-states-2020-simplified.geojson", import.meta.url), "utf8"));
const qualityReport = JSON.parse(await readFile(new URL("../reports/college-data-quality.json", import.meta.url), "utf8"));

function checksum(payload) {
  const value = structuredClone(payload);
  delete value.meta.sha256;
  delete value.meta.generatedAt;
  return createHash("sha256").update(`${JSON.stringify(value)}\n`).digest("hex");
}

assert.equal(full.meta.snapshotDate, "2026-08-24");
assert.deepEqual(full.meta.seasonRange, { start: 2000, end: 2026 });
assert.equal(full.meta.counts.affiliatedPlayers, 54_980);
assert.equal(full.meta.counts.mlbParticipants, 7_380);
assert.equal(full.meta.counts.minorOnlyPlayers, 47_600);
assert.equal(full.meta.counts.playersWithMlbEducationCollege, 23_895);
assert.ok(full.meta.counts.playersAddedByMlbDraft > 750);
assert.ok(full.meta.counts.playersAddedBySabrLahman > 0);
assert.equal(full.meta.counts.playersWithVerifiedCollege + full.meta.counts.playersWithoutVerifiedCollege, 54_980);
assert.equal(full.meta.sha256, checksum(full));
assert.equal(leaders.meta.sha256, checksum(leaders));
assert.equal(leaders.meta.collegeUniverseSha256, full.meta.sha256);
assert.deepEqual(qualityReport.counts, full.meta.counts);
assert.deepEqual(qualityReport.sourceFiles, full.meta.sourceFiles);

assert.equal(full.colleges.length, full.meta.counts.collegeIdentities);
assert.equal(leaders.colleges.length, full.meta.counts.locatedColleges);
assert.equal(leaders.colleges.length, 26, "the location-audited leader set must include the full boundary tie");
assert.equal(locations.colleges.length, leaders.colleges.length);

const resolutionIds = resolutions.rules.map((rule) => rule.canonical.id);
assert.equal(new Set(resolutionIds).size, resolutionIds.length, "canonical college IDs must be unique");
const aliases = resolutions.rules.flatMap((rule) => rule.aliases.map((alias) => alias.toLocaleLowerCase()));
assert.equal(new Set(aliases).size, aliases.length, "college aliases must resolve to one identity");

const allPlayerIds = new Set();
const primaryPlayerIds = new Set();
const draftSupplementIds = new Set();
const lahmanOnlySupplementIds = new Set();
let credits = 0;
for (const college of full.colleges) {
  assert.ok(college.id && college.name && college.playerCount > 0);
  assert.equal(college.playerCount, college.players.length);
  assert.equal(new Set(college.players.map((player) => player.id)).size, college.players.length,
    `duplicate player credit at ${college.name}`);
  assert.equal(college.reachedMlbCount, college.players.filter((player) => player.reachedMlb).length);
  credits += college.playerCount;
  for (const player of college.players) {
    allPlayerIds.add(player.id);
    if (player.collegeSources.includes("mlbEducation")) primaryPlayerIds.add(player.id);
  }
}

const sourcesByPlayer = new Map();
for (const college of full.colleges) {
  for (const player of college.players) {
    const set = sourcesByPlayer.get(player.id) ?? new Set();
    for (const source of player.collegeSources) set.add(source);
    sourcesByPlayer.set(player.id, set);
  }
}
for (const [playerId, sources] of sourcesByPlayer) {
  if (!sources.has("mlbEducation") && sources.has("mlbDraft")) draftSupplementIds.add(playerId);
  if (!sources.has("mlbEducation") && !sources.has("mlbDraft") && sources.has("sabrLahman")) lahmanOnlySupplementIds.add(playerId);
}
assert.equal(primaryPlayerIds.size, full.meta.counts.playersWithMlbEducationCollege);
assert.equal(draftSupplementIds.size, full.meta.counts.playersAddedByMlbDraft);
assert.equal(lahmanOnlySupplementIds.size, full.meta.counts.playersAddedBySabrLahman);
assert.equal(allPlayerIds.size, full.meta.counts.playersWithVerifiedCollege);
assert.equal(credits, full.meta.counts.verifiedCollegePlayerCredits);

const fullById = new Map(full.colleges.map((college) => [college.id, college]));
for (const college of leaders.colleges) {
  const fullCollege = fullById.get(college.id);
  assert.ok(fullCollege, `leader missing from full data: ${college.id}`);
  assert.equal(college.playerCount, fullCollege.playerCount);
  assert.ok(Number.isFinite(college.latitude) && college.latitude >= 24 && college.latitude <= 50);
  assert.ok(Number.isFinite(college.longitude) && college.longitude >= -125 && college.longitude <= -66);
  const state = states.features.find((feature) => feature.properties.state_abbr === college.state);
  assert.ok(state, `unknown state for ${college.name}: ${college.state}`);
  assert.ok(geoContains(state, [college.longitude, college.latitude]),
    `campus coordinates fall outside ${college.state}: ${college.name}`);
  assert.match(college.locationSourceUrl, /^https:\/\/www\.openstreetmap\.org\/(relation|way)\/\d+$/);
  assert.ok(college.players.every((player) => !Object.hasOwn(player, "collegeEvidence")),
    "leader bundle must omit bulky record-level evidence objects");
}

const ordered = [...full.colleges].sort((a, b) => b.playerCount - a.playerCount || a.name.localeCompare(b.name));
assert.deepEqual(full.colleges.map((college) => college.id), ordered.map((college) => college.id));
assert.equal(leaders.colleges.at(-1).playerCount, 155);
assert.equal(full.colleges.filter((college) => college.playerCount >= 155).length, 26);
assert.equal(full.colleges.filter((college) => college.playerCount === 155).length, 4);
assert.ok(full.colleges.find((college) => college.id === "college-louisiana-state")?.reportedNames.includes("LSU"));
assert.ok(full.colleges.find((college) => college.id === "college-southern-california")?.reportedNames.includes("USC"));
assert.ok(full.colleges.find((college) => college.id === "college-miami-fl")?.reportedNames.includes("Miami (FL)"));

for (const source of Object.values(full.meta.sourceFiles)) {
  assert.match(source.sha256, /^[a-f0-9]{64}$/);
}

process.stdout.write(`Validated college data: ${allPlayerIds.size.toLocaleString()} verified players, ${credits.toLocaleString()} college credits, ${leaders.colleges.length} mapped leaders.\n`);
