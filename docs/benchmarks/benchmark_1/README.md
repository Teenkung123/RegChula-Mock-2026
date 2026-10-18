# Benchmark 1 snapshot

This directory preserves the first complete RegChula performance campaign as a self-contained
evidence snapshot.

## Contents

- `report.md` — final interpreted benchmark report and cloud-result links.
- `results/` — all 24 retained Artillery JSON reports, including passing, unstable, failed, pre-fix,
  and post-fix runs.
- `tests/` — six benchmark definitions: comprehensive lifecycle, capacity ladder, held concurrency,
  catalogue matrix, optimized registration-day smoke, and the legacy k6 presentation test.
- `scripts/` — reproducible profile runner, fixture preparation/cleanup, integrity checks,
  concurrency check, search benchmark, and legacy batch launcher.
- `environment/` — exact dependency lock, package scripts, Docker topology, and environment example.
- `manifest.sha256` — SHA-256 for each of the 42 payload files.

The aggregate SHA-256 of the ordered manifest entries is
`533a45e1a6dd461c58564520a77b4db0fb1574fe7362732a8af0db04afb7a37b`.

## Security and safety

`artillery.txt` is intentionally excluded because it contains the Artillery Cloud API key. No API
key appears in this snapshot.

The copied fixture scripts are historical reproduction inputs. Run the live repository versions,
not these archived copies, when conducting a new campaign. Live benchmark profiles guard against
non-development databases, create only `bench-global-*` identities and checksum-owned reserved
courses, clean those rows in `finally`, and run the registration integrity check afterward.

## Scope

This snapshot records local single-machine results. It does not claim production Kubernetes,
multi-replica, distributed-database, network-edge, or external load-generator capacity.

Next planned phase: request atomicity and failure isolation, single-command container orchestration,
and a full blue-team security audit with a bounded local red-team adversarial review.
