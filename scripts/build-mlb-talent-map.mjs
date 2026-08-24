import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { geoContains } from "d3-geo";

const SNAPSHOT_DATE = process.argv[2] ?? "2026-08-24";
const PUBLIC_URL = "https://mlb-talent-map-2026.pages.dev";
const SPORT_IDS = [1, 11, 12, 13, 14, 16];
const API = "https://statsapi.mlb.com/api/v1";
const GNIS_POPULATED = new URL("../data/raw/PopulatedPlaces_National_Text.zip", import.meta.url);
const GNIS_ALL_NAMES = new URL("../data/raw/AllNames_National_Text.zip", import.meta.url);

const SPORT_LEVEL = new Map([
  [1, "MLB"], [11, "Triple-A"], [12, "Double-A"],
  [13, "High-A"], [14, "Single-A"], [16, "Rookie"],
]);

const STATUS_GROUPS = new Map([
  ["A", "Active"], ["D7", "Injured"], ["D10", "Injured"],
  ["D15", "Injured"], ["D60", "Injured"], ["MIN", "Injured"],
  ["RM", "Reserve / inactive"], ["RSN", "Reserve / inactive"],
  ["TI", "Reserve / inactive"], ["RST", "Reserve / inactive"],
  ["DEV", "Development list"],
]);

const countryAliases = new Map([
  ["united states", "USA"], ["united states of america", "USA"],
  ["u s a", "USA"], ["usa", "USA"],
  ["dom", "Dominican Republic"], ["ven", "Venezuela"],
  ["cub", "Cuba"], ["mex", "Mexico"], ["pan", "Panama"],
  ["col", "Colombia"], ["pur", "Puerto Rico"],
  ["republic of korea", "South Korea"],
]);

function normalize(value) {
  return String(value ?? "").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function normalizePlace(value) {
  return normalize(value).replace(/^saint\s+/, "st ")
    .replace(/\s+(city|town|village|borough|municipality|cdp)$/i, "").trim();
}

function parsePipe(line) {
  return line.replace(/^\uFEFF/, "").split("|");
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "MLB talent geography research snapshot" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function pooled(items, limit, work) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await work(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return output;
}

async function* zipLines(zipUrl) {
  const child = spawn("unzip", ["-p", zipUrl.pathname], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const reader = createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of reader) yield line;
  const code = await completion;
  if (code !== 0) throw new Error(`unzip failed with exit code ${code}`);
}

function addCandidate(index, key, feature) {
  if (!key) return;
  const current = index.get(key) ?? [];
  if (!current.some((item) => item.featureId === feature.featureId)) {
    current.push(feature);
    index.set(key, current);
  }
}

async function loadFederalPlaces() {
  const featureById = new Map();
  const officialIndex = new Map();
  let header = null;
  for await (const line of zipLines(GNIS_POPULATED)) {
    if (!header) { header = parsePipe(line); continue; }
    const values = parsePipe(line);
    const row = Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""]));
    const feature = {
      featureId: row.feature_id,
      name: row.feature_name,
      stateFips: row.state_numeric.padStart(2, "0"),
      countyFips: `${row.state_numeric.padStart(2, "0")}${row.county_numeric.padStart(3, "0")}`,
      latitude: Number(row.prim_lat_dec), longitude: Number(row.prim_long_dec),
    };
    featureById.set(feature.featureId, feature);
    addCandidate(officialIndex, `${feature.stateFips}|${normalizePlace(feature.name)}`, feature);
  }

  const variantIndex = new Map();
  header = null;
  for await (const line of zipLines(GNIS_ALL_NAMES)) {
    if (!header) { header = parsePipe(line); continue; }
    const values = parsePipe(line);
    const feature = featureById.get(values[0]);
    if (feature) addCandidate(variantIndex, `${feature.stateFips}|${normalizePlace(values[1])}`, feature);
  }
  return { officialIndex, variantIndex, featureCount: featureById.size };
}

function uniqueCounty(candidates, context) {
  if (!candidates?.length) return null;
  const fips = [...new Set(candidates.map((item) => item.countyFips))];
  if (fips.length !== 1) return null;
  if (context.validCountyFips.has(fips[0])) return fips[0];
  const legacyFips = [...new Set(candidates.map((candidate) => {
    const county = context.countyFeatures.find((feature) =>
      geoContains(feature, [candidate.longitude, candidate.latitude]),
    );
    return county?.properties?.GEOID ?? String(county?.id ?? "");
  }).filter(Boolean))];
  return legacyFips.length === 1 ? legacyFips[0] : null;
}

function positionGroup(position) {
  const type = position?.type ?? "Unknown";
  if (type === "Pitcher") return "Pitcher";
  if (type === "Catcher") return "Catcher";
  if (type === "Infielder") return "Infielder";
  if (type === "Outfielder") return "Outfielder";
  return type === "Two-Way Player" ? "Two-way" : "Other / unknown";
}

function statusGroup(status) {
  if (STATUS_GROUPS.has(status?.code)) return STATUS_GROUPS.get(status.code);
  const description = status?.description ?? "Unknown";
  if (/injur/i.test(description)) return "Injured";
  if (/active/i.test(description)) return "Active";
  if (/development/i.test(description)) return "Development list";
  return "Reserve / inactive";
}

function canonicalCountry(country) {
  const key = normalize(country);
  return countryAliases.get(key) ?? (country?.trim() || "Unknown");
}

function resolveBirthplace(person, context) {
  const country = canonicalCountry(person.birthCountry);
  if (country !== "USA") {
    return {
      country,
      countyFips: null,
      geographyBasis: country === "Unknown" ? "unresolved" : "outside_us_map",
      matchMethod: null,
    };
  }

  const state = context.stateLookup.get(normalize(person.birthStateProvince));
  if (!state || !person.birthCity) {
    return { country, countyFips: null, geographyBasis: "unresolved", matchMethod: null };
  }
  if (!context.inScopeStateFips.has(state.fips)) {
    return { country, countyFips: null, geographyBasis: "outside_us_map", matchMethod: null };
  }

  const place = normalizePlace(person.birthCity);
  const official = context.federalPlaces.officialIndex.get(`${state.fips}|${place}`);
  const officialCounty = uniqueCounty(official, context);
  if (officialCounty) {
    return {
      country,
      countyFips: officialCounty,
      geographyBasis: "federal_place_county",
      matchMethod: "gnis_official_unique",
    };
  }

  const variants = context.federalPlaces.variantIndex.get(`${state.fips}|${place}`);
  const variantCounty = uniqueCounty(variants, context);
  if (variantCounty) {
    return {
      country,
      countyFips: variantCounty,
      geographyBasis: "federal_place_county",
      matchMethod: "gnis_variant_unique",
    };
  }

  const ambiguous = Boolean(official?.length || variants?.length);
  return {
    country,
    countyFips: null,
    geographyBasis: ambiguous ? "ambiguous_place" : "unresolved",
    matchMethod: null,
  };
}

function summarize(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

async function main() {
  const [teamPayload, countyReference, countyCollection] = await Promise.all([
    fetchJson(`${API}/teams?sportIds=${SPORT_IDS.join(",")}&activeStatus=Y&hydrate=league,division`),
    readFile(new URL("../public/data/county-reference-2020.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/data/us-counties-2020-simplified.geojson", import.meta.url), "utf8").then(JSON.parse),
  ]);
  const teams = teamPayload.teams;
  const mlbTeams = teams.filter((team) => team.sport.id === 1);
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const rosterSnapshots = await pooled(mlbTeams, 6, async (team) => {
    const url = `${API}/teams/${team.id}/roster?rosterType=fullRoster&date=${SNAPSHOT_DATE}&hydrate=person(currentTeam)`;
    const payload = await fetchJson(url);
    return {
      organization: team,
      url,
      roster: payload.roster ?? [],
      copyright: payload.copyright,
    };
  });

  const duplicateIds = new Map();
  const rosterByPlayer = new Map();
  for (const snapshot of rosterSnapshots) {
    for (const entry of snapshot.roster) {
      const existing = rosterByPlayer.get(entry.person.id);
      if (existing) {
        const orgs = duplicateIds.get(entry.person.id) ?? new Set([existing.organization.id]);
        orgs.add(snapshot.organization.id);
        duplicateIds.set(entry.person.id, orgs);
        const currentParent = entry.person.currentTeam?.parentOrgId ?? entry.person.currentTeam?.id;
        const existingParent = existing.person.currentTeam?.parentOrgId ?? existing.person.currentTeam?.id;
        const incomingMatches = currentParent === snapshot.organization.id;
        const existingMatches = existingParent === existing.organization.id;
        if (incomingMatches && !existingMatches) {
          rosterByPlayer.set(entry.person.id, { ...entry, organization: snapshot.organization });
        }
        continue;
      }
      rosterByPlayer.set(entry.person.id, { ...entry, organization: snapshot.organization });
    }
  }

  const stateLookup = new Map();
  const inScopeStateFips = new Set();
  for (const county of countyReference.counties) {
    inScopeStateFips.add(county.state_fips);
    const state = {
      fips: county.state_fips,
      abbr: county.state_abbr,
      name: county.state_name,
    };
    stateLookup.set(normalize(county.state_abbr), state);
    stateLookup.set(normalize(county.state_name), state);
  }
  stateLookup.set(normalize("D.C."), {
    fips: "11", abbr: "DC", name: "District of Columbia",
  });
  stateLookup.set(normalize("Washington, D.C."), {
    fips: "11", abbr: "DC", name: "District of Columbia",
  });

  const federalPlaces = await loadFederalPlaces();
  const geographyContext = {
    stateLookup,
    inScopeStateFips,
    federalPlaces,
    validCountyFips: new Set(countyReference.counties.map((county) => county.county_fips)),
    countyFeatures: countyCollection.features,
  };

  const auditPlayers = [...rosterByPlayer.values()]
    .map((entry) => {
      const person = entry.person;
      const currentTeam = teamById.get(person.currentTeam?.id);
      const geography = resolveBirthplace(person, geographyContext);
      return {
        id: String(person.id),
        fullName: person.fullName,
        organizationId: entry.organization.id,
        organization: entry.organization.name,
        currentTeamId: person.currentTeam?.id ?? null,
        currentParentOrgId: person.currentTeam?.parentOrgId ?? null,
        affiliate: currentTeam?.name ?? person.currentTeam?.name ?? "Unassigned / unknown",
        level: SPORT_LEVEL.get(currentTeam?.sport?.id) ?? "Unassigned / unknown",
        rosterStatus: entry.status?.description ?? "Unknown",
        statusGroup: statusGroup(entry.status),
        position: person.primaryPosition?.abbreviation ?? entry.position?.abbreviation ?? "Unknown",
        positionGroup: positionGroup(person.primaryPosition ?? entry.position),
        birthCity: person.birthCity ?? null,
        birthStateProvince: person.birthStateProvince ?? null,
        birthCountry: geography.country,
        countyFips: geography.countyFips,
        geographyBasis: geography.geographyBasis,
        matchMethod: geography.matchMethod,
      };
    })
    .sort((a, b) =>
      a.organization.localeCompare(b.organization) || a.fullName.localeCompare(b.fullName),
    );

  const publicPlayers = auditPlayers.map((player) => {
    const row = { ...player };
    delete row.fullName;
    delete row.birthCity;
    delete row.birthStateProvince;
    return row;
  });
  const usPlayers = auditPlayers.filter((player) => player.birthCountry === "USA");
  const mappedPlayers = usPlayers.filter((player) => player.countyFips);
  const outsidePlayers = auditPlayers.filter((player) =>
    player.geographyBasis === "outside_us_map",
  );
  const unknownTeamPlayers = auditPlayers.filter((player) =>
    player.level === "Unassigned / unknown",
  );
  const duplicateConflicts = [...duplicateIds.entries()].map(([id, orgs]) => ({
    id: String(id),
    organizations: [...orgs],
  }));
  const unresolvedDuplicateAssignments = auditPlayers.filter((player) =>
    duplicateIds.has(Number(player.id)) &&
    player.currentTeamId !== player.organizationId &&
    player.currentParentOrgId !== player.organizationId &&
    teamById.get(player.currentTeamId)?.parentOrgId !== player.organizationId,
  );

  const levelSummary = summarize(auditPlayers, (player) => player.level)
    .map(({ key, count }) => ({ level: key, count }));
  const countrySummary = summarize(auditPlayers, (player) => player.birthCountry)
    .map(({ key, count }) => ({ country: key, count }));
  const organizationSummary = summarize(auditPlayers, (player) => player.organization)
    .map(({ key, count }) => ({ organization: key, count }));
  const geographySummary = summarize(auditPlayers, (player) => player.geographyBasis)
    .map(({ key, count }) => ({ basis: key, count }));
  const matchMethodSummary = summarize(mappedPlayers, (player) => player.matchMethod ?? "unknown")
    .map(({ key, count }) => ({ method: key, count }));

  const counties = countyReference.counties.map((county) => ({
    fips: county.county_fips,
    name: county.county_name,
    state: county.state_name,
    stateAbbr: county.state_abbr,
    population: county.population_2020,
  }));
  const total = auditPlayers.length;
  const usTotal = usPlayers.length;
  const mapped = mappedPlayers.length;
  const percentage = (value, denominator = total) =>
    denominator ? Math.round((value / denominator) * 10_000) / 100 : 0;

  const publicPayload = {
    meta: {
      title: "The Geography of MLB Talent",
      snapshotDate: SNAPSHOT_DATE,
      generatedAt: new Date().toISOString(),
      rosterDefinition: "MLB organization full rosters, including active and rostered inactive players, across MLB, Triple-A, Double-A, High-A, Single-A, and Rookie levels.",
      geographyDefinition: "Birth countries use MLB's reported birthCountry field. U.S. birth city/state is matched only when a federal GNIS official or variant populated-place name resolves uniquely to one 2020 county-equivalent. County is a representative place assignment, not proof of exact birth county.",
      totalPlayers: total,
      usBirthPlayers: usTotal,
      mappedUsPlayers: mapped,
      usMappingPct: percentage(mapped, usTotal),
      outsideUsMapPlayers: outsidePlayers.length,
      outsideUsMapPct: percentage(outsidePlayers.length),
      unresolvedUsPlayers: usTotal - mapped,
      unresolvedUsPct: percentage(usTotal - mapped, usTotal),
      populationYear: 2020,
      publicUrl: PUBLIC_URL,
      sources: [
        { label: "MLB Stats API — sports", url: `${API}/sports` },
        { label: "MLB Stats API — active teams", url: `${API}/teams?sportIds=${SPORT_IDS.join(",")}&activeStatus=Y` },
        { label: "MLB Stats API — roster types", url: `${API}/rosterTypes` },
        { label: "USGS GNIS populated places", url: "https://www.usgs.gov/us-board-on-geographic-names/download-gnis-data" },
        { label: "U.S. Census 2020 cartographic boundaries", url: "https://www.census.gov/geographies/mapping-files/2020/geo/carto-boundary-file.html" },
        { label: "Natural Earth 1:50m country boundaries", url: "https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/" },
      ],
    },
    counties,
    players: publicPlayers,
    summaries: {
      levels: levelSummary,
      countries: countrySummary,
      organizations: organizationSummary,
      geography: geographySummary,
      matchMethods: matchMethodSummary,
    },
  };

  const rawSnapshot = {
    snapshotDate: SNAPSHOT_DATE,
    generatedAt: publicPayload.meta.generatedAt,
    teamQuery: `${API}/teams?sportIds=${SPORT_IDS.join(",")}&activeStatus=Y&hydrate=league,division`,
    sourceUrls: rosterSnapshots.map((snapshot) => snapshot.url),
    teams,
    rosters: rosterSnapshots,
  };
  const qualityReport = {
    snapshotDate: SNAPSHOT_DATE,
    intendedGrain: "one unique MLB person id currently present on one MLB organization full roster",
    rowCount: total,
    organizationCount: mlbTeams.length,
    affiliateTeamCount: teams.filter((team) => team.sport.id !== 1).length,
    duplicatePersonIdsAcrossOrganizations: duplicateConflicts.length,
    duplicateConflicts,
    unresolvedDuplicateAssignments: unresolvedDuplicateAssignments.length,
    unknownCurrentTeam: unknownTeamPlayers.length,
    unknownCurrentTeamPct: percentage(unknownTeamPlayers.length),
    usBirthPlayers: usTotal,
    mappedUsPlayers: mapped,
    usMappingPct: percentage(mapped, usTotal),
    unresolvedUsPlayers: usTotal - mapped,
    internationalOrTerritoryPlayers: outsidePlayers.length,
    levelSummary,
    countrySummary,
    geographySummary,
    matchMethodSummary,
    federalPopulatedPlaceCount: federalPlaces.featureCount,
    checks: {
      expectedMlbOrganizations: {
        expected: 30,
        actual: mlbTeams.length,
        pass: mlbTeams.length === 30,
      },
      allPlayersUniqueAfterDeduplication: {
        pass: new Set(auditPlayers.map((player) => player.id)).size === total,
      },
      allOrganizationsRepresented: { pass: organizationSummary.length === 30 },
      duplicateAssignmentsResolvedToCurrentOrganization: {
        pass: unresolvedDuplicateAssignments.length === 0,
      },
      allCountyFipsValid: {
        pass: mappedPlayers.every((player) =>
          counties.some((county) => county.fips === player.countyFips),
        ),
      },
      noReleasedOrTradedStatuses: {
        pass: auditPlayers.every((player) =>
          !/released|traded|free agent/i.test(player.rosterStatus),
        ),
      },
    },
    caveats: [
      "MLB person records expose birth city/state/country, not exact birth county.",
      "Federal place matching is deliberately conservative: ambiguous names remain unmapped.",
      "The fullRoster endpoint includes active players and rostered inactive/reserve/injured players; it excludes released and traded historical-season rows.",
      "Current team assignment is read from each MLB person record at snapshot time; players without an in-scope active team remain labeled unassigned/unknown.",
    ],
  };

  await Promise.all([
    writeFile(
      new URL(`../data/raw/mlb-rosters-${SNAPSHOT_DATE}.json`, import.meta.url),
      JSON.stringify(rawSnapshot),
    ),
    writeFile(
      new URL(`../data/processed/mlb-roster-player-audit-${SNAPSHOT_DATE}.json`, import.meta.url),
      JSON.stringify(auditPlayers, null, 2),
    ),
    writeFile(
      new URL("../public/data/mlb-talent-map.json", import.meta.url),
      JSON.stringify(publicPayload),
    ),
    writeFile(
      new URL("../reports/data-quality.json", import.meta.url),
      JSON.stringify(qualityReport, null, 2),
    ),
  ]);

  console.log(JSON.stringify({
    snapshotDate: SNAPSHOT_DATE,
    totalPlayers: total,
    usBirthPlayers: usTotal,
    mappedUsPlayers: mapped,
    usMappingPct: percentage(mapped, usTotal),
    internationalOrTerritoryPlayers: outsidePlayers.length,
    unknownCurrentTeam: unknownTeamPlayers.length,
    duplicatePersonIdsAcrossOrganizations: duplicateConflicts.length,
    checks: qualityReport.checks,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
