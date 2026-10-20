# Campus navigation page

## What is included

- Protected `/navigation` page linked from the sidebar and schedule/exam planning tabs.
- Consecutive same-day active classes from the existing `/api/v1/schedule` response; arranged, dropped, withdrawn and invalid meetings are omitted.
- Day/transition selection, explicit sample mode (MHMK M01 → TAB220), an estimated ten-minute early-finish walking allowance, unchanged scheduled-time overlap warnings, unknown-code and disconnected-route states.
- Client-side Dijkstra over the supplied filtered pedestrian graph, with pedestrian one-way restrictions. No straight-line fallback.
- Lazy-loaded Three.js viewer for the supplied v3 GLB: fixed north-up overhead perspective view, immediately available bounded pan/zoom and touch/keyboard controls, fit, retry/fallback and disposal. A slim blue route with small light chevrons contained within straight segments and distinct origin/destination colors and shapes identifies the walk. An optional switch lets buildings obstruct the route.
- Thai, English and Chinese UI. No geolocation calls, GPS tracking, location permissions or new backend endpoints.

## Data and estimates

Updated 2026-10-19: 5,469 nodes, 6,012 edges, 48 mapped building footprints with additional code aliases. MHMK and TAB match the official Faculty of Science building guide. PHOTO uses the official university location pin matched to the supplied model footprint; other mappings use exact OSM-reference/course-directory matches and retain lower confidence. Unknown or ambiguous codes remain unresolved. See ROUTING-DATA.md for sources and access-point limitations.

MHMK M01 resolves to floor M; TAB220 to floor 2 from the official room table. Exact room mappings take precedence. Where a supported floor count/convention exists, the first digit (or first two for more than nine storeys) provides an estimated floor label. Conflicting counts or unusual codes fall back to the building. No floor label is presented as an indoor coordinate or included in travel time.

The sample route is approximately 192 m / 3 minutes outdoors at 1.2 m/s. It uses one mapped steps segment and shared low-speed road segments. Add time for indoor movement, lifts, finding classrooms and crossing waits. Endpoints are mapped nearby path points, not verified entrances. The overlay is schematic in elevation. No surveyed, wheelchair-accessible, open-gate or live-closure guarantee is made.

See ROUTING-DATA.md, graph-validation.json, example-route.json and source-way-tags.json. Public attribution and model provenance are under apps/web/public/campus/.

## Install and run

If using the published feature/campus-navigation branch, the changes are already present: run bun install --frozen-lockfile and the normal startup workflow. Otherwise, apply the supplied Git patch to a clean checkout of Teenkung123/RegChula-Mock-2026 at main commit 5d2c88578bdda3b6fa7326f2327ba64a01215d7c, or a compatible later main after reviewing conflicts:

    git switch -c feat/campus-navigation
    git apply --check campus-navigation.patch
    git apply campus-navigation.patch
    bun install --frozen-lockfile

Use Bun 1.3.14 as already required. New approved dependency: three 0.186.1; development types: @types/three 0.185.0. All existing pinned dependencies are unchanged. Start the project using its existing README/start.bat workflow and sign in, then open `/navigation`.

The API still requires the project's existing MySQL/Redis/catalog setup; this feature adds no migrations. The source package is a change overlay, not a replacement repository or database.

The fixed-camera and interface revision is documented in REVISION-2.md. The subsequent depth-preserving perspective refinement is documented in REVISION-3.md.

## Model naming and roof audit 2026-10-19

- The supplied web GLB contains 246 building footprints, 48 parts and 16 canopies. Six parts with an explicit shared landmark parent combine into one anchor, giving 305 grouped anchors. There are 184 explicit source names: 183 buildings and one canopy.
- Labels merge those explicit model names with the mapped classroom-building directory by footprint identity. Model roof bounds supply the label elevation. MAHIT and BRK lack individual model anchors, so their supported map positions are retained at the existing ground datum without inventing a roof height. Unnamed model records acquire no generated display name.
- Labels follow the camera, favor selected/mapped buildings, avoid route lines, endpoint badges and map controls, and limit visible density. Text sizes are cached during panning and refreshed for font, theme or viewport changes.
- The vivid `roof_tile_historic` material occurs on eleven `campus_roof_detail` surfaces. Presentation color is softened toward the existing pale `roof_tile` palette (linear RGB 0.48, 0.25, 0.16). Fourteen existing pale roof surfaces, one glass roof and twenty-six facade-material gables are preserved. Shared non-roof materials are protected.
- The original GLB geometry and file remain unchanged. Roof treatment is applied to the loaded scene. Marker and map-label colors use fixed map-specific tokens, independent of the surrounding interface theme.
- The map owns touch gestures through an explicit sidebar-swipe boundary; ordinary page-edge swipes retain the existing menu behavior.

## Local verification 2026-10-19

- The full frontend unit run passed 131 tests. The follow-up map/label regressions passed twelve tests after correcting label layout when the controls first mount.
- Frontend typecheck, production build and focused Biome checks passed; existing test non-null-assertion warnings remain. The lazy map bundle still exceeds the existing 400 kB advisory threshold.
- Fifteen desktop/mobile browser scenarios passed; the desktop copy of the mobile-only touch test is intentionally skipped. Coverage includes real touch panning without opening the sidebar, normal menu swipes, label collisions, stable marker colors across theme changes, direct interaction, endpoint framing, light/dark rendering, building occlusion, overlap/empty states, model retry, and the reported PHOTO 501 example in Thai. Screenshots were inspected at desktop and mobile widths.
- The data audit confirmed all 5,469 nodes, 6,012 edges and original thirty building records are unchanged, apart from supported additional aliases. Eighteen building footprints were added with existing nearby path endpoints.
- `bun run check` stops at the existing deployment-security assertion requiring literal environment-file ignore lines; `.env.*` already ignores those files. No database fixture checks, imports, migrations or resets were run.

## Verification performed for the original publication in cloud copy

- `bun run test`: PASS, 94 API tests + 65 web tests (159 total).
- New focused coverage: 8 routing/parser/timetable tests + 6 page state/integration tests.
- `bun run typecheck`: PASS, API and web.
- `bun run build`: PASS, API and web. Existing 400 kB chunk threshold warns for the lazy 3D viewer (~644 kB minified, ~163 kB gzip). Its model is ~9.3 MB and loaded only on the navigation page.
- `bun run lint`: PASS with warnings (existing CSS specificity and test non-null assertions); no errors.
- `bun run check:elysia` and `bun run check:clean-room`: PASS.
- Independent graph audit: 900 mapped-building pairs remain on graph edges with consistent distances; one-way and disconnected cases verified; restricted permit/destination-only paths removed; geometry/adjacency checks passed.
- Independent source/data review found no blocking issue within the reviewed scope.

`bun run check` does NOT pass on the supplied baseline: `check:deployment-security` expects literal `.env.local`, `.env.k8s.local`, `.env.k8s.mysql.local`, `.env.k8s.redis.local` ignore lines, while the existing .gitignore uses `.env.*`. It stops there; the unrelated assertion was not changed. DB/catalog/auth-concurrency/load checks beyond that gate were not run against a live database.

In that original cloud run, browser/visual verification was blocked: six authored Playwright scenarios could not start Chromium because of cloud shell Unix-socket restrictions; escalation failed before launching, and the separate cloud browser could not reach the isolated Vite loopback server. Its page-state tests used jsdom and a mocked map. The subsequent local browser and screenshot checks are recorded above.

## Run browser checks on the normal development machine

Start the frontend at http://127.0.0.1:5173, then:

    bun x playwright install chromium
    bun x playwright test --config tests/navigation.config.ts

The specs mock session/schedule API responses; no live student data is required. They cover desktop/mobile route display, floor labels, interaction/escape focus, example toggling, responsive overflow, unknown/empty schedules, and GLB network failure/retry. Set CHROMIUM_PATH only if using a specific installed Chromium executable. Successful runs write tmp/navigation-desktop.png and tmp/navigation-mobile.png. Real WebGL rendering, screen-reader usability and actual campus walkability still warrant local review.

Publishing a feature branch does not deploy or merge these changes. No deployment or merge is included.
