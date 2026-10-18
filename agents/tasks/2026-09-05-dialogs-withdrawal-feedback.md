# Course panels, withdrawal workflow, and registration warnings

## Goal

Complete the ongoing neutral-theme, ultra-wide, alignment, and directory work, then integrate the
user's additional spacious course panel, clipped-icon, saved withdrawal draft, CR48, live-feedback,
and non-blocking timetable/exam-overlap requests.

## Boundaries

- Own the affected web views/shared UI, withdrawal renderer/snapshot, registration rule/filter
  queries, focused tests, generated PDF sample, and project documentation.
- Only the explicitly attached Withdraw Form.html is authorized as a legacy document reference.
  Its layout/content is interpreted; its implementation is not transferred.
- Do not deploy, delete student data, reset Docker, or alter unrelated registration blockers.

## Implementation

- Course metadata, sections, and safe-rendered reviews share an actual wide Dialog.
- Shared button content reserves line height and no longer clips inline SVG icons.
- Browser-local withdrawal drafts validate owner/term and retain selected rows/reasons across
  navigation and reload. The two non-action mode badges are removed.
- CR48 renderer uses A4, four course slots, full overflow continuations, and signature areas.
  User's final instruction: exam dates are omitted from this form.
- Registration offers initial/debounced suggestions and standalone HeroUI ErrorMessage feedback.
  Missing fields, duplicate courses, credits, prerequisites, and approval requirements stay visible.
- SCHEDULE_CONFLICT and EXAM_CONFLICT never block registration, independent of prerequisite override.
  Draft rows, class timetable, and exam timetable show warnings. Class lanes expand to fit overlaps.
- Eden-revived Date values are normalized before comparing exam dates.

## Verification

Run project check, scoped persistence/PDF/pipeline tests, browser restoration/live-feedback/panel
and overlap fixtures, and responsive/axe audit. Independently inspect rendered PDF and screenshots.
Preserve the prior successful 320–3440px layout and hierarchy checks.

## Completed evidence

- Project check passed: Elysia conventions, clean-room validation, lint, types, unit tests, build.
- Latest unit totals: 43 API tests and 14 web tests passed; final PDF-only rerun passed 8 tests.
- Full Playwright run: 62 passed, 22 intentionally skipped across Chromium, Firefox, WebKit, mobile.
- Responsive/axe audit passed at 320, 375, 414, 768, 1280, 1440, 1920, 2560, and 3440px.
- Independently inspected the unified course panel, mobile More drawer, wide catalogue, overlap
  lanes, and final rendered CR48 fixture.
- Mobile sticky toolbar uses an opaque canvas surface and neutral separator while scrolling;
  desktop retains the transparent merged toolbar.
- Final PDF: one A4 page (595.28 by 841.89pt), four subjects, no exam wording; longer values retain
  continuation pages. Draft selections/reasons restored after navigation and reload in E2E.
- IPHSM reference URL returned an HTML challenge. Compared official copies at
  https://www.reg.chula.ac.th/form/jt48.pdf and
  https://portal.edu.chula.ac.th/pub/tefl/images/Downloads/2-4_Request_Form_for_Course_Withdrawal.pdf.
