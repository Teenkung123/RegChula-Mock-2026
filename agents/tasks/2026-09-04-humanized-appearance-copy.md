# Humanized appearance-language copy

## Goal

Replace literal or mechanical appearance-workspace copy with natural Thai, English, and Chinese UI
language without changing settings, routes, data, or accessibility semantics.

## Inputs

- User request to humanize displayed language and translations.
- Existing centralized messages and appearance-page helper copy.

## Owned paths

- apps/web/src/i18n/index.tsx
- apps/web/src/pages/AppearancePage.tsx
- tests/e2e/app.spec.ts

## Forbidden paths

- Course data, user-provided login policy text, backend/API contracts, database schema, and legacy
  source material.

## Changed copy

- Replaced literal labels such as Appearance and reading with Display and readability.
- Clarified display language, theme/accent, label style, course-detail view, color picker, status,
  reset, and small-screen helper wording in all three UI languages.
- Reworded appearance-page preview and helper text to match the same tone.

## Meaning check

- No fact, setting name, permission, route, number, or behavior changed.
- No unsupported claim, sales language, chatbot closing, em dash, or invented detail was added.

## Validation

- Full project check passed.
- Full Playwright matrix passed: 52 tests, zero failures.
- Visual/axe/control-geometry QA passed at 320, 375, 414, 768, 1280, and 1440px.
