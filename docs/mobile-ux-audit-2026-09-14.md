# Mobile UX and catalogue search audit — 14 September 2026

## Delivered behavior

- Course search has independent examination weekday and time-window filters. An announced midterm or final must satisfy every selected exam criterion within the same slot. Time boundaries are inclusive; incomplete slots do not match. Invalid weekdays, times, and reversed/equal windows return structured 422 responses.
- Advanced filters are grouped into Class schedule, Exams, and Course attributes using HeroUI accordions. Group and overall active counts remain visible. Deep links expand relevant groups; clear resets filters and expansion. Automatic filtering remains enabled.
- Dashboard replaces the registered-course list with one next/current class card: countdown, course, section, date/time, location, and an overlapping-course notice where applicable. It refreshes every minute and when the tab becomes visible, and advances as classes finish. Mobile prioritizes this card above the three summary statistics.
- Drop/withdraw rows wrap long course names, align section and labeled credits together, and place selection on the right. Container-based layout also handles narrow desktop content. Unchecked boxes no longer display a misleading tick.
- Schedule download/add/edit/delete actions align toward the right on mobile.
- Route navigation resets document scrolling after the mobile drawer releases its scroll lock. Changing search filters does not trigger the route scroll reset.
- Sidebar swipe gestures remain available. Entire slider controls own their touch gestures, including the tracks and fills.
- Mobile hides desktop content-layout/width controls and retains effective appearance choices. Language and label choices remain readable at 135% interface size.

## Verification

`bun run check` passed with Bun 1.3.14:

- Elysia, clean-room, deployment configuration, and catalogue validation checks.
- Lint and API/web TypeScript checks.
- 94 API tests, including seven SQL exam-filter fixture tests.
- 50 web tests, including five next-class clock/boundary tests.
- Authentication safety, registration concurrency, and seat/duplicate invariants.
- API and web production builds.

Browser checks passed:

```text
node node_modules/@playwright/test/cli.js test tests/e2e/dashboard-next-class.spec.ts tests/e2e/mobile-responsiveness.spec.ts tests/e2e/exam-search.spec.ts --project=mobile-375 --workers=1
node node_modules/@playwright/test/cli.js test tests/e2e/app.spec.ts --grep "catalog filters use inline" --project=mobile-375 --workers=1
node node_modules/@playwright/test/cli.js test tests/e2e/app.spec.ts --grep "catalog filters use inline" --project=chromium --workers=1
```

- Layouts checked at 320, 375, 414, 768, 960, 1024, and 1280 CSS pixels.
- Maximum-scale dark-mode overflow checks at 320, 375, and 414 pixels on dashboard, drop, withdraw, schedule, and appearance.
- Native Chromium touch events verified slider dragging and sidebar opening/closing. Selection and withdrawal reason entry used visible controls.
- Navigation from a scrolled schedule through the drawer reached the dashboard at scroll position zero.
- A controlled browser clock verified upcoming → in progress → next class transitions and missing-time/empty states.
- Live catalogue checks verified returned exam slots, invalid-filter rejection, time editing, URL persistence, and clearing.
- Existing class-filter browser coverage passed after updating its accordion navigation; native click waiting replaced an old forced click that bypassed accordion animation stability.
- Screenshots were inspected for course management, dashboard, schedule actions, grouped search, and appearance.

Browser layout fixtures do not modify student registrations. Live catalogue verification uses an isolated mock audit login and read-only catalogue requests. The required repository checks use their existing controlled authentication/concurrency fixtures.

## Changed files

- API catalogue: `apps/api/src/modules/catalog/index.ts`, `service.ts`, `cache.ts`, `cache.test.ts`, `exam-search.test.ts`.
- Web API contract: `apps/web/src/lib/api.ts`.
- Search: `apps/web/src/pages/CourseExplorerPage.tsx`, `CourseExplorer.module.css`.
- Dashboard: `apps/web/src/pages/DashboardPage.tsx`, `apps/web/src/components/NextClassCard.tsx`, `NextClassCard.module.css`, `apps/web/src/lib/next-class.ts`, `next-class.test.ts`.
- Shared page layouts: `apps/web/src/pages/pages.module.css`.
- Mobile management: `apps/web/src/pages/ManageRegistrationPage.tsx`, `ManageRegistration.module.css`.
- Navigation: `apps/web/src/components/AppShell.tsx`, `useMobileSidebar.ts`.
- Schedule actions: `apps/web/src/components/PersonalPlanning.module.css`.
- Appearance: `apps/web/src/pages/AppearancePage.tsx`, `Appearance.module.css`.
- Browser regression coverage: `tests/e2e/mobile-responsiveness.spec.ts`, `exam-search.spec.ts`, `dashboard-next-class.spec.ts`, and updated `app.spec.ts`.
- Existing visual audit compatibility: `scripts/visual-qa.mjs`.
- Behavior documentation: `agents/behavior-ledger.md` and this report.

## Limits

The next-class card projects the current term's recurring weekly meetings in Bangkok time. The catalogue does not provide a holiday/cancellation calendar or term date boundaries, so those exceptions are not inferred. Browser tests use Chromium mobile emulation; physical Android/iOS browser behavior remains unverified. No deployment was performed.

Screenshots and the full check log are under `tmp/browser/mobile-fixes-*` and `tmp/mobile-fixes-check.log`.
