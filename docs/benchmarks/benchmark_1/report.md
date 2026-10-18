# RegChula full-system benchmark — 2026-09-05

## Conclusion

On this PC and the local development topology, the application passed all tested successful product
paths. The strict clean held-session ceiling tested was 8,000 fully overlapping active sessions.
Runs at 9,000 and 10,000 fully overlapping sessions crossed the zero-error boundary.

The repeatable zero-error registration-day capacity was 175 new user journeys per second,
equivalent to approximately 936–938 HTTP requests per second for the measured mix. The unstable
boundary began at 188 journeys per second and failed consistently by 194–200 journeys per second.

The heavier every-feature lifecycle was repeatable at 15 journeys per second, approximately
418–434 HTTP requests per second. It exceeded the 100-request admission limit at 20 journeys per
second.

These are local-stack results, not production or universal limits. Artillery, Bun, Vite, Docker,
and MySQL shared the same machine, and the API ran through the current development process rather
than a production load balancer with multiple replicas.

## Environment

- Windows host: Intel Core i5-13500, 14 cores / 20 logical processors, approximately 32 GiB RAM.
- Bun 1.3.14 API, one process, 100-request admission limit.
- MySQL 8.4.11 in Docker, 20-connection application pool, 100 queued acquisitions.
- Artillery 2.0.30 / Node.js 24.12.0 on the same host.
- Source/config manifest: 126 files, aggregate SHA-256
  `ede9ae83465dde501e44b546f8855d16dbe43f79857910f733c8a6a7603846f2`.
- Current data before temporary benchmark fixtures: 19,141 offerings, 34,143 sections,
  43,202 meetings, and 1,134 reviews.
- Performance requirement: response p95 below 3,000 ms under high load.
- Correctness gate: every expected request must return 200, every scheduled VU must be created and
  complete, and post-run registration integrity must pass.

## Coverage

The comprehensive lifecycle covered all normal successful product operations:

- authentication challenge, login, current profile, and logout;
- terms, catalogue options, autocomplete, code/Thai/advanced search, details, and reviews;
- announcements;
- appearance read, update, and reset;
- empty and active registration lists;
- single and three-course batch preview/commit;
- weekly schedule, exams, schedule-color read/update/reset;
- withdrawal preview and generated PDF;
- four-course batch drop preview/commit;
- saved withdrawal PDF inline and download paths through a benchmark-owned fixture;
- liveness, readiness, OpenAPI JSON, compatibility echo;
- OpenAPI UI plus root, login, dashboard, search, register, drop, withdraw, schedule, exams,
  buildings, faculties, and appearance SPA routes on the local Vite server;
- every catalogue filter family in a separate one-user matrix: current/historical terms, empty and
  numeric autocomplete, faculty/department single and CSV, GenEd/group, day/time, exact/range
  credits, combined filters, page size 50, deep pagination, and no-match search.

The deliberate compatibility `418` problem route and expected rejection cases were verified by
normal automated tests rather than mixed into the all-200 capacity oracle.

## Results

| Workload | Result | HTTP | Global latency | Verdict |
|---|---:|---:|---:|---|
| Comprehensive mixed coverage | 510 / 510 journeys | 14,103 / 14,103 HTTP 200 | p95 34.8 ms, p99 67.4 ms | Pass |
| Public/OpenAPI/all SPA routes | 1 / 1 journey | 17 / 17 HTTP 200 | p95 3 ms | Pass |
| Every catalogue filter family | 1 / 1 journey | 25 / 25 HTTP 200 | p95 41.7 ms | Pass |
| Registration-day fixed 175/s, run 1 | 5,250 / 5,250 | 28,109 / 28,109 HTTP 200 | p95 36.2 ms, p99 68.7 ms | Pass |
| Registration-day fixed 175/s, run 2 | 5,250 / 5,250 | 28,133 / 28,133 HTTP 200 | p95 94.6 ms, p99 159.2 ms | Pass |
| Registration-day fixed 175/s, run 3 | 5,250 / 5,250 | 28,077 / 28,077 HTTP 200 | p95 96.6 ms, p99 183.1 ms | Pass |
| Registration-day fixed 188/s, run 1 | 5,640 / 5,640 | 30,210 / 30,210 HTTP 200 | p95 85.6 ms | Pass once |
| Registration-day fixed 188/s, run 2 | 5,607 / 5,640 | 96 HTTP 503, 49 HTTP 401 | p95 169 ms | Unstable |
| Registration-day fixed 194/s | 5,806 / 5,820 | 82 HTTP 503, 61 HTTP 401 | p95 159.2 ms | Fail |
| Registration-day fixed 200/s | 5,977 / 6,000 | 72 HTTP 503, 51 HTTP 401 | p95 149.9 ms | Fail |
| Initial 10,000-session run without guaranteed full overlap | 10,000 / 10,000 | 80,000 / 80,000 HTTP 200 | p95 43.4 ms, p99 80.6 ms | 7,383 sampled concurrent |
| 8,000 fully overlapping sessions | 8,000 / 8,000 | 80,000 / 80,000 HTTP 200 | p95 47.9 ms, p99 165.7 ms | Pass |
| 9,000 fully overlapping sessions | 8,029 / 9,000 | 86,983 HTTP 200, 515 HTTP 503, 971 timeouts | p95 584.2 ms | Fail |
| 10,000 fully overlapping sessions | 10,000 / 10,000 | 99,923 HTTP 200, 77 HTTP 503 | p95 925.4 ms | Fail strict zero-error gate |
| Every-feature fixed 15/s, run 1 | 450 / 450 | 12,554 / 12,554 HTTP 200 | p95 278.7 ms, p99 925.4 ms | Pass |
| Every-feature fixed 15/s, run 2 | 450 / 450 | 12,752 / 12,752 HTTP 200 | p95 308 ms, p99 837.3 ms | Pass |
| Every-feature fixed 15/s, run 3 | 450 / 450 | 13,008 / 13,008 HTTP 200 | p95 186.8 ms, p99 889.1 ms | Pass |
| Every-feature fixed 20/s | 516 / 600 | 237 HTTP 503, 89 HTTP 401 | p95 727.9 ms | Fail |

At the repeat-safe all-feature rate, the slower operations remained within the requirement:

- three-course batch commit: p95 889–983 ms;
- four-course drop commit: p95 944–1,002 ms;
- single-course commit: p95 128–207 ms;
- generated withdrawal PDF: p95 48–93 ms;
- saved withdrawal PDF: p95 40–87 ms;
- autocomplete: p95 24–25 ms;
- course detail: p95 55–194 ms.

## Meaning of “10,000 concurrent users”

The initial concurrent-session test created exactly 10,000 users over 60 seconds. Each stayed active
for approximately 60 seconds, but completions began before generation ended. Raw interval counters
prove 7,383 active simultaneously at sampled boundaries, with an interval-resolution upper bound of
8,045. The final profiles keep sessions active for approximately 90 seconds, ensuring every arrival
completes before the first session exits. At that stricter overlap, 8,000 passed cleanly while both
9,000 and 10,000 produced overload/timeouts.

Neither result means 10,000 simultaneous HTTP requests or registration commits. Sessions are signed
cookies and are cheap while idle; server capacity is determined by request rate and operation mix.

## Saturation behavior

The API remained responsive beyond its safe rate because admission control returned fast 503
responses instead of allowing unlimited queue growth. Follow-on 401 responses occurred when a
login request was rejected but the scenario continued with no valid session. Therefore the first
non-200 response, not the three-second latency threshold, defined the capacity boundary.

The benchmark also exposed an InnoDB lock-order cycle between expired-idempotency cleanup and
section locks. Expiry deletion was moved to autocommit before registration transactions. Focused
tests and subsequent 15/s full-lifecycle runs passed with no deadlock or HTTP 500.

## Known limitations and product findings

- Results use one API process and one MySQL instance with the load generator on the same PC.
- A production result requires the production static server, TLS/load balancer, multiple API
  replicas, production secrets, and an external/distributed load generator.
- The public withdrawal-form creation route generates an ephemeral form ID but does not persist a
  `withdrawal_requests` row. Saved-PDF retrieval therefore required a benchmark fixture and is not
  reachable from the normal public creation flow.
- The old k6 presentation scenario still contains obsolete per-registration drop routes and should
  not be used as the correctness oracle.
- The 10,000-session test used hot cached autocomplete keys; high-cardinality cache-bypass search
  requires a separate campaign.
- A two-hour soak test was not run in this interactive campaign.

## Reproduction and evidence

Benchmark definitions:

- `tests/load/global.yml`
- `tests/load/capacity.yml`
- `tests/load/concurrent-10000.yml`
- `tests/load/catalog-matrix.yml`
- `apps/api/src/cli/benchmark-fixture.ts`

Reproducible profiles:

```text
powershell -ExecutionPolicy Bypass -File scripts/benchmark.ps1 -Profile coverage
powershell -ExecutionPolicy Bypass -File scripts/benchmark.ps1 -Profile catalog-matrix
powershell -ExecutionPolicy Bypass -File scripts/benchmark.ps1 -Profile registration-day-175
powershell -ExecutionPolicy Bypass -File scripts/benchmark.ps1 -Profile registration-day-188
powershell -ExecutionPolicy Bypass -File scripts/benchmark.ps1 -Profile registration-day-194
powershell -ExecutionPolicy Bypass -File scripts/benchmark.ps1 -Profile registration-day-200
powershell -ExecutionPolicy Bypass -File scripts/benchmark.ps1 -Profile all-features-15
powershell -ExecutionPolicy Bypass -File scripts/benchmark.ps1 -Profile all-features-20
powershell -ExecutionPolicy Bypass -File scripts/benchmark.ps1 -Profile concurrent-8000
powershell -ExecutionPolicy Bypass -File scripts/benchmark.ps1 -Profile concurrent-9000
powershell -ExecutionPolicy Bypass -File scripts/benchmark.ps1 -Profile concurrent-10000
```

Raw local Artillery reports are retained under `tmp/benchmarks/`. Recorded cloud runs used the API
key from `artillery.txt`; the key was not copied into any benchmark definition or report.

Key cloud reports:

- Comprehensive coverage: https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/tadn7_9ycb4zxcbt5ymgxbtqp6qfzjdy838_km8m
- Registration-day 175/s run 1: https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/ta96w_bfym9ew9zzwzxkgj55macrwr9pzqq_cyga
- Registration-day 175/s run 2: https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/t8z95_zgtwzj4znb7jmmdtpahy5pgqrxm7e_exaj
- Registration-day 175/s run 3: https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/t8m6q_pycmfg3j6xjexgpbqt5n3z44qp9xe_zj8g
- 10,000 active sessions: https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/t3cpy_c99yh4m8kcybb6wbgw66pbfwr5pzq_dk3r
- 8,000 fully overlapping sessions: https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/t84hw_deemd53gaakg7wmapx64bz3rzjzd5_4kq8
- 9,000 fully overlapping sessions: https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/t7ajx_mkbhmny3r5zbaetxhwq4at5dzzchp_fykn
- 10,000 fully overlapping sessions: https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/tf9j3_xcfhhqqw4wn57gz95g4dcncrrbgtm_n5dr
- Every-feature 15/s confirmation: https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/tzqzy_d73xhac57etk6ynmtkjpnwbfp9xe8_gr7j
- Every-feature 15/s run 3: https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/t7bzf_5hz5kzna55z9yf7grb5hgrmkx5n3g_qdjn
- Every-feature 20/s failure: https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/tq6e6_qyj9e3ah6q5ccfxdzrbq4cn4kgrxe_yctr

Final cleanup removed all `bench-global-*` students, withdrawal fixtures, and reserved benchmark
offerings. Registration seat/duplicate integrity passed afterward. Existing `artillery-*` records
from the earlier optimization campaign were not modified.
