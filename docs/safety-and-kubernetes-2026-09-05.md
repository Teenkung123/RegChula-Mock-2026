# Safety and local Kubernetes architecture — 2026-09-05

## Implemented failure guarantees

- Registration and batch registration already keep seat counters, registration rows, audit events,
  and idempotency responses in one transaction. Drop uses the same all-or-nothing model.
- Successful confirmation responses are now also keyed by request hash. Repeating the same signed
  confirmation with a new idempotency key returns the first result instead of performing a second
  write or reporting a misleading duplicate after a lost response.
- Withdrawal-form assembly now takes the student-term lock and reads one transaction snapshot, so a
  concurrent drop cannot produce mixed course and credit state.
- Challenge claim, student initialization, preference initialization, and opaque session creation
  commit together. An identical retry is safe across replicas; reusing the nonce for another student
  is rejected.
- Sessions have shared idle expiry, absolute expiry, throttled activity writes, and logout revocation.
  A failed or revoked lookup never falls back to the legacy student-ID cookie.
- Redis is the fail-closed shared session/rate boundary. MySQL retains one hashed audit row per student;
  login rotation atomically tombstones the previous Redis key and replaces that row, preventing
  repeated-login storage growth.

## Local deployment

`start.bat` automatically selects the Kubernetes path only when Docker Desktop's `docker-desktop`
context is healthy; otherwise it starts the development stack. `start.bat k8s`, `start.bat dev`, and
`start.bat check` provide explicit selection/diagnosis. The Kubernetes path builds pinned Bun/Nginx
images, creates separate runtime, MySQL, and Redis Secrets, and renders 23 resources.
The initial run creates a logical dump from the existing Compose volume, restores it into the private
Kubernetes MySQL PVC, marks the seed complete, and stops Compose. The original volume and dump remain
available for rollback; no automatic path deletes either database.

The web service is exposed only through `kubectl port-forward --address 127.0.0.1`. Nginx applies
request-size and auth-rate bounds, private API caching policy, CSP, frame denial, MIME sniffing
protection, Referrer-Policy, and Permissions-Policy. API/web workloads have restricted security
contexts, resource requests/limits, probes, rolling updates, disruption budgets, and optional HPA.

## Capacity limits

- Static: 3 API replicas × 12 DB connections = 36 maximum application connections; 2 web replicas.
- HPA when Metrics Server exists: up to 8 API replicas × 12 = 96 application connections and 4 web
  replicas. MySQL is capped at 160 connections to retain administrative/maintenance headroom.
- Admission is 200 in-flight requests per API replica. Auth uses fixed local buckets plus Redis-clocked
  global limits; Nginx adds an outer burst boundary.
- Mock profiles have a hard 49,920-row sharded ceiling, one durable session row per student, bounded
  challenge/session cleanup, and Redis `noeviction` behavior under a 768 MiB data ceiling.

These are budgets, not a 10,000-user production guarantee. The previous 8,000-session result used
stateless signed student-ID cookies. Shared session lookup now uses Redis and fail-closes on shared-state
loss, so the complete benchmark matrix must be rerun on the Kubernetes topology before accepting a
new maximum. The disposable three-replica Docker approximation strictly passed 25 journeys/s
(4,022/4,022 HTTP 200, p95 165.7 ms), nearly passed 50 journeys/s with one timeout, and failed at
175 journeys/s. See `docs/benchmarks/benchmark_1/post_safety/report.md`.

## Unresolved production blockers

- Trusted CUNET/identity-provider integration is not supplied; mock authentication is forbidden in
  production.
- The single MySQL and Redis StatefulSets automatically restart but have no datastore or host failover.
- TLS termination, external ingress, backups, restore drills, metrics/log aggregation, alerting, and
  production secret rotation remain environment responsibilities.
- Docker Desktop Kubernetes is not enabled/configured on the reviewed PC, so manifests were rendered
  offline and images were smoke-tested in Docker, but the cluster was not deployed.
