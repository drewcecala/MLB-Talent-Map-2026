export type CollegeEra = "all" | "2000s" | "2010s" | "2020s";

export type CollegePlayer = {
  id: number;
  name: string;
  firstSeason: number;
  lastSeason: number;
  seasons: number[];
  reachedMlb: boolean;
  highestLevel: string;
  mlbDebutDate: string | null;
  position: string;
  positionGroup: string;
  collegeSources: string[];
};

export type College = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  locationPrecision: string;
  locationSource: string | null;
  locationSourceUrl: string | null;
  reportedNames: string[];
  players: CollegePlayer[];
  playerCount: number;
  reachedMlbCount: number;
  firstSeason: number;
  latestSeason: number;
};

export type RankedCollege = College & {
  filteredPlayers: CollegePlayer[];
  filteredCount: number;
};

export type CollegeFilters = {
  era: CollegeEra;
  state: string;
  positionGroup: string;
  query: string;
  college: string;
};

export const DEFAULT_COLLEGE_FILTERS: CollegeFilters = {
  era: "all",
  state: "all",
  positionGroup: "all",
  query: "",
  college: "",
};

export const COLLEGE_ERA_LABELS: Record<CollegeEra, string> = {
  all: "2000–2026",
  "2000s": "2000–2009",
  "2010s": "2010–2019",
  "2020s": "2020–2026",
};

export const integer = new Intl.NumberFormat("en-US");

export function formatCollegeSeasons(seasons: number[]) {
  if (!seasons.length) return "—";
  const ranges: string[] = [];
  let start = seasons[0];
  let previous = seasons[0];
  for (const season of seasons.slice(1)) {
    if (season === previous + 1) {
      previous = season;
      continue;
    }
    ranges.push(start === previous ? String(start) : `${start}–${previous}`);
    start = season;
    previous = season;
  }
  ranges.push(start === previous ? String(start) : `${start}–${previous}`);
  return ranges.join(", ");
}

export function collegePlayerMatchesEra(player: CollegePlayer, era: CollegeEra) {
  if (era === "all") return true;
  if (era === "2000s") return player.seasons.some((season) => season >= 2000 && season <= 2009);
  if (era === "2010s") return player.seasons.some((season) => season >= 2010 && season <= 2019);
  return player.seasons.some((season) => season >= 2020 && season <= 2026);
}

export function rankColleges(colleges: College[], filters: CollegeFilters): RankedCollege[] {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase();
  return colleges
    .filter((college) => college.latitude !== null && college.longitude !== null)
    .filter((college) => filters.state === "all" || college.state === filters.state)
    .filter((college) => !normalizedQuery || [college.name, college.city, college.state]
      .filter(Boolean).join(" ").toLocaleLowerCase().includes(normalizedQuery))
    .map((college) => {
      const filteredPlayers = college.players.filter((player) =>
        collegePlayerMatchesEra(player, filters.era)
        && (filters.positionGroup === "all" || player.positionGroup === filters.positionGroup));
      return { ...college, filteredPlayers, filteredCount: filteredPlayers.length };
    })
    .filter((college) => college.filteredCount > 0)
    .sort((a, b) => b.filteredCount - a.filteredCount
      || b.playerCount - a.playerCount
      || a.name.localeCompare(b.name));
}

export function countCollegePlayers(colleges: RankedCollege[]) {
  return new Set(colleges.flatMap((college) => college.filteredPlayers.map((player) => player.id))).size;
}

export function collegeOptionValues(colleges: College[], field: "state" | "positionGroup") {
  const values = field === "state"
    ? colleges.filter((college) => college.latitude !== null).map((college) => college.state ?? "")
    : colleges.flatMap((college) => college.players.map((player) => player.positionGroup));
  return [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function validValue(requested: string | null, values: string[]) {
  return requested && values.includes(requested) ? requested : "all";
}

export function parseCollegeFilters(search: string, colleges: College[]): CollegeFilters {
  const params = new URLSearchParams(search);
  const requestedEra = params.get("era");
  const era = requestedEra && requestedEra in COLLEGE_ERA_LABELS ? requestedEra as CollegeEra : "all";
  const mappedIds = new Set(colleges.filter((college) => college.latitude !== null).map((college) => college.id));
  const college = params.get("college") ?? "";
  return {
    era,
    state: validValue(params.get("state"), collegeOptionValues(colleges, "state")),
    positionGroup: validValue(params.get("position"), collegeOptionValues(colleges, "positionGroup")),
    query: (params.get("q") ?? "").slice(0, 80),
    college: mappedIds.has(college) ? college : "",
  };
}

export function collegeFiltersToQuery(filters: CollegeFilters) {
  const params = new URLSearchParams();
  if (filters.era !== "all") params.set("era", filters.era);
  if (filters.state !== "all") params.set("state", filters.state);
  if (filters.positionGroup !== "all") params.set("position", filters.positionGroup);
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.college) params.set("college", filters.college);
  return params;
}

export function collegeLocation(college: Pick<College, "city" | "state">) {
  return [college.city, college.state].filter(Boolean).join(", ");
}

export function sourceLabel(source: string) {
  if (source === "mlbEducation") return "MLB education";
  if (source === "mlbDraft") return "MLB Draft";
  if (source === "sabrLahman") return "SABR Lahman";
  return source;
}
