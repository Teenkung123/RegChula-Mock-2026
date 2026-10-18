# Mobile UX corrections — 2026-09-06

The supplied screenshots and requested interactions were used as the acceptance criteria. Existing
fonts, theme tokens, HeroUI overlays, registration confirmations, and API contracts were retained.

| Finding | Correction | Verification |
| --- | --- | --- |
| Browsing-term disclosure moved filters and required a second click | Direct HeroUI Select with an overlay list and visible selected marker | One click opens options; filter input bounds remain unchanged at 320/375/414/768 CSS pixels |
| Sidebar appeared through a fade and accepted only completed edge swipes | Separate motion hook moves the existing HeroUI drawer horizontally; backdrop fades independently | Intermediate positions checked before touch release, including browser-generated touch input |
| Sidebar swipe difficult to activate | Starts from non-interactive page space after 8px horizontal intent; settles after a short swipe or flick | Open/close, cancellation, vertical gesture exclusion, horizontal timetable exclusion, desktop resize dismissal |
| Existing registration rows scattered section/mode/credits | Compact course cards with labeled metadata; draft controls grouped and remove action icon-only | Populated fixture with two courses checked at all four compact widths; desktop controls still aligned |
| Button/link contents exceeded available space | Intrinsic minimum width and no flex shrink; containing headers wrap when needed | Label bounds and timetable link padding checked at all compact widths |
| Phone timetable and PNG truncated useful details | Wider hour columns; separate fixed-width export layout; section/time on separate lines and course details below grid | Actual PNG downloads at phone and tablet widths both measured 3776 × 3224 pixels for the same fixture |

## Implementation

- `apps/web/src/components/AppShell.tsx`, `Shell.module.css`, `useMobileSidebar.ts`
- `apps/web/src/components/ui.tsx`, `ui.module.css`
- `apps/web/src/pages/CourseExplorerPage.tsx`, `CourseExplorerPage.module.css`, `CourseExplorer.module.css`
- `apps/web/src/pages/RegistrationPage.tsx`, `RegistrationPage.module.css`
- `apps/web/src/pages/SchedulePage.tsx`, `Schedule.module.css`, `pages.module.css`
- `apps/web/src/lib/schedule-export.ts`
- `tests/e2e/mobile-ux.spec.ts`, updated existing term-selector tests in `tests/e2e/app.spec.ts`
- `design.md` and `.hallmark/log.json`

The export clone waits for fonts, preserves inherited theme variables, omits interactive color
controls, and is removed in a finally block. Export sizing is established before image capture;
the live timetable is not resized for the download. Meeting duration and conflict lane placement
remain proportional to the actual schedule. Long course names remain available in the appended details.

## Checks run

- `bun run check` with pinned Bun 1.3.14 passed: conventions, catalogue validation, lint,
  API/web type checks, 71 API tests, 23 web tests, auth safety, registration concurrency,
  database integrity, and API/web production builds.
- Focused Playwright cases passed for mobile gesture tracking, browser touch input, compact layout
  and export checks, catalogue search, viewport-preserving popups, drawer dismissal and widths.
- Four focused Chromium desktop cases passed: catalogue search, popup position preservation,
  aligned registration controls/footer, and live registration suggestions/feedback.
- Final frontend lint/build passed after visual refinements. Three pre-existing specificity
  warnings remain in `Appearance.module.css`; imported catalogue warnings also remain unchanged.

Screenshots and downloaded test PNGs are in `tmp/browser/ux-*.png` and
`tmp/browser/mobile-sidebar-*.png`. These are synthetic course fixtures, not actual student schedules.
Physical iOS/Android device testing has not been performed. Browser/OS-reserved edge gestures may take
priority; the Menu button and swipes away from the extreme edge remain available.

Hallmark review retained the locked design system and drove the four-width visual inspection,
explicit metadata labels, content-safe button sizing, and reduced-motion handling.

## Follow-up: compact mobile timetable

The subsequent request replaces the wide mobile timetable with a compact view below 60rem:

- Blocks show course code and name; section/time remain in the detailed cards and desktop/PNG views.
- Hours unused across the whole week use 2.5rem minimum tracks, compared with 6rem occupied tracks.
  Every hour remains visible. Partial-hour endpoints use the same weighted axis as grid lines.
- Occupied lanes use 4.25rem height; empty weekdays use 2.5rem. Conflict borders and separate lanes remain.
- Saturday/Sunday are omitted unless a registered course uses that day, including in the export.

Implemented in `SchedulePage.tsx`, `Schedule.module.css`, and `lib/compact-timetable.ts`.
Three axis unit cases cover occupancy boundaries, partial/multi-hour placement, and empty schedules.
The full `bun run check` passed. Two focused Playwright cases passed, covering all four compact widths,
short grid height, narrow empty columns, hidden in-grid metadata, partial-hour placement, conditional
weekends, desktop equal-width restoration, and actual phone/tablet PNG downloads with equal dimensions.
The earlier 3776 × 3224 export measurement describes the original seven-day fixture; hiding unused
weekends now reduces export height as well.

### Course labels and rooms

The schedule/registration response now includes the existing catalogue `short_name` as `shortName`.
Timetable blocks prefer this supplied abbreviation and fall back to the localized full course name.
On compact screens that name occupies one ellipsized line, preserving space for a dedicated room line
without increasing row height. Missing rooms show a dash. Full course names and building/room details
remain in the course cards below; the block title also includes the full name and location.
The four-width Playwright check covers abbreviation preference, missing-short-name fallback,
room visibility and containment, and actual PNG downloads.

Building names now accompany room numbers in each timetable block (for example, `SCI · 101`).
The room number does not shrink when the building name is long; the building can ellipsize and the
full location remains in the block title and detailed course card. The compact layout/PNG checks
and full project check were rerun for this follow-up.
