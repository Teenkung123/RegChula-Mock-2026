# Personal planning

- Page loading uses the shared HeroUI spinner and skeleton view. Lazy pages load within the app shell after authentication.
- Weekly personal activities live in the timetable. Students can create, edit, and delete a title, weekday, and time range. Activities are scoped to the student and term; a new term starts empty and historical rows are retained without copying them forward. Overnight entries must be split across two days; HeroUI TimeField uses 24-hour hour/minute segments. An end time of 00:00 means the end of the selected day and is stored as 24:00. Overlaps are warnings, and activity blocks are included in PNG exports.
- Course Search has compact icon-only heart toggles beside the course detail action and a persistent favorite list. Favorites belong to the student and course code. The selected catalog term determines whether each favorite is offered; an unavailable course stays in the list and can still be removed.
- Course detail sections use separate cards with section headers, occupied/capacity counts, remaining-seat status, and compact meeting rows. Cards adapt to the modal or drawer width.

## Storage and validation

Migration `0010_personal_planning` adds `student_activities` and `student_favorites` without changing existing rows. Run `bun run db:migrate` before starting an updated API. Existing startup scripts already run migrations. No schema work occurs in HTTP requests.

Local Kubernetes startup builds API/web images, assigns content-specific tags, and uses those tags for the bootstrap job, cleanup job, and app deployments. This prevents `IfNotPresent` from reusing an older node-cached `:local` image after a rebuild. Startup checks that every active API/web replica is ready on the expected release tag. Rendered manifests are kept under `tmp/k8s-releases/` without secrets.

All personal endpoints derive the student from the signed session and check the origin for mutations. Activity reads and writes include an explicit term ID. Favorites have a composite student/course primary key, so repeated saves are idempotent. The database constrains activity time ranges as well as validating them in the API.

## Verification

Run `bun run check` for the project checks and `bun run test:planning` for isolated integration and browser checks. The latter loads `.env.local`, uses ports 3015/5175, and leaves an existing app on 3000/5173 untouched. It needs local MySQL, Redis, Bun, Node, and installed Playwright Chromium.

The browser suite covers activity CRUD and persistence, overlap layout, PNG download, favorite persistence, course details, student/term isolation, and section-card layouts at 320, 375, 414, 768, and 1440 pixels. Light/dark views are checked for serious/critical accessibility violations and page overflow.
