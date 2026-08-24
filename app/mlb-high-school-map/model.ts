export type Era = "all" | "2000s" | "2010s" | "2020s";

export type HighSchoolPlayer = {
  id: number;
  name: string;
  debutDate: string;
  debutYear: number;
  position: string;
  positionGroup: string;
};

export type HighSchool = {
  id: string;
  name: string;
  city: string | null;
  state: string;
  latitude: number | null;
  longitude: number | null;
  locationPrecision: string;
  locationSource: string | null;
  locationSourceUrl: string | null;
  identityBasis: string;
  reportedNames: string[];
  reportedCities: string[];
  players: HighSchoolPlayer[];
  playerCount: number;
  firstDebutYear: number;
  latestDebutYear: number;
};

export type RankedHighSchool = HighSchool & {
  filteredPlayers: HighSchoolPlayer[];
  filteredCount: number;
};

export type HighSchoolFilters = {
  era: Era;
  state: string;
  positionGroup: string;
  query: string;
  school: string;
};

export const DEFAULT_HIGH_SCHOOL_FILTERS: HighSchoolFilters = {
  era: "all",
  state: "all",
  positionGroup: "all",
  query: "",
  school: "",
};

export const ERA_LABELS: Record<Era, string> = {
  all: "2000–2026",
  "2000s": "2000–2009",
  "2010s": "2010–2019",
  "2020s": "2020–2026",
};

export const integer = new Intl.NumberFormat("en-US");

export function playerMatchesEra(player: HighSchoolPlayer, era: Era) {
  if (era === "all") return true;
  if (era === "2000s") return player.debutYear >= 2000 && player.debutYear <= 2009;
  if (era === "2010s") return player.debutYear >= 2010 && player.debutYear <= 2019;
  return player.debutYear >= 2020 && player.debutYear <= 2026;
}

export function rankHighSchools(
  schools: HighSchool[],
  filters: HighSchoolFilters,
): RankedHighSchool[] {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase();
  return schools
    .filter((school) => school.latitude !== null && school.longitude !== null)
    .filter((school) => filters.state === "all" || school.state === filters.state)
    .filter((school) => !normalizedQuery || [school.name, school.city, school.state]
      .filter(Boolean).join(" ").toLocaleLowerCase().includes(normalizedQuery))
    .map((school) => {
      const filteredPlayers = school.players.filter((player) =>
        playerMatchesEra(player, filters.era)
        && (filters.positionGroup === "all" || player.positionGroup === filters.positionGroup),
      );
      return { ...school, filteredPlayers, filteredCount: filteredPlayers.length };
    })
    .filter((school) => school.filteredCount > 0)
    .sort((a, b) => b.filteredCount - a.filteredCount
      || b.playerCount - a.playerCount
      || a.name.localeCompare(b.name)
      || (a.city ?? "").localeCompare(b.city ?? ""));
}

export function countUniquePlayers(schools: RankedHighSchool[]) {
  return new Set(schools.flatMap((school) => school.filteredPlayers.map((player) => player.id))).size;
}

export function optionValues(schools: HighSchool[], field: "state" | "positionGroup") {
  const values = field === "state"
    ? schools.filter((school) => school.latitude !== null).map((school) => school.state)
    : schools.flatMap((school) => school.players.map((player) => player.positionGroup));
  return [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function validValue(requested: string | null, values: string[]) {
  return requested && values.includes(requested) ? requested : "all";
}

export function parseHighSchoolFilters(search: string, schools: HighSchool[]): HighSchoolFilters {
  const params = new URLSearchParams(search);
  const requestedEra = params.get("era");
  const era = requestedEra && requestedEra in ERA_LABELS ? requestedEra as Era : "all";
  const mappedIds = new Set(schools.filter((school) => school.latitude !== null).map((school) => school.id));
  const school = params.get("school") ?? "";
  return {
    era,
    state: validValue(params.get("state"), optionValues(schools, "state")),
    positionGroup: validValue(params.get("position"), optionValues(schools, "positionGroup")),
    query: (params.get("q") ?? "").slice(0, 80),
    school: mappedIds.has(school) ? school : "",
  };
}

export function highSchoolFiltersToQuery(filters: HighSchoolFilters) {
  const params = new URLSearchParams();
  if (filters.era !== "all") params.set("era", filters.era);
  if (filters.state !== "all") params.set("state", filters.state);
  if (filters.positionGroup !== "all") params.set("position", filters.positionGroup);
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.school) params.set("school", filters.school);
  return params;
}

export function schoolLocation(school: Pick<HighSchool, "city" | "state">) {
  return [school.city, school.state].filter(Boolean).join(", ");
}
