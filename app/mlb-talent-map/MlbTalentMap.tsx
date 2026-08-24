"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoAlbersUsa, geoEqualEarth, geoGraticule10, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import {
  DEFAULT_FILTERS,
  EMPTY_COLOR,
  METRIC_LABELS,
  RATE_INSUFFICIENT_COLOR,
  RATE_MIN_COUNT,
  buildCountyStats,
  buildCountryStats,
  colorScale,
  countryColorScale,
  countryMetricValue,
  filterPlayers,
  filtersToQuery,
  formatMetric,
  legendBins,
  metricValue,
  number,
  oneDecimal,
  optionValues,
  parseFiltersFromSearch,
  playerCountLabel,
  summarizeCoverageByLevel,
  twoDecimals,
} from "./model";
import type {
  CountryStats,
  CountyMeta,
  CountyStats,
  FilterState,
  MapView,
  Metric,
  PlayerRow,
} from "./model";

type SourceItem = { label: string; url: string };
type SummaryRow = { count: number };

type TalentData = {
  meta: {
    title: string;
    snapshotDate: string;
    generatedAt: string;
    rosterDefinition: string;
    geographyDefinition: string;
    totalPlayers: number;
    usBirthPlayers: number;
    mappedUsPlayers: number;
    usMappingPct: number;
    outsideUsMapPlayers: number;
    outsideUsMapPct: number;
    unresolvedUsPlayers: number;
    unresolvedUsPct: number;
    populationYear: number;
    publicUrl: string;
    sources: SourceItem[];
  };
  counties: CountyMeta[];
  players: PlayerRow[];
  summaries: {
    levels: Array<SummaryRow & { level: string }>;
    countries: Array<SummaryRow & { country: string }>;
    organizations: Array<SummaryRow & { organization: string }>;
    geography: Array<SummaryRow & { basis: string }>;
    matchMethods: Array<SummaryRow & { method: string }>;
  };
};

type CountyFeatureProperties = {
  GEOID?: string;
  county_fips?: string;
};
type CountyFeature = Feature<Geometry, CountyFeatureProperties>;

type CountryFeatureProperties = {
  isoA3?: string;
  name?: string;
  birthCountry?: string | null;
  labelLongitude?: number;
  labelLatitude?: number;
};
type CountryFeature = Feature<Geometry, CountryFeatureProperties>;

function countyFeatureFips(feature: CountyFeature) {
  return feature.properties.GEOID ?? feature.properties.county_fips ?? String(feature.id ?? "");
}

type GeometryBundle = {
  countyFeatures: CountyFeature[];
  countyCollection: FeatureCollection<Geometry, CountyFeatureProperties>;
  stateFeatures: Feature<Geometry>[];
  countryFeatures: CountryFeature[];
  countryCollection: FeatureCollection<Geometry, CountryFeatureProperties>;
};

function useTalentBundle() {
  const [bundle, setBundle] = useState<{ data: TalentData; geometry: GeometryBundle } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/data/mlb-talent-map.json").then((response) => {
        if (!response.ok) throw new Error("The MLB roster snapshot is unavailable.");
        return response.json() as Promise<TalentData>;
      }),
      fetch("/data/us-counties-2020-simplified.geojson").then((response) => {
        if (!response.ok) throw new Error("The county geometry file is unavailable.");
        return response.json() as Promise<FeatureCollection<Geometry, CountyFeatureProperties>>;
      }),
      fetch("/data/us-states-2020-simplified.geojson").then((response) => {
        if (!response.ok) throw new Error("The state geometry file is unavailable.");
        return response.json() as Promise<FeatureCollection<Geometry>>;
      }),
      fetch("/data/world-countries-50m.geojson").then((response) => {
        if (!response.ok) throw new Error("The country geometry file is unavailable.");
        return response.json() as Promise<FeatureCollection<Geometry, CountryFeatureProperties>>;
      }),
    ]).then(([data, counties, states, countries]) => {
      if (!cancelled) {
        setBundle({
          data,
          geometry: {
            countyFeatures: counties.features as CountyFeature[],
            countyCollection: counties,
            stateFeatures: states.features,
            countryFeatures: countries.features as CountryFeature[],
            countryCollection: countries,
          },
        });
      }
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "The map could not be loaded.");
    });
    return () => { cancelled = true; };
  }, []);
  return { bundle, error };
}

function CountyMap({
  geometry,
  countyStats,
  metric,
  activeFips,
  descriptionId,
  onCountyEnter,
  onCountyLeave,
  onCountySelect,
}: {
  geometry: GeometryBundle;
  countyStats: CountyStats[];
  metric: Metric;
  activeFips?: string | null;
  descriptionId: string;
  onCountyEnter: (county: CountyStats) => void;
  onCountyLeave: () => void;
  onCountySelect: (county: CountyStats) => void;
}) {
  const projection = useMemo(() => geoAlbersUsa().fitExtent(
    [[14, 12], [966, 598]],
    geometry.countyCollection,
  ), [geometry.countyCollection]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const statsByFips = useMemo(() =>
    new Map(countyStats.map((county) => [county.fips, county])),
  [countyStats]);
  const scale = useMemo(() => colorScale(countyStats, metric), [countyStats, metric]);

  return (
    <svg
      className="county-map"
      viewBox="0 0 980 610"
      role="img"
      aria-label={`U.S. county map shaded by ${METRIC_LABELS[metric].toLowerCase()}`}
      aria-describedby={descriptionId}
    >
      <rect className="map-ocean" width="980" height="610" rx="18" />
      <g className="county-layer">
        {geometry.countyFeatures.map((feature) => {
          const fips = countyFeatureFips(feature);
          const county = statsByFips.get(fips);
          const value = county ? metricValue(county, metric) : 0;
          const fill = metric === "per_capita" && county?.total && !county.rateEligible
            ? RATE_INSUFFICIENT_COLOR : scale.color(value);
          const d = path(feature);
          if (!d) return null;
          const interactive = Boolean(county?.total);
          return (
            <path
              key={fips}
              d={d}
              fill={fill}
              className={activeFips === fips ? "county active" : "county"}
              aria-hidden="true"
              onMouseEnter={interactive && county ? () => onCountyEnter(county) : undefined}
              onMouseLeave={interactive ? onCountyLeave : undefined}
              onClick={interactive && county ? () => onCountySelect(county) : undefined}
            />
          );
        })}
      </g>
      <g className="state-boundary-layer" aria-hidden="true">
        {geometry.stateFeatures.map((feature, index) => (
          <path
            className="state-boundary"
            d={path(feature) ?? undefined}
            key={String(feature.id ?? index)}
          />
        ))}
      </g>
      <g className="inset-labels" aria-hidden="true">
        <text x="190" y="568">ALASKA</text>
        <text x="365" y="564">HAWAII</text>
      </g>
    </svg>
  );
}

function CountyDetail({ county, onClose }: { county: CountyStats; onClose?: () => void }) {
  return (
    <section className="county-detail" aria-live="polite">
      <div className="county-detail-heading">
        <div>
          <p className="detail-kicker">County detail</p>
          <h3>{county.name}, {county.stateAbbr}</h3>
        </div>
        {onClose ? (
          <button aria-label="Close county detail" className="icon-button" type="button" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
      <dl className="county-detail-grid">
        <div><dt>Rostered players</dt><dd>{number.format(county.total)}</dd></div>
        <div><dt>Players per 100,000</dt><dd>{twoDecimals.format(county.perCapita)}</dd></div>
        <div><dt>At MLB level</dt><dd>{number.format(county.mlb)}</dd></div>
        <div><dt>Pitchers</dt><dd>{number.format(county.pitcher)}</dd></div>
        <div><dt>Most common level</dt><dd>{county.mostCommonLevel}</dd></div>
        <div><dt>Most common role</dt><dd>{county.mostCommonPosition}</dd></div>
      </dl>
      <p className="population-note">
        2020 population: {number.format(county.population)}. Per-capita rankings require at least {RATE_MIN_COUNT} mapped players
        {county.rateEligible ? "." : "; this county is not rate-ranked."}
      </p>
    </section>
  );
}

type CountMetric = Exclude<Metric, "per_capita">;

function WorldMap({
  geometry,
  countryStats,
  metric,
  activeCountry,
  descriptionId,
  onCountryEnter,
  onCountryLeave,
  onCountrySelect,
}: {
  geometry: GeometryBundle;
  countryStats: CountryStats[];
  metric: CountMetric;
  activeCountry?: string | null;
  descriptionId: string;
  onCountryEnter: (country: CountryStats) => void;
  onCountryLeave: () => void;
  onCountrySelect: (country: CountryStats) => void;
}) {
  const projection = useMemo(() => geoEqualEarth().fitExtent(
    [[16, 24], [964, 580]],
    geometry.countryCollection,
  ), [geometry.countryCollection]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const statsByCountry = useMemo(() =>
    new Map(countryStats.map((country) => [country.country, country])),
  [countryStats]);
  const scale = useMemo(() => countryColorScale(countryStats, metric), [countryStats, metric]);

  return (
    <svg
      className="county-map world-map"
      viewBox="0 0 980 610"
      role="img"
      aria-label={`World map shaded by ${METRIC_LABELS[metric].toLowerCase()}`}
      aria-describedby={descriptionId}
    >
      <path className="world-sphere" d={path({ type: "Sphere" }) ?? undefined} />
      <path className="world-graticule" d={path(geoGraticule10()) ?? undefined} aria-hidden="true" />
      <g className="country-layer">
        {geometry.countryFeatures.map((feature, index) => {
          const birthCountry = feature.properties.birthCountry;
          const stats = birthCountry ? statsByCountry.get(birthCountry) : undefined;
          const value = stats ? countryMetricValue(stats, metric) : 0;
          const d = path(feature);
          if (!d) return null;
          const interactive = Boolean(stats?.total);
          return (
            <path
              key={feature.properties.isoA3 ?? String(feature.id ?? index)}
              d={d}
              fill={scale.color(value)}
              className={activeCountry === birthCountry ? "country active" : "country"}
              aria-hidden="true"
              onMouseEnter={interactive && stats ? () => onCountryEnter(stats) : undefined}
              onMouseLeave={interactive ? onCountryLeave : undefined}
              onClick={interactive && stats ? () => onCountrySelect(stats) : undefined}
            />
          );
        })}
      </g>
      <g className="tiny-country-layer" aria-hidden="true">
        {geometry.countryFeatures.map((feature) => {
          const birthCountry = feature.properties.birthCountry;
          const stats = birthCountry ? statsByCountry.get(birthCountry) : undefined;
          if (!stats?.total || path.area(feature) >= 18) return null;
          const point = projection([
            feature.properties.labelLongitude ?? 0,
            feature.properties.labelLatitude ?? 0,
          ]);
          if (!point) return null;
          return (
            <circle
              key={`dot-${feature.properties.isoA3}`}
              cx={point[0]}
              cy={point[1]}
              r={activeCountry === birthCountry ? 6 : 4.5}
              fill={scale.color(countryMetricValue(stats, metric))}
              className={activeCountry === birthCountry ? "tiny-country active" : "tiny-country"}
              onMouseEnter={() => onCountryEnter(stats)}
              onMouseLeave={onCountryLeave}
              onClick={() => onCountrySelect(stats)}
            />
          );
        })}
      </g>
    </svg>
  );
}

function CountryDetail({ country, onClose }: { country: CountryStats; onClose?: () => void }) {
  return (
    <section className="county-detail country-detail" aria-live="polite">
      <div className="county-detail-heading">
        <div>
          <p className="detail-kicker">Birth-country detail</p>
          <h3>{country.country}</h3>
        </div>
        {onClose ? (
          <button aria-label="Close birth-country detail" className="icon-button" type="button" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
      <dl className="county-detail-grid country-detail-grid">
        <div><dt>Rostered players</dt><dd>{number.format(country.total)}</dd></div>
        <div><dt>At MLB level</dt><dd>{number.format(country.mlb)}</dd></div>
        <div><dt>Pitchers</dt><dd>{number.format(country.pitcher)}</dd></div>
        <div><dt>Most common level</dt><dd>{country.mostCommonLevel}</dd></div>
        <div><dt>Most common role</dt><dd>{country.mostCommonPosition}</dd></div>
      </dl>
      <p className="population-note">Country is taken directly from MLB&apos;s reported birth-country field; no city-level location is inferred.</p>
    </section>
  );
}

function SelectFilter({
  id, label, value, values, allLabel = "All", onChange,
}: {
  id: string;
  label: string;
  value: string;
  values: string[];
  allLabel?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="filter-field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">{allLabel}</option>
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  );
}

function CountyInspector({
  counties, selectedFips, onChange,
}: {
  counties: CountyStats[];
  selectedFips: string;
  onChange: (fips: string) => void;
}) {
  const options = [...counties].filter((county) => county.total > 0)
    .sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
  return (
    <label className="county-inspector" htmlFor="county-inspector">
      <span>Inspect a mapped county</span>
      <select id="county-inspector" value={selectedFips} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose a county</option>
        {options.map((county) => (
          <option key={county.fips} value={county.fips}>
            {county.name}, {county.stateAbbr} — {playerCountLabel(county.total)}
          </option>
        ))}
      </select>
    </label>
  );
}

function CountryInspector({
  countries, selectedCountry, onChange,
}: {
  countries: CountryStats[];
  selectedCountry: string;
  onChange: (country: string) => void;
}) {
  const options = [...countries].filter((country) => country.total > 0)
    .sort((a, b) => a.country.localeCompare(b.country));
  return (
    <label className="county-inspector" htmlFor="country-inspector">
      <span>Inspect a birth country</span>
      <select id="country-inspector" value={selectedCountry} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose a country or territory</option>
        {options.map((country) => (
          <option key={country.country} value={country.country}>
            {country.country} — {playerCountLabel(country.total)}
          </option>
        ))}
      </select>
    </label>
  );
}

function LoadingState({ error }: { error?: string | null }) {
  return (
    <main className="loading-shell" aria-busy={!error}>
      <div className="loading-card" role={error ? "alert" : "status"}>
        <span className="brand-chip">ROSTER ATLAS</span>
        <h1>The Geography of MLB Talent</h1>
        <p>{error ?? "Loading the official roster snapshot and U.S./world boundary data…"}</p>
      </div>
    </main>
  );
}

function CountryRanking({ players }: { players: PlayerRow[] }) {
  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const player of players) {
      counts.set(player.birthCountry, (counts.get(player.birthCountry) ?? 0) + 1);
    }
    return [...counts.entries()].map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country)).slice(0, 10);
  }, [players]);
  return (
    <div className="country-ranking">
      <h3>Birth countries</h3>
      <ol>
        {rows.map((row) => (
          <li key={row.country}>
            <span>{row.country}</span>
            <strong>{number.format(row.count)}</strong>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function MlbTalentMap() {
  const { bundle, error } = useTalentBundle();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [hoveredCounty, setHoveredCounty] = useState<CountyStats | null>(null);
  const [pinnedCounty, setPinnedCounty] = useState<CountyStats | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<CountryStats | null>(null);
  const [pinnedCountry, setPinnedCountry] = useState<CountryStats | null>(null);
  const [shareState, setShareState] = useState("Copy share link");
  const didReadUrl = useRef(false);

  useEffect(() => {
    if (!bundle || didReadUrl.current) return;
    didReadUrl.current = true;
    const readUrl = () => {
      setFilters(parseFiltersFromSearch(window.location.search, bundle.data.players));
      setPinnedCounty(null);
      setPinnedCountry(null);
    };
    readUrl();
    window.addEventListener("popstate", readUrl);
    return () => window.removeEventListener("popstate", readUrl);
  }, [bundle]);

  useEffect(() => {
    if (!didReadUrl.current || typeof window === "undefined") return;
    const query = filtersToQuery(filters).toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [filters]);

  const update = useCallback(<Key extends keyof FilterState>(key: Key, value: FilterState[Key]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPinnedCounty(null);
    setPinnedCountry(null);
  }, []);

  const filteredPlayers = useMemo(() =>
    bundle ? filterPlayers(bundle.data.players, filters) : [],
  [bundle, filters]);
  const mappedPlayers = useMemo(() =>
    filteredPlayers.filter((player) => player.countyFips),
  [filteredPlayers]);
  const countyStats = useMemo(() =>
    bundle ? buildCountyStats(bundle.data.counties, mappedPlayers) : [],
  [bundle, mappedPlayers]);
  const scale = useMemo(() => colorScale(countyStats, filters.metric), [countyStats, filters.metric]);
  const bins = useMemo(() => legendBins(scale.thresholds, filters.metric), [scale.thresholds, filters.metric]);
  const rankings = useMemo(() => [...countyStats]
    .filter((county) => metricValue(county, filters.metric) > 0)
    .sort((a, b) => metricValue(b, filters.metric) - metricValue(a, filters.metric)
      || b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, 10), [countyStats, filters.metric]);
  const countryStats = useMemo(() => buildCountryStats(filteredPlayers), [filteredPlayers]);
  const countryMetric: CountMetric = filters.metric === "per_capita" ? "total" : filters.metric;
  const countryScale = useMemo(() =>
    countryColorScale(countryStats, countryMetric),
  [countryStats, countryMetric]);
  const countryBins = useMemo(() =>
    legendBins(countryScale.thresholds, countryMetric),
  [countryScale.thresholds, countryMetric]);
  const countryRankings = useMemo(() => [...countryStats]
    .filter((country) => countryMetricValue(country, countryMetric) > 0)
    .sort((a, b) => countryMetricValue(b, countryMetric) - countryMetricValue(a, countryMetric)
      || b.total - a.total || a.country.localeCompare(b.country))
    .slice(0, 10), [countryStats, countryMetric]);
  const mappedCountryNames = useMemo(() => new Set(
    bundle?.geometry.countryFeatures.map((feature) => feature.properties.birthCountry).filter(Boolean) as string[] ?? [],
  ), [bundle]);
  const worldMappedPlayers = useMemo(() =>
    filteredPlayers.filter((player) => mappedCountryNames.has(player.birthCountry)),
  [filteredPlayers, mappedCountryNames]);

  if (!bundle) return <LoadingState error={error} />;

  const { data, geometry } = bundle;
  const activeCounty = pinnedCounty ?? hoveredCounty;
  const activeCountry = pinnedCountry ?? hoveredCountry;
  const usPlayers = filteredPlayers.filter((player) => player.birthCountry === "USA");
  const internationalPlayers = filteredPlayers.filter((player) => player.geographyBasis === "outside_us_map");
  const unresolvedUs = usPlayers.length - mappedPlayers.length;
  const coverage = usPlayers.length ? (mappedPlayers.length / usPlayers.length) * 100 : 0;
  const coverageByLevel = summarizeCoverageByLevel(filteredPlayers);
  const selectedCountyFips = pinnedCounty?.fips ?? "";
  const selectedCountry = pinnedCountry?.country ?? "";
  const unknownCountryPlayers = filteredPlayers.length - worldMappedPlayers.length;
  const countyMapDescription = `${number.format(mappedPlayers.length)} players are assigned to representative U.S. counties from ${number.format(usPlayers.length)} U.S.-born roster records in the current selection. International and unresolved locations are not converted to zero.`;
  const worldMapDescription = `${number.format(worldMappedPlayers.length)} roster records are assigned to ${number.format(countryStats.length)} reported birth countries or territories in the current selection. ${number.format(unknownCountryPlayers)} records with unknown country are not mapped.`;

  const changeView = (view: MapView) => {
    setFilters((current) => ({
      ...current,
      view,
      metric: view === "countries" && current.metric === "per_capita" ? "total" : current.metric,
    }));
    setPinnedCounty(null);
    setHoveredCounty(null);
    setPinnedCountry(null);
    setHoveredCountry(null);
  };

  const changeCountryFilter = (country: string) => {
    setFilters((current) => ({
      ...current,
      country,
      view: country !== "all" && country !== "USA" ? "countries" : current.view,
      metric: country !== "all" && country !== "USA" && current.metric === "per_capita"
        ? "total" : current.metric,
    }));
    setPinnedCounty(null);
    setHoveredCounty(null);
    setPinnedCountry(null);
    setHoveredCountry(null);
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareState("Link copied");
      window.setTimeout(() => setShareState("Copy share link"), 1600);
    } catch {
      setShareState("Use the URL in your browser");
    }
  };

  return (
    <main className="site-shell mlb-theme" data-map-ready="true">
      <header className="site-header">
        <div className="header-copy">
          <div className="eyebrow-line">
            <span>MLB + AFFILIATED MINOR LEAGUES</span>
            <span className="brand-chip">ROSTER ATLAS</span>
          </div>
          <h1>The Geography of MLB Talent</h1>
          <p>
            Every player on an MLB organization full roster as of {data.meta.snapshotDate}, including MLB, Triple-A, Double-A, High-A, Single-A, and Rookie levels. U.S. counties use conservative federal place matching; international players are mapped to MLB&apos;s reported birth countries.
          </p>
        </div>
        <div className="header-actions">
          <button className="share-button" type="button" onClick={handleShare}>{shareState}</button>
          <p>Filters stay in the URL when you share.</p>
        </div>
      </header>

      <section className="coverage-strip" aria-label="Current roster coverage">
        <div><span>Rostered players</span><strong>{number.format(filteredPlayers.length)}</strong></div>
        <div><span>U.S.-born records</span><strong>{number.format(usPlayers.length)}</strong></div>
        <div><span>U.S. place mapped</span><strong>{number.format(mappedPlayers.length)} · {oneDecimal.format(coverage)}%</strong></div>
        <div><span>International / territory</span><strong>{number.format(internationalPlayers.length)}</strong></div>
      </section>

      <div className="workspace-grid">
        <section className="map-panel">
          <div className="map-view-tabs" aria-label="Map geography">
            <button type="button" aria-pressed={filters.view === "counties"} onClick={() => changeView("counties")}>U.S. counties</button>
            <button type="button" aria-pressed={filters.view === "countries"} onClick={() => changeView("countries")}>Birth countries</button>
          </div>
          <div className="map-panel-head">
            <div>
              <p className="panel-kicker">{filters.view === "counties" ? "U.S. birthplace view" : "Worldwide birthplace view"}</p>
              <h2>{METRIC_LABELS[filters.view === "countries" ? countryMetric : filters.metric]}</h2>
            </div>
            <p className="interaction-note">
              {filters.view === "counties" ? "Point to or tap a county" : "Point to or tap a country"} · keyboard users can use the selector
            </p>
          </div>
          <div className="view-status">
            {filters.view === "counties" ? (
              <>
                <strong>Representative federal-place county</strong>
                <span>{playerCountLabel(mappedPlayers.length)} mapped</span>
                <span>{number.format(unresolvedUs)} U.S. records unresolved or ambiguous</span>
              </>
            ) : (
              <>
                <strong>MLB reported birth country</strong>
                <span>{playerCountLabel(worldMappedPlayers.length)} mapped</span>
                <span>{number.format(countryStats.length)} countries / territories · {number.format(unknownCountryPlayers)} unknown</span>
              </>
            )}
          </div>
          <div className="metric-tabs" aria-label="Map metric">
            {(filters.view === "countries"
              ? ["total", "mlb", "pitcher"] as CountMetric[]
              : Object.keys(METRIC_LABELS) as Metric[]).map((metric) => (
              <button
                key={metric}
                type="button"
                aria-pressed={filters.metric === metric}
                onClick={() => update("metric", metric)}
              >
                {METRIC_LABELS[metric]}
              </button>
            ))}
          </div>
          {filters.view === "counties" ? (
            <CountyInspector
              counties={countyStats}
              selectedFips={selectedCountyFips}
              onChange={(fips) => {
                setPinnedCounty(countyStats.find((county) => county.fips === fips) ?? null);
                setHoveredCounty(null);
              }}
            />
          ) : (
            <CountryInspector
              countries={countryStats}
              selectedCountry={selectedCountry}
              onChange={(country) => {
                setPinnedCountry(countryStats.find((row) => row.country === country) ?? null);
                setHoveredCountry(null);
              }}
            />
          )}
          <p id="map-description" className="visually-hidden">
            {filters.view === "counties" ? countyMapDescription : worldMapDescription}
          </p>
          <div className="map-stage">
            {filters.view === "counties" ? (
              <CountyMap
                geometry={geometry}
                countyStats={countyStats}
                metric={filters.metric}
                activeFips={activeCounty?.fips}
                descriptionId="map-description"
                onCountyEnter={setHoveredCounty}
                onCountyLeave={() => setHoveredCounty(null)}
                onCountySelect={setPinnedCounty}
              />
            ) : (
              <WorldMap
                geometry={geometry}
                countryStats={countryStats}
                metric={countryMetric}
                activeCountry={activeCountry?.country}
                descriptionId="map-description"
                onCountryEnter={setHoveredCountry}
                onCountryLeave={() => setHoveredCountry(null)}
                onCountrySelect={setPinnedCountry}
              />
            )}
            {filters.view === "counties" ? (
              activeCounty ? (
                <CountyDetail
                  county={activeCounty}
                  onClose={pinnedCounty ? () => setPinnedCounty(null) : undefined}
                />
              ) : (
                <div className="map-placeholder-detail">
                  <strong>Select a county</strong>
                  <span>See roster totals, MLB-level players, pitchers, dominant level, and the population-normalized rate.</span>
                </div>
              )
            ) : activeCountry ? (
              <CountryDetail
                country={activeCountry}
                onClose={pinnedCountry ? () => setPinnedCountry(null) : undefined}
              />
            ) : (
              <div className="map-placeholder-detail">
                <strong>Select a birth country</strong>
                <span>See roster totals, MLB-level players, pitchers, dominant level, and role. Dots keep small territories visible.</span>
              </div>
            )}
          </div>
          <div className="legend" aria-label={`${METRIC_LABELS[filters.view === "countries" ? countryMetric : filters.metric]} legend`}>
            <span className="legend-title">{METRIC_LABELS[filters.view === "countries" ? countryMetric : filters.metric]}</span>
            <span className="legend-item"><i style={{ background: EMPTY_COLOR }} />0</span>
            {filters.view === "counties" && filters.metric === "per_capita" ? (
              <span className="legend-item">
                <i style={{ background: RATE_INSUFFICIENT_COLOR }} />1–{RATE_MIN_COUNT - 1} mapped (rate withheld)
              </span>
            ) : null}
            {(filters.view === "countries" ? countryBins : bins).map((bin) => (
              <span className="legend-item" key={`${bin.color}-${bin.label}`}>
                <i style={{ background: bin.color }} />{bin.label}
              </span>
            ))}
            {filters.view === "countries" ? <span className="legend-note">Dots mark small country / territory polygons.</span> : null}
          </div>
        </section>

        <aside className="filter-panel">
          <div className="panel-heading">
            <div><p className="panel-kicker">Refine the roster</p><h2>Filters</h2></div>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setPinnedCounty(null);
                setHoveredCounty(null);
                setPinnedCountry(null);
                setHoveredCountry(null);
              }}
            >Reset</button>
          </div>
          <div className="filter-grid">
            <SelectFilter id="filter-level" label="Roster level" value={filters.level}
              values={optionValues(data.players, "level")} onChange={(value) => update("level", value)} />
            <SelectFilter id="filter-organization" label="MLB organization" value={filters.organization}
              values={optionValues(data.players, "organization")} onChange={(value) => update("organization", value)} />
            <SelectFilter id="filter-position" label="Position group" value={filters.positionGroup}
              values={optionValues(data.players, "positionGroup")} onChange={(value) => update("positionGroup", value)} />
            <SelectFilter id="filter-status" label="Roster status" value={filters.statusGroup}
              values={optionValues(data.players, "statusGroup")} onChange={(value) => update("statusGroup", value)} />
            <SelectFilter id="filter-country" label="Birth country" value={filters.country}
              values={optionValues(data.players, "birthCountry")} onChange={changeCountryFilter} />
          </div>
          <div className="checkbox-stack">
            <label className="checkbox-filter">
              <input type="checkbox" checked={filters.activeOnly}
                onChange={(event) => update("activeOnly", event.target.checked)} />
              <span aria-hidden="true" className="checkbox-mark" />
              <span>Active roster status only</span>
            </label>
          </div>
          <div className="filter-note">
            <strong>Evidence policy</strong>
            <p>{data.meta.rosterDefinition}</p>
            <p>{data.meta.geographyDefinition}</p>
            <p>Current selection: {number.format(filteredPlayers.length)} rostered; {number.format(mappedPlayers.length)} mapped U.S.; {number.format(internationalPlayers.length)} international or territory; {number.format(unresolvedUs)} unresolved U.S.</p>
          </div>
        </aside>

        <aside className="ranking-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Current selection</p>
              <h2>{filters.view === "counties" ? "Top counties" : "Top birth countries"}</h2>
            </div>
          </div>
          <ol className="ranking-list">
            {filters.view === "counties" ? (
              rankings.length ? rankings.map((county, index) => (
                <li key={county.fips}>
                  <button
                    type="button"
                    aria-label={`Inspect ${county.name}, ${county.stateAbbr}: ${formatMetric(metricValue(county, filters.metric), filters.metric)} ${METRIC_LABELS[filters.metric].toLowerCase()}`}
                    onMouseEnter={() => setHoveredCounty(county)}
                    onMouseLeave={() => setHoveredCounty(null)}
                    onFocus={() => setHoveredCounty(county)}
                    onBlur={() => setHoveredCounty(null)}
                    onClick={() => setPinnedCounty(county)}
                  >
                    <span className="rank-number">{index + 1}</span>
                    <span className="rank-name"><strong>{county.name}</strong><small>{county.stateAbbr}</small></span>
                    <span className="rank-value">{formatMetric(metricValue(county, filters.metric), filters.metric)}</span>
                  </button>
                </li>
              )) : <li className="empty-ranking">No mapped U.S. players match this filter combination.</li>
            ) : (
              countryRankings.length ? countryRankings.map((country, index) => (
                <li key={country.country}>
                  <button
                    type="button"
                    aria-label={`Inspect ${country.country}: ${number.format(countryMetricValue(country, countryMetric))} ${METRIC_LABELS[countryMetric].toLowerCase()}`}
                    onMouseEnter={() => setHoveredCountry(country)}
                    onMouseLeave={() => setHoveredCountry(null)}
                    onFocus={() => setHoveredCountry(country)}
                    onBlur={() => setHoveredCountry(null)}
                    onClick={() => setPinnedCountry(country)}
                  >
                    <span className="rank-number">{index + 1}</span>
                    <span className="rank-name"><strong>{country.country}</strong><small>Birth country / territory</small></span>
                    <span className="rank-value">{number.format(countryMetricValue(country, countryMetric))}</span>
                  </button>
                </li>
              )) : <li className="empty-ranking">No reported birth countries match this filter combination.</li>
            )}
          </ol>
          <div className="rank-context">
            <strong>{filters.view === "counties" && filters.metric === "per_capita" ? "Rate reliability rule" : "Ranking scope"}</strong>
            <p>{filters.view === "countries"
              ? "Country totals use MLB's reported birth-country field directly. Boundary shapes show country-level extent and do not imply an exact birthplace within a country."
              : filters.metric === "per_capita"
                ? `Counties need at least ${RATE_MIN_COUNT} mapped players in the current selection to enter the rate ranking.`
                : "Rankings use only matched U.S. birthplace records in the current roster selection; international and unresolved records are not estimated."}</p>
          </div>
          {filters.view === "counties" ? <CountryRanking players={filteredPlayers} /> : null}
        </aside>
      </div>

      <section className="coverage-audit" aria-labelledby="coverage-audit-title">
        <div className="coverage-audit-heading">
          <div>
            <p className="panel-kicker">Coverage audit</p>
            <h2 id="coverage-audit-title">The roster universe stays complete when the map cannot.</h2>
          </div>
          <p>
            County coverage is calculated only against U.S.-born records. International players map directly to MLB&apos;s reported birth country, while ambiguous U.S. place names and unknown countries remain unresolved.
          </p>
        </div>
        <p className="table-scroll-note">Swipe horizontally to see every coverage column.</p>
        <div className="audit-table-wrap" role="region" aria-label="Roster coverage by level" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Roster level</th>
                <th scope="col">All players</th>
                <th scope="col">U.S.-born</th>
                <th scope="col">Mapped U.S.</th>
                <th scope="col">U.S. mapping rate</th>
                <th scope="col">International / territory</th>
                <th scope="col">Unresolved U.S.</th>
              </tr>
            </thead>
            <tbody>
              {coverageByLevel.map((row) => (
                <tr key={row.level}>
                  <th scope="row">{row.level}</th>
                  <td>{number.format(row.total)}</td>
                  <td>{number.format(row.usBirths)}</td>
                  <td>{number.format(row.mapped)}</td>
                  <td>{oneDecimal.format(row.mappedPct)}%</td>
                  <td>{number.format(row.international)}</td>
                  <td>{number.format(row.unresolvedUs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="methodology-band">
        <div>
          <p className="panel-kicker">Methodology</p>
          <h2>Birth countries are direct; county geography is conservative.</h2>
        </div>
        <p>
          The snapshot uses MLB&apos;s full organization roster for all 30 clubs and deduplicates by MLB person ID. Reported birth countries are joined by ISO code to Natural Earth 5.1.1 boundaries. For U.S. births, city and state are matched against current USGS GNIS official and variant populated-place names. A county is assigned only when every matched federal place points to one county; otherwise the record remains unresolved.
        </p>
        <dl>
          <div><dt>All rostered players</dt><dd>{number.format(data.meta.totalPlayers)}</dd></div>
          <div><dt>Mapped U.S. records</dt><dd>{number.format(data.meta.mappedUsPlayers)} · {oneDecimal.format(data.meta.usMappingPct)}%</dd></div>
          <div><dt>International / territory</dt><dd>{number.format(data.meta.outsideUsMapPlayers)} · {oneDecimal.format(data.meta.outsideUsMapPct)}%</dd></div>
          <div><dt>Unresolved U.S. records</dt><dd>{number.format(data.meta.unresolvedUsPlayers)} · {oneDecimal.format(data.meta.unresolvedUsPct)}%</dd></div>
        </dl>
      </section>

      <footer className="site-footer">
        <div>
          <strong>Sources</strong>
          <p>
            {data.meta.sources.map((source, index) => (
              <Fragment key={source.url}>
                {index ? " · " : ""}
                <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a>
              </Fragment>
            ))}
            {" · "}
            <a href="https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/" target="_blank" rel="noreferrer">
              Natural Earth 1:50m country boundaries
            </a>
          </p>
        </div>
        <div className="footer-note">
          <span>Roster snapshot: {data.meta.snapshotDate}</span>
          <span>Independent research · not affiliated with or endorsed by MLB</span>
          <span className="quiet-brand">ROSTER ATLAS</span>
        </div>
      </footer>
    </main>
  );
}
