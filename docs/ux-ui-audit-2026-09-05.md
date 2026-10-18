# RegChula UX/UI audit — 2026-09-05

## Scope and method

Reviewed the shared application shell and all eleven routes: login, dashboard, catalogue search,
registration, drop, withdrawal, schedule, exams, buildings, faculties, and appearance.
Combined source review, cross-browser journeys, axe checks, actual rendered screenshots, keyboard
interaction, error-response interception, concurrent-save tests, and populated schedule fixtures.
No live university registration or production deployment was performed.

## Requested search change

- Top-right search now provides debounced course suggestions by code, Thai name, and English name.
- Arrow keys and Enter select suggestions; free-text searches and empty/error states remain available.
- The single Advanced Search button preserves the query and opens the catalogue filters immediately.
- Removed the accordion and its obsolete styling.
- Corrected catalogue URL/draft synchronization: searching again from within /search no longer
  allows the old draft to overwrite the incoming query.

## Findings fixed

| Priority | Finding | Resolution |
| --- | --- | --- |
| High | New shortcut searches could revert to the previous catalogue query | Synchronize external URL changes before the draft debounce writes back |
| Medium | Open suggestions hid the advanced-search action from accessibility navigation | Place actions inside the active suggestion popup; keep a direct action available when closed |
| High | One failed course-color save could erase another course's optimistic/successful update | Per-course rollback; track each pending save; delay refetch until pending writes settle |
| Medium | Early/late class meetings were clipped outside the fixed 08:00–20:00 axis | Extend the axis to cover actual valid meeting times |
| Medium | Artificial minimum event widths implied overlaps where none existed | Use real time-proportional block widths |
| Medium | Timetable horizontal scroll region was unreachable by keyboard | Named focusable section with existing visible focus styling |
| Medium | Color-picker prop was unsupported and could not compile | Guarded aria-disabled open state using supported HeroUI API |
| Medium | Swatch/popover foreground tokens were applied to the wrong elements | Contrast-safe swatch mark and neutral popover ink |
| Medium | Small exam text failed contrast on red conflict cards | Strong readable foreground inside conflict rows/cards |
| Medium | Temporary /me server errors forced a return to login | Preserve URL and provide explicit Retry; only 401 redirects |
| Medium | Login network failures lacked readable feedback | Visible connection-error message |
| Medium | System-dark quick toggle did not change to light; icon reflected preference rather than effective mode | Use resolved theme and listen to system changes |
| Medium | No way to skip repeated navigation using a keyboard | Localized Skip to content link and focusable main landmark |
| Medium | Failed schedule/exam loads also displayed misleading empty states | Show empty state only after a successful empty response |
| Medium | Courses with no meeting records disappeared from schedule details | Keep registered course cards even without meetings |
| Low | Repeated export clicks started duplicate PNG work | Export pending state and synchronous re-entry guard |
| Low | Shared busy buttons replaced their action with Thai text in every language | Keep the original action label, spinner, and aria-busy state |
| Low | Long planning navigation labels clipped on small screens | Allow local label wrapping without page overflow |
| Low | Primary navigation accessible name stayed Thai in English/Chinese | Use the locale dictionary |

## Verification evidence

- Light mode: 320, 375, 414, 768, 1280, 1440, 1920, 2560, 3440px. The 1280px check targets the
  login fold; all protected routes are covered at the other eight widths.
- Dark mode: all routes at 375, 1440, and 3440px.
- Screenshot/geometry checks: page overflow, shared icon/control alignment, catalogue field heights,
  title grouping, mobile toolbar, popup dimensions.
- No serious/critical axe violations in the route sweep or populated light/dark schedule, exam, and
  color-picker fixtures at 375/1440px.
- Populated fixtures verify an early 07:00 course, overlapping lanes, red exam warnings, and missing dates.
- Actual schedule PNG download completed; generated file exceeded 1 KiB.
- New cross-browser shortcut checks exercise suggestions, keyboard selection, no-result text,
  one-action advanced filtering, and repeated navigation from the catalogue.
- The advanced action is tested while suggestions remain open, without an extra Escape/dismiss step.
- Recovery checks exercise a temporary 503 response and successful retry, system-dark switching,
  and keyboard skip-link focus.
- Project check: compatibility, clean-room, catalogue validation, lint, typecheck, unit suites and build.
- Final `bun run check`: passed, including 43 API tests and 17 web tests across eight web test files.
- Final `bun x playwright test --workers=1`: 71 passed, 37 explicitly scoped skips, zero failures
  across Chromium, mobile Chromium, Firefox, and WebKit (5.8 minutes).
- Final popup changes were rechecked in the complete light/dark route sweeps at 375 and 1440px.
- Existing non-fatal catalogue ambiguity warnings and Vite's large-chunk warning remain visible;
  this task does not claim a newly enforced bundle-budget gate.

## Remaining findings and limitations

1. **Medium — multi-course registration failure recovery.** Registration commits courses sequentially
   in RegistrationPage.tsx. A later rejection can follow earlier successful registrations while the
   overall action shows a failure toast. A dedicated batch endpoint/transaction or explicit partial
   completion reconciliation is recommended. This audit does not change the registration transaction
   contract.
2. **Medium — appearance storage restriction.** AppearanceProvider.tsx writes browser storage without
   handling quota/access failure; a browser that denies localStorage can interrupt appearance changes.
   MySQL persistence exists, so browser-cache failure should eventually degrade gracefully.
3. **Low — registration drafts are not persisted.** Withdrawal selections are restored, but unsaved
   registration rows can be lost when navigating away. Consider a student/term-scoped draft or leave warning.
4. **Low — PNG contains the time grid only.** Unscheduled courses and full course-detail cards remain
   on the page but are absent from the PNG. Label the export scope or extend the exported layout.
5. Automated axe checks are not a WCAG certification. Physical devices, assistive-technology reading
   order with NVDA/VoiceOver, and low-bandwidth real-device usability were not tested.
6. PDF layout was not changed in this task; the existing PDF regression suite was run through the
   project check. No new claims about handwriting space or printer behavior are made here.

## Artifacts

- Light screenshots: tmp/browser/audit-light/
- Dark screenshots: tmp/browser/audit-dark/
- Populated palette/exam captures: tmp/browser/audit-palette-*.png and audit-exams-*.png
- Cross-browser report: playwright-report/index.html
- Focused audit: tests/e2e/ux-audit.spec.ts
