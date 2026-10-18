# Registration repeater and alignment pass

## Changed areas

- Signed mock session lifetime and Remember Me handling.
- Catalogue multi-filters, numeric section order, safe review HTML rendering, and seat indicators.
- Dedicated registration repeater, compact management tables, withdrawal request preview, and
  time-horizontal/day-vertical schedule grid.
- Shared toast feedback, footer flow, alignment rules, visual/browser regressions, and docs.

## Assumptions

- `to` and `or` expose a fallback section in this mock; fallback is tried only when primary section
  cannot be registered.
- Imported data has faculty codes plus owner-unit/department text, not a verified faculty-name
  master table. Filter labels therefore show code plus imported unit text.
- Withdrawal form is a clean-room demo request preview; existing server-side PDF remains the source
  of its immutable document snapshot.

## Validation

- API and web typechecks, lint, API/web unit tests, targeted Chromium/mobile/Firefox E2E, and
  six-width visual/axe QA.

## Limits

- Overall repeater save uses ordered existing transactional actions rather than a new multi-action
  database transaction. Each action retains capacity, idempotency, and ownership protections.
