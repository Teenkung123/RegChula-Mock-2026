# Clean-room implementation boundary

## Allowed inputs

- User-supplied SRS and approved implementation plan
- Neutral behavior observations from a running legacy interface or HTTP response
- Legacy README descriptions
- Authorized course JSON data
- Official framework/library documentation

## Prohibited inputs

- Legacy PHP, JavaScript, CSS, SQL, HTML, compiled bundles, or source structure
- Copying or translating implementation logic
- Copying styles, page markup, assets, comments, constants, or API compatibility code

C:\xampp\htdocs is read-only. Target work occurs only in D:\RegChula.

## Data provenance

Initial catalog data came from the authorized artifact:

    C:\xampp\htdocs\data\cugetreg_2568_2_all_with_reviews.json

It is used as inert data. Target normalization, merging, validation, persistence, and API behavior
were independently designed from the observed JSON contract.

## Review gate

1. Search target for legacy source paths and prohibited package scopes.
2. Verify only JSON data crossed the source boundary.
3. Run Elysia convention, type, lint, test, and build checks.
4. Record later behavior discoveries in agents/behavior-ledger.md, never as source snippets.

