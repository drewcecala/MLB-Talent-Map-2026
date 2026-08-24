# The Geography of MLB Talent

An audited roster-and-birthplace geography project covering every unique player on an MLB organization full roster as of **August 24, 2026**. The snapshot includes MLB, Triple-A, Double-A, High-A, Single-A, and Rookie levels.

> [!IMPORTANT]
> **Corrected high-school release (August 24, 2026).** The historical map uses 54,980 unique official MLB and affiliated MiLB season participants from 2000–2026—not the withdrawn 6,225-debut subset. The complete participant universe and its linked checksum are public. See [CORRECTION.md](CORRECTION.md).

![The Geography of MLB Talent social preview](public/og.png)

**Interactive map:** [mlb-talent-map-2026.pages.dev](https://mlb-talent-map-2026.pages.dev)

**High-school pipeline:** [mlb-talent-map-2026.pages.dev/mlb-high-school-map](https://mlb-talent-map-2026.pages.dev/mlb-high-school-map)

**College pipeline:** [mlb-talent-map-2026.pages.dev/mlb-college-map](https://mlb-talent-map-2026.pages.dev/mlb-college-map)

## What the product does

- Includes 8,440 unique rostered players across all 30 MLB organizations and 201 affiliated teams.
- Maps U.S. birthplaces only when MLB birth city/state resolves uniquely through a federal GNIS populated place to a 2020 county-equivalent.
- Maps all 4,159 international or territory records to MLB's reported birth country using ISO-linked Natural Earth 5.1.1 country boundaries.
- Provides shareable U.S. county and worldwide birth-country views; all 43 known roster countries/territories have geometry, while one unknown-country record remains unmapped.
- Shows U.S. mapping coverage after every filter; ambiguous and unresolved places are never treated as zero.
- Supports filters for roster level, MLB organization, position group, roster status, birth country, and active-only status.
- Supports total players, players per 100,000 residents, MLB-level players, and pitchers.
- Withholds per-capita rankings until a county has at least 10 mapped players in the selected view.
- Reconciles 54,980 distinct MLB/affiliated-MiLB season participants since 2000 and maps every U.S. high school credited with at least 20 of them.
- Reconciles reported college attendance across MLB education, official MLB Draft records, and SABR/Lahman with a Chadwick ID crosswalk; missing college evidence is never interpreted as non-attendance.

## Route

- `/mlb-talent-map` — current MLB/MiLB roster birthplace map.
- `/mlb-high-school-map` — historical MLB/affiliated-MiLB pipeline by U.S. high school.
- `/mlb-college-map` — historical MLB/affiliated-MiLB pipeline by verified college.

## High-school pipeline scope

- Reviews 54,980 distinct players from official MLB season-player endpoints for MLB, Triple-A, Double-A, High-A, Single-A, Short-Season A, and Rookie levels in 2000–2026.
- Separates 7,380 participants who appeared in MLB during the period from 47,600 minor-only participants.
- Preserves exact participation seasons for every player and 7,048 U.S. high-school identities from MLB education records.
- Maps all 25 schools with at least 20 qualifying participants and exposes the names, seasons, positions, and highest included level underlying every count.
- Audits every displayed campus coordinate against a source and its reported state boundary.

## College pipeline scope

- Uses the same 54,980-player, 2000–2026 official MLB/affiliated-MiLB participation universe as the corrected high-school map.
- Starts with 23,895 players who have a nonempty college in MLB education records.
- Fills 804 previously blank player records from official MLB Draft evidence and 21 more from the SABR Lahman CollegePlaying table joined through exact Chadwick Register identifiers.
- Retains 24,720 players with verified college evidence and explicitly marks the other 30,260 as unresolved evidence—not as players who did not attend college.
- Preserves 28,832 distinct player-college credits across 2,452 institution identities; transfers credit every verified college once.
- Maps all 26 programs at the 155-player leader cutoff. Four programs tie at that boundary, so none is excluded by an arbitrary tiebreak.
- Audits every displayed campus feature against OpenStreetMap and its reported 2020 state boundary.

## Reproduce and verify

```bash
npm ci
npm run data:build
npm run check
```

`data:build` refreshes the official MLB roster snapshot, the 2000–2026 MLB/MiLB season-player universe, and the college-source reconciliation for the fixed publication date; it also reruns the federal-place match and validates the Natural Earth country join. `check` validates all three data products, builds both deployment targets, runs unit tests, and exercises every rendered route in desktop and mobile Chromium.

## Evidence boundary

Roster membership and birth-country aggregation use MLB's person-ID snapshot directly. County geography is a conservative representative assignment because MLB exposes birth city/state/country, not exact birth county. A mapped country means the player is counted somewhere within MLB's reported birth country; a mapped county means the federal place reference resolves uniquely to that county and does not prove exact birth coordinates.

The current-roster browser payload omits player names and raw birth-city text. The historical high-school and college research publishes participant names and official person IDs because they are the auditable evidence behind each program count; no private personal data is included.

See [METHODOLOGY.md](METHODOLOGY.md), [DATA_QUALITY.md](DATA_QUALITY.md), and [ATTRIBUTION.md](ATTRIBUTION.md).

## License

Original project code and documentation are MIT-licensed. Third-party data and source material retain their own terms; see [ATTRIBUTION.md](ATTRIBUTION.md).

This is an independent research project and is not affiliated with, sponsored by, or endorsed by Major League Baseball or any MLB club.
