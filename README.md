# RegChula Mock

Clean-room course registration demonstration built with Elysia 2, React, HeroUI, Lucide, MySQL,
and Redis
8.4.

The web app includes course search and registration, drop/withdrawal, weekly class and exam
timetables, withdrawal PDF and schedule PNG exports, reviews, announcements, and a per-student
enterprise-style workspace with persisted appearance preferences.

Course details use one spacious scrollable view for metadata, sections, and reviews. Registration
shows initial suggestions, live form feedback, requirements, and class/exam clash warnings before
saving. Time clashes are allowed and remain visible in the class and exam timetables.

The weekly timetable uses the same horizontal time grid on desktop and mobile; phones scroll the
grid inside its frame. Each registered course receives a stable automatic color that can be changed
from its schedule card. The selected color is stored per student, term, and course and is reused by
the midterm/final exam boards and detailed exam table. Red is reserved for conflicts.

Registration uses a current-term form repeater rather than a second catalogue search page. Type a
course code/name for autocomplete, select an available section, add more rows, then save the whole
draft. The server previews the combined selection once and commits every accepted course in one
transaction, with deterministic section locking and an all-or-nothing result. Existing active
courses can be removed from that draft through the same confirmation-safe flow.
Prerequisite/manual-approval warnings stay visible in this mock but do not block its draft save.
Class and exam overlaps are warnings and do not block registration. Capacity, duplicate, credit,
and closed-section rules still block it.

## Requirements

- Windows 11
- Bun 1.3.14
- Docker Desktop with the Linux engine
- Optional for the multi-replica path: local Kubernetes and `kubectl` using the `docker-desktop` context

## Start

Run `start.bat`. It checks the `docker-desktop` context explicitly, regardless of the selected context,
and uses local Kubernetes when its API is ready. Otherwise it reports the detection failure and
falls back to the Bun/Vite development stack automatically. Use `start.bat k8s` or `start.bat dev` to
force a mode, and `start.bat check` to see the automatic choice without starting anything.
Kubernetes start and stop commands target `docker-desktop` without changing your selected context.
If Docker Desktop appears ready but detection fails, run `docker desktop kubernetes status` and
`kubectl config get-contexts`: a running Docker engine alone does not mean Kubernetes is running,
and kubectl needs the `docker-desktop` context in its active kubeconfig. Check `KUBECONFIG` if it is set.
If Docker Desktop is installed but stopped, the launcher starts it and waits for the engine. A failed
double-click start keeps the console open so the prerequisite or startup error remains readable.
The launcher resolves the locked Bun 1.3.14 executable from `PATH` or standard Bun, WinGet, and Scoop
per-user install locations. Existing healthy RegChula listeners on ports 3000 and 5173 are reused;
only missing development services are started. When both already exist, the launcher remains open and
monitors them until Ctrl+C instead of closing its console after setup.

The script builds pinned API and web images, starts private MySQL 8.4 and Redis 7.4 StatefulSets, runs one
controlled migration/import Job, starts three API and two web replicas, and opens one network-accessible
port-forward:

- Web: http://localhost:5173
- API: http://localhost:5173/api/v1
- OpenAPI: http://localhost:5173/openapi

On the first Kubernetes start, the existing Compose database is copied through a logical dump into a
new Kubernetes PVC. The original Docker volume is stopped but retained as rollback data. Later starts
reuse the Kubernetes PVC and never overwrite it from the old volume. `stop.bat` scales workloads to
zero without deleting either volume or the ignored secret files.

Docker Desktop Metrics Server is optional. On the Kubernetes path, HPA scales API replicas from 3 to 8 and
web replicas from 2 to 4; otherwise the static replica counts remain. `start-dev.bat` keeps the old
Bun/Vite development workflow with MySQL and Redis bound only to loopback.

For later non-Kubernetes development runs, `bun run dev` starts MySQL and Redis if needed and waits
for their health checks before starting the API and Vite. Use `start-dev.bat` when migrations/imports are also
needed.

## LAN and Tailscale access

Both startup modes listen on all IPv4 interfaces on port 5173. On another device, open
`http://<this-PC-LAN-IP>:5173` or `http://<this-PC-Tailscale-IP>:5173`.
Use `ipconfig` or `tailscale ip -4` on the hosting PC to find its address.

In `.env.local`, list the exact URLs you will use so login and save requests are accepted:

```dotenv
WEB_ADDITIONAL_ORIGINS=http://192.168.1.115:5173,http://100.88.122.114:5173
```

Replace these example addresses with this PC's addresses; do not include a trailing slash.
Restart the development API and Vite after changing this setting. `start.bat k8s` copies this
setting into its existing runtime configuration while preserving secrets. A running Kubernetes
installation needs that restart to rebuild the web image and apply the API configuration.
For development, close any old loopback-only Vite process before restarting because the launcher
reuses healthy services. Localhost remains supported.

If Windows Firewall blocks access, allow inbound TCP 5173 from your trusted LAN subnet and
Tailscale peers. Both devices must be connected to the same LAN or have Tailscale access rules
that allow the connection. Use IP addresses for this workflow; custom hostnames require an explicit
Vite allowed-host configuration. Keep this mock app on trusted networks without router port forwarding.

## Public presentation access

Run `start-public.bat` to build and start the local Kubernetes deployment, then publish its production
web service through Tailscale Funnel at:

    https://main-pc.taila84498.ts.net

Web service via Cloudflare Tunnel at:
    
    https://regchula.nthpn.com

Guests do not need Tailscale; anyone with the URL can reach the mock site. The launcher keeps the
Kubernetes service private behind a loopback-only bridge and lets Tailscale terminate public HTTPS.
Tailscale may show a one-time browser approval when Funnel is first enabled for the tailnet. The PC,
Docker Desktop, Kubernetes, and Tailscale must remain running. Funnel has bandwidth limits, so this is
intended for presentations and bounded demos rather than permanent production hosting.

Run `stop-public.bat` to close only the public URL, or `stop.bat` to close it and stop all RegChula
workloads. This is a mock system: keep real student data and reused passwords out of it.

## Catalog updates

Place raw CUGetReg JSON files using the datasets shape in data/catalogs, then restart or run:

    bun run catalog:validate
    bun run catalog:import
    bun run catalog:status

The importer carries an explicit version so schema-aware normalization changes refresh existing
snapshots once and later starts return to checksum-based skips. A manual refresh remains available:

    bun run catalog:import --force

Imports are versioned, checksum-based, and idempotent. Ambiguous program-specific exam definitions
are reported as warnings and displayed as unannounced instead of guessing. New terms do not become current automatically after
initial bootstrap:

    bun run term:list
    bun run term:set 2569 1

Historical terms remain searchable but read-only.

## Public directories

The application includes read-only building and faculty/department directories from the public CU
directory endpoints. Faculty records include all three levels: faculty, department, and field of
study, with expandable rows and searches that reveal matching ancestors. They are generated data only; no legacy page code, markup, styling, or assets
are used. Refresh them explicitly when needed:

    bun run buildings:import
    bun run faculties:import

## Appearance and language

Each mock student has an isolated profile for system/light/dark mode, eleven accent presets or a
validated custom hex accent, interface scale (90–135%), full-width or contained desktop layout, soft or
solid labels, and desktop course-detail modal/drawer choice. Detail views always use a drawer below
640px. Thai, English, and Chinese static UI are available; course records use their supplied Thai
and English names rather than generated translations.

Light mode uses a #fcfcfc canvas, pure-white content cards, and #f1f1f4 secondary buttons. Dark
mode uses a #0f1014 canvas, #15171c cards, and #1a1a1a secondary buttons. The selected accent drives
solid primary actions and active states. The default Rose preset is Chula pink (#db5f8d). Borders,
inputs, text, shadows, and focus rings stay neutral in every accent theme.

Full-width layout is the default and fills the available space on ultra-wide monitors. Contained
layout retains the saved 960–1360px width. Migration 0003 adds this choice without discarding existing
width settings; start.bat applies it, or run bun run db:migrate when updating a running development copy.

Appearance previews immediately, saves automatically, and is cached only for the signed-in student
before being reconciled with MySQL. The reset action restores the documented defaults.

## Session behavior

Withdrawal selections and reasons are saved in this browser per student and academic term. They
restore after navigation, reload, or a later login with the same mock ID. The A4 CR48 request has
four course rows and space for handwritten approvals; generating it does not change enrollment.

Remember Me is unchecked by default. The browser receives an opaque signed token, Redis owns active
expiry/revocation, and MySQL stores only its SHA-256 audit/retry row. Standard sessions
slide for ten minutes with writes throttled to once per minute and have a seven-day absolute ceiling;
Remember Me uses a seven-day ceiling. Logout revokes the shared row before clearing cookies, so a
captured cookie is rejected by every replica. Legacy student-ID cookies are not migrated.

The local mock requires a password field to match the registration specification, but it does not
store, log, or verify that value and does not treat it as identity proof. Mock authentication is
disabled by default, cannot run with `APP_ENV=production`, and may bind beyond loopback only through
the generated local container override. A real deployment remains blocked until a trusted
CUNET/identity-provider contract is implemented.

## Validation

    bun run check
    bun run test:e2e
    bun run test:visual
    load-test.bat
    artillery run test.yml

The comprehensive local campaign uses scoped synthetic records and always requires cleanup:

    bun run benchmark:prepare
    artillery run tests/load/global.yml
    artillery run tests/load/capacity.yml
    artillery run tests/load/concurrent-10000.yml
    bun run benchmark:cleanup
    bun run test:load:verify

See `docs/performance-benchmark-2026-09-05.md` for the measured limits, exact workload definitions,
cloud report links, and interpretation of concurrent users versus request rate.

E2E and load tests require healthy MySQL and Redis plus imported catalog data. The load script targets 500
virtual users as presentation evidence. The Artillery scenario uses an open arrival model for
autocomplete, catalogue, login, and batch-preview traffic. Neither local scenario is by itself a
10,000-concurrent-user production claim. The historical benchmark predates shared server sessions
and is no longer transferable; rerun the archived matrix after Kubernetes is enabled. Production
qualification also requires real authentication, TLS, observability, backup/restore evidence, and a
replicated database design.

The focused post-safety three-replica rerun is archived under
`docs/benchmarks/benchmark_1/post_safety/`: 25 registration-day journeys/s passed strictly with
4,022/4,022 HTTP 200 and p95 165.7 ms; 50 journeys/s missed strict acceptance by one timeout; 175
journeys/s failed. These are Docker approximation results because Kubernetes is not enabled locally.

Autocomplete responses, catalogue options, and term resolution use short bounded per-process
caches with request coalescing; course details and seat availability remain live. Runtime admission,
request-body size, database pool/queue sizing, connection timeout, and shutdown grace are controlled
by the documented values in `.env.example`. Overload is rejected with structured `503` responses
instead of allowing an unbounded queue to exhaust the process.

## Locked backend versions

- elysia 2.0.0-beta.11
- @elysia/openapi 2.0.0-beta.2
- @elysia/eden 2.0.0-beta.5

No automatic beta upgrades are allowed. See AGENTS.md and docs/clean-room.md before changing the
project.

## Locked frontend versions

- @heroui/react 3.2.4
- @heroui/styles 3.2.4
- lucide-react 1.39.0
- tailwindcss 4.3.3
- @tailwindcss/vite 4.3.3

Frontend package changes require a reviewed lockfile update; start.bat always uses frozen
dependencies.
