# Agent workspace

Use this directory for bounded task packets and concise handoffs. Production code belongs under
`apps/`; durable architecture belongs under `docs/`.

Create a task packet only for concrete, independent work whose delegation materially improves speed
or quality. Keep small or tightly coupled work with the coordinating agent.

Task packet fields: goal, inputs, owned paths, forbidden paths, deliverables, assumptions the agent
may make, decisions that require user input, and acceptance checks.

Handoff fields: outcome, implemented, files changed, commands run, results, assumptions, limitations,
and unresolved decisions. A handoff is evidence rather than completion; the coordinating agent must
inspect the actual workspace, review overlapping changes, and verify the relevant acceptance checks.
