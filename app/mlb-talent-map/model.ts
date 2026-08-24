export type Metric = "total" | "per_capita" | "mlb" | "pitcher";
export type MapView = "counties" | "countries";

export type GeographyBasis =
  | "federal_place_county"
  | "outside_us_map"
  | "ambiguous_place"
  | "unresolved";

export type PlayerRow = {
  id: string;
  organizationId: number;
  organization: string;
  currentTeamId: number | null;
  currentParentOrgId: number | null;
  affiliate: string;
  level: string;
  rosterStatus: string;
  statusGroup: string;
  position: string;
  positionGroup: string;
  birthCountry: string;
  countyFips: string | null;
  geographyBasis: GeographyBasis;
  matchMethod: string | null;
};

export type CountyMeta = {
  fips: string;
  name: string;
  state: string;
  stateAbbr: string;
  population: number;
};

export type CountyStats = CountyMeta & {
  total: number;
  perCapita: number;
  rateEligible: boolean;
  mlb: number;
  pitcher: number;
  mostCommonLevel: string;
  mostCommonPosition: string;
};

export type CountryStats = {
  country: string;
  total: number;
  mlb: number;
  pitcher: number;
  mostCommonLevel: string;
  mostCommonPosition: string;
};

export type FilterState = {
  view: MapView;
  level: string;
  organization: string;
  positionGroup: string;
  statusGroup: string;
  country: string;
  activeOnly: boolean;
  metric: Metric;
};

export const RATE_MIN_COUNT = 10;

export const DEFAULT_FILTERS: FilterState = {
  view: "counties",
  level: "all",
  organization: "all",
  positionGroup: "all",
  statusGroup: "all",
  country: "all",
  activeOnly: false,
  metric: "total",
};

export const METRIC_LABELS: Record<Metric, string> = {
  total: "Rostered players",
  per_capita: "Players per 100,000",
  mlb: "Players currently at MLB level",
  pitcher: "Pitchers",
};

export const MAP_COLORS = [
  "#f3e7f4",
  "#ddb9df",
  "#bf7fc1",
  "#914b96",
  "#5e2268",
];
export const EMPTY_COLOR = "#f1f3f2";
export const RATE_INSUFFICIENT_COLOR = "#d9d0bd";

export const number = new Intl.NumberFormat("en-US");
export const oneDecimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
export const twoDecimals = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function playerCountLabel(value: number) {
  return `${number.format(value)} ${value === 1 ? "player" : "players"}`;
}

export function metricValue(stats: CountyStats, metric: Metric) {
  if (metric === "per_capita") return stats.rateEligible ? stats.perCapita : 0;
  return stats[metric];
}

export function formatMetric(value: number, metric: Metric) {
  return metric === "per_capita" ? twoDecimals.format(value) : number.format(value);
}

function quantile(sorted: number[], probability: number) {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function colorScale(stats: CountyStats[], metric: Metric) {
  const positive = stats.map((county) => metricValue(county, metric))
    .filter((value) => value > 0).sort((a, b) => a - b);
  const thresholds = metric === "per_capita"
    ? [0.2, 0.4, 0.6, 0.8].map((probability) => quantile(positive, probability))
    : [0.2, 0.4, 0.6, 0.8].reduce<number[]>((output, probability) => {
      const rounded = Math.max(1, Math.ceil(quantile(positive, probability)));
      output.push(output.length ? Math.max(rounded, output.at(-1)! + 1) : rounded);
      return output;
    }, []);
  return {
    thresholds,
    color(value: number) {
      if (value <= 0) return EMPTY_COLOR;
      const index = thresholds.findIndex((threshold) => value <= threshold);
      return MAP_COLORS[index === -1 ? MAP_COLORS.length - 1 : index];
    },
  };
}

export function countryMetricValue(
  stats: CountryStats,
  metric: Exclude<Metric, "per_capita">,
) {
  return stats[metric];
}

export function countryColorScale(
  stats: CountryStats[],
  metric: Exclude<Metric, "per_capita">,
) {
  const positive = stats.map((country) => countryMetricValue(country, metric))
    .filter((value) => value > 0).sort((a, b) => a - b);
  const thresholds = [0.2, 0.4, 0.6, 0.8].reduce<number[]>((output, probability) => {
    const rounded = Math.max(1, Math.ceil(quantile(positive, probability)));
    output.push(output.length ? Math.max(rounded, output.at(-1)! + 1) : rounded);
    return output;
  }, []);
  return {
    thresholds,
    color(value: number) {
      if (value <= 0) return EMPTY_COLOR;
      const index = thresholds.findIndex((threshold) => value <= threshold);
      return MAP_COLORS[index === -1 ? MAP_COLORS.length - 1 : index];
    },
  };
}

export function legendBins(thresholds: number[], metric: Metric) {
  if (!thresholds.length || thresholds.every((threshold) => threshold === 0)) return [];
  if (metric !== "per_capita") {
    return MAP_COLORS.map((color, index) => {
      const lower = index === 0 ? 1 : Math.floor(thresholds[index - 1]) + 1;
      const upper = index < thresholds.length ? Math.floor(thresholds[index]) : null;
      const label = upper === null ? `${number.format(lower)}+`
        : lower === upper ? number.format(lower)
          : `${number.format(lower)}–${number.format(upper)}`;
      return { color, label };
    });
  }
  const starts = [0, ...thresholds];
  return MAP_COLORS.map((color, index) => {
    const floor = starts[index];
    const ceiling = index < thresholds.length ? thresholds[index] : null;
    const label = ceiling === null ? `${formatMetric(floor, metric)}+`
      : index === 0 ? `>0–${formatMetric(ceiling, metric)}`
        : `${formatMetric(floor, metric)}–${formatMetric(ceiling, metric)}`;
    return { color, label };
  });
}

type OptionField =
  | "level"
  | "organization"
  | "positionGroup"
  | "statusGroup"
  | "birthCountry";

function validOption(requested: string | null, players: PlayerRow[], field: OptionField) {
  if (!requested || requested === "all") return "all";
  return new Set(players.map((player) => player[field])).has(requested) ? requested : "all";
}

export function parseFiltersFromSearch(search: string, players: PlayerRow[]): FilterState {
  const query = new URLSearchParams(search);
  const view: MapView = query.get("view") === "countries" ? "countries" : "counties";
  const requestedMetric = query.get("metric");
  const metric = requestedMetric && requestedMetric in METRIC_LABELS
    ? requestedMetric as Metric : DEFAULT_FILTERS.metric;
  return {
    view,
    level: validOption(query.get("level"), players, "level"),
    organization: validOption(query.get("organization"), players, "organization"),
    positionGroup: validOption(query.get("position"), players, "positionGroup"),
    statusGroup: validOption(query.get("status"), players, "statusGroup"),
    country: validOption(query.get("country"), players, "birthCountry"),
    activeOnly: query.get("active") === "1",
    metric: view === "countries" && metric === "per_capita" ? "total" : metric,
  };
}

export function filtersToQuery(filters: FilterState) {
  const query = new URLSearchParams();
  if (filters.view !== DEFAULT_FILTERS.view) query.set("view", filters.view);
  if (filters.level !== "all") query.set("level", filters.level);
  if (filters.organization !== "all") query.set("organization", filters.organization);
  if (filters.positionGroup !== "all") query.set("position", filters.positionGroup);
  if (filters.statusGroup !== "all") query.set("status", filters.statusGroup);
  if (filters.country !== "all") query.set("country", filters.country);
  if (filters.activeOnly) query.set("active", "1");
  if (filters.metric !== DEFAULT_FILTERS.metric) query.set("metric", filters.metric);
  return query;
}

export function filterPlayers(players: PlayerRow[], filters: FilterState) {
  return players.filter((player) => {
    if (filters.level !== "all" && player.level !== filters.level) return false;
    if (filters.organization !== "all" && player.organization !== filters.organization) return false;
    if (filters.positionGroup !== "all" && player.positionGroup !== filters.positionGroup) return false;
    if (filters.statusGroup !== "all" && player.statusGroup !== filters.statusGroup) return false;
    if (filters.country !== "all" && player.birthCountry !== filters.country) return false;
    if (filters.activeOnly && player.statusGroup !== "Active") return false;
    return true;
  });
}

function mostCommon(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "—";
}

export function buildCountyStats(counties: CountyMeta[], players: PlayerRow[]) {
  const aggregate = new Map<string, PlayerRow[]>();
  for (const player of players) {
    if (!player.countyFips) continue;
    const rows = aggregate.get(player.countyFips) ?? [];
    rows.push(player);
    aggregate.set(player.countyFips, rows);
  }
  return counties.map((county): CountyStats => {
    const rows = aggregate.get(county.fips) ?? [];
    const total = rows.length;
    return {
      ...county,
      total,
      perCapita: county.population ? (total / county.population) * 100_000 : 0,
      rateEligible: total >= RATE_MIN_COUNT,
      mlb: rows.filter((player) => player.level === "MLB").length,
      pitcher: rows.filter((player) => player.positionGroup === "Pitcher").length,
      mostCommonLevel: mostCommon(rows.map((player) => player.level)),
      mostCommonPosition: mostCommon(rows.map((player) => player.positionGroup)),
    };
  });
}

export function buildCountryStats(players: PlayerRow[]) {
  const aggregate = new Map<string, PlayerRow[]>();
  for (const player of players) {
    if (!player.birthCountry || player.birthCountry === "Unknown") continue;
    const rows = aggregate.get(player.birthCountry) ?? [];
    rows.push(player);
    aggregate.set(player.birthCountry, rows);
  }
  return [...aggregate.entries()].map(([country, rows]): CountryStats => ({
    country,
    total: rows.length,
    mlb: rows.filter((player) => player.level === "MLB").length,
    pitcher: rows.filter((player) => player.positionGroup === "Pitcher").length,
    mostCommonLevel: mostCommon(rows.map((player) => player.level)),
    mostCommonPosition: mostCommon(rows.map((player) => player.positionGroup)),
  }));
}

export function optionValues(players: PlayerRow[], field: OptionField) {
  return [...new Set(players.map((player) => player[field]))]
    .filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export type CoverageRow = {
  level: string;
  total: number;
  usBirths: number;
  mapped: number;
  mappedPct: number;
  international: number;
  unresolvedUs: number;
};

export function summarizeCoverageByLevel(players: PlayerRow[]) {
  const order = ["MLB", "Triple-A", "Double-A", "High-A", "Single-A", "Rookie", "Unassigned / unknown"];
  return order.map((level): CoverageRow => {
    const rows = players.filter((player) => player.level === level);
    const usBirths = rows.filter((player) => player.birthCountry === "USA").length;
    const mapped = rows.filter((player) => player.countyFips).length;
    return {
      level,
      total: rows.length,
      usBirths,
      mapped,
      mappedPct: usBirths ? (mapped / usBirths) * 100 : 0,
      international: rows.filter((player) => player.geographyBasis === "outside_us_map").length,
      unresolvedUs: usBirths - mapped,
    };
  });
}
