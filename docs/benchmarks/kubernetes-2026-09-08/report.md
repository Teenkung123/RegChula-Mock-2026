# Kubernetes Artillery stress test — 2026-09-08

## Result

The deployed Kubernetes stack passed the registration-day workload at **250 new journeys/second in two separate 30-second runs**, with 7,500/7,500 journeys and all HTTP responses 200 in each run. Response p95 was 383.8 ms and 273.2 ms. Artillery reported approximately 1,334–1,355 HTTP requests/second.

At 300 journeys/second, the strict correctness gate failed. Gateway login throttling and exhausted API database queues were observed. The heavier complete-student lifecycle passed once at 15 journeys/second and failed at 30 journeys/second.

The previous post-safety Docker approximation passed 25 journeys/second, nearly passed 50, and failed at 175. This campaign raises the highest demonstrated clean registration-day rate from 25 to 250 journeys/second. This is a comparison of measured runs, not proof that Kubernetes alone caused a tenfold improvement: deployment, network path, data volume, and host conditions differ.

## Environment and workload

- Docker Desktop Kubernetes v1.36.1: one control-plane node and three workers on the same Windows PC.
- Three API replicas, distributed across the three workers; two Nginx web replicas; one MySQL and one Redis instance.
- Bun 1.3.14, Artillery 2.0.30, Node.js v24.12.0.
- Each API: 12 MySQL connections, queue limit 120, admission limit 200, CPU limit 2 cores, memory limit 1 GiB.
- MySQL: maximum 160 connections, CPU limit 4 cores, memory limit 4 GiB.
- Metrics Server was unavailable; no HPA was enabled. Resource observations came from kubelet stats sampled about every five seconds.
- Target: `http://127.0.0.1:5174`, forwarded to `service/regchula-web`. The existing Vite process on port 5173 was preserved. Scenarios retained the configured `Origin: http://localhost:5173` header; browser-origin behavior on 5174 was not tested.
- The port-forward selects **one web pod**. All three API replicas showed load, but both web replicas were not load-balanced by this test path.
- Data: 111,947 course offerings, 195,797 sections, 28,940 existing students, and 798 registrations before and after the campaign.

Registration-day uses the existing `tests/load/capacity.yml` mix: 65% autocomplete/options/profile journeys, 20% course-detail/review journeys, and 15% three-course registration previews. It does not commit registrations.

Lifecycle uses only `complete-student-lifecycle` from `tests/load/global.yml`: 34 requests per successful journey, including login, catalogue queries, appearance changes, single and batch registration commits, schedules, exams, colors, withdrawal PDF creation, batch drop, and logout. Public SPA and shared-account saved-PDF scenarios were excluded. This is not identical to the older weighted every-feature benchmark, and is not an exhaustive frontend test.

Every load step used a 30-second arrival window, a maximum of 5,000 active virtual users, the existing HTTP timeout, and a p95 threshold of 3,000 ms. Passing also required all planned users to be created and completed, with every HTTP response 200. A completed Artillery journey alone is not proof of successful business operations; the all-200 condition is essential.

## Results and recorded runs

| Workload | Arrivals/s | Completed / planned | HTTP 200 / responses | p95 | p99 | Strict result / cloud report |
|---|---:|---:|---:|---:|---:|---|
| Registration-day | 25 | 750 / 750 | 4,008 / 4,008 | 10.1 ms | 29.1 ms | [Pass](https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/tjre9_xfe35zeqhfqmdpkdmrkh3wrc3btyh_mfh5) |
| Registration-day | 50 | 1,500 / 1,500 | 7,981 / 7,981 | 8.9 ms | 12.1 ms | [Pass](https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/t876p_fj5jah85qtpbmbe8j9btemycx5mcb_kygh) |
| Registration-day | 175 | 5,250 / 5,250 | 28,085 / 28,085 | 40.0 ms | 74.4 ms | [Pass](https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/t4r3d_pj5ynpckytfd4eqexm964c99db9wm_cakn) |
| Registration-day, run 1 | 250 | 7,500 / 7,500 | 40,167 / 40,167 | 383.8 ms | 685.5 ms | [Pass](https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/t8x6f_g38848k87nkb5mybbx77yfqtyka46_84h6) |
| Registration-day, recovery repeat | 250 | 7,500 / 7,500 | 40,170 / 40,170 | 273.2 ms | 450.4 ms | [Pass](https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/t53we_5zxkqnnp894bgjzf4q3y7pjzyg53w_r7tb) |
| Registration-day | 300 | 8,664 / 9,000 | 40,670 / 47,211 | 854.2 ms | 1,380.5 ms | [Fail](https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/tt73d_md5xqbjh5ayhn7namx37xkyr8cebh_df7t) |
| Complete lifecycle | 15 | 450 / 450 | 15,300 / 15,300 | 36.2 ms | 58.6 ms | [Pass, one run](https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/thcx4_7grxkh8y5jgjhj7qn3y3de6k4xwnp_je9w) |
| Complete lifecycle | 30 | 852 / 900 | 29,557 / 29,818 | 1,085.9 ms | 1,652.8 ms | [Fail](https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/t6ze7_cndakr7r7hgc57gjnw3b7cp5hpqhh_gcqa) |

The 300/s run returned 2,185 HTTP 503 and 4,356 HTTP 401 responses, with 336 failed capture/match journeys. Nginx logged login-limit burst exhaustion; API logs reported database queue limits reached. Some 503s occurred outside login. These two mechanisms were observed, but the reports do not attribute every individual 503 to its originating layer.

The 30/s lifecycle returned 90 HTTP 503 and 171 HTTP 401 responses, with 48 failed capture/match journeys. API logs again showed database queue exhaustion, including the logout session-revocation path. At this load, batch registration p95 was 1,755 ms and batch drop p95 was 1,826.6 ms. Neither failing run returned HTTP 500 or recorded transport timeouts.

Latency alone would have passed both failing runs. They fail because operations were rejected and some journeys did not finish. The follow-on 401s are consistent with scenarios continuing after rejected authentication.

## Resource observations

Across this campaign, sampled API peaks were approximately 1.03–1.09 CPU cores and 184–211 MiB per replica. MySQL peaked at 1.72 sampled CPU cores and 739 MiB, Redis at 0.24 cores and 14 MiB, and the loaded web pod at 0.85 cores and 165 MiB. These are periodic samples, not instantaneous maxima or CPU-throttling measurements. The idle web replica confirms the tunnel limitation.

Every API, web, MySQL, and Redis pod remained Ready with zero restarts after the tests. The next performance investigation should measure time holding database connections and contention on shared registration sections before changing connection budgets or adding replicas. The write scenario intentionally shares four synthetic sections, so its contention differs from a broadly distributed course workload.

## Deployment fixes and verification

Deployment was separately authorized. First startup exposed and required these focused fixes:

- `start-k8s.bat`: invoke `icacls` once per secret file; Windows rejected the original multi-filename call. Add `mysqldump --no-tablespaces` to avoid the application user's missing PROCESS privilege during logical export.
- `deploy/k8s/base/api.yaml`, `web.yaml`, and `jobs.yaml`: change `imagePullPolicy` from `Never` to `IfNotPresent`. New workers reported `ErrImageNeverPull`; a restricted probe successfully loaded the locally built API image and printed Bun 1.3.14 before the corrected workloads were started.
- `scripts/benchmark.ps1`: add a `-Target` parameter so existing benchmark profiles can target the Kubernetes gateway.

The source database was exported and restored into the Kubernetes PVC, then the original Compose MySQL container was stopped. Its volume remains intact. The logical seed is retained at `tmp/regchula-k8s-seed-verified.sql`; it is intentionally excluded from this report bundle.

`bun run check` passed after the deployment/runner changes: convention and deployment checks, catalogue validation, lint, type checking, 81 API tests, 44 web tests, auth safety, registration concurrency, integrity, and builds. The deployed root HTML, a referenced JavaScript asset, and readiness endpoint returned HTTP 200.

Benchmark fixture cleanup and integrity verification ran after every load step, including failures. Final counts match the source counts; zero benchmark students and zero benchmark offerings remain. Original registrations remain at 798. Database/Redis tunnels and resource monitoring were stopped afterward; the Kubernetes workloads and web tunnel remain running. The existing Vite process was preserved.

## Reproduction and evidence

The baseline is [the post-safety Docker report](../benchmark_1/post_safety/report.md), not the older stateless-authentication 175/s result.

The executed local runners are `tmp/benchmarks/kubernetes-20260908/run-profile.ps1` and `run-rate.ps1`. They load existing runtime secrets into process environment without printing them, use private MySQL/Redis tunnels, prepare reserved fixtures, record with the key from `artillery.txt`, and clean up in `finally`. Copies are retained in `scripts/` here. To reproduce, first establish the same loopback tunnels (web 5174, MySQL 3307, Redis 6381), then run from `D:\RegChula`:

```powershell
./tmp/benchmarks/kubernetes-20260908/run-profile.ps1 -Profile registration-day-175
./tmp/benchmarks/kubernetes-20260908/run-rate.ps1 -Rate 250
./tmp/benchmarks/kubernetes-20260908/run-rate.ps1 -Rate 300
./tmp/benchmarks/kubernetes-20260908/run-rate.ps1 -Rate 15 -Workload lifecycle
./tmp/benchmarks/kubernetes-20260908/run-rate.ps1 -Rate 30 -Workload lifecycle
```

Raw reports are in `results/`; `summary.json`, `cloud-runs.json`, source hashes, pre/post topology, sampled resources, diagnostic logs, final data counts, and the full check log are alongside this document. Some original filenames use Buddhist year 2569 because the installed PowerShell culture formats dates that way; custom run filenames use Gregorian year 2026.

These short tests do not establish an exact maximum between 250 and 300 registration-day arrivals/s, between 15 and 30 lifecycle arrivals/s, a long-term safe operating rate, a concurrent-session ceiling, autoscaling behavior, or production capacity. The load generator, cluster, and other existing applications shared one PC. No load-balancing across both web pods, browser UI load, external distributed generator, TLS ingress, or extended soak test was exercised.

Subsequent work: the [concurrent-user campaign](../kubernetes-concurrent-2026-09-08/report.md) verified 8,000 overlapping authenticated browsing users twice; its 10,000-user attempt failed with connection refusals on the local test path.
