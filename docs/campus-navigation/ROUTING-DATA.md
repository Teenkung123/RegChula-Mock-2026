# Chula pedestrian routing data

## Integration contract

`navigation-data.json` is dependency-free static data: `{nodes,edges,buildings,metadata}`. All node/way IDs are **strings**. Nodes have `id,x,y,lon,lat`; metres x east / y north relative to EPSG:32647 (665434,1519346). glTF position is `[x, elevation, -y]`.

Edges use `a,b,lengthM,wayId,highway,layer,bridge,tunnel,covered,sharedRoad,crossing,oneway,hasSteps,wheelchair`. Each straight segment is an original consecutive OSM node pair; do not re-snap or connect geometrically intersecting lines. `oneway` is **pedestrian-specific**: `yes` permits a→b, `-1` permits b→a; otherwise bidirectional. Motorvehicle oneway is ignored. Grade tags are retained; graph joins only exact OSM node IDs, including legitimate bridge/ramp endpoints. Rendering elevation is not surveyed and must not imply an indoor floor.

Building records use `code,aliases,name,nameTh,footprintId,x,y,accessNodeId,accessLabel,accessConfidence,accessOffsetM,source,osmSource,verifiedRooms,codeConfidence,roomParsing,accessibility`. Building x/y is the footprint centroid for highlighting only. **Route to accessNodeId, never draw a centroid connector through a building.** Access nodes are actual mapped points close to a footprint, not verified doors. MHMK endpoint happens to lie on the footprint boundary; TAB endpoint is ~0.9m from its footprint. No entrance/interior/gate availability is certified.

Official code/room mappings for MHMK and TAB are verified against https://www.bbtech.sc.chula.ac.th/building/ (checked 2026-10-18). MHMK M01 is floor M, TAB220 floor2. Other MHMK/TAB rooms listed in `verifiedRooms` come from the same official table. Other codes are only exact OSM `ref` matches against the app's course-building directory, and explicitly marked lower confidence. No guessed acronyms. Thirty buildings have access points within30m (MHMK/TAB special check allows60m but both <1m); others remain unmapped.

Room parser should prioritize `verifiedRooms`. TAB permits the user's first-digit floor convention as an estimate bounded by four floors. MHMK official 19 stories vs OSM20 is a conflict; its real 201/301 convention also contradicts blindly taking two digits for every tall building. Thus unlisted MHMK and lower-confidence buildings should fall back to building arrival unless another trusted convention exists. A parsed floor is a label, not a 3D room coordinate or indoor route.

## Safety and limits

This is an outdoor **planning preview**, not surveyed navigation. Permission, opening hours, gates and closures are not live. Route may use stairs and shared low-speed roads, and is not wheelchair-verified. Show `hasSteps` / `sharedRoad` route warnings. Always show OSM attribution and copyright link.

Conservative exclusions: foot=no/private/use_sidepath; any access value except yes/permissive/designated (including permit/destination/private/customers/delivery) unless foot explicitly yes/permissive/designated; motorroad, motorways/trunks/major traffic centreline classes, busways, construction, indoor corridors, area polygons, unhandled conditional access. Low-speed service/residential/unclassified centreline ways are allowed only absent separate/no-sidewalk tags. Restricted, locked or conditionally accessible nodes are rejected. Node foot=use_sidepath is rejected. Ground segments entering building interiors are rejected (0.3m inward tolerance), except explicitly mapped tunnel=building_passage. Merely covered=yes does not exempt a wall crossing. Mapped wall/fence crossing segments are rejected unless a shared passable gate node exists. No missing link is invented; disconnected components remain disconnected.

Estimate: ceil(outdoor path metres / 1.2 / 60). Excludes indoor movement, lifts, crossing waits and small unverified endpoint gaps. Example MHMK→TAB: **192.2m / ~3 minutes outdoors**, 16 segments, one stair segment, two shared-road segments. Never promise classroom-to-classroom 3 minutes.

## Reproduce and validate

From original workspace, `python routing_data/build_graph.py`, then `python routing_data/test_graph.py`, then `python routing_data/audit_geometry.py`. Builder reads unchanged source OSM XML and expanded footprints from `chula_expanded_v2/source/`, merges duplicate IDs by highest version, and uses pyproj/shapely installed in `/tmp/chula_model_deps`. Audit visualization also uses matplotlib. No app runtime dependency is introduced.

Outputs: `navigation-data.json`, `source-way-tags.json`, `component-summary.json`, `example-route.json`, `validation-report.json`, `example-route-audit.png`. Geometry validation checks every edge against original node adjacency and building obstacles. Visually reviewed sample route stays outside footprints and follows mapped crossings/paths. Source OSM dataset is © OpenStreetMap contributors under ODbL; retain license metadata. Tests validate this snapshot, not real-world current walkability.

The original model/routing research source archives are separate from this feature overlay. The application consumes the bundled derived JSON directly. The scripts referenced above document the research build and are not required for application installation; refreshing the graph requires the original OSM inputs and another access/topology review.
