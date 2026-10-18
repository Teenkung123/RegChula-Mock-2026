# Post-safety registration-day benchmark — 2026-09-06

## Purpose

This focused rerun measures the authentication/session architecture after adding shared replay state,
server-side expiry/revocation, global rate limits, and bounded mock identity/session allocation. It is
not a replacement for the complete `benchmark_1` matrix.

Docker Desktop Kubernetes was not enabled on this PC. The test therefore used a disposable equivalent
data path: one Nginx gateway, three pinned API containers, one loopback-only Compose MySQL 8.4
container, and one loopback-only Redis 7.4 container. Each API replica used 12 database connections,
a queue of 120, and admission limit 200. The gateway explicitly listed all three API containers.

## Results

| Arrival rate | Journeys | HTTP results | p95 | Strict result |
| --- | ---: | --- | ---: | --- |
| 25 journeys/s for 30 s | 750/750 completed | 4,022/4,022 HTTP 200 | 165.7 ms | Pass |
| 50 journeys/s for 30 s | 1,499/1,500 completed | 8,019 successful responses; 1 timeout | 2,671 ms | Fail by one incomplete journey |
| 175 journeys/s for 30 s | 672/5,250 completed | 5,559 HTTP 200; 171 HTTP 429; 4,407 connection/timeouts | 6,064.7 ms | Fail |

The strict post-safety floor is therefore 25 complete registration-day journeys per second on this
single machine. A 50-journey run was close but does not satisfy the zero-error contract. No absolute
maximum is claimed between those points because the intermediate rates were not repeated to a stable
boundary, and the real Kubernetes service/network path was unavailable.

The older 175-journey result cannot be reused: it authenticated with a stateless signed student ID and
did not provide server-side logout, shared challenge replay prevention, or bounded identity/session
state. The safety controls materially change the workload.

## Integrity and cleanup

Every run used the reserved `bench-global-*` fixture boundary and executed cleanup in `finally`.
Post-run integrity checks reported no local seat drift or duplicate registration. The inherited 1,059
source sections whose imported baseline exceeds quota were unchanged.

## Artifacts

- `results/registration-day-25.json` — strict pass.
- `results/registration-day-50.json` — one-timeout near pass.
- `results/registration-day-175.json` — explicit three-replica failure.
- `tests/capacity.yml` — live scenario at capture time.
- `tests/docker-gateway.conf` — explicit three-upstream Docker approximation.
- `scripts/benchmark.ps1` — runner with 25–200 journey profiles.

No Artillery API key or secret-bearing environment file is included.
