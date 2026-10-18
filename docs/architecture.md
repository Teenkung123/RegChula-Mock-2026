# Architecture

## Containers

    React browser
      -> loopback Nginx /api proxy (2-4 replicas)
      -> Elysia 2 modular monolith (3-8 replicas)
      -> private MySQL 8.4 + Redis 7.4 StatefulSets (1 replica each)

Frontend never loads the full catalog JSON. CLI importer is the only JSON consumer; API reads
normalized MySQL rows.

## Backend modules

- auth: visible local-demo challenge, atomic shared consumption ledger, opaque signed cookie,
  Redis-backed expiry/revocation, MySQL audit/retry state, and opt-in Remember Me lifetime
- catalog: terms, filters, course details, sections, and course-wide reviews
- registration: Pipe-and-Filter preview plus transactional confirmation
- exams: current student offering-level midterm/final dates and times
- preferences: normalized student-owned appearance profile and demo announcements
- withdrawal: immutable snapshot and Thai PDF rendering
- health: process liveness and database readiness

Routes use Elysia 2 order route(path, hooks, handler), @elysia plugins, and RFC 9457 problem responses.

## Catalog identities

    courseNo -> Course
    Course + AcademicTerm -> Offering
    Offering + sectionNo -> Section
    review _id -> CourseReview

Duplicate study-program rows merge. Metadata conflicts fail import. Program-specific section quotas
merge using the maximum capacity/current enrollment, a section stays open when any program variant is
open, classes union by normalized fingerprint, and notes combine. Exam definitions live on an
offering; populated duplicates must agree. Ambiguous exam definitions are omitted with a non-fatal
warning because the authorized source has no section-specific exam contract or exam-room data.

Current term is stored in app_settings. Initial bootstrap selects newest term only when no value
exists. Later imports preserve operator choice.

## Registration pipeline

    intent
     -> current term
     -> section open
     -> duplicate course
     -> 22-credit cap
     -> meeting overlap
     -> prerequisites
     -> capacity
     -> decision

Preview is advisory. Confirmation locks student-term first and section second, reloads data, reruns
the same pipeline, and writes capacity, registration, audit, and idempotency state in one transaction.
The request hash is unique per student and operation, so a lost response can be recovered even when
the client retries the same confirmation with a fresh idempotency key.

Drop decrements local occupancy. Withdrawal preserves occupancy and creates an immutable document
snapshot. Active and withdrawn registrations prevent same-course duplicates; dropped registrations
may be reactivated.

## Failure model

- 400: invalid schema or origin
- 401: missing/invalid mock session
- 404: absent or foreign-owned resource
- 409: business-rule, confirmation, or idempotency conflict
- 500: unexpected failure
- 503: database readiness failure

All expected failures use Thai RFC 9457 Problem Details with stable code and requestId.

## Local Kubernetes boundary

`start.bat` accepts only the Docker Desktop Kubernetes context. Secrets are generated into ignored
runtime/MySQL/Redis env files and materialized as separate Kubernetes Secrets so API pods never receive the root
database password. MySQL has no NodePort or host port. NetworkPolicy allows web-to-API and
API/maintenance-to-MySQL traffic only. Images and pods run without privilege escalation; API/web root
filesystems are read-only with bounded temporary volumes.

First startup logically copies the existing Compose database into a Kubernetes PVC and leaves the
source Docker volume untouched. `stop.bat` scales workloads down without deleting storage. This is
single-machine resilience and horizontal application scaling, not host-level or MySQL high
availability.

## Appearance profile

`packages/appearance` is the dependency-free shared contract for both API and web. It validates
theme, accent preset/custom hex color, UI scale, content width, label treatment, detail presentation,
and language. The API merges and normalizes patches before persistence; the web applies the result as
semantic CSS variables and document language attributes. A versioned local cache contains its owner
and validated profile, so it cannot leak one student's visual settings to another.

## Registration draft UI

The repeater is a client-side current-term draft over existing transactional registration/drop
endpoints. It previews selected rows together and obtains a fresh batch preview before the overall
save confirmation. Capacity, duplicate, term, credit, and closed-section failures block registration.
Prerequisites, corequisites, manual conditions, and class/exam overlaps are always visible advisories,
independent of the legacy override flag. Academic checks see all successfully selected batch peers;
complex source conditions remain available for manual review. Expandable warnings show related
courses and overlapping time ranges. Uncertain saves retain their confirmation and idempotency key
for safe replay, preserving any later draft edits. Ownership, seat updates, and transactional
revalidation remain enforced.
