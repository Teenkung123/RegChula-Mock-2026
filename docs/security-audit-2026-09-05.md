# Security audit — 2026-09-05

Codex Security Standard scan `25709dec-6e3d-4d43-998d-625444b7f3c2` reviewed the current directory
snapshot `codex-security-snapshot/v1:sha256:1e331e86d3665b77a1f477519f988d496f1f504846f90e69cc4bc3a019b987df`.
The sealed scan contains six findings. Static validation used independent baseline, architecture,
authentication/replica, and transaction reviewers.

| Severity | Finding | Remediation in this phase |
| --- | --- | --- |
| High | Arbitrary student impersonation in mock login | Contained: mock mode is explicit, the specification-required password is bounded but never stored/logged/treated as proof, loopback is default, non-loopback containers require an explicit local override, and production refuses mock mode. Real IdP integration remains blocked on an external contract. |
| Medium | Browser-only session expiry and logout | Fixed for the supported topology with opaque Redis-backed sessions, server idle/absolute expiry, shared tombstones, fail-closed Redis outages, and one hashed MySQL audit row per student. |
| Medium | Auth map scans and persistent allocation | Fixed: process-local map removed; Redis-clocked global limits and fixed local buckets bound traffic; challenge use is indexed/shared/atomic; mock profiles are capped at 49,920 through 256 shards; session rotation and scheduled cleanup bound retained state. |
| Medium | Host-published MySQL with known credentials | Active Compose port is loopback-only. Kubernetes MySQL is cluster-internal with generated ignored secrets. The old credential is retained only for compatibility with the preserved local volume and must be rotated before non-disposable external use. |
| Medium | Known signing-key fallbacks/placeholders | Fixed: missing, low-diversity, malformed, repeated, placeholder, and equal keys fail closed; setup validates existing files and all replicas consume one generated secret set. |
| Low | Challenge replay across replicas/restarts | Fixed with the shared unique-nonce ledger and idempotent same-request recovery. |

No independent SQL injection, stored XSS, direct object-level IDOR, registration overbooking, duplicate
course race, or partial registration/drop commit survived review. Ownership still depends on trusted
authentication, so this statement does not reduce the unresolved production IdP blocker.

The requested localhost-only red-team subagent was blocked before inspection by the Trusted Access
for Cyber gate. No offensive runtime probe was performed. A dependency audit reported one moderate
`esbuild` development-server advisory through Vite/Drizzle tooling; production serves static files
through Nginx and does not include or run that development server, so it is recorded as non-runtime
tooling exposure rather than a production finding.
