# Software Requirements Specification

## Goal

Provide a responsive web application for Chula students to search, register, drop, withdraw, inspect
current registrations, and view a weekly timetable. This is a local demonstration, not an official
university system.

## Functional requirements

- Accept any non-empty student ID and password plus a visible four-digit CAPTCHA-style demo challenge.
- Isolate all student registration/preferences data by signed-session student ID.
- Search by Thai/English name, code, faculty, department, day, time range, credits, and term.
- Show section schedule, room, capacity, local occupancy, and remaining seats.
- Preview and confirm registration.
- Block historical term, closed/full section, duplicate course, and totals above 21 credits.
- Warn without blocking for prerequisites, corequisites, manual/faculty conditions, and overlapping
  class or exam times. Students inspect related courses and conflicts before confirming; they remain
  responsible for their academic choices.
- Drop active current-term course after confirmation and release local occupancy.
- Withdraw active current-term course after confirmation without releasing occupancy.
- Generate authorized Thai withdrawal PDF.
- Show current registrations and weekly desktop/mobile timetable.
- Show offering-level midterm/final exam dates and times for current active registrations, while
  marking unavailable or ambiguous source schedules as unannounced.
- Export timetable PNG.
- Show course-wide approved reviews with source-term labels.
- Show demo announcements and expose a discoverable HeroUI-based appearance workspace that persists
  system/light/dark theme, eleven presets or a validated custom accent, UI scale, desktop content
  width, soft/solid labels, course-detail modal/drawer preference, and Thai/English/Chinese UI
  language.
- Use a grouped enterprise navigation workspace: Work (dashboard, search, registration), Manage
  (drop, withdrawal), Plan (schedule, exams), and Personal (appearance). Small screens keep the
  primary destinations visible and provide the remaining routes in a drawer.
- Browse older terms without registration actions.
- Use a current-term registration repeater with course autocomplete, available/disabled section
  choices, automatic credit total, overall save confirmation, and draft removal of active courses.
- Support searchable multi-select faculty/unit and department filters, weekday/time ranges, numeric
  credit range, and visible course requirements in catalogue search.
- Default to ten-minute idle sign-out; offer Remember Me only as an explicit login choice.

## Non-functional acceptance

- Main user actions target p95 under three seconds in the 500-user presentation scenario.
- MySQL constraints, lock ordering, and idempotency must prevent duplicate active courses and new
  oversell.
- Student-owned resources must return 404 to other students.
- Latest modern Chrome, Edge, Firefox, and Safari are supported.
- Responsive QA widths: 320, 375, 414, 768, 1280, and 1440 CSS pixels.
- WCAG 2.2 AA is the target for keyboard, focus, contrast, motion, labels, and status messaging.
- Appearance profile caching is versioned and owner-scoped; it is applied before protected rendering
  and reconciled with the signed-in student's MySQL profile.
- Desktop schedule renders time across the horizontal axis and days down the vertical axis; mobile
  retains an accessible agenda representation.
- One start.bat must bootstrap the local stack without resetting persistent data.
