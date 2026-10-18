# Kubernetes concurrent stability fix — 2026-09-08

## Outcome

**10,000 independently authenticated virtual users passed a five-minute-session test:** 250,000/250,000 HTTP 200 responses, zero failed users, zero transport errors, and 20,000 successful profile-ownership checks. Response p95 was **10.9 ms**, p99 **18 ms**. All 10,000 authenticated users overlapped across **230 seconds of sampled reporting boundaries**. Peak requests in a ten-second interval were **1,141.2 requests/second**.

This advances the earlier repeat-tested 8,000-user result for the browsing workload. The successful change is in the load-test transport and runner. Application code, database budgets, replica counts, authentication protections, and gateway rate limits were not changed during this campaign.

## Diagnosis and controlled comparison

The prior 10,000-user failure was reproduced on the same Kubernetes deployment and `http://127.0.0.1:5174` tunnel. It again returned only HTTP 200 responses when an HTTP exchange completed, but 3,455 users failed with `ECONNREFUSED`.

A bounded Artillery `onError` hook recorded only timestamp, worker ID, error code, destination host/port, path, and timing phases. Failures targeted the local 5174 endpoint and included both authentication challenges and catalogue searches. Most of the 456 retained samples clustered within two seconds. No request headers, cookies, credentials, or bodies were recorded.

The web pod's kernel counters had zero deltas for listen overflows/drops, request-queue drops, memory-pressure aborts, and SYN retransmissions. Pods remained Ready with zero restarts; the tunnel listener stayed present and its stderr was empty. These observations did not support increasing application admission, database connections, or pod resources.

The installed Artillery HTTP engine creates a separate `agentkeepalive` transport agent for each VU unless `config.http.pool` is set. It creates a separate cookie jar for each VU in either case. The controlled experiment changed only `http.pool` to 128, preserving the same user count, distributed arrival schedule, 90-second hold, request mix, and timeout. That run completed all 10,000 users and all 100,000 HTTP requests, with no transport errors.

This demonstrates that bounded connection reuse removes the observed failure threshold on this local generator/port-forward path. It does **not** pinpoint a specific Windows TCP or kubectl implementation defect, and it is not proof of 10,000 separate simultaneous client TCP connections. The pool is per Artillery worker, not one shared user session or one global socket.

## Recorded results

| Run | Users completed / planned | HTTP 200 / responses | Transport failures | Response p95 / p99 | Result |
|---|---:|---:|---:|---:|---|
| [Unpooled reproduction](https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/tcxmc_aqrctdt3adkt43yjzy4wxj74npnqz_6mjt) | 6,545 / 10,000 | 83,759 / 83,759 | 3,455 refusals | 284.3 / 713.5 ms | Fail |
| [Pool 128, same 90-second workload](https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/taywf_n8y5t57zp5hk7ygybktg87yrp5479_6phw) | 10,000 / 10,000 | 100,000 / 100,000 | 0 | 12.1 / 16.9 ms | Pass; 20-second sampled full-overlap span |
| [Permanent five-minute stability profile](https://app.artillery.io/qyEQrfWW2AIvLeU_9WQxYbbD/load-tests/ttxmg_khbrbbn9k4qwhh9ygmxxp93wdb9gn_6yf9) | **10,000 / 10,000** | **250,000 / 250,000** | **0** | **10.9 / 18 ms** | **Pass; 230-second sampled full-overlap span** |

The controlled short experiment used the original ten-request session. The permanent scenario adds a final profile request and verifies profile ownership at both ends of each session. Its short variant therefore makes eleven requests per user; the stability variant makes twenty-five. These distinct request counts are intentional.

## Durable changes

- `tests/load/concurrent-10000.yml`: bounded per-worker HTTP pool of 128; distributed rate phases; configurable search-poll count; a final authenticated profile read; exact request and identity-check expectations.
- `tests/load/concurrent.cjs`: creates a unique 29-character reserved benchmark identity per VU, verifies that both profile responses belong to that VU, and rejects mismatches or malformed responses without logging private data.
- `scripts/benchmark.ps1`: distributes arrivals for all concurrent profiles, adds `concurrent-10000-stability`, uses Gregorian report filenames, and runs the overlap verifier before reporting successful completion.
- `scripts/verify-concurrent-report.ps1`: reconstructs chronological interval counters, reconciles them with aggregate totals, rejects failures/skips/transport errors, and enforces a genuine authenticated-overlap span. The stability profile requires at least 180 seconds; it measured 230.

The installed Artillery 2.0.30 `arrivalCount` implementation assigns that phase to one local worker. Rate phases distribute across workers. The exact 10,000 arrivals use 20 seconds at 166 users/s followed by 40 seconds at 167 users/s. The earlier [concurrent campaign](../kubernetes-concurrent-2026-09-08/report.md) explains why total arrivals alone were an inadequate concurrency measure.

Each permanent VU fetches a challenge, logs in, checks its profile, performs catalogue autocomplete every 15 seconds, reads catalogue options, and checks its own profile again. The default six polls hold the session about 90 seconds. The stability profile uses twenty polls and holds it for at least 300 seconds. The measured minimum session duration was 300,190.5 ms. The overlap count uses successful logins minus completed and failed VUs; all counts reconcile with the raw report.

## Validation and cleanup

- `bun run check`: passed after the durable changes, including lint, type checks, API/web tests, authentication safety, registration concurrency, integrity, and builds.
- Focused processor checks: accepted the correct profile; rejected another user's identity and malformed JSON.
- Overlap oracle: accepted the clean 10,000-user pooled report and rejected the historical all-200 8,000-arrival report with insufficient overlap.
- Independent read-only review: processor signatures, cookie-jar isolation, phase arithmetic, request arithmetic, failure handling, and overlap gate reviewed; no concrete correctness issue found. PowerShell and Node syntax checks passed.
- Live stability run: 20,000/20,000 identity checks matched, 250,000/250,000 expected requests succeeded, and all 10,000 users completed.
- Fixture cleanup and registration-integrity checks passed after every run, including the failing reproduction.

Final counts match the original data: 111,947 offerings, 195,797 sections, 28,940 students, and 798 registrations; zero benchmark students and zero benchmark offerings remain. All application pods remained Ready with zero restarts, and final readiness returned HTTP 200. Temporary database tunnels and resource monitoring were stopped. The existing deployment and web tunnel remain running.

## Reproduction and limits

For the existing Kubernetes test environment, open the same private MySQL 3307 and Redis 6381 tunnels, load the existing runtime environment, and run:

```powershell
. ./tmp/benchmarks/kubernetes-20260908/environment.ps1
./scripts/benchmark.ps1 -Profile concurrent-10000-stability -Target http://127.0.0.1:5174 -Record
```

The runner reads the authorized API key from `artillery.txt`. No key or runtime secret is included in this report bundle. `results/` contains the three raw Artillery reports and the long-run overlap result; scripts, scenario, summary, check log, resource samples, TCP observations, topology, and final counts are retained alongside this report.

This is a local browsing/search benchmark with think time and pooled transport. The generator and Kubernetes share one Windows PC. Port-forwarding selects one web pod, so both web replicas and a production ingress were not exercised. The exact maximum above 10,000 VUs, independent-client connection capacity, extended-hour stability, and registration-heavy capacity remain unmeasured by this campaign. It would be misleading to call the pooled result an increase in proven production backend capacity; it is a verified improvement in test transport plus evidence of stable application behavior under this defined logical-user workload.
