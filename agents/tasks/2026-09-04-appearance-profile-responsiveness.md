# Appearance responsiveness and profile shell

## Goal

Make every appearance control respond immediately, persist safely in the background, and move term
context and appearance navigation from the sidebar into the profile dropdown.

## Inputs

- User-reported lag, intermittent unresponsive appearance controls, incomplete accent application,
  and requested light-surface hierarchy.
- Locked RegChula enterprise workspace design system and installed HeroUI v3 Slider support.

## Owned paths

- Appearance provider/page/styles, app shell/styles, token and localization records, visual/E2E
  tests, design record, and Hallmark history.

## Forbidden paths

- C:\xampp\htdocs, legacy implementation material, API contracts, database schema, and deployment
  configuration.

## Changed files

- apps/web/src/appearance/AppearanceProvider.tsx and its test
- apps/web/src/pages/AppearancePage.tsx and Appearance.module.css
- apps/web/src/components/AppShell.tsx and Shell.module.css
- apps/web/src/i18n/index.tsx and styles/global.css
- tokens.css, design.md, .hallmark/log.json
- tests/e2e/app.spec.ts and scripts/visual-qa.mjs

## Acceptance checks

- HeroUI Slider previews on change and persists on change end.
- Theme, color, language, label, and detail controls update locally without waiting for a request.
- Custom accents update the project and HeroUI semantic bridges.
- Sidebar contains only Work, Manage, and Plan; profile dropdown contains term and Appearance.
- Light UI separates darker-white canvas, pale sidebar, and white content panels.

## Validation

- Full project check passed.
- Full Playwright browser matrix passed: 52 tests, zero failures.
- Visual/axe/control geometry checks passed at 320, 375, 414, 768, 1280, and 1440px.

## Assumptions and limits

- Error, warning, and success colors remain semantic and are not recolored by the user accent.
- A hard browser reload immediately after changing a preference may still show the last server-saved
  value; normal in-app navigation uses the immediate local profile.
