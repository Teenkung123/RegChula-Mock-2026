# Chulalongkorn University and nearby Bangkok: detailed v3

An editable, georeferenced architectural study model. This is a schematic model, not a measured survey or an as-built BIM model.

## Open
- `assets/chula_detailed_v3.blend`: full editable scene.
- `assets/chula_detailed_v3.glb`: full scene with separate objects.
- `assets/chula_detailed_v3_web.glb`: context batched for lower draw-call cost. Original campus buildings and new campus details stay separate. Batched neighboring context is not individually pickable.
- `previews`: actual Blender renders, including matched historic before/after views.
- `assets/building_metadata.csv` and JSON: building evidence, preserved earlier observations and v3 decisions.
- `assets/detail_confidence_register.csv` and JSON: each geometric/detail change and its confidence.

## Scope and coordinates
Area: longitude 100.518–100.541, latitude 13.728–13.749. Includes Siam, Sam Yan, CU Centenary Park and adjacent precincts. Local origin is EPSG:32647 E665434 N1519346. One unit is one metre; Blender X east, Y north, Z up. GLB uses standard glTF Y up. Footprints represent mapped buildings, not legal land parcels.

All original campus feature IDs remain. Original roads and neighboring context geometry are unchanged from expanded v2. Campus parts and main buildings remain distinct; new detail objects carry `parent_osm_id` as metadata, not transform parenting.

## What v3 adds
19 mapped building/part records receive roof treatment, representing approximately 14 building complexes when Sala's six parts are grouped. 128 records receive floor articulation: 10 have corroborating official and OSM counts, while 118 rely on explicit OSM level assertions that have not been independently verified. Nine conflicting floor-count records are withheld from floor articulation. No floor count is inferred from a raster height.

Floor bands are evenly spaced schematic indications, not measured slab elevations. They are only used when explicit counts and the existing envelope give a plausible interval. Raised parts use total levels minus minimum level, so a one-level elevated segment does not get its total building-wide count repeated. Canopies and zero-level plinths are not treated as occupied storeys.

Historic roofs are reference-informed schematic profiles. The Auditorium's high hall and lower annex hierarchy is represented, but its roof pitch, stages and exact dimensions are not verified. The Maha Chulalongkorn/Maha Vajiravudh pair has simplified roof and wing massing; ornamental and precise facade details are omitted. Chakrabongse's open entrance, balcony and two-tier roof are schematic interpretations of an official photograph.

Sala Phra Kiao retains mapped part footprints. A dominant central roof and conservative lower lateral roofs replace unsupported tall intersecting secondary gable fins. The central eave is estimated at 6.5 m, with a 15 m ridge; five lateral envelopes are visual estimates of 6.5 m eave and 8.5 m ridge. Original 12 m heights and 45-degree roof assertions are preserved, but are not applied literally to a compound roof. Side/rear roof intersections remain unverified.

## Explicit height changes and uncertainty
- Greenhouse way/200671027: previous 24.7 m raster-based estimate is preserved as evidence; v3 uses a schematic 4 m eave and 2 m roof rise consistent with its explicit one-level greenhouse and gabled/glass roof tags. Nearby tall-building contamination is plausible, not proven.
- Chakrabongse way/174143693: previous 8.3 m raster estimate is retained; a schematic 11.5 m envelope is used for the photographed two-storey hall and roof. No measured metric height is claimed.
- Five Sala secondary roof parts use the conservative envelope above instead of literal mapped 12 m heights.

The official 2025 SHECU floor observations repeat several earlier conflicts (including Mahamakut, library, Chamchuri 9 and Engineering 3). Both official and OSM observations remain; differences can reflect scope, wings or counting conventions. These records are not silently resolved.

## Roads and context limitations
Mapped OSM road centerlines/carriageways are used. Of 3,528 road/path ways, only 15 have explicit width tags; 361 widths use lane counts, 28 use connected same-name neighbors, and 3,124 use documented class defaults. Bridges and approaches use schematic elevations, not surveyed grades. See road metadata and the accompanying accuracy audit. Nearby buildings retain v2 height provenance, including explicit placeholders; this update does not verify them.

## Sources and reuse
Geometry is derived from OpenStreetMap contributors, downloaded 18 October 2026; ODbL attribution and terms apply: https://www.openstreetmap.org/copyright . Google Open Buildings 2.5D Temporal 2023 raster heights are research estimates, under CC BY 4.0: https://sites.research.google/gr/open-buildings/temporal/ . Neither source establishes accurate architectural roof dimensions.

Official university and published architectural sources are linked per record. They are used as factual references; photographs, copyrighted textures and third-party 3D meshes are not incorporated. See `sources_and_confidence.md` and the modelling reference register.

## Rebuild
Python 3 with numpy, shapely 2.2 and pyproj; Blender 4.3.2. Run `python source/detail_campus.py`, then `blender -b --python source/build_blender.py`, then `blender -b --python source/render_details.py`. The script's optional `/tmp/chula_model_deps` path may be replaced with an ordinary installed Python environment. Input v2 scene and observations are included. Set `CHULA_SKIP_RENDERS=1` to export without the builder's overview renders; the detail renderer produces the final views.
