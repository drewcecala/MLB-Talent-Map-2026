# The Geography of MLB Talent

An audited roster-and-birthplace geography project covering every unique player on an MLB organization full roster as of **August 24, 2026**. The snapshot includes MLB, Triple-A, Double-A, High-A, Single-A, and Rookie levels.

![The Geography of MLB Talent social preview](public/og.png)

**Interactive map:** [mlb-talent-map-2026.pages.dev](https://mlb-talent-map-2026.pages.dev)

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

- `/mlb-talent-map` — interactive desktop/mobile map.

## Reproduce and verify

```bash
npm ci
npm run data:build
npm run check
```

`data:build` refreshes the official MLB roster snapshot for the fixed publication date, reruns the federal-place match, and validates the Natural Earth country join. `check` validates the public data contract, builds both deployment targets, runs unit tests, and exercises the rendered product in desktop and mobile Chromium.

## Evidence boundary

Roster membership and birth-country aggregation use MLB's person-ID snapshot directly. County geography is a conservative representative assignment because MLB exposes birth city/state/country, not exact birth county. A mapped country means the player is counted somewhere within MLB's reported birth country; a mapped county means the federal place reference resolves uniquely to that county and does not prove exact birth coordinates.

The browser payload omits player names and raw birth-city text. The private audit file retains them for research verification.

See [METHODOLOGY.md](METHODOLOGY.md), [DATA_QUALITY.md](DATA_QUALITY.md), and [ATTRIBUTION.md](ATTRIBUTION.md).

## License

Original project code and documentation are MIT-licensed. Third-party data and source material retain their own terms; see [ATTRIBUTION.md](ATTRIBUTION.md).

This is an independent research project and is not affiliated with, sponsored by, or endorsed by Major League Baseball or any MLB club.
