# Campus navigation page

## What is included

- Protected `/navigation` page linked from the sidebar and schedule/exam planning tabs.
- Consecutive same-day active classes from the existing `/api/v1/schedule` response; arranged, dropped, withdrawn and invalid meetings are omitted.
- Day/transition selection, explicit sample mode (MHMK M01 → TAB220), gap/overlap warnings, unknown-code and disconnected-route states.
- Client-side Dijkstra over the supplied filtered pedestrian graph, with pedestrian one-way restrictions. No straight-line fallback.
- Lazy-loaded Three.js viewer for the supplied v3 GLB: fixed north-up overhead view, bounded pan/zoom, fit, keyboard controls, mobile interaction opt-in, retry/fallback and disposal.
- Thai, English and Chinese UI. No geolocation calls, GPS tracking, location permissions or new backend endpoints.

## Data and estimates

Snapshot 2026-10-18: 5,469 nodes, 6,012 edges, 30 mapped building codes. MHMK and TAB match the official Faculty of Science building guide; the other 28 are exact OSM-reference/course-directory matches and are labeled lower confidence. Unknown codes remain unresolved.

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

The fixed-camera and interface revision is documented in REVISION-2.md.

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

Actual browser/visual verification is BLOCKED, not passed: six authored Playwright scenarios could not start Chromium because of cloud shell Unix-socket restrictions; escalation failed before launching, and the separate cloud browser could not reach the isolated Vite loopback server. No rendered screenshots are claimed. Page-state tests use jsdom and a mocked map; they do not validate WebGL rendering.

## Run browser checks on the normal development machine

Start the frontend at http://127.0.0.1:5173, then:

    bun x playwright install chromium
    bun x playwright test --config tests/navigation.config.ts

The specs mock session/schedule API responses; no live student data is required. They cover desktop/mobile route display, floor labels, interaction/escape focus, example toggling, responsive overflow, unknown/empty schedules, and GLB network failure/retry. Set CHROMIUM_PATH only if using a specific installed Chromium executable. Successful runs write tmp/navigation-desktop.png and tmp/navigation-mobile.png. Real WebGL rendering, screen-reader usability and actual campus walkability still warrant local review.

Publishing a feature branch does not deploy or merge these changes. No deployment or merge is included.
