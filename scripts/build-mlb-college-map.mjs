import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const SNAPSHOT_DATE = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const START_YEAR = 2000;
const END_YEAR = Number(SNAPSHOT_DATE.slice(0, 4));
const MLB_API = "https://statsapi.mlb.com/api/v1";
const DRAFT_START_YEAR = 1965;
const SABR_SHARE_URL = "https://sabr.app.box.com/s/y1prhc795jk8zvmelfd3jq7tl389y6cd";
const SABR_FILES = {
  collegePlaying: {
    id: "2084273807945",
    name: "CollegePlaying.csv",
    minimumBytes: 400000,
  },
  schools: {
    id: "2084271352651",
    name: "Schools.csv",
    minimumBytes: 60000,
  },
};
const CHADWICK_BASE = "https://raw.githubusercontent.com/chadwickbureau/register/master/data";
const RAW_DIR = new URL("../data/raw/", import.meta.url);
const PROCESSED_DIR = new URL("../data/processed/", import.meta.url);
const PEOPLE_FILE = new URL(`mlb-high-school-people-${SNAPSHOT_DATE}.json`, RAW_DIR);
const UNIVERSE_FILE = new URL("../data/mlb-affiliated-universe-audit.json", import.meta.url);
const RESOLUTION_FILE = new URL("../data/college-resolutions.json", import.meta.url);
const LOCATION_FILE = new URL("../data/college-locations.json", import.meta.url);
const DRAFT_FILE = new URL(`mlb-draft-${DRAFT_START_YEAR}-${END_YEAR}-${SNAPSHOT_DATE}.json`, RAW_DIR);
const AUDIT_FILE = new URL("../data/mlb-college-map-audit.json", import.meta.url);
const LEADER_FILE = new URL("../public/data/mlb-college-leaders.json", import.meta.url);
const QUALITY_REPORT_FILE = new URL("../reports/college-data-quality.json", import.meta.url);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function slug(value) {
  return normalize(value).replaceAll(" ", "-");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const headers = rows.shift()?.map((value) => value.replace(/^\uFEFF/, "")) ?? [];
  return rows.filter((values) => values.some(Boolean)).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

async function fetchText(url, attempt = 1) {
  const response = await fetch(url, {
    headers: { "User-Agent": "MLB-Talent-Map-2026/1.0 (public research visualization)" },
  });
  if (response.ok) return response.text();
  if (attempt < 5 && (response.status === 429 || response.status >= 500)) {
    await new Promise((resolve) => setTimeout(resolve, 600 * (2 ** attempt)));
    return fetchText(url, attempt + 1);
  }
  throw new Error(`${response.status} ${response.statusText}: ${url}`);
}

async function fetchJson(url, attempt = 1) {
  return JSON.parse(await fetchText(url, attempt));
}

async function readOrFetchText(file, url, minimumBytes = 1) {
  try {
    const cached = await readFile(file, "utf8");
    if (Buffer.byteLength(cached) >= minimumBytes) return cached;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const value = await fetchText(url);
  if (Buffer.byteLength(value) < minimumBytes) {
    throw new Error(`Downloaded source is unexpectedly small: ${url}`);
  }
  await writeFile(file, value);
  return value;
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
  await Promise.all(Array.from({ length: Math.min(items.length, limit) }, worker));
  return results;
}

function positionGroup(person) {
  const type = person.primaryPosition?.type ?? "Unknown";
  if (type === "Pitcher") return "Pitcher";
  if (type === "Catcher") return "Catcher";
  if (type === "Infielder") return "Infielder";
  if (type === "Outfielder") return "Outfielder";
  return "Other";
}

function isExplicitCollegeClass(value) {
  return /^(4YR|JC)\b/i.test(String(value ?? "").trim());
}

function isExplicitNonCollegeDraftSchool(name, schoolClass) {
  if (/^(HS|NS)\b/i.test(String(schoolClass ?? "").trim())) return true;
  return /\b(high school|secondary school|prep(?:aratory)?|hs)\b/i.test(String(name ?? ""));
}

async function loadDrafts() {
  try {
    const cached = JSON.parse(await readFile(DRAFT_FILE, "utf8"));
    if (cached.startYear === DRAFT_START_YEAR && cached.endYear === END_YEAR
      && cached.years?.length === END_YEAR - DRAFT_START_YEAR + 1) return cached;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const draftYears = Array.from({ length: END_YEAR - DRAFT_START_YEAR + 1 }, (_, index) => DRAFT_START_YEAR + index);
  const years = await mapLimit(draftYears, 6, async (year) => {
    const payload = await fetchJson(`${MLB_API}/draft/${year}`);
    return { year, rounds: payload.drafts?.rounds ?? [] };
  });
  const output = { snapshotDate: SNAPSHOT_DATE, startYear: DRAFT_START_YEAR, endYear: END_YEAR, years };
  await writeFile(DRAFT_FILE, `${JSON.stringify(output)}\n`);
  return output;
}

function resolutionFor(name, rules) {
  const key = normalize(name);
  const rule = rules.find((candidate) => candidate.aliases.some((alias) => normalize(alias) === key));
  if (rule) return rule.canonical;
  return { id: `college-${slug(name)}`, name: String(name).trim() };
}

await mkdir(RAW_DIR, { recursive: true });
await mkdir(PROCESSED_DIR, { recursive: true });

const [peoplePayload, universeAudit, resolutions, locations, drafts] = await Promise.all([
  readFile(PEOPLE_FILE, "utf8").then(JSON.parse),
  readFile(UNIVERSE_FILE, "utf8").then(JSON.parse),
  readFile(RESOLUTION_FILE, "utf8").then(JSON.parse),
  readFile(LOCATION_FILE, "utf8").then(JSON.parse),
  loadDrafts(),
]);

const sabrTexts = {};
for (const [key, source] of Object.entries(SABR_FILES)) {
  const downloadUrl = `https://sabr.app.box.com/index.php?rm=box_download_shared_file&shared_name=y1prhc795jk8zvmelfd3jq7tl389y6cd&file_id=f_${source.id}`;
  const file = new URL(`lahman-2025-${source.name}`, RAW_DIR);
  sabrTexts[key] = await readOrFetchText(file, downloadUrl, source.minimumBytes);
}

const chadwickRows = [];
const chadwickHashes = [];
await mkdir(new URL("chadwick-register/", RAW_DIR), { recursive: true });
for (const part of "0123456789abcdef") {
  const url = `${CHADWICK_BASE}/people-${part}.csv`;
  const file = new URL(`chadwick-register/people-${part}.csv`, RAW_DIR);
  const text = await readOrFetchText(file, url, 100_000);
  chadwickHashes.push(sha256(text));
  chadwickRows.push(...parseCsv(text));
}

const participantFields = universeAudit.meta.participantFields;
const participants = universeAudit.participants.map((values) =>
  Object.fromEntries(participantFields.map((field, index) => [field, values[index]])));
const participantById = new Map(participants.map((participant) => [participant.id, participant]));
const peopleById = new Map(peoplePayload.people.map((person) => [person.id, person]));
if (participants.length !== peopleById.size || participants.length !== universeAudit.meta.participantCount) {
  throw new Error(`Universe mismatch: audit=${participants.length}; people=${peopleById.size}`);
}

const schools = parseCsv(sabrTexts.schools);
const schoolById = new Map(schools.map((school) => [school.schoolID, school]));
const collegePlaying = parseCsv(sabrTexts.collegePlaying);
if (schools.length < 1_000 || collegePlaying.length < 10_000) {
  throw new Error(`SABR Lahman source validation failed: schools=${schools.length}; college rows=${collegePlaying.length}`);
}
const mlbamByBbref = new Map();
for (const row of chadwickRows) {
  const mlbam = Number(row.key_mlbam);
  if (Number.isInteger(mlbam) && row.key_bbref) mlbamByBbref.set(row.key_bbref, mlbam);
}

const knownCollegeNames = new Set();
for (const person of peopleById.values()) {
  for (const college of person.education?.colleges ?? []) {
    if (String(college.name ?? "").trim()) knownCollegeNames.add(normalize(college.name));
  }
}
for (const school of schools) {
  if (school.name_full) knownCollegeNames.add(normalize(school.name_full));
}
for (const rule of resolutions.rules) {
  for (const alias of rule.aliases) knownCollegeNames.add(normalize(alias));
}

const creditsByPlayer = new Map();
const sourceCreditCounts = { mlbEducation: 0, mlbDraft: 0, sabrLahman: 0 };
function addCredit(playerId, rawName, source, evidenceUrl, sourceDetail = {}) {
  if (!participantById.has(playerId) || !String(rawName ?? "").trim()) return false;
  const canonical = resolutionFor(rawName, resolutions.rules);
  const playerCredits = creditsByPlayer.get(playerId) ?? new Map();
  const existing = playerCredits.get(canonical.id) ?? {
    canonical,
    reportedNames: new Set(),
    sources: new Set(),
    evidence: [],
  };
  const sourceAlreadyPresent = existing.sources.has(source);
  existing.reportedNames.add(String(rawName).trim());
  existing.sources.add(source);
  if (!existing.evidence.some((row) => row.source === source && row.url === evidenceUrl)) {
    existing.evidence.push({ source, url: evidenceUrl, ...sourceDetail });
  }
  playerCredits.set(canonical.id, existing);
  creditsByPlayer.set(playerId, playerCredits);
  if (!sourceAlreadyPresent) sourceCreditCounts[source] += 1;
  return true;
}

const baselinePlayerIds = new Set();
for (const person of peopleById.values()) {
  for (const college of person.education?.colleges ?? []) {
    if (addCredit(person.id, college.name, "mlbEducation", `${MLB_API}/people/${person.id}?hydrate=education`, {
      reportedCity: college.city ?? null,
      reportedState: college.state ?? null,
    })) baselinePlayerIds.add(person.id);
  }
}

const draftAddedPlayerIds = new Set();
const rejectedDraftSchools = [];
for (const draft of drafts.years) {
  for (const pick of draft.rounds.flatMap((round) => round.picks ?? [])) {
    const playerId = pick.person?.id;
    if (!participantById.has(playerId) || !pick.school?.name) continue;
    const name = String(pick.school.name).trim();
    const schoolClass = pick.school.schoolClass ?? "";
    const explicitCollege = isExplicitCollegeClass(schoolClass);
    const knownCollege = knownCollegeNames.has(normalize(name));
    if (!explicitCollege && (isExplicitNonCollegeDraftSchool(name, schoolClass) || !knownCollege)) {
      rejectedDraftSchools.push({ playerId, year: draft.year, name, schoolClass: schoolClass || null });
      continue;
    }
    const hadCollege = creditsByPlayer.has(playerId);
    addCredit(playerId, name, "mlbDraft", `${MLB_API}/draft/${draft.year}`, {
      draftYear: draft.year,
      schoolClass: schoolClass || null,
      reportedCity: pick.school.city ?? null,
      reportedState: pick.school.state ?? null,
      reportedCountry: pick.school.country ?? null,
      classificationBasis: explicitCollege ? "mlb_school_class" : "verified_college_identity",
    });
    if (!hadCollege) draftAddedPlayerIds.add(playerId);
  }
}

const lahmanAddedPlayerIds = new Set();
const lahmanUnmatchedIds = new Set();
for (const row of collegePlaying) {
  const playerId = mlbamByBbref.get(row.playerID);
  if (!playerId || !participantById.has(playerId)) {
    if (!playerId) lahmanUnmatchedIds.add(row.playerID);
    continue;
  }
  const school = schoolById.get(row.schoolID);
  if (!school?.name_full) continue;
  const hadCollege = creditsByPlayer.has(playerId);
  addCredit(playerId, school.name_full, "sabrLahman", SABR_SHARE_URL, {
    schoolId: row.schoolID,
    firstReportedYear: Number(row.yearID) || null,
    reportedCity: school.city || null,
    reportedState: school.state || null,
    reportedCountry: school.country || null,
  });
  if (!hadCollege) lahmanAddedPlayerIds.add(playerId);
}

const collegeRows = new Map();
for (const [playerId, playerCredits] of creditsByPlayer) {
  const person = peopleById.get(playerId);
  const participation = participantById.get(playerId);
  const player = {
    id: playerId,
    name: person.fullName,
    firstSeason: participation.firstSeason,
    lastSeason: participation.lastSeason,
    seasons: participation.seasons,
    reachedMlb: participation.appearedInMlb,
    highestLevel: participation.appearedInMlb ? "MLB" : ({ 11: "Triple-A", 12: "Double-A", 13: "High-A", 14: "Single-A", 15: "Short-Season A", 16: "Rookie" })[participation.sportIds[0]] ?? "Unknown",
    mlbDebutDate: person.mlbDebutDate ?? null,
    position: person.primaryPosition?.abbreviation ?? "—",
    positionGroup: positionGroup(person),
  };
  for (const credit of playerCredits.values()) {
    const location = locations.colleges.find((row) => row.id === credit.canonical.id);
    const row = collegeRows.get(credit.canonical.id) ?? {
      id: credit.canonical.id,
      name: credit.canonical.name,
      city: location?.city ?? credit.canonical.city ?? null,
      state: location?.state ?? credit.canonical.state ?? null,
      country: location?.country ?? credit.canonical.country ?? null,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      locationPrecision: location?.precision ?? "unresolved",
      locationSource: location?.source ?? null,
      locationSourceUrl: location?.sourceUrl ?? null,
      reportedNames: new Set(),
      players: [],
    };
    for (const reportedName of credit.reportedNames) row.reportedNames.add(reportedName);
    row.players.push({
      ...player,
      collegeSources: [...credit.sources].sort(),
      collegeEvidence: credit.evidence,
    });
    collegeRows.set(row.id, row);
  }
}

const colleges = [...collegeRows.values()].map((college) => ({
  ...college,
  reportedNames: [...college.reportedNames].sort(),
  players: college.players.sort((a, b) => a.firstSeason - b.firstSeason || a.name.localeCompare(b.name)),
  playerCount: college.players.length,
  reachedMlbCount: college.players.filter((player) => player.reachedMlb).length,
  firstSeason: Math.min(...college.players.map((player) => player.firstSeason)),
  latestSeason: Math.max(...college.players.map((player) => player.lastSeason)),
})).sort((a, b) => b.playerCount - a.playerCount || a.name.localeCompare(b.name));

const verifiedCollegePlayerIds = new Set(creditsByPlayer.keys());
const mappedColleges = colleges.filter((college) => college.latitude !== null && college.longitude !== null);
const mappedPlayerIds = new Set(mappedColleges.flatMap((college) => college.players.map((player) => player.id)));
const mlbParticipants = participants.filter((participant) => participant.appearedInMlb).length;
const sourceFiles = {
  universe: { sha256: universeAudit.meta.sha256, records: participants.length },
  mlbEducation: { sha256: sha256(await readFile(PEOPLE_FILE)), records: peoplePayload.people.length },
  mlbDraft: { sha256: sha256(await readFile(DRAFT_FILE)), years: drafts.years.length },
  sabrCollegePlaying: { sha256: sha256(sabrTexts.collegePlaying), records: collegePlaying.length },
  sabrSchools: { sha256: sha256(sabrTexts.schools), records: schools.length },
  chadwickRegister: { sha256: sha256(chadwickHashes.join("")), records: chadwickRows.length },
};
const counts = {
  affiliatedPlayers: participants.length,
  mlbParticipants,
  minorOnlyPlayers: participants.length - mlbParticipants,
  playersWithMlbEducationCollege: baselinePlayerIds.size,
  playersAddedByMlbDraft: draftAddedPlayerIds.size,
  playersAddedBySabrLahman: lahmanAddedPlayerIds.size,
  playersWithVerifiedCollege: verifiedCollegePlayerIds.size,
  playersWithoutVerifiedCollege: participants.length - verifiedCollegePlayerIds.size,
  verifiedCollegePlayerCredits: colleges.reduce((sum, college) => sum + college.playerCount, 0),
  collegeIdentities: colleges.length,
  locatedColleges: mappedColleges.length,
  locatedPlayers: mappedPlayerIds.size,
};

const output = {
  meta: {
    title: "Colleges producing MLB and affiliated MiLB talent since 2000",
    snapshotDate: SNAPSHOT_DATE,
    generatedAt: new Date().toISOString(),
    seasonRange: { start: START_YEAR, end: END_YEAR },
    definition: "Distinct players listed by MLB's official season-player endpoints at MLB or affiliated Triple-A through Rookie levels from 2000 through the snapshot season. A player is credited once to every college supported by MLB education, an MLB Draft record classified as college, or the SABR Lahman CollegePlaying table joined to MLB person IDs through the Chadwick Register.",
    sources: [
      `${MLB_API}/people?personIds=592450&hydrate=education`,
      `${MLB_API}/draft/${END_YEAR}`,
      SABR_SHARE_URL,
      "https://github.com/chadwickbureau/register",
    ],
    sourceFiles,
    caveats: [
      "No college record is treated as unresolved evidence, not proof that a player did not attend college.",
      "MLB education is the primary source. Official MLB Draft records fill gaps only when MLB labels the school as a four-year or junior college, or the reported school exactly matches a verified college identity; explicit high-school and preparatory-school records are excluded.",
      "The SABR Lahman CollegePlaying table supplements MLB participants only, using exact MLBAM-to-Baseball-Reference identifier links from the Chadwick Register; it cannot fill records for minor-league-only players absent from Lahman.",
      "A transfer is credited once to every verified college. Totals across colleges therefore are not additive.",
      "Counts measure participation in the 2000–2026 MLB/affiliated-MiLB universe, not draft selections, college roster size, games, seasons, or career peak level.",
      "Affiliated minor-league seasons were canceled in 2020; the 2020 minor-league endpoints contain no participants.",
    ],
    counts,
  },
  colleges,
};
const checksumValue = structuredClone(output);
delete checksumValue.meta.generatedAt;
output.meta.sha256 = sha256(`${JSON.stringify(checksumValue)}\n`);

const leaderColleges = mappedColleges.map((college) => ({
  ...college,
  players: college.players.map((player) => Object.fromEntries(
    Object.entries(player).filter(([key]) => key !== "collegeEvidence"),
  )),
}));
const leaderOutput = {
  meta: { ...output.meta, collegeUniverseSha256: output.meta.sha256 },
  colleges: leaderColleges,
};
delete leaderOutput.meta.sha256;
const leaderChecksumValue = structuredClone(leaderOutput);
delete leaderChecksumValue.meta.generatedAt;
leaderOutput.meta.sha256 = sha256(`${JSON.stringify(leaderChecksumValue)}\n`);

const qualityOutput = {
  counts,
  sourceFiles,
  sourceCreditCounts,
  draftRejectedRecords: rejectedDraftSchools.length,
  lahmanUnmatchedPlayerIds: lahmanUnmatchedIds.size,
  topColleges: colleges.slice(0, 75).map((college) => ({
    id: college.id,
    name: college.name,
    playerCount: college.playerCount,
    reachedMlbCount: college.reachedMlbCount,
    reportedNames: college.reportedNames,
    located: college.latitude !== null && college.longitude !== null,
  })),
};
const qualityJson = `${JSON.stringify(qualityOutput, null, 2)}\n`;

await writeFile(AUDIT_FILE, `${JSON.stringify(output)}\n`);
await writeFile(LEADER_FILE, `${JSON.stringify(leaderOutput)}\n`);
await writeFile(new URL(`mlb-college-quality-${SNAPSHOT_DATE}.json`, PROCESSED_DIR), qualityJson);
await writeFile(QUALITY_REPORT_FILE, qualityJson);

console.log(JSON.stringify({ counts, sourceCreditCounts, topColleges: colleges.slice(0, 40).map((college) => ({
  id: college.id,
  name: college.name,
  playerCount: college.playerCount,
  reachedMlbCount: college.reachedMlbCount,
  reportedNames: college.reportedNames,
})) }, null, 2));
