# Attribution and source ledger

| Layer | Source | Snapshot / vintage | Use | Notes |
|---|---|---|---|---|
| Sports and level taxonomy | [MLB Stats API sports](https://statsapi.mlb.com/api/v1/sports) | 2026-08-24 | Defines MLB, Triple-A, Double-A, High-A, Single-A, and Rookie sport IDs | MLB API response carries MLB Advanced Media copyright notice |
| Active team catalog | [MLB Stats API teams](https://statsapi.mlb.com/api/v1/teams?sportIds=1,11,12,13,14,16&activeStatus=Y) | 2026-08-24 | Defines 30 MLB organizations and 201 active affiliates | Joined by team and parent-organization IDs |
| Roster-type definition | [MLB Stats API roster types](https://statsapi.mlb.com/api/v1/rosterTypes) | 2026-08-24 | Documents `fullRoster` as the full active/inactive roster | Each parent roster request is preserved in the private raw snapshot |
| Player roster/person fields | MLB Stats API organization `fullRoster` responses | 2026-08-24 | Person ID, current team, position, status, and birth city/state/country | Public payload omits names and raw birth-city/state fields |
| Federal place names | [USGS GNIS downloads](https://www.usgs.gov/us-board-on-geographic-names/download-gnis-data) | Files dated 2026-07-01 | Official and variant populated-place names, county codes, and coordinates | USGS describes GNIS as the federal repository; source page marks the data public domain |
| County boundaries | [U.S. Census Bureau 2020 Cartographic Boundary Files](https://www.census.gov/geographies/mapping-files/2020/geo/carto-boundary-file.html) | 2020 | Simplified 50-state/DC county and state geometry | Census cartographic boundaries are simplified representations of MAF/TIGER geography |
| County population | U.S. Census Bureau 2020 population reference joined by county FIPS | 2020 | Per-capita denominator | Per-capita rankings require at least 10 mapped players in the selected view |
| Country boundaries | [Natural Earth Admin 0 – Countries](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/) | Version 5.1.1, 1:50m | Worldwide birth-country choropleth and small-country label points | Public-domain dataset; default de facto boundary view; joined to MLB labels through documented ISO alpha-3 codes |
| MLB season players and education | [MLB Stats API season players](https://statsapi.mlb.com/api/v1/sports/1/players?season=2026) and [person education example](https://statsapi.mlb.com/api/v1/people?personIds=592450&hydrate=education) | 2000–2026 seasons, queried 2026-08-24 | MLB person ID, debut date, primary position, and reported high schools | Each school count is distinct by MLB person ID; MLB education completeness varies by player |
| High-school campus points | [OpenStreetMap Nominatim](https://nominatim.org/release-docs/latest/api/Search/) and official school/municipal sources | Audited 2026-08-24 | Campus locations for all 76 programs with five or more qualifying MLB debuts | Nominatim requests were cached and rate-limited; OpenStreetMap data is ODbL |
| Address geocoding | [U.S. Census Geocoder](https://geocoding.geo.census.gov/geocoder/) | Queried 2026-08-24 | Coordinates for 11 official school addresses not resolved to an exact Nominatim school feature | Every resulting point is checked against the reported-state polygon |

## MLB content notice

The live MLB API responses state: “Copyright 2026 MLB Advanced Media, L.P.” and direct users to MLB content terms. The project uses the responses for a dated research snapshot and retains source URLs and copyright text in the private raw snapshot. MLB names and team names remain the property of their respective owners.

## Original work

Application code, data transformation logic, tests, documentation, visual design, and derived aggregate tables are original project work under the repository license. No third-party dataset is relicensed.
