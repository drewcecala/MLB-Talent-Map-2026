"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import {
  DEFAULT_HIGH_SCHOOL_FILTERS,
  ERA_LABELS,
  countUniquePlayers,
  formatSeasons,
  highSchoolFiltersToQuery,
  integer,
  optionValues,
  parseHighSchoolFilters,
  rankHighSchools,
  schoolLocation,
} from "./model";
import type {
  Era,
  HighSchool,
  HighSchoolFilters,
  RankedHighSchool,
} from "./model";

type HighSchoolData = {
  meta: {
    title: string;
    snapshotDate: string;
    startDate: string;
    generatedAt: string;
    definition: string;
    sources: string[];
    caveats: string[];
    counts: {
      affiliatedPlayers: number;
      mlbParticipants: number;
      minorOnlyPlayers: number;
      hydratedPlayers: number;
      playersWithAnyHighSchool: number;
      playersWithUsHighSchool: number;
      playersMissingHighSchool: number;
      schoolPlayerCredits: number;
      usHighSchoolIdentities: number;
      locatedHighSchools: number;
      locatedPlayers: number;
      outsideScopeCredits: number;
    };
  };
  schools: HighSchool[];
};

type StateProperties = { state_abbr?: string; state_name?: string };
type StateFeature = Feature<Geometry, StateProperties>;

function useHighSchoolBundle() {
  const [bundle, setBundle] = useState<{
    data: HighSchoolData;
    states: FeatureCollection<Geometry, StateProperties>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/data/mlb-high-school-leaders.json").then((response) => {
        if (!response.ok) throw new Error("The high-school research snapshot is unavailable.");
        return response.json() as Promise<HighSchoolData>;
      }),
      fetch("/data/us-states-2020-simplified.geojson").then((response) => {
        if (!response.ok) throw new Error("The state geometry file is unavailable.");
        return response.json() as Promise<FeatureCollection<Geometry, StateProperties>>;
      }),
    ]).then(([data, states]) => {
      if (!cancelled) setBundle({ data, states });
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "The map could not be loaded.");
    });
    return () => { cancelled = true; };
  }, []);

  return { bundle, error };
}

const LABEL_OFFSETS: Record<string, [number, number]> = {
  "fl-img-academy-bradenton": [-42, -42],
  "fl-american-heritage-plantation": [42, -32],
  "ca-rancho-bernardo-san-diego": [-24, 72],
  "az-chaparral-scottsdale": [-30, -30],
  "nv-bishop-gorman-las-vegas": [20, -19],
};

function dotRadius(count: number) {
  return 3.8 + Math.sqrt(count) * 2.25;
}

function HighSchoolDotMap({
  states,
  schools,
  activeId,
  descriptionId,
  onEnter,
  onLeave,
  onSelect,
}: {
  states: FeatureCollection<Geometry, StateProperties>;
  schools: RankedHighSchool[];
  activeId: string | null;
  descriptionId: string;
  onEnter: (school: RankedHighSchool) => void;
  onLeave: () => void;
  onSelect: (school: RankedHighSchool) => void;
}) {
  const projection = useMemo(() => geoAlbersUsa().fitExtent(
    [[26, 28], [954, 564]],
    states,
  ), [states]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const labeled = useMemo(() => new Set(schools.slice(0, 10)
    .map((school) => school.id).filter((id) => id in LABEL_OFFSETS)), [schools]);

  return (
    <svg
      className="hs-map"
      viewBox="0 0 980 600"
      role="group"
      aria-label="U.S. map locating leading high schools by MLB and affiliated Minor League Baseball participants since 2000"
      aria-describedby={descriptionId}
    >
      <rect className="hs-map-background" width="980" height="600" rx="18" />
      <g aria-hidden="true">
        {(states.features as StateFeature[]).map((feature, index) => (
          <path className="hs-state" d={path(feature) ?? undefined} key={String(feature.id ?? index)} />
        ))}
      </g>
      <g className="hs-dot-layer">
        {schools.map((school) => {
          const point = projection([school.longitude!, school.latitude!]);
          if (!point) return null;
          const active = activeId === school.id;
          return (
            <circle
              key={school.id}
              cx={point[0]}
              cy={point[1]}
              r={dotRadius(school.filteredCount) + (active ? 2.2 : 0)}
              className={active ? "hs-dot active" : "hs-dot"}
              role="button"
              tabIndex={0}
              aria-label={`${school.name}, ${schoolLocation(school)}: ${school.filteredCount} players in the current selection`}
              onMouseEnter={() => onEnter(school)}
              onMouseLeave={onLeave}
              onFocus={() => onEnter(school)}
              onBlur={onLeave}
              onClick={() => onSelect(school)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(school);
                }
              }}
            >
              <title>{school.name}, {schoolLocation(school)} — {school.filteredCount} players</title>
            </circle>
          );
        })}
      </g>
      <g className="hs-label-layer" aria-hidden="true">
        {schools.filter((school) => labeled.has(school.id)).map((school) => {
          const point = projection([school.longitude!, school.latitude!]);
          if (!point) return null;
          const [dx, dy] = LABEL_OFFSETS[school.id];
          const anchor = dx < 0 ? "end" : "start";
          return (
            <g key={`label-${school.id}`}>
              <line x1={point[0]} y1={point[1]} x2={point[0] + dx * 0.76} y2={point[1] + dy * 0.76} />
              <text x={point[0] + dx} y={point[1] + dy} textAnchor={anchor}>
                <tspan>{school.name}</tspan>
                <tspan className="hs-label-count" dx="5">{school.filteredCount}</tspan>
              </text>
            </g>
          );
        })}
      </g>
      <g className="hs-inset-labels" aria-hidden="true">
        <text x="190" y="558">ALASKA</text>
        <text x="365" y="552">HAWAII</text>
      </g>
    </svg>
  );
}

function SchoolDetail({ school }: { school: RankedHighSchool }) {
  return (
    <section className="hs-detail" aria-live="polite" aria-label="Selected high school detail">
      <div className="hs-detail-head">
        <div>
          <p className="panel-kicker">Selected program</p>
          <h3>{school.name}</h3>
          <p>{schoolLocation(school)}</p>
        </div>
        <div className="hs-detail-total">
          <strong>{integer.format(school.filteredCount)}</strong>
          <span>{school.filteredCount === 1 ? "player" : "players"}</span>
        </div>
      </div>
      <div className="hs-player-list" role="list" aria-label={`Players credited to ${school.name}`}>
        {school.filteredPlayers.map((player) => (
          <div className="hs-player-row" role="listitem" key={player.id}>
            <strong>{player.name}</strong>
            <span>{player.positionGroup} · {player.position} · highest in window {player.highestLevel}</span>
            <span>
              Seasons {formatSeasons(player.seasons)}
              {player.mlbDebutDate ? <> · MLB debut <time dateTime={player.mlbDebutDate}>{player.mlbDebutDate}</time></> : ""}
            </span>
          </div>
        ))}
      </div>
      <p className="hs-detail-source">
        School identity uses MLB&apos;s education record.
        {school.locationSourceUrl ? (
          <> <a href={school.locationSourceUrl} target="_blank" rel="noreferrer">Verify campus location</a>.</>
        ) : null}
      </p>
    </section>
  );
}

function LoadingState({ error }: { error?: string | null }) {
  return (
    <main className="loading-shell hs-loading" aria-busy={!error}>
      <div className="loading-card" role={error ? "alert" : "status"}>
        <span className="brand-chip">AFFILIATED PIPELINE</span>
        <h1>High Schools Producing MLB &amp; MiLB Talent</h1>
        <p>{error ?? "Loading the audited school, player, and campus-location records…"}</p>
      </div>
    </main>
  );
}

export function MlbHighSchoolMap() {
  const { bundle, error } = useHighSchoolBundle();
  const [filters, setFilters] = useState<HighSchoolFilters>(DEFAULT_HIGH_SCHOOL_FILTERS);
  const [hovered, setHovered] = useState<RankedHighSchool | null>(null);
  const [shareState, setShareState] = useState("Copy share link");
  const didReadUrl = useRef(false);

  useEffect(() => {
    if (!bundle || didReadUrl.current) return;
    didReadUrl.current = true;
    const readUrl = () => setFilters(parseHighSchoolFilters(window.location.search, bundle.data.schools));
    readUrl();
    window.addEventListener("popstate", readUrl);
    return () => window.removeEventListener("popstate", readUrl);
  }, [bundle]);

  useEffect(() => {
    if (!didReadUrl.current || typeof window === "undefined") return;
    const query = highSchoolFiltersToQuery(filters).toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [filters]);

  const ranked = useMemo(() => bundle ? rankHighSchools(bundle.data.schools, filters) : [], [bundle, filters]);
  const stateValues = useMemo(() => bundle ? optionValues(bundle.data.schools, "state") : [], [bundle]);
  const positionValues = useMemo(() => bundle ? optionValues(bundle.data.schools, "positionGroup") : [], [bundle]);
  const selected = useMemo(() => ranked.find((school) => school.id === filters.school) ?? ranked[0] ?? null, [filters.school, ranked]);
  const active = hovered ?? selected;
  const uniquePlayers = useMemo(() => countUniquePlayers(ranked), [ranked]);

  const update = useCallback(<Key extends Exclude<keyof HighSchoolFilters, "school">>(
    key: Key,
    value: HighSchoolFilters[Key],
  ) => {
    setFilters((current) => ({ ...current, [key]: value, school: "" }));
    setHovered(null);
  }, []);

  if (!bundle) return <LoadingState error={error} />;

  const { data, states } = bundle;
  const currentLeader = ranked[0];
  const mapDescription = `${integer.format(ranked.length)} high schools with ${integer.format(uniquePlayers)} distinct players match the current selection. Dot area represents the number of players credited to each school.`;

  const selectSchool = (school: RankedHighSchool) => {
    setFilters((current) => ({ ...current, school: school.id }));
    setHovered(null);
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
    <main className="site-shell hs-theme" data-high-school-map-ready="true">
      <header className="site-header hs-header">
        <div className="header-copy">
          <div className="eyebrow-line">
            <span>MLB + AFFILIATED MiLB · CAREERS STARTING 2000–2026</span>
            <span className="brand-chip">AFFILIATED PIPELINE</span>
          </div>
          <h1>High Schools Producing MLB &amp; MiLB Talent</h1>
          <p>
            Every U.S. high school credited with at least 20 distinct players whose official MLB or affiliated MiLB career record begins in 2000 or later, through {data.meta.snapshotDate}. Dot size shows player count; each school opens to its underlying official player records.
          </p>
        </div>
        <div className="header-actions header-actions-with-nav">
          <nav className="header-route-nav" aria-label="Related research maps">
            <a className="hs-nav-link" href="/mlb-talent-map/">Roster atlas</a>
            <a className="hs-nav-link" href="/mlb-college-map/">College source audit</a>
          </nav>
          <button className="share-button" type="button" onClick={handleShare}>{shareState}</button>
          <p>Filters and selected school stay in the URL.</p>
        </div>
      </header>

      <section className="coverage-strip hs-coverage" aria-label="High school research coverage">
        <div><span>MLB/MiLB participants</span><strong>{integer.format(data.meta.counts.affiliatedPlayers)}</strong></div>
        <div><span>Reached MLB</span><strong>{integer.format(data.meta.counts.mlbParticipants)}</strong></div>
        <div><span>With U.S. high school</span><strong>{integer.format(data.meta.counts.playersWithUsHighSchool)}</strong></div>
        <div><span>Leader programs mapped</span><strong>{integer.format(data.meta.counts.locatedHighSchools)}</strong></div>
      </section>

      <div className="hs-workspace-grid">
        <section className="map-panel hs-map-panel">
          <div className="map-panel-head">
            <div>
              <p className="panel-kicker">Campus-level geography</p>
              <h2>{currentLeader ? `${currentLeader.name} leads this view` : "No programs match"}</h2>
            </div>
            <p className="interaction-note">Tap a dot or use the school selector · circle area encodes players</p>
          </div>
          <div className="view-status">
            <strong>{ERA_LABELS[filters.era]} official participants</strong>
            <span>{integer.format(ranked.length)} programs shown</span>
            <span>{integer.format(uniquePlayers)} distinct players</span>
          </div>
          <label className="hs-school-inspector" htmlFor="high-school-inspector">
            <span>Inspect a mapped high school</span>
            <select
              id="high-school-inspector"
              value={selected?.id ?? ""}
              onChange={(event) => {
                const school = ranked.find((row) => row.id === event.target.value);
                if (school) selectSchool(school);
              }}
            >
              {ranked.length ? ranked.map((school) => (
                <option value={school.id} key={school.id}>
                  {school.name}, {schoolLocation(school)} — {school.filteredCount}
                </option>
              )) : <option value="">No matching programs</option>}
            </select>
          </label>
          <p id="high-school-map-description" className="visually-hidden">{mapDescription}</p>
          <HighSchoolDotMap
            states={states}
            schools={ranked}
            activeId={active?.id ?? null}
            descriptionId="high-school-map-description"
            onEnter={setHovered}
            onLeave={() => setHovered(null)}
            onSelect={selectSchool}
          />
          <div className="hs-size-legend" aria-label="Player count legend">
            <strong>Players credited</strong>
            {[5, 20, 47].map((value) => (
              <span key={value}><i style={{ width: dotRadius(value) * 2, height: dotRadius(value) * 2 }} />{value}</span>
            ))}
            <small>All {integer.format(data.meta.counts.locatedHighSchools)} programs with 20+ eligible career starters were location-audited.</small>
          </div>
          {active ? <SchoolDetail school={active} /> : (
            <p className="hs-empty">No school has a player matching this filter combination.</p>
          )}
        </section>

        <aside className="filter-panel hs-filter-panel">
          <div className="panel-heading">
            <div><p className="panel-kicker">Refine the record</p><h2>Filters</h2></div>
            <button className="text-button" type="button" onClick={() => setFilters(DEFAULT_HIGH_SCHOOL_FILTERS)}>Reset</button>
          </div>
          <div className="filter-grid">
            <label className="filter-field" htmlFor="hs-era">
              <span>Participation period</span>
              <select id="hs-era" value={filters.era} onChange={(event) => update("era", event.target.value as Era)}>
                {(Object.keys(ERA_LABELS) as Era[]).map((era) => <option value={era} key={era}>{ERA_LABELS[era]}</option>)}
              </select>
            </label>
            <label className="filter-field" htmlFor="hs-state">
              <span>School state</span>
              <select id="hs-state" value={filters.state} onChange={(event) => update("state", event.target.value)}>
                <option value="all">All mapped states</option>
                {stateValues.map((state) => <option value={state} key={state}>{state}</option>)}
              </select>
            </label>
            <label className="filter-field" htmlFor="hs-position">
              <span>Primary position group</span>
              <select id="hs-position" value={filters.positionGroup} onChange={(event) => update("positionGroup", event.target.value)}>
                <option value="all">All position groups</option>
                {positionValues.map((position) => <option value={position} key={position}>{position}</option>)}
              </select>
            </label>
            <label className="filter-field" htmlFor="hs-search">
              <span>School or city</span>
              <input id="hs-search" type="search" placeholder="Search the audited leaders" value={filters.query}
                onChange={(event) => update("query", event.target.value)} />
            </label>
          </div>
          <div className="filter-note hs-filter-note">
            <strong>Counting rule</strong>
            <p>{data.meta.definition}</p>
            <p>A player listed at multiple high schools credits each one, so school totals are not additive.</p>
            <p>{integer.format(data.meta.counts.playersMissingHighSchool)} participants have no reported high school and are excluded from school rankings, not treated as zero.</p>
          </div>
        </aside>

        <aside className="ranking-panel hs-ranking-panel">
          <div className="panel-heading">
            <div><p className="panel-kicker">Current selection</p><h2>Top programs</h2></div>
          </div>
          <ol className="ranking-list">
            {ranked.slice(0, 15).map((school, index) => (
              <li key={school.id}>
                <button type="button" onClick={() => selectSchool(school)}
                  onMouseEnter={() => setHovered(school)} onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(school)} onBlur={() => setHovered(null)}
                  aria-label={`Inspect ${school.name}, ${schoolLocation(school)}: ${school.filteredCount} players`}>
                  <span className="rank-number">{index + 1}</span>
                  <span className="rank-name"><strong>{school.name}</strong><small>{schoolLocation(school)}</small></span>
                  <span className="rank-value">{school.filteredCount}</span>
                </button>
              </li>
            ))}
            {!ranked.length ? <li className="empty-ranking">No programs match this filter combination.</li> : null}
          </ol>
          <div className="rank-context hs-rank-context">
            <strong>Default leader</strong>
            <p>IMG Academy in Bradenton leads the full period with 47 distinct MLB/MiLB participants. Ties are ordered by full-period count, then school name.</p>
          </div>
        </aside>
      </div>

      <section className="coverage-audit hs-directory" aria-labelledby="hs-directory-title">
        <div className="coverage-audit-heading">
          <div><p className="panel-kicker">Ranked directory</p><h2 id="hs-directory-title">Every mapped leader in the current view</h2></div>
          <p>The table is the exact-value companion to the proportional-symbol map. Select a school name to open its player-level evidence above.</p>
        </div>
        <p className="table-scroll-note">Swipe horizontally to see every directory column.</p>
        <div className="audit-table-wrap" role="region" aria-label="Ranked high school directory" tabIndex={0}>
          <table>
            <thead><tr><th scope="col">Rank</th><th scope="col">High school</th><th scope="col">Location</th><th scope="col">Players</th><th scope="col">Participation span</th><th scope="col">Player records</th></tr></thead>
            <tbody>
              {ranked.map((school, index) => (
                <tr key={school.id}>
                  <td>{index + 1}</td>
                  <th scope="row"><button className="hs-table-button" type="button" onClick={() => { selectSchool(school); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{school.name}</button></th>
                  <td>{schoolLocation(school)}</td>
                  <td><strong>{school.filteredCount}</strong></td>
                  <td>{Math.min(...school.filteredPlayers.map((player) => player.firstSeason))}–{Math.max(...school.filteredPlayers.map((player) => player.lastSeason))}</td>
                  <td>{school.filteredPlayers.map((player) => `${player.name} (${formatSeasons(player.seasons)}; ${player.highestLevel})`).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="methodology-band hs-methodology">
        <div><p className="panel-kicker">Methodology</p><h2>Player records first; campus points second.</h2></div>
        <p>
          MLB&apos;s official season-player endpoints identify participants at MLB, Triple-A, Double-A, High-A, Single-A, Short-Season A, and Rookie levels. Every player returned before 2000 is excluded, so the population contains career starters rather than anyone who merely appeared after the cutoff. Education records supply reported high schools. Players are deduplicated by MLB person ID within each school. Only narrowly audited school aliases are consolidated. All {integer.format(data.meta.counts.locatedHighSchools)} programs with at least 20 eligible players were geocoded to campus locations and checked against state boundaries.
          Education coverage is incomplete: {integer.format(data.meta.counts.playersMissingHighSchool)} participants have no reported high school and therefore cannot be credited to a school.
        </p>
        <dl>
          <div><dt>Official participants</dt><dd>{integer.format(data.meta.counts.affiliatedPlayers)}</dd></div>
          <div><dt>MLB participants</dt><dd>{integer.format(data.meta.counts.mlbParticipants)}</dd></div>
          <div><dt>Minor-only participants</dt><dd>{integer.format(data.meta.counts.minorOnlyPlayers)}</dd></div>
          <div><dt>U.S. school identities</dt><dd>{integer.format(data.meta.counts.usHighSchoolIdentities)}</dd></div>
        </dl>
      </section>

      <footer className="site-footer hs-footer">
        <div>
          <strong>Sources</strong>
          <p>
            {data.meta.sources.map((source, index) => (
              <Fragment key={source}>{index ? " · " : ""}<a href={source} target="_blank" rel="noreferrer">MLB Stats API {index < 7 ? ["MLB", "Triple-A", "Double-A", "High-A", "Single-A", "Short-Season A", "Rookie"][index] : "education"}</a></Fragment>
            ))}
            {" · "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>
            {" · "}<a href="https://geocoding.geo.census.gov/geocoder/" target="_blank" rel="noreferrer">U.S. Census Geocoder</a>
          </p>
        </div>
        <div className="footer-note">
          <span>Research snapshot: {data.meta.snapshotDate}</span>
          <span>Independent research · not affiliated with or endorsed by MLB</span>
          <span className="quiet-brand">AFFILIATED PIPELINE</span>
        </div>
      </footer>
    </main>
  );
}
