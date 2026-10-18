# Inline control alignment audit

## Goal

Keep icon, chevron, spinner, and label content on one row in every shared frontend control.

## Inputs

- User-reported icon/text and select-chevron wrapping.
- Existing HeroUI, Lucide, responsive, and accessibility contracts.

## Owned paths

- Shared web controls, shell, affected direct control styles, and visual/component regression tests.

## Forbidden paths

- C:\xampp\htdocs and any legacy implementation, markup, CSS, assets, or database schema changes.

## Changed files

- apps/web/src/components/{ui,MultiSelectField,AppShell,Shell}.*
- apps/web/src/pages/{Appearance,RegistrationPage,ManageRegistration,CourseExplorer,LoginPage}.*
- apps/web/src/styles/global.css
- scripts/visual-qa.mjs

## Acceptance checks

- Shared Button, SelectField, multiselect, combobox, shell menu/navigation, and direct color-picker
  triggers use shrink-safe, no-wrap layouts.
- Text regions can shrink or ellipsize without moving their icon or chevron onto another row.
- The intentionally vertical mobile navigation remains excluded from the inline-row rule.

## Validation

- Web lint, typecheck, and 7 component tests passed.
- Chromium E2E passed all 10 workflows.
- Visual/axe/geometry QA passed at 320, 375, 414, 768, 1280, and 1440px.
- Full project check passed, including Elysia, clean-room, API, frontend, and production build checks.

## Assumptions and limits

- Action groups may wrap whole controls at narrow widths; their internal icon-and-label rows do not.
- Mobile primary navigation intentionally stacks its icon above its label for compact touch targets.
