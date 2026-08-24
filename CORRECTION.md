# High-School Map Data Correction

**Status: corrected and superseded — August 24, 2026**

The initial high-school map used 6,225 players whose MLB debut dates fell between January 1, 2000 and August 24, 2026. A first correction expanded that to all 54,980 players who appeared in an official MLB or affiliated MiLB season endpoint during 2000–2026. That population was still too broad for the clarified question because it included careers that began before 2000.

The final rule includes only players whose first appearance in the official MLB or affiliated MiLB season-player endpoints is 2000 or later. The build checks every included level back through 1876 and excludes any person ID found before the cutoff.

The corrected career-start reconciliation produced:

- **54,980** unique MLB or affiliated MiLB participants visible during 2000–2026;
- **5,209** pre-2000 career carryovers excluded;
- **49,771** eligible career starters;
- **5,372** eligible players who reached MLB; and
- **44,399** eligible players who appeared only at an included affiliated minor-league level.

The 6,225-player and 54,980-player rankings should not be cited for a career-start question. The corrected release uses 49,771 eligible players, explicitly records all 5,209 exclusions (including Barry Bonds), retains exact participation seasons, publishes the linked SHA-256 audit, and validates school identities, campus geolocation, calculations, accessibility, and desktop/mobile rendering before publication.
