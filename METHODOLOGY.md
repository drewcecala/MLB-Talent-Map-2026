# Methodology

## Research question

Where are players currently rostered by MLB organizations from, and how does that geography differ by organization, level, role, and roster status?

The project separates three evidence claims:

1. **Roster membership:** exact player membership in an MLB organization snapshot.
2. **Birth country:** MLB's reported country or territory joined directly to a country geometry.
3. **County geography:** a conservative U.S. birth-city-to-representative-county transformation.

## Snapshot scope

- As-of date: **2026-08-24**.
- Parent organizations: 30 active MLB clubs.
- Affiliated teams: 201 active Triple-A, Double-A, High-A, Single-A, and Rookie clubs.
- Levels: MLB (`sportId=1`), Triple-A (`11`), Double-A (`12`), High-A (`13`), Single-A (`14`), and Rookie (`16`).
- Roster endpoint: each MLB parent club's `fullRoster`, requested with the snapshot date and hydrated person/current-team fields.
- Included statuses: active plus MLB-rostered inactive, injured, reserve, restricted, temporary inactive, reassigned, and development-list records returned by `fullRoster`.
- Excluded: released, traded, and free-agent historical-season rows. A validation rule confirms those statuses are absent.

The resulting grain is one MLB person ID on one current MLB organization full roster.

## Organization and level assignment

All roster rows are deduplicated by MLB person ID. Twenty IDs appeared in more than one parent-organization response during the live snapshot, consistent with transaction propagation. Those rows were assigned to the organization matching `person.currentTeam.parentOrgId` (or the current MLB team ID). All 20 conflicts resolved; none remain ambiguous.

Current level is assigned by joining `person.currentTeam.id` to the active MLB/MiLB team catalog. Sixteen players (0.19%) did not have a current team in the in-scope active-team catalog and remain `Unassigned / unknown` rather than being forced into a level.

## Birth-country normalization

MLB `birthCountry` values control country totals. Common three-letter values (`DOM`, `VEN`, `CUB`, `MEX`, `PAN`, `COL`, `PUR`) are normalized to the corresponding full country or territory label. `Republic of Korea` is normalized to `South Korea`. No country is inferred from name, organization, or current team.

## Birth-country geometry

- Geometry: Natural Earth Admin 0 – Countries, 1:50m, version 5.1.1.
- Join: normalized MLB birth-country label to a documented ISO alpha-3 code, then ISO code to Natural Earth geometry.
- Coverage: all 43 known country/territory labels in the snapshot resolve to geometry, representing 8,439 of 8,440 players. The one `Unknown` country record remains unmapped.
- Projection: Equal Earth, which reduces the area distortion of common cylindrical world maps.
- Boundary view: Natural Earth's default de facto Admin-0 boundaries. The shapes provide country context only; they do not imply an exact location within a country.
- Small-country treatment: small country and territory polygons receive a centroid/label-point dot so they remain visible at the full-world scale. The country selector provides a keyboard and text fallback.

## U.S. place-to-county method

MLB person records provide birth city, state/province, and country but not exact birth county. For records with `birthCountry=USA`:

1. Normalize case, punctuation, diacritics, whitespace, and `Saint`/`St.` spelling.
2. Match city/state to the July 2026 USGS GNIS national Populated Places file.
3. If no official-name match exists, try GNIS variant names for populated-place features.
4. Accept a county only when every matched federal place record points to one county-equivalent.
5. Leave same-name, multi-county, or missing-place matches unresolved.
6. For Connecticut, current GNIS planning-region codes are reconciled to the 2020 county map by testing the federal place coordinate against the 2020 county polygon.

The map label is deliberately **representative federal-place county**. It is a reproducible cartographic proxy, not proof of exact birth county.

## County boundaries and population

- Geometry: 2020 Census cartographic county boundaries for the 50 states and District of Columbia.
- Population: 2020 Census population joined by five-digit county FIPS.
- County count: 3,143.
- Projection: Albers USA.
- Per-capita denominator: county 2020 population.
- Reliability rule: at least 10 mapped players in the current filter selection before a county enters per-capita rankings.

## Map metrics

- Rostered players: mapped roster records in each county or reported birth country.
- Players per 100,000: mapped U.S. county count / 2020 population × 100,000; not shown for countries because no country-population denominator is included.
- Players currently at MLB level: mapped records whose current team is MLB, aggregated by the active map geography.
- Pitchers: mapped records whose MLB position type is Pitcher, aggregated by the active map geography.

Sequential color bins use quintile thresholds among positive county values in the current filtered view. Zero, insufficient-rate, selected, and focus states use distinct colors.

## Missing-data policy

- International/territory records appear in the worldwide birth-country map but cannot appear on the 50-state/DC county map.
- U.S. ambiguous places remain unresolved.
- Unknown country/location records remain unresolved.
- Missing or unresolved locations are never converted to zero and never assigned to the most likely county.

## Publication boundary

The public map payload includes MLB person IDs, organization/level/status/position attributes, birth country, county FIPS when accepted, and match method. It excludes player names and raw birth-city/state text. The private processed audit file retains those fields for record-level verification.

## High-school pipeline methodology

The high-school map answers a different question: which U.S. high schools are credited with the most players who appeared in MLB or affiliated Minor League Baseball from **2000 through 2026-08-24**?

1. Request MLB's official season-player endpoint for every season from 2000 through 2026 at MLB (`sportId=1`), Triple-A (`11`), Double-A (`12`), High-A (`13`), Single-A (`14`), Short-Season A (`15`), and Rookie (`16`).
2. Deduplicate the union by MLB person ID while retaining every exact participation season and every returned level. The reconciled universe contains 54,980 players: 7,380 with an MLB appearance in the period and 47,600 who appeared only at an included affiliated minor-league level.
3. Hydrate all 54,980 person records with MLB education data and require complete person hydration before the build can continue.
4. Credit each player once to every listed high school in the 50 states or District of Columbia.
5. Keep distinct school identities by normalized name, state, and reported city. Consolidate only documented aliases or neighboring locality labels for the same campus; do not broadly merge ambiguous name-only records.
6. Rank by distinct MLB person IDs credited to each school.
7. Location-audit every program with at least 20 qualifying players. The published leader map contains all 25 programs meeting that threshold.

Campus locations use OpenStreetMap Nominatim where an exact school feature is available. Remaining leaders use an official school or municipal address with the U.S. Census Geocoder, or an official municipal coordinate. Every published point is automatically checked against the 2020 state polygon for its reported state.

The historical school dataset contains player names, exact participation seasons, highest included level, positions, and MLB debut dates where available. The repository also publishes the full 54,980-player universe and a linked SHA-256 checksum so the scope can be audited independently from the mapped school subset. Totals across schools are not additive because a player listed at multiple schools credits each school.

MLB education data is incomplete: 18,642 participants have at least one high-school record, 16,800 have a U.S. high school in scope, and 36,338 have no reported high school. The official affiliated minor-league season was canceled in 2020; those six minor-league endpoints correctly return zero participants for 2020, while the MLB endpoint remains included.

## College pipeline methodology

The college map uses the same 54,980-person official MLB/affiliated-MiLB participation universe and asks which verified colleges are credited with the most of those players.

1. Read every nonempty college reported by MLB's hydrated education record. This primary source identifies 23,895 players.
2. Query the official MLB Draft endpoint for every draft year from 1965 through 2026 and intersect draft picks with the 54,980 MLB person IDs. Accept a draft school when MLB explicitly classifies it as a four-year or junior college. Older draft records lack consistent school-class fields, so they are accepted only when the reported school exactly matches an audited college alias, an MLB education college identity, or a SABR Lahman school identity. Explicit high-school, secondary-school, and preparatory-school records are excluded.
3. Join the SABR Lahman 2025 `CollegePlaying` table to MLB person IDs through exact `key_bbref` → `key_mlbam` links in the Chadwick Register. This source can supplement MLB participants but not minor-only players who are absent from Lahman's major-league player universe.
4. Consolidate audited institutional aliases such as `LSU`/`Louisiana State`, `USC`/`Southern California`, and `Miami`/`Miami (FL)`. Do not merge ambiguous institutions without a documented rule.
5. Deduplicate by MLB person ID within each canonical college. A transfer credits every verified college once, so totals across colleges are not additive.
6. Rank by distinct qualifying player IDs. Map every program at the 155-player cutoff; four programs tie at 155, producing a 26-program leader set rather than an arbitrary 25.

The source hierarchy recovers 804 player records that were blank in MLB education from MLB Draft evidence and 21 more from SABR/Lahman. The final evidence state is 24,720 players with at least one verified college and 30,260 without verified college evidence. The latter are labeled **unresolved**, not “did not attend college,” because source absence is not proof of non-attendance.

The reconciled data contains 28,832 player-college credits across 2,452 institution identities. The 26 mapped leaders cover 4,626 distinct players. Campus points are OpenStreetMap university-feature centroids recorded with direct feature links, and every displayed coordinate is automatically tested against the 2020 polygon for its reported state.

The repository's full audit preserves record-level evidence URLs and source labels. The smaller public browser bundle retains the source labels needed to audit displayed player rows while omitting repeated evidence objects for performance. Both files have reproducible SHA-256 checksums and link back to the same player-universe checksum.
