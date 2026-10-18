# Neutral theme, fluid layout, and alignment

## Goal and inputs

Implement the user's Metronic reference, exact #db5f8d action accent, ultra-wide layout, reported
title/control/More alignment fixes, and missing third level of the public faculty directory.

## Owned paths

Shared tokens, appearance contract/provider/API/schema, additive migration 0003, shell and shared
controls, affected page styles, faculty importer/data/page, focused browser checks, and design docs.

## Forbidden paths

C:\xampp\htdocs implementation, unrelated business rules, destructive data changes, and deployment.

## Changes

- Neutral palette and HeroUI bridge no longer mix user accents into cards, fields, rules, or text.
- Rose uses #db5f8d; solid actions retain exact color and text accents have a contrast-safe tone.
- Fluid layout is the new default. Existing width values remain available in contained mode.
- Shared header groups keep titles left and actions right; obsolete catalogue grid columns removed.
- Field supports an integrated leading icon; SelectField and catalogue triggers have explicit sizing.
- More styles apply to Drawer.Dialog, preserving the full-screen positioning wrapper.
- The importer fetched 29 faculties, 585 departments, and 710 fields, including alphanumeric codes.
- Directory search expands matching ancestors and each level can be browsed independently.

## Acceptance and verification

- Run the project check, focused appearance/geometry/More/directory browser tests, and visual audit.
- Check 320, 375, 414, 768, 1280, 1440, 1920, 2560, and 3440px views.
- Compare neutral computed styles before/after changing accent; verify saved contained mode reloads.
- Measure matching catalogue trigger heights, contained search icons, left-aligned titles, and
  bottom-docked More geometry after the opening transition settles.

## Assumptions and limits

Saved custom accents remain the student's choice; selecting Rose applies the new Chula pink.
The CU third-level servlet calls these records fields of study, not registration course sections.
Only public directory data was imported; no template or legacy implementation was copied.
