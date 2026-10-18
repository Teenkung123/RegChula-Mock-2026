# Utility shell, theme tokens, and faculty directory

## Goal

Make the shared workspace surfaces and controls follow the requested exact light/dark values,
replace the full-screen topbar search with a compact advanced-search popup, improve responsive
navigation, and add a clean-room faculty/department lookup.

## Inputs

- User-supplied exact colors, Metronic-inspired visual references, and official public faculty
  directory URL.
- Existing HeroUI v3, Lucide, appearance contract, and public-building importer pattern.

## Owned paths

- Root theme tokens, appearance bridge, shared shell/UI styles and tests, Vite local-server config,
  public faculty importer/data/page, routes/localization, visual/E2E checks, and documentation.

## Forbidden paths

- C:\xampp\htdocs, legacy implementation material, MySQL catalog schema, Elysia route contracts,
  production deployment, and destructive Docker actions.

## Changed files

- tokens.css and apps/web/src/appearance/AppearanceProvider.tsx with tests
- apps/web/src/components/AppShell.tsx, Shell.module.css, ui.module.css, and Vite config
- apps/web/src/pages/FacultiesPage.tsx, Faculties.module.css, and generated faculties.json
- scripts/import-faculties.ts, package scripts, localization, routes, visual/E2E/data tests
- README.md, design.md, behavior ledger, and Hallmark history

## Acceptance checks

- Light canvas/card/secondary values are #fcfcfc/#ffffff/#f1f1f4; dark values are
  #0f1014/#15171c/#1a1a1a.
- Accent is used by shared solid primary Buttons and selected states without recoloring semantic
  error/warning/success colors.
- Search opens a compact Popover with a full-filter route instead of a full-screen Modal.
- Language is inside the profile dropdown and each choice is visibly identified by its flag.
- Mobile rail uses sidebar color and More groups remain collapsed until opened.
- Faculty search covers 29 public faculties and 585 public departments; each faculty expands its
  own department list.
- Vite binds a stable loopback port with explicit HMR and refuses a port collision rather than
  silently changing its URL.

## Validation

- bun run check
- Focused cross-browser Playwright coverage for theme, profile language, and mobile navigation
- bun run test:visual at 320, 375, 414, 768, 1280, and 1440px

## Assumptions and limits

- The public CU servlet can return transient HTTP 500s. The importer retries three times with two
  concurrent department requests, then fails without writing an incomplete directory.
- Public directory rows are data only. No source page implementation, frame layout, styling, or
  assets cross the clean-room boundary.
