# Final security, safety, and mitigation report — 2026-09-06

## Scope and evidence

This report covers the current `D:\RegChula` directory snapshot after the safety, security, Docker,
Redis, and local Kubernetes implementation. It consolidates:

- sealed Codex Security Standard scan `25709dec-6e3d-4d43-998d-625444b7f3c2`;
- snapshot digest
  `codex-security-snapshot/v1:sha256:1e331e86d3665b77a1f477519f988d496f1f504846f90e69cc4bc3a019b987df`;
- independent architecture, authentication, transaction, failure-boundary, and bypass reviews;
- unit, integration, concurrency, integrity, image, proxy, and load checks;
- Bun production dependency audit.

The sealed scan describes the vulnerable pre-remediation snapshot and remains immutable. This file is
the current remediation status. The requested localhost-only red-team worker was blocked before doing
any work by the Trusted Access for Cyber gate, so no offensive runtime assessment is claimed.

## Executive status

| ID | Severity | Finding | Final status |
| --- | --- | --- | --- |
| SEC-01 | High | Arbitrary student identity can enter the mock | Contained; production remains blocked pending real CUNET/IdP integration |
| SEC-02 | Medium | Browser-only session expiry and logout | Fixed for the supported topology |
| SEC-03 | Medium | Authentication CPU/memory/database exhaustion | Fixed with explicit finite budgets |
| SEC-04 | Medium | MySQL exposed with repository-known credentials | Fixed on active startup/deployment paths |
| SEC-05 | Low | Challenge replay across replicas or restart | Fixed |
| SEC-06 | Medium | Known fallback/example signing keys accepted | Fixed |
| SAF-01 | Integrity | Withdrawal PDF could combine concurrent states | Fixed |
| SAF-02 | Integrity | Lost response plus a new idempotency key could misreport success | Fixed |
| SUP-01 | Moderate advisory | Development `esbuild` advisory through tooling | Not in production runtime; retained as a tooling follow-up |

## SEC-01 — Arbitrary identity in local mock

### Original vulnerability

Login accepted any caller-selected student ID and any non-empty password. The public challenge
returned its answer. The resulting signed cookie became the owner used by registration, drop,
withdrawal, preferences, schedules, and exams. If exposed as a real service, this allowed complete
student impersonation.

### Mitigations implemented

- The specification-required password field is restored with a 1–128 character bound across the API,
  web form, E2E helpers, and load scenarios. The local mock never stores, logs, or verifies it, and the
  UI states that neither the password nor student ID proves identity.
- `AUTH_MODE` is closed to `disabled | local-mock` and defaults to `disabled`.
- `APP_ENV=production` always rejects `local-mock`, including the container override.
- Direct development binds the API, MySQL, and Redis only to loopback.
- Container mock mode requires an explicit non-production override. Kubernetes exposes no Ingress,
  NodePort, LoadBalancer, host port, or host network; the supported launcher opens only a
  `127.0.0.1` port-forward.
- NetworkPolicy applies default deny before workloads and limits API ingress to web pods.
- Disabled auth clears legacy/current cookies and rejects all protected routes.

### Remaining risk and required production mitigation

This is containment, not real authentication. Any actor who can reach the explicit local mock can
still choose a mock profile ID. A usable production service must integrate a trusted CUNET/OIDC/SAML
identity contract, validate issuer/audience/signature/state/nonce/PKCE as applicable, derive the
student ID from the verified assertion, and define account status, logout, revocation, and failure
policy. Until that contract exists, production authentication remains disabled and production course
registration must not be enabled.

## SEC-02 — Indefinite session replay and ineffective logout

### Original vulnerability

The signed cookie contained only a student ID. Ten-minute/seven-day lifetimes existed only as browser
attributes, and logout only removed the browser copy. A captured cookie could be replayed and renewed
indefinitely.

### Mitigations implemented

- Cookies now carry a 256-bit opaque token; MySQL stores only its SHA-256 hash and audit metadata.
- Redis is the authoritative, shared, fail-closed active-session store. Standard sessions use a
  ten-minute sliding TTL; Remember Me and every absolute deadline are capped at seven days.
- Redis key namespace `v3` invalidates all pre-migration cache entries.
- MySQL enforces one session row per student. Login locks the current row, tombstones/deletes the old
  Redis authority before replacement can commit, records the prior hash for retry recovery, and then
  atomically installs the new Redis authority.
- Logout atomically writes a seven-day tombstone and deletes the active key. MySQL audit revocation
  must also succeed before cookies are cleared; on any failure the request fails and the cookie remains
  available for retry.
- Redis loss returns structured 503 responses; there is no cookie-only or MySQL fallback that could
  bypass revocation.
- Legacy student-ID cookies are cleared and never interpreted as ownership.

### Limitations

An already-authorized in-flight request may finish while logout occurs. Operator-controlled restoration
of stale datastore backups is outside the lower-privilege attacker model and requires a coordinated
session invalidation procedure. Redis uses one persistent AOF StatefulSet rather than a replicated
session cluster.

## SEC-03 — Authentication resource exhaustion

### Original vulnerability

Every login scanned an attacker-sized process map, arbitrary IDs created permanent student/preference
rows, rate limits were absent, and repeated sessions/challenges could grow without a durable bound.

### Mitigations implemented

- The scan-based process map was removed.
- Two fixed-size local token buckets provide per-process protection.
- Two Redis-clocked fixed-key counters provide cluster-wide challenge/login limits; attacker input is
  never included in rate-limit key names and keys expire after two seconds.
- Challenge use is a unique, expiry-indexed MySQL ledger with bounded opportunistic cleanup and a
  ten-minute Kubernetes cleanup CronJob.
- Mock profiles are capped at exactly 49,920 through 256 SHA-256 shards of 195 rows each. Reservation,
  race refund, student/default-preference initialization, challenge claim, and session replacement are
  one transaction.
- One durable session row exists per student and Redis rotation removes prior active keys.
- Redis has a 768 MiB `maxmemory` limit and `noeviction`; exhaustion fails new writes instead of
  silently evicting authentication state.
- Cleanup deletes bounded batches of expired/revoked state and reconciles aggregate and shard counters.

### Limitations

A hostile caller can fill one deterministic quota shard before the global profile ceiling and deny new
IDs mapped to that shard. This is bounded denial inside the explicit local mock, not an unbounded
resource path. Production identity provisioning must replace arbitrary mock profile creation.

## SEC-04 — Exposed MySQL with known credentials

### Original vulnerability

Compose published `3307:3306` on all host interfaces while committing development root/application
passwords, allowing any network peer that could reach the port to bypass API controls.

### Mitigations implemented

- Active Compose binds MySQL to `127.0.0.1:3307` and Redis to `127.0.0.1:6380`.
- Every active start/stop/reset path pins the root Compose file and project directory, preventing a
  `COMPOSE_FILE` environment override from selecting archived evidence.
- Kubernetes MySQL and Redis are internal headless services with no host exposure.
- Default-deny NetworkPolicy is rendered before workloads; only expected web/API/maintenance/database
  paths are allowed.
- Runtime, MySQL, and Redis secrets are separate ignored files. Existing files are validated,
  cross-checked, and never partially overwritten. Current ACLs are protected and grant access only to
  the owner, SYSTEM, and local Administrators.
- First Kubernetes startup performs a logical seed into a new PVC and retains the original Compose
  volume and dump as rollback data. Marker/PVC mismatches fail closed. `stop.bat` scales workloads to
  zero without deleting storage.

The pre-hardening Compose file inside `benchmark_1` remains checksum evidence and has an adjacent
security notice. No active launcher or package command references it.

## SEC-05 — Cross-replica challenge replay

### Original vulnerability

Consumed nonces lived in one process map, so another replica or restart could accept the same token.
Challenge consumption, student creation, and session issuance were not atomic.

### Mitigations implemented

- Challenge payload/version and signing key are domain-separated as v2; old and new tokens are not
  interchangeable.
- MySQL rechecks expiry using database time before claiming the nonce.
- A nonce primary key serializes replicas. The request hash binds nonce, canonical student ID, and
  Remember Me. Conflicting reuse fails.
- Challenge claim, student/preference initialization, one-session replacement, prior-session retry
  metadata, and MySQL session audit commit together.
- Identical response-loss retries can reconstruct the same result on another replica; a revoked or
  expired session cannot be recreated.
- Redis tombstones and old/new session rotation are one Lua operation, while the old key is also
  invalidated before the MySQL replacement can commit.
- API rollout uses `Recreate` for the security-boundary migration, avoiding mixed vulnerable/current
  replicas.

## SEC-06 — Known signing-secret fallbacks

### Original vulnerability

Missing development secrets became deterministic repository-known strings, and example placeholders
passed a length-only production check. Those keys protected cookies, challenges, and confirmations.

### Mitigations implemented

- `APP_ENV` is mandatory and closed to three exact values.
- All three keys are mandatory, 43–128 base64url characters, whitespace-exact, at least 16 distinct
  characters, rejected on known/example patterns, and mutually distinct.
- Unit-test secrets are generated at runtime rather than stored as accepted constants.
- Existing `.env.local` is validated without overwrite. Kubernetes setup rejects incomplete files,
  validates DB/Redis URL-password matching, validates all signing keys, and requires them to match the
  local source set.
- Fresh values use independent 32-byte CSPRNG output. Every API replica consumes one Kubernetes
  runtime Secret revision.
- Secret-bearing files are Git-ignored, excluded from Docker build context, and ACL-restricted.

## SAF-01 — Withdrawal snapshot race

Withdrawal generation previously checked active registrations, then read meetings and credits without
joining the student-term transaction lock. A concurrent drop could create a mixed PDF. Generation now
creates/locks the student-term mutex, revalidates owned active rows, and assembles all fields inside one
transaction snapshot. The transaction is read-only from the product perspective and rolls back its
temporary mutex-row insertion.

## SAF-02 — Ambiguous response retry

Registration/drop idempotency was keyed only by the caller's key. If a commit succeeded but its HTTP
response was lost, retrying the same confirmation with a new key could return a misleading duplicate
instead of the committed result. MySQL now uniquely indexes student + scope + request hash. Replay
lookup checks both the supplied key and confirmation hash, so a fresh-key retry returns the original
response without a second seat, registration, drop, or event write.

## Other reviewed surfaces with no surviving vulnerability

- SQL/NoSQL injection: user values use Drizzle expressions or mysql2 placeholders; generated `IN` and
  `VALUES` fragments contain only schema-bounded placeholder counts.
- Stored XSS: approved imported reviews are reconstructed into a small React tag allowlist, arbitrary
  attributes are discarded, links are scheme-restricted, and raw HTML injection is not used.
- Independent object-level IDOR: owner IDs come from the resolved session and student-owned queries
  include ownership predicates. This remains dependent on replacing mock identity for production.
- Registration overbooking/duplicates/credit races: student-term and deterministic section locks,
  conditional seat updates, unique keys, commit-time rule evaluation, audit events, and idempotency
  writes remain transaction-bound.
- CSRF: mutation Origin checks plus Strict cookies survived review for the established browser
  boundary. Direct non-browser clients still require a valid session.
- Upload/path traversal/SSRF/XXE/command injection/prototype pollution/open redirect: no remotely
  reachable sink exists in the reviewed HTTP product paths.

## Supply-chain finding

`bun audit --production` reported one moderate `esbuild <=0.24.2` development-server advisory through
Vite/Drizzle tooling. The production web image runs static files under Nginx and the production API
image does not run Vite or expose an esbuild development server. It is therefore not a production
runtime finding, but development tools should be upgraded when compatible with the repository's locked
framework versions.

## Deployment and availability limitations

- Docker Desktop Kubernetes was not enabled/configured, so no cluster deployment was performed.
  Kustomize rendered 23 resources with policy-first FIFO ordering; image and service behavior were
  validated in disposable Docker containers.
- MySQL and Redis each have one StatefulSet/PVC. Kubernetes restarts them, but there is no datastore
  replica, host failover, backup automation, or restore drill.
- TLS termination, external ingress, production secret rotation, metrics/log aggregation, alerting,
  and real identity integration remain deployment responsibilities.
- The deployment path was not executed because deployment requires separate authorization.
  `start.bat check` passed and selected the development fallback because `docker-desktop` Kubernetes
  is unavailable; forced Kubernetes startup still refuses marker/PVC or secret-file inconsistencies.

## Performance after safety controls

The prior 175-journey/s result used unsafe stateless student-ID sessions and is not transferable. A
disposable three-API Docker approximation of the new topology produced:

- strict pass at 25 journeys/s for 30 seconds: 750/750 journeys, 4,022/4,022 HTTP 200, p95 165.7 ms;
- near pass at 50 journeys/s: 1,499/1,500 journeys, one timeout, p95 2,671 ms;
- failure at 175 journeys/s.

The strict verified floor is 25 registration-day journeys/s on this machine. The absolute maximum and
10,000-concurrent-session claim remain unproven until the real Kubernetes topology is enabled and the
complete matrix is rerun. Raw evidence is under `docs/benchmarks/benchmark_1/post_safety/`.

## Verification completed

- `bun run check`: passed; 70 API unit tests, 23 web tests, Elysia/clean-room checks, lint, typecheck,
  catalogue validation, auth safety, registration concurrency, integrity, and both builds.
- Auth safety: identical retry recovery, conflicting-student rejection, one active durable session,
  prior-cookie invalidation, and captured-cookie rejection after logout passed.
- Registration concurrency: exactly one final-seat registration and fresh-idempotency-key response
  recovery passed.
- Integrity: no local seat drift or duplicate registration; 1,059 inherited source over-quota sections
  were unchanged.
- API and web production images built. API readiness against private MySQL/Redis passed. Nginx config,
  reverse proxy, CSP/nosniff headers, non-root MySQL, and non-root read-only Redis (with writable
  fsGroup-equivalent data volume) passed disposable smoke checks.
- Kustomize rendered 23 resources with Namespace and default-deny policy first.
- Current database: required auth tables exist, one-session unique index exists, 256 quota shards sum
  exactly to current students, and no scoped auth/seat/benchmark synthetic students remain.

## Required next actions before production

1. Implement and independently test the trusted CUNET/IdP contract; keep production auth disabled until
   this is complete.
2. Enable Docker Desktop Kubernetes, authorize a local deployment, run `start.bat`, verify data-count
   parity and rollback, then rerun the complete benchmark matrix including 8,000/9,000/10,000 sessions.
3. Add TLS/ingress, datastore replication, backups, restore drills, observability, and incident alerts.
4. Re-run the full blue-team scan and an authorized TAC red-team assessment against the deployed local
   cluster, then fix any deployment-specific findings.
