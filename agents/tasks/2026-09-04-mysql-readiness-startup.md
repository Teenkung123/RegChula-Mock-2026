# MySQL readiness startup

## Goal

Prevent first-start login requests from reaching an API whose MySQL service is still starting.

## Inputs

- User log showing Drizzle wrapping ECONNREFUSED on 127.0.0.1:3307.
- Existing Docker Compose health check and start.bat workflow.

## Owned paths

- apps/api/src/db/client.ts
- apps/api/src/db/client.test.ts
- apps/api/src/index.ts
- apps/api/src/app.ts
- scripts/dev.ts
- package.json and README.md

## Forbidden paths

- Database schema, catalog data, migrations, Docker volumes, and legacy project material.

## Changed behavior

- API waits up to 120 seconds for a successful MySQL probe before binding its HTTP port.
- Transient database connection failures become a 503 DATABASE_UNAVAILABLE problem instead of an
  unhandled Drizzle stack trace.
- bun run dev starts and health-checks the scoped MySQL service before starting API and Vite.
- start.bat remains the required first-run path for secret generation, migrations, and catalog import.

## Validation

- Database helper tests cover direct and Drizzle-wrapped transient connection errors plus retry.
- API tests: 31 passed.
- Isolated API smoke test on port 3101 waited for MySQL, then returned ready.
- Full repository check passed.
