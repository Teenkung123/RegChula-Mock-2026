# Navigation revision: fixed overhead map and student interface

Base: published feature/campus-navigation commit a67417329dd7e08b1d05aede42b97ffb1450fa81. The branch was checked before editing; no intervening remote changes were present. These revision files are local until separately approved for publication.

## Requested behavior

- Fixed, exact 90-degree overhead camera with north at the top; panning and zooming only.
- Entire visible map viewport constrained inside the supplied model's ground rectangle, with an additional interior margin. Dragging, pinching, wheel/button/keyboard zoom, keyboard movement, resize and route/reset all use the same clamp.
- Orthographic projection, bounded by actual model heights, replaces the wide perspective depth range.
- Student-focused route panel: class end/start times next to building/room, clear walking duration and distance, brief outdoor-time and steps/shared-road notices. Sources, survey limits and lower-confidence matches move to an accessible secondary disclosure; attribution remains visible.

## Depth investigation

The original model contains map layers only centimetres apart: roads at 0.065 m, paths at 0.075 m and green surfaces at 0.03 m. The original perspective camera used near=0.5 and far=40,000, wasting depth precision at distant views. The geometry audit also identified a genuinely coplanar road/path overlap (~23.55 square metres at y=6 m), so tightening the clipping range alone was insufficient.

The revision uses a fixed overhead orthographic camera and a tight depth range derived from the loaded model. A minimal path-material-only depth bias resolves the known coplanar road/path tie without changing building/road coordinates or the supplied GLB. Route paint remains a schematic overlay; geometry is not flattened or hidden to mask the problem.

The viewport's visual aspect ratio is capped at 2:1. This is necessary because arbitrarily wide views cannot simultaneously show every long route and avoid the model border. The clamp still enforces the no-border invariant at all positive aspect ratios, while the application layout keeps normal route fits in the audited range.

## Verification limits

Browser execution was rechecked after this revision request and is still blocked before page load: Chromium fails process_singleton_posix socket() with Operation not permitted in this cloud shell. No rendered screenshot or observed disappearance of GPU flicker is claimed. The conclusions above are based on actual geometry inspection, camera/depth mathematics and automated unit/component lifecycle tests. The user's normal browser remains the final visual check.

No runtime dependencies, graph data, model binary, backend API or database schema were changed. No GPS/location access is used.

## Results on revised source

- `bun run test`: 180 passing tests (94 API, 86 web). Added 15 camera-math tests and 6 renderer/control lifecycle tests.
- `bun run typecheck`: API and web pass.
- `bun run build`: API and web pass. Lazy viewer bundle is about 627 kB minified / 159 kB gzip; the existing 400 kB warning threshold remains.
- `bun run lint`: passes with the same 11 non-blocking warnings; focused changed-source lint is clean.
- `bun run check`: still stops at the unchanged baseline deployment-security assertion requiring literal `.env.local` ignore entries while `.gitignore` uses `.env.*`. Later database/catalog checks remain unrun.
- Independent review: 35 focused tests pass; all 900 mapped-building route fits pass across tested aspect ratios 0.4–2; 1,100 randomized extreme-aspect pan/zoom cases preserve viewport containment, exact nadir and north-up orientation.
- No GLB or navigation-data bytes changed. No new runtime dependency.

The browser spec was updated for the revised student-facing controls, but its rerun stopped before page assertions because Chromium could not start in this environment. It is not counted among the passing tests above.

### Measured model bounds used by the camera

The supplied GLB's ground rectangle in local east/north metres is x=-1310.4930954…1191.6012650, y=-1185.1195049…1153.8391132. The view remains a further 24 m inside each edge. Entire-model elevations are -6…235.1499939 m; the overhead camera is at 335.1499939 m with near=1 and far=441.1499939. Nominal 24-bit orthographic depth spacing is ~0.0262 mm, versus the 10 mm ground road/path separation. The two-unit path bias is ~0.0525 mm, a tie-break rather than a visible geometric shift.
