# Security notice for archived benchmark inputs

The files under this benchmark snapshot preserve the exact pre-hardening environment used to produce
the recorded results. In particular, `environment/compose.yml` contains development credentials and
an all-interface MySQL port mapping.

Do not run archived environment or script copies. Use the live repository `start.bat`,
`start-dev.bat`, `compose.yml`, and `scripts/benchmark.ps1`, which pin the active Compose file and keep
database ports on loopback or inside Kubernetes. This notice is outside the original checksum manifest
so the captured evidence remains unchanged.
