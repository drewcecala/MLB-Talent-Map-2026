# College Source Coverage Audit

**Snapshot:** August 24, 2026

**Eligible cohort:** 49,771 players whose first official MLB or affiliated MiLB season is 2000 or later

**Publication requirement:** at least 44,794 players (90%) with a documented final college or documented non-college entry

## Counting rule

Each player can credit one school only: the last school attended before signing a professional contract. Earlier transfer schools and unsigned draft selections receive no credit. A blank education field, international origin, foreign birth, or young signing age is never treated as proof that the player did not attend college.

## Current evidence

| Evidence state | Players |
|---|---:|
| Verified final college | 17,210 |
| Documented non-college entry | 3,640 |
| Total resolved | 20,850 (41.9%) |
| Unresolved | 28,921 |
| Additional resolved players required | 23,944 |

The public college rankings are withheld because the threshold is not met.

## Source findings

| Source | Cohort result | Limitation |
|---|---:|---|
| [MLB education](https://statsapi.mlb.com/api/v1/people/592450?hydrate=education) | 21,513 players name a college | The field is usually undated, so it cannot establish the final pre-signing school by itself. |
| [MLB Draft](https://statsapi.mlb.com/api/v1/draft/2026) | 22,513 cohort players have a draft record; 17,980 have a college-classified candidate | A draft selection may be unsigned. Only the draft tied to professional entry is used. |
| [MLB transactions](https://statsapi.mlb.com/api/v1/people/592450?hydrate=transactions) | 15,929 professional-signing transactions | The transaction supplies a date and organization but not the source school. |
| [SABR Lahman](https://sabr.org/lahman-database/) plus [Chadwick Register](https://github.com/chadwickbureau/register) | 1,300 college candidates; 58 final-school selections after conflict checks | Lahman covers major-league players and its collegiate records are not complete for the minor-only cohort. |
| [NCAA statistics](https://www.ncaa.org/championships/statistics-and-records/baseball/) | Not suitable for a complete exact-ID join | Excludes junior college, NAIA, international college, and many historical/minor-only paths; bulk reuse terms are not stated. |
| [The Baseball Cube Draft Register](https://www.thebaseballcube.com/content/store/baseball-draft-register-historical/), [UDFA/International Signings](https://www.thebaseballcube.com/content/store/udfa-signing-history-baseball/), and [Player Biographies](https://www.thebaseballcube.com/content/store/baseball-player-biographies/) | Most practical candidate for a licensed cohort join | Coverage must be measured after purchase, and written permission is required before public redistribution or derived publication. |
| [Chadwick Bureau](https://www.chadwick-bureau.com/) and [Sports Info Solutions](https://www.sportsinfosolutions.com/baseball/) | Commercial alternatives | Require a schema sample, MLBAM-ID coverage test, and negotiated public-use rights. |

`International` is not a no-college category. For example, [MLB lists Tsuyoshi Wada's college as Waseda University](https://www.mlb.com/player/tsuyoshi-wada-493159), so international acquisition alone cannot establish non-attendance.

## Required next-source contract

A supplemental source must provide an exact MLBAM join or a two-identifier manual match, signing/acquisition year or date, signed status, acquisition source, and the school immediately preceding the signing. Its license must allow the intended public GitHub and interactive-map use. Licensed raw files must remain outside the repository; only permitted derived fields and aggregate results may be published.

The pipeline will not set `publicationReady` to `true` until the measured resolved count reaches 44,794 and every credited player has no more than one final school.
