"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import {
  COLLEGE_ERA_LABELS,
  DEFAULT_COLLEGE_FILTERS,
  collegeFiltersToQuery,
  collegeLocation,
  collegeOptionValues,
  countCollegePlayers,
  formatCollegeSeasons,
  integer,
  parseCollegeFilters,
  rankColleges,
  sourceLabel,
} from "./model";
import type { College, CollegeEra, CollegeFilters, RankedCollege } from "./model";

type CollegeData = {
  meta: {
    title: string;
    snapshotDate: string;
    definition: string;
    sources: string[];
    caveats: string[];
    publicationReady: boolean;
    counts: {
      affiliatedPlayers: number;
      mlbParticipants: number;
      minorOnlyPlayers: number;
      playersWithMlbEducationCollege: number;
      playersAddedByMlbDraft: number;
      playersAddedBySabrLahman: number;
      playersWithVerifiedCollege: number;
      playersWithoutVerifiedCollege: number;
      playersWithDocumentedNoCollege: number;
      playersWithUnresolvedEducation: number;
      resolvedSigningSchoolPlayers: number;
      requiredResolvedPlayers: number;
      resolutionCoverageRate: number;
      minimumPublicationCoverage: number;
      verifiedCollegePlayerCredits: number;
      collegeIdentities: number;
      locatedColleges: number;
      locatedPlayers: number;
    };
  };
  colleges: College[];
};

type StateProperties = { state_abbr?: string; state_name?: string };
type StateFeature = Feature<Geometry, StateProperties>;

function useCollegeBundle() {
  const [bundle, setBundle] = useState<{
    data: CollegeData;
    states: FeatureCollection<Geometry, StateProperties>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/data/mlb-college-leaders.json").then((response) => {
        if (!response.ok) throw new Error("The college research snapshot is unavailable.");
        return response.json() as Promise<CollegeData>;
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
  "college-arizona-state": [-30, -32],
  "college-miami-fl": [24, 28],
  "college-ucla": [-42, -22],
  "college-texas": [-28, 44],
  "college-louisiana-state": [25, 24],
  "college-arkansas": [-28, -34],
  "college-oklahoma": [-24, -32],
  "college-cal-state-fullerton": [-42, 38],
};

function dotRadius(count: number) {
  return 3.6 + Math.sqrt(count) * 1.15;
}

function CollegeDotMap({
  states,
  colleges,
  activeId,
  descriptionId,
  onEnter,
  onLeave,
  onSelect,
}: {
  states: FeatureCollection<Geometry, StateProperties>;
  colleges: RankedCollege[];
  activeId: string | null;
  descriptionId: string;
  onEnter: (college: RankedCollege) => void;
  onLeave: () => void;
  onSelect: (college: RankedCollege) => void;
}) {
  const projection = useMemo(() => geoAlbersUsa().fitExtent([[26, 28], [954, 564]], states), [states]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const labeled = useMemo(() => new Set(colleges.slice(0, 8)
    .map((college) => college.id).filter((id) => id in LABEL_OFFSETS)), [colleges]);

  return (
    <svg className="hs-map college-map" viewBox="0 0 980 600" role="group"
      aria-label="U.S. map locating the leading colleges by MLB and affiliated Minor League Baseball participants since 2000"
      aria-describedby={descriptionId}>
      <rect className="hs-map-background college-map-background" width="980" height="600" rx="18" />
      <g aria-hidden="true">
        {(states.features as StateFeature[]).map((feature, index) => (
          <path className="hs-state college-state" d={path(feature) ?? undefined} key={String(feature.id ?? index)} />
        ))}
      </g>
      <g>
        {colleges.map((college) => {
          const point = projection([college.longitude!, college.latitude!]);
          if (!point) return null;
          const active = activeId === college.id;
          return (
            <circle key={college.id} cx={point[0]} cy={point[1]}
              r={dotRadius(college.filteredCount) + (active ? 2.2 : 0)}
              className={active ? "hs-dot college-dot active" : "hs-dot college-dot"}
              role="button" tabIndex={0}
              aria-label={`${college.name}, ${collegeLocation(college)}: ${college.filteredCount} players in the current selection`}
              onMouseEnter={() => onEnter(college)} onMouseLeave={onLeave}
              onFocus={() => onEnter(college)} onBlur={onLeave}
              onClick={() => onSelect(college)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(college);
                }
              }}>
              <title>{college.name}, {collegeLocation(college)} — {college.filteredCount} players</title>
            </circle>
          );
        })}
      </g>
      <g className="hs-label-layer college-label-layer" aria-hidden="true">
        {colleges.filter((college) => labeled.has(college.id)).map((college) => {
          const point = projection([college.longitude!, college.latitude!]);
          if (!point) return null;
          const [dx, dy] = LABEL_OFFSETS[college.id];
          return (
            <g key={`label-${college.id}`}>
              <line x1={point[0]} y1={point[1]} x2={point[0] + dx * 0.74} y2={point[1] + dy * 0.74} />
              <text x={point[0] + dx} y={point[1] + dy} textAnchor={dx < 0 ? "end" : "start"}>
                <tspan>{college.name}</tspan><tspan className="hs-label-count" dx="5">{college.filteredCount}</tspan>
              </text>
            </g>
          );
        })}
      </g>
      <g className="hs-inset-labels" aria-hidden="true"><text x="190" y="558">ALASKA</text><text x="365" y="552">HAWAII</text></g>
    </svg>
  );
}

function CollegeDetail({ college }: { college: RankedCollege }) {
  return (
    <section className="hs-detail college-detail" aria-live="polite" aria-label="Selected college detail">
      <div className="hs-detail-head">
        <div><p className="panel-kicker">Selected program</p><h3>{college.name}</h3><p>{collegeLocation(college)}</p></div>
        <div className="hs-detail-total college-detail-total"><strong>{integer.format(college.filteredCount)}</strong><span>players</span></div>
      </div>
      <div className="hs-player-list college-player-list" role="list" tabIndex={0}
        aria-label={`All players credited to ${college.name}`}>
        {college.filteredPlayers.map((player) => (
          <div className="hs-player-row college-player-row" role="listitem" key={player.id}>
            <strong>{player.name}</strong>
            <span>{player.positionGroup} · {player.position} · highest in window {player.highestLevel}</span>
            <span>Seasons {formatCollegeSeasons(player.seasons)}{player.mlbDebutDate ? ` · MLB debut ${player.mlbDebutDate}` : ""}</span>
            <span>Evidence: {player.collegeSources.map(sourceLabel).join(" + ")}</span>
          </div>
        ))}
      </div>
      <p className="hs-detail-source">
        Every row is linked by MLB person ID and deduplicated within this college.
        {college.locationSourceUrl ? <> <a href={college.locationSourceUrl} target="_blank" rel="noreferrer">Verify campus location</a>.</> : null}
      </p>
    </section>
  );
}

function LoadingState({ error }: { error?: string | null }) {
  return (
    <main className="loading-shell hs-loading college-loading" aria-busy={!error}>
      <div className="loading-card" role={error ? "alert" : "status"}>
        <span className="brand-chip">COLLEGE PIPELINE</span><h1>Colleges Producing MLB &amp; MiLB Talent</h1>
        <p>{error ?? "Loading the reconciled college, player, and campus records…"}</p>
      </div>
    </main>
  );
}

function CollegePublicationHold({ data }: { data: CollegeData }) {
  const percent = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <main className="site-shell hs-theme college-theme college-review" data-college-map-ready="true">
      <header className="site-header hs-header college-header">
        <div className="header-copy">
          <div className="eyebrow-line"><span>MLB + AFFILIATED MiLB · CAREERS STARTING 2000–2026</span><span className="brand-chip">SOURCE REVIEW</span></div>
          <h1>College map withheld pending source coverage</h1>
          <p>The ranking is not being published as complete until the last school attended before each player&apos;s professional signing is documented for at least 90% of the eligible cohort.</p>
        </div>
        <div className="header-actions">
          <a className="hs-nav-link" href="/mlb-high-school-map">High school map</a>
          <a className="hs-nav-link" href="/mlb-talent-map">2026 roster map</a>
        </div>
      </header>

      <section className="coverage-strip hs-coverage college-coverage" aria-label="College research coverage">
        <div><span>Eligible career starters</span><strong>{integer.format(data.meta.counts.affiliatedPlayers)}</strong></div>
        <div><span>Signing-school status resolved</span><strong>{integer.format(data.meta.counts.resolvedSigningSchoolPlayers)}</strong></div>
        <div><span>Current coverage</span><strong>{percent.format(data.meta.counts.resolutionCoverageRate)}</strong></div>
        <div><span>Publication requirement</span><strong>{percent.format(data.meta.counts.minimumPublicationCoverage)}</strong></div>
      </section>

      <section className="methodology-band hs-methodology college-methodology" aria-labelledby="college-review-title">
        <div><p className="panel-kicker">Accuracy gate</p><h2 id="college-review-title">No guessed colleges. No false “no college” labels.</h2></div>
        <p>Each player may receive credit for one school only: the last school attended before signing a professional contract. Earlier transfer schools and unsigned draft selections receive no credit. A blank education field, international origin, foreign birth, or young signing age is not evidence that a player skipped college.</p>
        <dl>
          <div><dt>Verified final college</dt><dd>{integer.format(data.meta.counts.playersWithVerifiedCollege)}</dd></div>
          <div><dt>Documented non-college signing</dt><dd>{integer.format(data.meta.counts.playersWithDocumentedNoCollege)}</dd></div>
          <div><dt>Unresolved</dt><dd>{integer.format(data.meta.counts.playersWithUnresolvedEducation)}</dd></div>
          <div><dt>Required to publish</dt><dd>{integer.format(data.meta.counts.requiredResolvedPlayers)}</dd></div>
        </dl>
      </section>

      <footer className="site-footer hs-footer college-footer">
        <div><strong>Status</strong><p>The interactive college rankings and player lists remain disabled until the documented coverage threshold is met.</p></div>
        <div className="footer-note"><span>Research snapshot: {data.meta.snapshotDate}</span><span>Independent research · not affiliated with or endorsed by MLB</span></div>
      </footer>
    </main>
  );
}

export function MlbCollegeMap() {
  const { bundle, error } = useCollegeBundle();
  const [filters, setFilters] = useState<CollegeFilters>(DEFAULT_COLLEGE_FILTERS);
  const [hovered, setHovered] = useState<RankedCollege | null>(null);
  const [shareState, setShareState] = useState("Copy share link");
  const didReadUrl = useRef(false);

  useEffect(() => {
    if (!bundle || didReadUrl.current) return;
    didReadUrl.current = true;
    const readUrl = () => setFilters(parseCollegeFilters(window.location.search, bundle.data.colleges));
    readUrl();
    window.addEventListener("popstate", readUrl);
    return () => window.removeEventListener("popstate", readUrl);
  }, [bundle]);

  useEffect(() => {
    if (!didReadUrl.current || typeof window === "undefined") return;
    const query = collegeFiltersToQuery(filters).toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [filters]);

  const ranked = useMemo(() => bundle ? rankColleges(bundle.data.colleges, filters) : [], [bundle, filters]);
  const stateValues = useMemo(() => bundle ? collegeOptionValues(bundle.data.colleges, "state") : [], [bundle]);
  const positionValues = useMemo(() => bundle ? collegeOptionValues(bundle.data.colleges, "positionGroup") : [], [bundle]);
  const selected = useMemo(() => ranked.find((college) => college.id === filters.college) ?? ranked[0] ?? null, [filters.college, ranked]);
  const active = hovered ?? selected;
  const uniquePlayers = useMemo(() => countCollegePlayers(ranked), [ranked]);

  const update = useCallback(<Key extends Exclude<keyof CollegeFilters, "college">>(key: Key, value: CollegeFilters[Key]) => {
    setFilters((current) => ({ ...current, [key]: value, college: "" }));
    setHovered(null);
  }, []);

  if (!bundle) return <LoadingState error={error} />;
  const { data, states } = bundle;
  if (!data.meta.publicationReady) return <CollegePublicationHold data={data} />;
  const currentLeader = ranked[0];
  const fullThreshold = Math.min(...data.colleges.map((college) => college.playerCount));
  const mapDescription = `${integer.format(ranked.length)} colleges with ${integer.format(uniquePlayers)} distinct players match the current selection. Dot area represents the number of players credited to each college.`;

  const selectCollege = (college: RankedCollege) => {
    setFilters((current) => ({ ...current, college: college.id }));
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
    <main className="site-shell hs-theme college-theme" data-college-map-ready="true">
      <header className="site-header hs-header college-header">
        <div className="header-copy">
          <div className="eyebrow-line"><span>MLB + AFFILIATED MiLB · 2000–2026</span><span className="brand-chip">COLLEGE PIPELINE</span></div>
          <h1>Colleges Producing MLB &amp; MiLB Talent</h1>
          <p>The leading U.S. college programs across all {integer.format(data.meta.counts.affiliatedPlayers)} official MLB and affiliated MiLB season participants since 2000—supplemented wherever MLB education was blank.</p>
        </div>
        <div className="header-actions">
          <a className="hs-nav-link" href="/mlb-high-school-map">High school map</a>
          <a className="hs-nav-link" href="/mlb-talent-map">2026 roster map</a>
          <button className="share-button" type="button" onClick={handleShare}>{shareState}</button>
          <p>Filters and selected college stay in the URL.</p>
        </div>
      </header>

      <section className="coverage-strip hs-coverage college-coverage" aria-label="College research coverage">
        <div><span>MLB/MiLB participants</span><strong>{integer.format(data.meta.counts.affiliatedPlayers)}</strong></div>
        <div><span>Verified college</span><strong>{integer.format(data.meta.counts.playersWithVerifiedCollege)}</strong></div>
        <div><span>Gaps filled</span><strong>{integer.format(data.meta.counts.playersAddedByMlbDraft + data.meta.counts.playersAddedBySabrLahman)}</strong></div>
        <div><span>Leader programs mapped</span><strong>{integer.format(data.meta.counts.locatedColleges)}</strong></div>
      </section>

      <div className="hs-workspace-grid college-workspace-grid">
        <section className="map-panel hs-map-panel college-map-panel">
          <div className="map-panel-head">
            <div><p className="panel-kicker">Campus-level geography</p><h2>{currentLeader ? `${currentLeader.name} leads this view` : "No programs match"}</h2></div>
            <p className="interaction-note">Tap a dot or use the college selector · circle area encodes players</p>
          </div>
          <div className="view-status"><strong>{COLLEGE_ERA_LABELS[filters.era]} official participants</strong><span>{integer.format(ranked.length)} programs shown</span><span>{integer.format(uniquePlayers)} distinct players</span></div>
          <label className="hs-school-inspector" htmlFor="college-inspector"><span>Inspect a mapped college</span>
            <select id="college-inspector" value={selected?.id ?? ""} onChange={(event) => {
              const college = ranked.find((row) => row.id === event.target.value);
              if (college) selectCollege(college);
            }}>
              {ranked.length ? ranked.map((college) => <option value={college.id} key={college.id}>{college.name}, {collegeLocation(college)} — {college.filteredCount}</option>) : <option value="">No matching programs</option>}
            </select>
          </label>
          <p id="college-map-description" className="visually-hidden">{mapDescription}</p>
          <CollegeDotMap states={states} colleges={ranked} activeId={active?.id ?? null}
            descriptionId="college-map-description" onEnter={setHovered} onLeave={() => setHovered(null)} onSelect={selectCollege} />
          <div className="hs-size-legend college-size-legend" aria-label="Player count legend">
            <strong>Players credited</strong>{[50, 150, 230].map((value) => <span key={value}><i style={{ width: dotRadius(value) * 2, height: dotRadius(value) * 2 }} />{value}</span>)}
            <small>All {data.meta.counts.locatedColleges} programs at the {fullThreshold}+ full-period cutoff are location-audited; four programs tie at the boundary.</small>
          </div>
          {active ? <CollegeDetail college={active} /> : <p className="hs-empty">No college has a player matching this filter combination.</p>}
        </section>

        <aside className="filter-panel hs-filter-panel college-filter-panel">
          <div className="panel-heading"><div><p className="panel-kicker">Refine the record</p><h2>Filters</h2></div><button className="text-button" type="button" onClick={() => setFilters(DEFAULT_COLLEGE_FILTERS)}>Reset</button></div>
          <div className="filter-grid">
            <label className="filter-field" htmlFor="college-era"><span>Participation period</span><select id="college-era" value={filters.era} onChange={(event) => update("era", event.target.value as CollegeEra)}>{(Object.keys(COLLEGE_ERA_LABELS) as CollegeEra[]).map((era) => <option value={era} key={era}>{COLLEGE_ERA_LABELS[era]}</option>)}</select></label>
            <label className="filter-field" htmlFor="college-state"><span>College state</span><select id="college-state" value={filters.state} onChange={(event) => update("state", event.target.value)}><option value="all">All mapped states</option>{stateValues.map((state) => <option value={state} key={state}>{state}</option>)}</select></label>
            <label className="filter-field" htmlFor="college-position"><span>Primary position group</span><select id="college-position" value={filters.positionGroup} onChange={(event) => update("positionGroup", event.target.value)}><option value="all">All position groups</option>{positionValues.map((position) => <option value={position} key={position}>{position}</option>)}</select></label>
            <label className="filter-field" htmlFor="college-search"><span>College or city</span><input id="college-search" type="search" placeholder="Search the audited leaders" value={filters.query} onChange={(event) => update("query", event.target.value)} /></label>
          </div>
          <div className="filter-note hs-filter-note college-filter-note"><strong>Counting rule</strong><p>{data.meta.definition}</p><p>Each player can credit only the last verified school attended before signing.</p><p>{integer.format(data.meta.counts.playersWithUnresolvedEducation)} participants remain unresolved—not labeled as non-college players.</p></div>
        </aside>

        <aside className="ranking-panel hs-ranking-panel college-ranking-panel">
          <div className="panel-heading"><div><p className="panel-kicker">Current selection</p><h2>Top programs</h2></div></div>
          <ol className="ranking-list">
            {ranked.slice(0, 15).map((college, index) => <li key={college.id}><button type="button" onClick={() => selectCollege(college)} onMouseEnter={() => setHovered(college)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(college)} onBlur={() => setHovered(null)} aria-label={`Inspect ${college.name}, ${collegeLocation(college)}: ${college.filteredCount} players`}><span className="rank-number">{index + 1}</span><span className="rank-name"><strong>{college.name}</strong><small>{collegeLocation(college)}</small></span><span className="rank-value">{college.filteredCount}</span></button></li>)}
            {!ranked.length ? <li className="empty-ranking">No programs match this filter combination.</li> : null}
          </ol>
          <div className="rank-context hs-rank-context college-rank-context"><strong>Full-period leader</strong><p>Arizona State leads with 231 distinct participants. Four programs tie at 155, so the location-audited leader set includes 26 rather than breaking the tie arbitrarily.</p></div>
        </aside>
      </div>

      <section className="coverage-audit hs-directory college-directory" aria-labelledby="college-directory-title">
        <div className="coverage-audit-heading"><div><p className="panel-kicker">Ranked directory</p><h2 id="college-directory-title">Every mapped leader in the current view</h2></div><p>The table provides exact counts alongside the proportional-symbol map. Select a college to inspect every underlying player record.</p></div>
        <p className="table-scroll-note">Swipe horizontally to see every directory column.</p>
        <div className="audit-table-wrap" role="region" aria-label="Ranked college directory" tabIndex={0}><table><thead><tr><th scope="col">Rank</th><th scope="col">College</th><th scope="col">Location</th><th scope="col">Players</th><th scope="col">Reached MLB</th><th scope="col">Participation span</th><th scope="col">Evidence sources</th></tr></thead><tbody>
          {ranked.map((college, index) => {
            const sources = [...new Set(college.filteredPlayers.flatMap((player) => player.collegeSources))];
            return <tr key={college.id}><td>{index + 1}</td><th scope="row"><button className="hs-table-button college-table-button" type="button" onClick={() => { selectCollege(college); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{college.name}</button></th><td>{collegeLocation(college)}</td><td><strong>{college.filteredCount}</strong></td><td>{college.filteredPlayers.filter((player) => player.reachedMlb).length}</td><td>{Math.min(...college.filteredPlayers.map((player) => player.firstSeason))}–{Math.max(...college.filteredPlayers.map((player) => player.lastSeason))}</td><td>{sources.map(sourceLabel).join(" · ")}</td></tr>;
          })}
        </tbody></table></div>
      </section>

      <section className="methodology-band hs-methodology college-methodology">
        <div><p className="panel-kicker">Methodology</p><h2>Missing records were researched, not inferred.</h2></div>
        <p>MLB education supplies the primary college record. Official MLB Draft data adds four-year and junior-college evidence, and older draft-school entries are accepted only when the reported identity matches a verified college. SABR&apos;s Lahman CollegePlaying table then fills remaining MLB-player gaps through exact Chadwick Register ID links. This recovered {integer.format(data.meta.counts.playersAddedByMlbDraft)} players from MLB Draft records and {integer.format(data.meta.counts.playersAddedBySabrLahman)} more from SABR/Lahman. The unresolved remainder is disclosed, never interpreted as “did not attend.”</p>
        <dl><div><dt>Official participants</dt><dd>{integer.format(data.meta.counts.affiliatedPlayers)}</dd></div><div><dt>Primary-source college</dt><dd>{integer.format(data.meta.counts.playersWithMlbEducationCollege)}</dd></div><div><dt>Verified after research</dt><dd>{integer.format(data.meta.counts.playersWithVerifiedCollege)}</dd></div><div><dt>Unresolved evidence</dt><dd>{integer.format(data.meta.counts.playersWithoutVerifiedCollege)}</dd></div></dl>
      </section>

      <footer className="site-footer hs-footer college-footer">
        <div><strong>Sources</strong><p>{data.meta.sources.map((source, index) => <Fragment key={source}>{index ? " · " : ""}<a href={source} target="_blank" rel="noreferrer">{["MLB education", "MLB Draft", "SABR Lahman Database", "Chadwick Register"][index]}</a></Fragment>)}{" · "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p><p>SABR Lahman derived data: <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC BY-SA 3.0</a>. Chadwick Register: <a href="https://opendatacommons.org/licenses/by/1-0/" target="_blank" rel="noreferrer">ODC Attribution</a>.</p></div>
        <div className="footer-note"><span>Research snapshot: {data.meta.snapshotDate}</span><span>Independent research · not affiliated with or endorsed by MLB</span><span className="quiet-brand">COLLEGE PIPELINE</span></div>
      </footer>
    </main>
  );
}
