# Course-color schedule and exam planning

## Goal and scope

Redesign the class and exam timetables from the supplied behavior references. Give each registered
course a stable color, persist student choices, reserve red for conflicts, preserve non-blocking
overlap behavior, and keep both views usable on phones and ultra-wide displays.

## Owned paths

- Shared appearance palette contract and public DTOs.
- Additive migration 0004, schedule-color table/API module, and app wiring.
- Typed web API and optimistic color state.
- Shared color picker and class/exam plan tabs.
- Schedule and exam pages/styles, focused tests, design docs, and behavior ledger.

## Behavior

- Defaults are deterministic and require no database row.
- Overrides are owned by signed student ID, current term, and active course; foreign/unregistered
  course mutations return 404. PUT/DELETE retain Origin checks.
- Schedule blocks and course cards use the same color. Conflicting blocks/rows use semantic red.
- Phones retain the weekly grid as an inner horizontal scroller and show compact course cards.
- Exam page shows midterm and final boards, TBA honestly, then the detailed horizontally scrollable
  table. Course colors match the class schedule.

## Validation

- Migration and workspace types.
- Palette invariants and existing class/exam overlap tests.
- Browser persistence from schedule to reload and exam board.
- Populated 375px grid/table nested-overflow checks and visual screenshots.
- Full project check and responsive/axe audit before completion.

## Completed evidence

- Migration 0004 applied successfully; API and web typechecks passed.
- Full project check passed: Elysia/clean-room conventions, catalog validation, lint, 43 API tests,
  15 web tests, and both production builds.
- Real persistence test passed: schedule color → reload → exam board.
- Red class/exam overlap fixture passed with separate class lanes and no global mock-style banner.
- Populated mobile tests passed at 320, 375, 414, and 768px: page width stayed contained,
  timetable and detailed exam table used nested scrolling, picker stayed below 90px, and its icon
  and swatch centers differed by at most 1px.
- Visually inspected populated desktop and mobile screenshots after final alignment changes.
