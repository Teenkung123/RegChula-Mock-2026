# Navigation revision 3: perspective depth in the overhead map

Base: published feature/campus-navigation commit ce37e46ef4075a226b1ee871b3f23bee93d0fdfa. The branch was checked before editing and had no intervening changes.

## Behavior

The camera remains exactly 90 degrees overhead and north-up, with pan and zoom only. Perspective projection replaces the previous orthographic projection, so elevated roofs and building sides away from the image center give a visible depth cue. A building exactly under the camera remains a top view; the camera does not tilt or orbit.

The nominal vertical field of view is 46 degrees. Zoom first changes altitude. At the minimum altitude of the highest roof plus 80 metres, further zoom narrows the lens rather than entering buildings. This preserves the previous minimum 90-metre ground span. At the supplied model's closest view, altitude is 315.149994 m, vertical field of view approximately 15.952869 degrees, near plane 60 m and far plane 341.149994 m. At a 600-metre span, altitude is approximately 700.755710 m and field of view is 46 degrees.

The visible span is defined at the lowest scene datum (-6 m). Every higher horizontal ground surface has a smaller footprint. Existing viewport clamps therefore continue to keep the entire visible ground inside the model's ground rectangle with a 24-metre inset. All dragging, touch pinching, wheel/buttons, keyboard, reset and resize continue through the same clamp. The existing maximum viewport aspect ratio of 2:1 is unchanged.

## Depth precision

Near and far planes follow the camera and actual model elevations: near is the distance to the highest roof minus 20 m; far is the distance to the lowest datum plus 20 m. The camera is always at least 80 m above the tallest roof. This avoids restoring the original wasteful near=0.5/far=40,000 range.

The existing path-material-only two-unit depth bias is retained for the previously verified coplanar road/path overlap. The model, routing graph, geographic positions, route logic and student-facing portal interface are unchanged. No dependency was added.

## Validation

Independent projection checks pass for 1,100 randomized views across aspect ratios 0.01–100: ray/ground intersections remain inside the inset bounds, the camera remains exactly nadir/north-up, roof clearance is at least 80 m, and the full model elevation range stays inside the clipping planes. The actual 10-mm ground road/path separation retains at least 123 nominal 24-bit depth-buffer steps in the tested cases.

All 4,500 route/aspect combinations (900 mapped-building pairs at five aspect ratios from 0.4 to 2) fit the raised route at elevation 1.8 m and endpoint labels at 12 m. Camera and renderer lifecycle tests cover perspective projection, bounds, resizing, close zoom, precision, visual depth geometry, cleanup, abort, retry and context loss.

Actual browser rendering remains unverified: a fresh Playwright attempt failed before page load because Chromium cannot create its process-singleton socket in this cloud shell (Operation not permitted). No screenshot or observed GPU flicker result is claimed. The projection/depth conclusions are mathematical and automated-test results; visual acceptance is in the user's normal browser.

Final checks: `bun run test` passes 197 tests (94 API + 103 web); `bun run typecheck`, `bun run build` and `bun run lint` pass. Independent review reran 52 focused tests successfully and focused lint is clean. The aggregate `bun run check` still stops at the unchanged baseline deployment-security assertion for a literal `.env.local` ignore entry; later database/catalog checks remain unrun. The existing lazy-viewer bundle-size warning remains.
