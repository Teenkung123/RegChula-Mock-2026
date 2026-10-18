# Kubernetes concurrent-user test — 2026-09-08

## Verified result

**8,000 authenticated browsing users overlapped and completed without errors in two separate runs.** Each successful run returned 80,000/80,000 HTTP 200 responses, with response p95 of 30.9 ms and 32.1 ms. Peak ten-second request rates were 903.3 and 934.0 requests/second.

The 10,000-user attempt failed with 3,066 `ECONNREFUSED` errors and only 6,934 completed journeys. All 81,265 HTTP responses actually received were 200. Kubernetes pods remained healthy with zero restarts, so this does not establish the backend's absolute concurrent-user ceiling. The cause of the connection refusals on the local generator/port-forward path was not established.

The defensible current claim is **8,000 concurrent users for this short authenticated browsing workload**, with 10,000 unsuccessful on the tested access path. Rates between 8,000 and 10,000 were not tested, and no long-duration operating guarantee is made.

## What users did

Each virtual user used an independent cookie jar and a unique reserved benchmark identity:

1. Fetch the authentication challenge and log in.
2. Read the current profile.
3. Search catalogue autocomplete six times, pausing 15 seconds after each search.
4. Read catalogue options and finish.

That is exactly ten HTTP requests per successful user and at least 90 seconds of session duration. Users were scheduled over 60 seconds. The successful 8,000-user runs each showed all 8,000 authenticated users at three consecutive ten-second reporting boundaries, a 20-second observed span of full overlap. Every session completed successfully afterward.

These are browsing/search sessions with think time. Registration commits, PDF generation, browser rendering, and 8,000 simultaneous in-flight HTTP requests are outside this workload. The separate [request-rate and lifecycle campaign](../kubernetes-2026-09-08/report.md) covers heavier operations.

## Results and Artillery dashboard links

| Run | Target users | Proven authenticated overlap at sampled boundaries | Completed | HTTP 200 | p95 / p99 | Verdict |
|---|---:|---:|---:|---:|---:|---|
| [5,000, count-based](https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/t8rxx_7fwrzerz55bpgafx9z3arcxptd4qq_3pxz) | 5,000 | 5,000 | 5,000 | 50,000 | 125.2 / 424.2 ms | Pass |
| [8,000, count-based](https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/taxbd_kdbgbbqn45y9kt6djy774zmd5a8en_99n9) | 8,000 | 5,481 | 8,000 | 80,000 | 742.6 / 1,826.6 ms | HTTP pass; insufficient overlap evidence |
| [8,000, distributed run 1](https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/thyf5_6z35mhp6mz5737rf8cfrrkrz3t5zr_bcm8) | 8,000 | **8,000** | **8,000** | **80,000** | **30.9 / 59.7 ms** | **Pass** |
| [10,000, distributed](https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/t9mqz_b9wxrc5tzqjq9drwecfcekqwfr68w_wyd7) | 10,000 | 7,374 lower bound | 6,934 | 81,265 | 685.5 / 1,130.2 ms | Fail: 3,066 connection refusals |
| [8,000, distributed recovery repeat](https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/tcf5q_z3yehjwwg9tjkwkxrxhrrk88zr84f_kgg8) | 8,000 | **8,000** | **8,000** | **80,000** | **32.1 / 63.4 ms** | **Pass** |

All runs were recorded using the existing `artillery.txt` API key. The key is not included in this evidence bundle.

## Why the initial 8,000-user result was not accepted

The installed Artillery 2.0.30 implementation routes an `arrivalCount` phase to the first local worker and pauses the other workers. This was verified in the installed `lib/dist.js` function `handleArrivalCountPhase`. Local rate-based phases are instead divided among workers by `handleArrivalRatePhase` and `lib/platform/local/index.js`.

The first 8,000-user run consequently took too long to generate all arrivals: early sessions completed before later users arrived. Its all-200 CLI result does not prove 8,000 concurrent users. The post-run overlap oracle correctly rejects that claim.

The corrected runner preserves the same 60-second arrival window and 90-second session workload, but uses integer arrival rates so Artillery can distribute generation across local workers:

- 8,000 users: 40 seconds at 133 users/s, then 20 seconds at 134 users/s.
- 10,000 users: 20 seconds at 166 users/s, then 40 seconds at 167 users/s.

These sum to exactly 8,000 and 10,000 users, respectively. The application, gateway limits, replica counts, and database budgets were unchanged during this campaign. This is a generator correction, not an application optimization.

For phase and metric semantics, see Artillery's [test-script reference](https://www.artillery.io/docs/reference/test-script), [HTTP think-time reference](https://www.artillery.io/docs/reference/engines/http), and [reported metrics](https://www.artillery.io/docs/reference/reported-metrics). The installed implementation, rather than a newer documentation version, supplied the worker-distribution finding.

## Overlap and correctness checks

`scripts/summarize.ps1` reconstructs cumulative counters from each report's chronological intermediate buckets:

```text
active VUs = cumulative created - cumulative completed - cumulative failed
authenticated lower bound = successful logins - cumulative completed - cumulative failed
```

Subtracting all failed users is conservative because some failed before authenticating. Thus the failed 10,000-user run's 7,374 figure is a sampled lower bound, not an exact maximum. For clean runs with every login successful and no failed users, this identifies the active authenticated users at each boundary. It is never inferred simply from total arrivals.

Interval created, completed, and successful-login counters must reconcile with aggregate counters. A strict pass additionally requires:

- every planned user created and completed, with no failed or skipped users;
- no transport errors;
- exactly ten requests per planned user, all responses 200;
- response p95 below 3,000 ms;
- a sampled authenticated-overlap count equal to the requested total.

Full timelines, raw reports, and actual phase overrides are retained in `results/`. The HTTP-only ensure plugin does not enforce overlap; the separate overlap oracle does. All five reports were parsed and their interval totals reconciled.

## Environment and failure observations

The existing Docker Desktop Kubernetes v1.36.1 deployment was reused: three API replicas, two web replicas, one MySQL and one Redis instance. Bun 1.3.14, Artillery 2.0.30, and Node.js v24.12.0 were unchanged from the earlier campaign.

The generator ran on the same Windows PC and targeted `http://127.0.0.1:5174` through the existing `kubectl port-forward` to `service/regchula-web`. This selects one web pod; it does not load-balance across both web replicas. The configured Origin header remained `http://localhost:5173`. Metrics Server/HPA remained unavailable. Kubelet resource samples were collected approximately every five seconds.

Campaign sampled peaks were 0.58–0.66 CPU cores and 171–181 MiB per API replica; MySQL 0.81 cores and 752 MiB; Redis 0.22 cores and 18 MiB; and the loaded web pod 0.38 cores and 163 MiB. Samples can miss brief peaks and are not CPU-throttling measurements.

During investigation of the connection refusals, the web tunnel process was still listening, readiness returned HTTP 200, and all pods were Ready with zero restarts. The Windows dynamic TCP range was 1024–65534. A later TCP snapshot showed 1,495 TIME_WAIT connections to the target; that post-load snapshot does not establish whether connection resources were exhausted during the failing interval. No definitive transport root cause is claimed. A future test through an appropriate ingress with an external generator would be needed to separate application capacity from this local access path.

## Cleanup, verification, and reproduction

Reserved benchmark fixture preparation ran before each test. Cleanup and `bun run test:load:verify` ran after every test, including the failed run. Final counts were unchanged: 111,947 offerings, 195,797 sections, 28,940 students, and 798 registrations. Zero benchmark students and zero benchmark offerings remain. Final seat and duplicate-registration checks passed; all application pods remained healthy with zero restarts and readiness returned HTTP 200.

Temporary MySQL/Redis tunnels were stopped. The bounded resource monitor finished. The pre-existing web tunnel, application workloads, and Vite process were preserved. No application or deployment configuration was changed in this concurrent-user campaign. The full application check suite had passed in the preceding deployment campaign; this follow-up used the workload, overlap, and data-integrity checks described above.

Executed commands, after opening the private MySQL 3307 and Redis 6381 tunnels:

```powershell
./tmp/benchmarks/kubernetes-concurrent-20260908/run.ps1 -Users 5000
./tmp/benchmarks/kubernetes-concurrent-20260908/run.ps1 -Users 8000
./tmp/benchmarks/kubernetes-concurrent-20260908/run.ps1 -Users 8000 -Distributed
./tmp/benchmarks/kubernetes-concurrent-20260908/run.ps1 -Users 10000 -Distributed
./tmp/benchmarks/kubernetes-concurrent-20260908/run.ps1 -Users 8000 -Distributed
./tmp/benchmarks/kubernetes-concurrent-20260908/summarize.ps1
```

The runner reuses `tmp/benchmarks/kubernetes-20260908/environment.ps1` to load the existing local Kubernetes credentials into process environment. Copies of the runner, summarizer, monitor, environment loader, and source scenario are included here, along with summary, resource samples, topology snapshots, and final data counts. No database dump or runtime secret file is included.

Follow-up: the [transport-fix and stability campaign](../kubernetes-stability-2026-09-08/report.md) removed the observed connection failures with bounded Artillery transport pooling and verified 10,000 logical VUs in a five-minute-session run. That result has a different connection model and should be read with its stated limits.
