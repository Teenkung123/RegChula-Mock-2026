# Navigation revision 4: reviewed pedestrian tunnel and plaza routes

Base: feature/campus-navigation commit `270496f12d2d1f6dcecd040e4c02fbd9e8ee2911`. The pedestrian-source evidence was reviewed on 2026-10-20. This revision was reconstructed and independently rechecked on 2026-10-21; earlier test totals are historical and are not substitutes for the fresh results recorded below.

## Route changes

The mapped campus tunnel becomes usable through four narrowly reviewed approach segments. Each is an existing consecutive OSM node pair and may cross only its individually recorded fence. Other fences, walls, buildings and access restrictions remain enforced.

| Approach | Original way | Original node pair | Allowed fence |
| --- | --- | --- | --- |
| East north | 836151470 | 13381164616 → 6247187971 | 1455922944 |
| East south | 836151471 | 11144118020 → 7804339314 | 31971887 |
| West north | 836151472 | 7804339316 → 7804339317 | 200671068 |
| West south | 1204350167 | 7804339319 → 7804339320 | 200671068 |

The university's [pedestrian-access report](https://sustainability.chula.ac.th/th/report/3373/), [CU Tunnel Revival project](https://healthyspaceforum.org/portfolio/cu-tunnel-revival/), and [campus gate register](https://www.arts.chula.ac.th/~tran/downloads/cu_traffic_03.pdf) corroborate the connection. Exact coordinates and adjacency come from the supplied OSM snapshot. Current gate access and hours remain unverified. Stored historic hours are provenance only, and affected routes display an access warning.

Visibility edges are allowed only within three explicitly mapped pedestrian surfaces: Sci Square (1425513646), the plaza mapped as 1379251825, and Atom Square (1100606098). These are standalone closed OSM ways with no multipolygon membership. Added segments must be contained by the surface, respect concave boundaries and holes, and avoid building interiors, planting, water and barriers. Elevated or stair-incidence nodes cannot gain plaza connections. No arbitrary sidewalk, lawn, fence, geometric-crossing, proximity or major-road-centreline shortcut is created.

MHMK→PINIT changes from 946.561 m to 441.049 m through the tunnel, approximately seven outdoor walking minutes at 1.2 m/s. MHMK→TAB remains 192.227 m, approximately three outdoor walking minutes. Building access points remain approximate mapped exterior points, not verified doors; indoor classroom travel is excluded.

## Grade separation and display

Interior source-node crossings at different grades receive separate graph identities. Ambiguous three-grade junctions are separated too; mapped two-grade structure/stair endpoints may remain transitions. Source-node and edge identities are retained as provenance. Tunnel node 358215242 has tunnel-only incidence and cannot connect to the surface.

Bridge tags establish a raised grade even when the optional layer tag is absent. Rendering uses schematic ground 0, tunnel -3 and bridge +5 metres per mapped layer, with interpolated mapped stair approaches. These are not surveyed elevations, ramp gradients, accessible routes or classroom floors.

Ground-ended structure spans receive display-only interior shoulders so that a two-node bridge or underpass is not drawn flat. The shoulders never enter the graph, create a connection or change walking distance. Ribbon geometry and arrows follow grade changes. Underground legs remain visible through the ground when building occlusion is enabled.

The final graph has 5,515 nodes, 6,153 edges and 105 weakly connected components after 23 mixed-grade junction splits. All 6,012 original edge identities and all 48 building records are retained; the additions are four reviewed approaches and 137 plaza segments. Restricted or unresolved connections remain disconnected.

## Reproduction and validation

Run `python scripts/campus-routing/update_graph.py` and `python scripts/campus-routing/test_graph.py` with Shapely installed as a build/test dependency. The compiler consumes the checked-in source and review snapshots, and recompilation must preserve the parsed graph data. The application adds no runtime dependency.

The fresh independent graph audit passed on 2026-10-21 at 07:12 UTC and is recorded in `pedestrian-validation.json`, including input hashes. All 141 added segments were checked against 5,315 original building/water/planting polygon features and 238 barrier lines. There were no unexpected intersections; each reviewed approach crossed its sole allowlisted fence at exactly one point. All 137 plaza segments are contained in their mapped surface, and all three area rings/tags match their original closed OSM ways.

All 2,304 directed building pairs, including same-building pairs, were compared with the baseline: 386 routes shortened, 1,080 reachable routes stayed unchanged, and 838 already unreachable pairs remained unreachable. No reachable pair lost its route or became longer. The compiler is idempotent on its parsed output, all original edge identities/building records are preserved, and all 13 compiler regression tests passed in this fresh run. Regression coverage includes concavity, holes, obstacles, fence exemptions, grade isolation, bridge tags without layers, stair interpolation, restrictions and idempotence.

The original `graph-validation.json` is labeled historical; its original-adjacency-only claims and counts do not describe the plaza overlay.

An independent fresh run of the routing, renderer-component and navigation-page suites passed all 42 tests across three files on 2026-10-21. This verifies the recovered TypeScript integration, including display-only structure elevations, underground occlusion behavior and access warnings; the renderer tests use a simulated renderer and do not establish actual GPU/browser appearance.

The final recovery checks on 2026-10-21 also produced these fresh results:

- All 140 web tests passed across 26 files using `cd apps/web && node node_modules/vitest/vitest.mjs run`.
- Web TypeScript passed using `node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit`.
- The Vite production build passed using `cd apps/web && node node_modules/vite/bin/vite.js build`; chunk-size and plugin-timing warnings remain.
- Biome passed for the seven changed TypeScript/TSX files, with 13 non-null-assertion warnings in the graph tests (seven baseline and six added). This is a focused check, not a whole-repository lint pass.
- `bun run check` passed the Elysia and clean-room checks, then stopped at the pre-existing deployment-security assertion requiring a literal `.env.local` ignore entry. The baseline `.gitignore` instead uses `.env.*`. Later aggregate stages, including database/catalog validation, were not reached; there is no full aggregate pass.
- The tunnel browser spec was retried with `CHROMIUM_PATH=/usr/bin/chromium node node_modules/@playwright/test/cli.js test --config tests/navigation.config.ts --grep 'takes the Chula Tunnel' --project=desktop`. Chromium failed before the application loaded because its process-singleton socket operation is not permitted in this cloud environment. Browser assertions did not run; no screenshot or observed GPU-rendering result is claimed.

These are the fresh recovery results, not the earlier 2026-10-20 totals. They do not establish API/database integration or real-world navigation availability.

## Remaining limits

- Outdoor planning preview only; gate state, access permissions and closures are not live.
- No GPS, turn-by-turn, verified entrance, indoor route or wheelchair-accessibility guarantee.
- Two-grade mapped endpoints are a source-topology assumption, not field-survey evidence.
- Building geometry uses the inherited 0.3 m inward audit tolerance; source mapping can be incomplete.
- Preserve OpenStreetMap attribution and ODbL licensing. These tests validate the supplied snapshot, not present-day walkability.
