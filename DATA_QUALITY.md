# Data quality report

Snapshot generated: 2026-08-24T07:47:50Z

Roster date: 2026-08-24

Intended grain: one unique MLB person ID currently present on one MLB organization full roster.

## Dataset profile

| Check | Result |
|---|---:|
| Unique rostered players | 8,440 |
| MLB organizations | 30 |
| Active affiliated teams | 201 |
| MLB-level players | 1,035 |
| Triple-A | 1,046 |
| Double-A | 1,047 |
| High-A | 1,093 |
| Single-A | 1,164 |
| Rookie | 3,039 |
| Unassigned / unknown current team | 16 (0.19%) |

## Integrity checks

All release checks passed:

- 30 expected MLB organizations are present.
- Player IDs are unique after deduplication.
- Every organization is represented.
- All 20 cross-organization duplicate IDs resolve to the current-team parent organization.
- Every mapped county FIPS exists in the 2020 county reference and geometry.
- All 43 known birth-country/territory labels resolve through documented ISO codes to Natural Earth 5.1.1 geometry.
- Released, traded, and free-agent historical-season statuses are absent.
- Level summary rows sum to the 8,440-player roster universe.
- Public player rows exclude name and raw birth-city/state fields.

## Geography completeness

| Evidence state | Players | Share / denominator |
|---|---:|---:|
| U.S.-born records | 4,280 | 50.7% of all players |
| U.S. place mapped to representative county | 3,912 | 91.4% of U.S.-born |
| Ambiguous U.S. federal place | 325 | 7.6% of U.S.-born |
| Other unresolved U.S. record | 43 | 1.0% of U.S.-born |
| International or territory | 4,159 | 49.3% of all players |
| Unknown country | 1 | <0.1% of all players |
| Known country/territory mapped worldwide | 8,439 | >99.9% of all players |

Accepted U.S. matches are 3,896 unique official GNIS place-name matches and 16 unique GNIS variant-name matches.

## Findings and risk

### Exact county is not an available source field

- Severity: High if interpreted as verified birth county; Low under the product's representative-place framing.
- Evidence: MLB exposes birth city/state/country, not county.
- Risk: city boundaries and commonly used place names can cross or differ from county boundaries.
- Control: label the value as a representative federal-place county, accept only unique federal-place matches, and keep ambiguous matches unresolved.

### Transaction-time duplicates

- Severity: Medium before resolution; Low after controls.
- Evidence: 20 MLB person IDs appeared in two organization responses.
- Likely cause: roster transaction propagation between parent-club responses.
- Control: assign to `currentTeam.parentOrgId`; validation confirms zero unresolved duplicate assignments.

### Current-team gaps

- Severity: Low.
- Evidence: 16 players (0.19%) lack an in-scope active current-team match.
- Risk: small undercount in level-specific views, but no effect on all-roster totals.
- Control: retain as `Unassigned / unknown`; do not impute a level.

### International geography is country-level

- Severity: High if silently excluded; controlled in this product.
- Evidence: 4,159 roster records are international or territory births.
- Control: map all known labels in the worldwide view using MLB's reported birth country and an audited ISO-to-Natural-Earth join. Do not infer subnational locations. The county coverage percentage uses only U.S.-born records as its denominator.

## Automated tests

The project validates uniqueness, organization coverage, allowed levels and geography values, county referential integrity, status exclusions, summary reconciliation, public-field privacy, data-source URLs, desktop/mobile rendering, URL state, international-only behavior, accessibility, and horizontal overflow.

Machine-readable evidence is in `reports/data-quality.json` and `reports/world-geometry-audit.json`.

## High-school pipeline validation

The 2000–2026 MLB/affiliated-MiLB pipeline is validated independently from the current-roster map:

| Check | Result |
|---|---:|
| Unique official MLB/MiLB participants | 54,980 |
| Appeared in MLB during the period | 7,380 |
| Appeared only in included affiliated minor-league levels | 47,600 |
| Players with any reported high school | 18,642 |
| Players with a U.S. high school | 16,800 |
| U.S. school identities retained | 7,048 |
| Programs meeting the 20-player map threshold | 25 |
| Distinct players credited to mapped leaders | 621 |
| Players without an MLB high-school record | 36,338 |
| High-school credits outside the 50 states/DC scope | 1,842 |

Automated release checks verify all 54,980 unique person IDs against the public universe audit, exact participation-season arrays, source sport IDs, universe-to-map checksum linkage, player-level joins, school count ordering, exact 20-player map-threshold coverage, source evidence for all campus points, state containment for every coordinate, and documented identity resolutions. The 2020 source reconciliation explicitly expects 1,289 MLB participants and zero participants from each canceled minor-league season endpoint. Machine-readable evidence is in `reports/high-school-data-quality.json` and `data/mlb-affiliated-universe-audit.json`.

## College pipeline validation

| Check | Result |
|---|---:|
| Unique official MLB/MiLB participants | 54,980 |
| Players with an MLB education college | 23,895 |
| Previously blank players recovered from MLB Draft evidence | 804 |
| Additional previously blank players recovered from SABR/Lahman | 21 |
| Players with verified college evidence | 24,720 |
| Players without verified college evidence | 30,260 |
| Distinct player-college credits | 28,832 |
| College identities retained | 2,452 |
| Programs at the 155-player map cutoff | 26 |
| Distinct players credited to mapped leaders | 4,626 |

Automated release checks reconcile the source hierarchy at player level, recompute all supplement counts from record source labels, reject duplicate player credits within an institution, verify exact alias ownership, enforce sorted counts and the complete four-program boundary tie, link the full and browser checksums, validate source-file SHA-256 values, and require every displayed campus point to fall inside its reported 2020 state polygon. Browser checks cover source-backed player detail, filters and URL state, console health, accessibility, mobile ordering, footer reachability, and horizontal overflow.

Machine-readable evidence is in `reports/college-data-quality.json`, `data/mlb-college-map-audit.json`, and `data/mlb-affiliated-universe-audit.json`.

The largest residual limitation is source completeness. The 30,260 unresolved records include players who signed from high school or internationally as well as players whose college history may be absent from every selected source. The pipeline makes no attempt to distinguish those cases without positive evidence.
