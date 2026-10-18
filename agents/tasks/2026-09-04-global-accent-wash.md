# Global accent wash and selected-state clarity

## Goal

Make a student's selected accent color shape the entire RegChula workspace, not only buttons and
focus rings. Replace ambiguous selected-state dots with clear check badges.

## Inputs

- User request for a full-site color feeling similar in behavior to the legacy application, without
  copying implementation.
- User screenshot showing unexplained green dot indicators in Appearance.
- Existing near-white enterprise workspace direction.

## Owned paths

- tokens.css
- apps/web/src/appearance/AppearanceProvider.tsx and its test
- apps/web/src/pages/AppearancePage.tsx and Appearance.module.css
- tests/e2e/app.spec.ts
- design and agent behavior records

## Forbidden paths

- C:\xampp\htdocs implementation, copied legacy code/assets, backend/API contracts, and database
  schema.

## Changed behavior

- Selected accents now tint shared canvas, paper, panel, sidebar, toolbar, border, and text-neutral
  tokens at low chroma.
- The light base is brighter and closer to a modern enterprise surface hierarchy.
- Error, warning, and success colors remain semantic.
- Appearance cards render explicit check badges. The unlabelled preview dot is removed and the custom
  color swatch is square.

## Validation

- Full project check passed.
- Full Playwright browser matrix passed: 52 tests, zero failures.
- Visual/axe/control-geometry QA passed at 320, 375, 414, 768, 1280, and 1440px.
