# The Geography of MLB Talent

An audited roster-and-birthplace geography project covering every unique player on an MLB organization full roster as of **August 24, 2026**. The snapshot includes MLB, Triple-A, Double-A, High-A, Single-A, and Rookie levels.

The project also includes a separately defined historical pipeline view: U.S. high schools credited with players who made an MLB debut from **January 1, 2000 through August 24, 2026**.

![The Geography of MLB Talent social preview](public/og.png)

**Interactive map:** [mlb-talent-map-2026.pages.dev](https://mlb-talent-map-2026.pages.dev)

**High-school pipeline:** [mlb-talent-map-2026.pages.dev/mlb-high-school-map](https://mlb-talent-map-2026.pages.dev/mlb-high-school-map)

## What the product does

- Includes 8,440 unique rostered players across all 30 MLB organizations and 201 affiliated teams.
- Maps U.S. birthplaces only when MLB birth city/state resolves uniquely through a federal GNIS populated place to a 2020 county-equivalent.
- Maps all 4,159 international or territory records to MLB's reported birth country using ISO-linked Natural Earth 5.1.1 country boundaries.
- Provides shareable U.S. county and worldwide birth-country views; all 43 known roster countries/territories have geometry, while one unknown-country record remains unmapped.
- Shows U.S. mapping coverage after every filter; ambiguous and unresolved places are never treated as zero.
- Supports filters for roster level, MLB organization, position group, roster status, birth country, and active-only status.
- Supports total players, players per 100,000 residents, MLB-level players, and pitchers.
- Withholds per-capita rankings until a county has at least 10 mapped players in the selected view.

## Route

- `/mlb-talent-map` — current MLB/MiLB roster birthplace map.
- `/mlb-high-school-map` — post-2000 MLB debut pipeline by U.S. high school.

## High-school pipeline scope

- Reviews 6,225 players with an MLB debut in the declared period.
- Preserves 2,656 U.S. high-school identities from MLB education records.
- Maps and ranks all 76 schools with at least five qualifying players.
- Exposes the player names, positions, and MLB debut dates underlying every mapped school count.
- Keeps school, state, debut-era, and position filters in the shareable URL.
- Audits each leader-program coordinate to a campus and checks that the point falls inside the reported state.

## Reproduce and verify

```bash
npm ci
npm run data:build
npm run check
```

`data:build` refreshes the official MLB roster snapshot and the post-2000 MLB debut/education records for the fixed publication date, reruns the federal-place match, and validates the Natural Earth country join. `check` validates both public data contracts, builds both deployment targets, runs unit tests, and exercises both rendered products in desktop and mobile Chromium.

## Evidence boundary

Roster membership and birth-country aggregation use MLB's person-ID snapshot directly. County geography is a conservative representative assignment because MLB exposes birth city/state/country, not exact birth county. A mapped country means the player is counted somewhere within MLB's reported birth country; a mapped county means the federal place reference resolves uniquely to that county and does not prove exact birth coordinates.

The current-roster browser payload omits player names and raw birth-city text. The high-school pipeline intentionally includes player names and debut dates because those records are the public evidence behind each school count; it does not publish private personal data.

See [METHODOLOGY.md](METHODOLOGY.md), [DATA_QUALITY.md](DATA_QUALITY.md), and [ATTRIBUTION.md](ATTRIBUTION.md).

## License

Original project code and documentation are MIT-licensed. Third-party data and source material retain their own terms; see [ATTRIBUTION.md](ATTRIBUTION.md).

This is an independent research project and is not affiliated with, sponsored by, or endorsed by Major League Baseball or any MLB club.
