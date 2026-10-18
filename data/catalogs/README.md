# Catalog files

Place authorized raw CUGetReg JSON exports here. Each file must contain a top-level datasets array
with academicYear, semester, studyProgram, and courses.

The importer:

- identifies stable courses by courseNo;
- stores term-specific offering and section snapshots;
- merges study-program section quotas using maximum capacity/current values;
- deduplicates approved reviews by _id;
- records file SHA-256;
- skips unchanged files;
- marks removed offerings/sections inactive instead of deleting history.

Run bun run catalog:validate before import.
