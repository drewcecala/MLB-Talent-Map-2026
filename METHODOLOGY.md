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
