# RegChula agent directives

## GPT-6 Astra operating profile

These repository instructions are tuned for GPT-6 Astra. Model selection remains a Codex or agent-
harness setting rather than an application dependency.

- Treat an action-oriented user request as authorization to complete safe work within its stated
  scope. Infer routine details from repository evidence and prior context; ask only when a missing
  choice would materially change the result, require new authority, or cause an irreversible or
  external action.
- Before requesting clarification or approval, finish the authorized read-only and reversible work
  needed to present a concrete, reviewable result or decision.
- When explicit user requirements, this file, a task packet, or skill guidance appear to conflict,
  follow the higher-priority instruction and preserve platform, permission, clean-room, and data-
  safety constraints. Identify the exact instruction when it forces a pause, leaves work incomplete,
  or changes the requested direction.
- Incorporate corrections and new constraints without discarding valid completed work. Persist until
  the requested outcome is complete or a concrete blocker genuinely requires user input.
- Lead status updates and final responses with the outcome. Prefer concise paragraphs and plain
  technical language; use lists only when they make parallel items or ordered steps clearer. Avoid
  repetitive summaries, excessive headings, canned transitions, and invented labels.
- Delegate only concrete, independent subtasks that can proceed safely in parallel and materially
  improve speed or quality. Keep small or tightly coupled work in the primary agent. Give every
  delegated task explicit owned paths, forbidden paths, deliverables, and acceptance checks; the
  primary agent remains responsible for reviewing the actual workspace and verifying the result.

## Clean-room boundary

- Work only inside `D:\RegChula`.
- Never modify `C:\xampp\htdocs`.
- Do not open, translate, reproduce, or adapt source PHP, JavaScript, CSS, SQL, HTML, bundles, or assets.
- Allowed legacy inputs: supplied SRS, neutral behavior descriptions, running UI/HTTP observations, and authorized JSON course data.
- Record behavior discoveries in `agents/behavior-ledger.md` without source symbols or snippets.

## Protected architecture

- Bun 1.3.14 and exact Elysia 2 beta versions are locked.
- Use Elysia 2 route order: `route(path, hooks, handler)`.
- Use `.request()`, `.beforeHandle()`, `.afterResponse()`, and `.error()`; never 1.x `on*` lifecycle APIs.
- Use `problem()` for RFC 9457 failures.
- Official plugins use `@elysia/*`; `@elysiajs/*` is prohibited.
- HTTP requests never create or migrate schemas.
- Registration rules remain a small typed Pipe-and-Filter chain.
- Class and exam time overlaps are non-blocking warnings, including when no prerequisite override
  is requested. Preserve the hard capacity, duplicate, term, and 21-credit rules.
- Schedule colors are student-, term-, and course-owned records. Use the shared palette contract;
  deterministic defaults need no row, and semantic red remains reserved for conflicts.
- Student ownership always comes from the signed session cookie.
- Frontend controls and overlays use HeroUI v3.2.4 with Tailwind CSS v4.3.3.
- Frontend icons use named imports from Lucide React 1.39.0 only; alternate icon libraries are not
  application dependencies.
- Keep the canonical token bridge in tokens.css and import Tailwind before HeroUI styles.
- `packages/appearance` owns the validated appearance contract. Do not duplicate presets, defaults,
  range rules, custom-color normalization, or contrast logic in API or web code.
- Appearance settings are student-owned: theme, accent, scale, content width, label style, detail
  presentation, and language must remain normalized and cache-isolated by student ID.
- Use actual HeroUI Modal, Drawer, and AlertDialog overlays. Do not add hidden dummy triggers;
  preserve focus restoration and popup no-jump behavior.
- Metronic is a high-level enterprise-layout reference only. Do not add Bootstrap, Sass, Keenicons,
  proprietary assets, or copied layout implementation.
- Mock sessions are signed cookies: Remember Me is opt-in; standard sessions slide for ten minutes
  of activity. Do not store passwords or turn prerequisite/manual-approval warnings into silent
  success outside the explicit mock draft flow.
- Course reviews may contain HTML. Render only through the allowlisted React-node renderer; never
  add raw `dangerouslySetInnerHTML` or a permissive sanitizer.
- Keep course search catalogue-only. Registration belongs in the current-term repeater and uses
  available-section choices, overall-save confirmation, and existing drop APIs.

## Code quality

- Prefer feature functions and focused queries over controller/service/repository boilerplate.
- Do not add runtime dependencies without approval and a concrete need.
- Preserve explicit migrations and idempotent imports.
- Keep all expected business rejections structured; never swallow exceptions.
- Avoid blocking I/O inside request handlers and registration transactions.
- Use semantic design tokens; no inline colors or font families in component styles.

## Validation

- For code, configuration, schema, data, or dependency changes, run `bun run check` before completion
  when dependencies and MySQL are available.
- For instruction- or documentation-only changes, use focused structural and content checks. Do not
  run the application test or build suite unless the change affects an executable behavior surface.
- Add focused tests for changed registration rules and data-integrity invariants. Do not add tests
  that only mirror reversible, low-impact implementation details.
- After the relevant checks pass, broaden or repeat testing only when the change, a failure, or an
  unresolved risk justifies it.
- Do not claim runtime, PDF, visual, or load behavior without running the matching check.
- Report files changed, commands run, results, assumptions, and remaining limitations.

## Safety

- No deployment or release without separate authorization.
- Never run `reset-data.bat` or delete a database volume without explicit user authorization.
- Preserve unrelated user changes.
