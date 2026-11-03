"""Apply reviewed pedestrian topology to the bundled graph. No proximity snapping.

Requires Shapely only as a build-time audit tool. The application consumes JSON.
Existing source edges/buildings are preserved; generated area/approach edges are
replaced deterministically, so this command is idempotent on its own output.
"""
from __future__ import annotations
import argparse
import collections
import copy
import heapq
import itertools
import json
import math
from pathlib import Path
from shapely.geometry import LineString, Point, Polygon, shape

ROOT = Path(__file__).resolve().parents[2]
GENERATED = "reviewed-pedestrian-topology-v2"
YES = {"yes", "designated", "permissive"}
PASSABLE = {"gate", "entrance", "lift_gate", "bollard", "cycle_barrier"}


def accessible(tags):
    if any(k.endswith(":conditional") for k in tags):
        return False
    if tags.get("foot") is not None and tags["foot"] not in YES:
        return False
    if tags.get("access") not in {None, *YES} and tags.get("foot") not in YES:
        return False
    return tags.get("locked") != "yes" and tags.get("barrier") not in {
        "wall", "fence", "retaining_wall", "hedge", "jersey_barrier", "block"
    }


def level(tags):
    """Structure tags still establish grade when OSM's optional layer is absent."""
    try:
        value = float(tags.get("layer", "0"))
    except (TypeError, ValueError):
        value = 0
    if value and math.isfinite(value):
        return value
    if tags.get("tunnel") not in {None, "", "no", "building_passage"}:
        return -1.0
    if tags.get("bridge") not in {None, "", "no"}:
        return 1.0
    return 0.0


def height(grade):
    # Schematic vertical separation, never a surveyed height or classroom floor.
    return grade * (3 if grade < 0 else 5)


def coordinates(node):
    return node["x"], node["y"]


def restore_source(data):
    nodes = {}
    for node in data["nodes"]:
        original = node.get("sourceNodeId", node["id"])
        nodes[original] = {k: v for k, v in node.items()
                           if k not in {"sourceNodeId", "elevationM", "level"}}
        nodes[original]["id"] = original
    edges = []
    for edge in data["edges"]:
        if edge.get("generatedBy") == GENERATED:
            continue
        edge = dict(edge)
        edge["a"] = edge.pop("sourceA", edge["a"])
        edge["b"] = edge.pop("sourceB", edge["b"])
        edges.append(edge)
    return nodes, edges


def blocked(line, a, b, snapshot, exempt_barriers=()):
    """Exemptions are exact reviewed gates, never a global fence bypass."""
    for obstacle in snapshot["obstacles"]:
        polygon = shape(obstacle["geometry"])
        # Existing facade mapping tolerance does not license walking through walls.
        if obstacle["kind"] == "building":
            polygon = polygon.buffer(-0.3)
        if not polygon.is_empty and line.intersects(polygon):
            return True
    for barrier in snapshot["barriers"]:
        fence = LineString(barrier["coordinates"])
        if not line.intersects(fence):
            continue
        if barrier["id"] in exempt_barriers:
            continue
        shared = {a, b}.intersection(barrier["nodes"])
        gate_points = [Point(coordinates(snapshot["nodes"][n])) for n in shared
                       if snapshot["nodes"][n]["tags"].get("barrier") in PASSABLE
                       and accessible(snapshot["nodes"][n]["tags"])]
        intersection = line.intersection(fence)
        # A gate at one end does not exempt a second wall crossing farther along.
        for point in gate_points:
            intersection = intersection.difference(point.buffer(0.05))
        if not intersection.is_empty:
            return True
    return False


def edge_from_source(a, b, way_id, tags, nodes, **extra):
    return {
        "a": a, "b": b, "lengthM": round(math.dist(coordinates(nodes[a]), coordinates(nodes[b])), 3),
        "wayId": way_id, "highway": tags["highway"], "layer": tags.get("layer", "0"),
        "bridge": tags.get("bridge", ""), "tunnel": tags.get("tunnel", ""),
        "covered": tags.get("covered", ""), "hasSteps": tags["highway"] == "steps",
        "wheelchair": tags.get("wheelchair", "unknown"), "sharedRoad": False,
        "crossing": tags.get("footway") == "crossing",
        "oneway": "yes" if tags.get("oneway:foot") in {"yes", "1", "true"}
        else tags.get("oneway:foot", "no"), **extra,
    }


def add_approaches(nodes, edges, snapshot, review):
    existing = {(e["wayId"], e["a"], e["b"]) for e in edges}
    for item in review["approaches"]:
        way = snapshot["ways"][item["wayId"]]
        a, b = item["nodes"]
        assert (a, b) in list(zip(way["nodes"], way["nodes"][1:])), "Not original OSM adjacency"
        assert accessible(way["tags"]), "Restricted approach"
        assert all(accessible(snapshot["nodes"][n]["tags"]) for n in [a, b]), "Restricted gate"
        if (item["wayId"], a, b) in existing:
            continue
        for n in [a, b]:
            nodes[n] = {"id": n, **{k: v for k, v in snapshot["nodes"][n].items() if k != "tags"}}
        line = LineString([coordinates(nodes[a]), coordinates(nodes[b])])
        assert not blocked(line, a, b, snapshot, item["barrierIds"]), "Unreviewed obstacle on approach"
        edges.append(edge_from_source(a, b, item["wayId"], way["tags"], nodes,
                                     generatedBy=GENERATED, evidenceId=item["id"],
                                     accessNoteRequired=True, confidence="corroborated_mapped_gate_approach"))


def add_areas(nodes, edges, snapshot):
    """Visibility graph entirely inside explicitly mapped pedestrian surfaces.

Only source boundary vertices and already-connected at-grade path nodes are
eligible. Concave boundaries and all obstacle geometry constrain every segment.
No proximity joins outside a polygon, road-centreline synthesis or indoor mesh.
"""
    ground_nodes = set()
    elevated_nodes = set()
    for edge in edges:
        target = ground_nodes if level(edge) == 0 and edge["highway"] != "steps" else elevated_nodes
        target.update([edge["a"], edge["b"]])
    # Ambiguous overlaid bridge/ground nodes must not acquire area shortcuts.
    ground_nodes -= elevated_nodes
    counts = {}
    for area in snapshot["areas"]:
        tags = area["tags"]
        assert accessible(tags) and tags.get("area") == "yes" and tags["highway"] == "pedestrian"
        assert level(tags) == 0 and tags.get("indoor") != "yes" and tags.get("seasonal") != "yes"
        rings = [area["nodes"], *area.get("holes", [])]
        refs = list(dict.fromkeys(n for ring in rings for n in ring))
        polygon = Polygon(
            [coordinates(snapshot["nodes"][n]) for n in rings[0]],
            [[coordinates(snapshot["nodes"][n]) for n in ring] for ring in rings[1:]],
        )
        assert polygon.is_valid and polygon.area > 0, "Invalid pedestrian surface"
        candidates = {n for n in ground_nodes if polygon.covers(Point(coordinates(nodes[n])))}
        for n in refs:
            if n in elevated_nodes or not accessible(snapshot["nodes"][n]["tags"]):
                continue
            nodes[n] = {"id": n, **{k: v for k, v in snapshot["nodes"][n].items() if k != "tags"}}
            candidates.add(n)
        # An isolated plaza does not establish an invented entrance to the network.
        if not candidates.intersection(ground_nodes):
            counts[area["id"]] = 0
            continue
        count = 0
        for a, b in itertools.combinations(sorted(candidates), 2):
            line = LineString([coordinates(nodes[a]), coordinates(nodes[b])])
            if line.length < 0.01 or not polygon.covers(line) or blocked(line, a, b, snapshot):
                continue
            edges.append(edge_from_source(a, b, area["id"], tags, nodes,
                                         generatedBy=GENERATED, pedestrianArea=True,
                                         confidence="mapped_pedestrian_surface_visibility",
                                         source=area["source"]))
            count += 1
        counts[area["id"]] = count
    return counts


def separate_grades(nodes, edges, ways):
    """Split interior crossings even when erroneous source IDs happen to coincide.

Source way endpoints and stair endpoints may represent an explicit transition.
A shared interior node of both ways is never an implicit elevator between grades.
"""
    incident = collections.defaultdict(list)
    for edge in edges:
        for end in ["a", "b"]:
            incident[edge[end]].append((edge, end))
    splits = []
    for node_id, links in incident.items():
        grades = {level(e) for e, _ in links}
        if len(grades) < 2:
            continue
        # More than two grades at one ID are ambiguous without a reviewed
        # transfer; an unrelated stair endpoint must not join all of them.
        transition = len(grades) == 2 and any(
            (e["highway"] == "steps" or level(e) != 0)
            and node_id in [ways.get(e["wayId"], {}).get("nodes", [None])[0],
                            ways.get(e["wayId"], {}).get("nodes", [None])[-1]]
            for e, _ in links if not e.get("pedestrianArea")
        )
        if transition:
            continue
        for grade in sorted(grades):
            identity = node_id if grade == 0 else f"{node_id}@{grade:g}"
            nodes[identity] = {**nodes[node_id], "id": identity, "sourceNodeId": node_id}
            for edge, end in links:
                if level(edge) == grade:
                    edge["source" + end.upper()] = node_id
                    edge[end] = identity
        splits.append({"sourceNodeId": node_id, "levels": sorted(grades)})
    return splits


def assign_elevations(nodes, edges):
    incident = collections.defaultdict(list)
    stairs = collections.defaultdict(list)
    for edge in edges:
        for end in ["a", "b"]:
            incident[edge[end]].append(edge)
        if edge["highway"] == "steps":
            stairs[edge["a"]].append((edge["b"], edge["lengthM"]))
            stairs[edge["b"]].append((edge["a"], edge["lengthM"]))
    values = {}
    unknown = []
    for n, links in incident.items():
        nonsteps = [e for e in links if e["highway"] != "steps"]
        if nonsteps:
            grades = {level(e) for e in nonsteps}
            # A shared structure endpoint is a mapped ramp to the adjoining surface.
            grade = 0 if 0 in grades else min(grades, key=lambda g: abs(g))
        else:
            grade = max((level(e) for e in links), key=abs)
            unknown.append(n)
        values[n] = height(grade)
    # Harmonic interpolation along connected mapped stair flights, anchored to
    # actual surface/structure endpoints. This does not claim surveyed gradients.
    for _ in range(500):
        difference = 0
        for n in unknown:
            links = stairs[n]
            if not links:
                continue
            value = sum(values[v] / length for v, length in links) / sum(1 / length for _, length in links)
            difference = max(difference, abs(value - values[n]))
            values[n] = value
        if difference < 0.000001:
            break
    for n, value in values.items():
        nodes[n]["elevationM"] = round(value, 3)
    return [nodes[n] for n in sorted(incident)]


def route(data, from_code, to_code):
    buildings = {b["code"]: b for b in data["buildings"]}
    a, b = [buildings[c]["accessNodeId"] for c in [from_code, to_code]]
    adj = collections.defaultdict(list)
    for e in data["edges"]:
        if e.get("oneway") != "-1":
            adj[e["a"]].append((e["b"], e))
        if e.get("oneway") not in {"yes", "1", "true"}:
            adj[e["b"]].append((e["a"], e))
    distance, previous, queue = {a: 0}, {}, [(0, a)]
    while queue:
        cost, n = heapq.heappop(queue)
        if cost != distance[n]:
            continue
        if n == b:
            break
        for v, edge in adj[n]:
            total = cost + edge["lengthM"]
            if total < distance.get(v, math.inf):
                distance[v], previous[v] = total, (n, edge)
                heapq.heappush(queue, (total, v))
    if b not in distance:
        return None
    result, n = [], b
    while n != a:
        n, edge = previous[n]
        result.append(edge)
    result.reverse()
    return {"distanceM": round(distance[b], 3), "minutes": math.ceil(distance[b] / 72),
            "wayIds": list(dict.fromkeys(e["wayId"] for e in result)),
            "usesTunnel": any(e.get("tunnel") == "yes" for e in result),
            "usesPedestrianArea": any(e.get("pedestrianArea") for e in result)}


def update(data, snapshot, review):
    data = copy.deepcopy(data)
    nodes, edges = restore_source(data)
    for edge in edges:
        tags = snapshot["ways"].get(edge["wayId"], {}).get("tags", {})
        if tags.get("opening_hours"):
            edge["openingHoursSource"] = tags["opening_hours"]
            edge["accessNoteRequired"] = True
    add_approaches(nodes, edges, snapshot, review)
    area_counts = add_areas(nodes, edges, snapshot)
    splits = separate_grades(nodes, edges, snapshot["ways"])
    data["nodes"] = assign_elevations(nodes, edges)
    data["edges"] = sorted(edges, key=lambda e: (int(e["wayId"]), e["a"], e["b"]))
    node_ids = {n["id"] for n in data["nodes"]}
    assert all(b["accessNodeId"] in node_ids for b in data["buildings"]), "Lost a building access point"
    data["metadata"].update({
        "schemaVersion": 2, "pedestrianTopologyChecked": review["checkedDate"],
        "topology": "Original mapped segments plus reviewed exact gate approaches and obstacle-checked visibility inside explicit pedestrian areas. Interior grade crossings are isolated; no proximity snapping or major-road centreline shortcuts.",
        "elevation": "Schematic metres for rendering only: ground0, tunnel-3, bridge+5 per mapped layer, with interpolated stair approaches; not surveyed heights or floors.",
        "reviewedApproaches": review["approaches"],
        "pedestrianAreas": [{"wayId": a["id"], "source": a["source"], "edgeCount": area_counts[a["id"]]} for a in snapshot["areas"]],
        "gradeSeparatedJunctions": splits,
    })
    adj = collections.defaultdict(set)
    for edge in edges:
        adj[edge["a"]].add(edge["b"])
        adj[edge["b"]].add(edge["a"])
    sizes, seen = [], set()
    for node_id in sorted(adj):
        if node_id in seen:
            continue
        stack, size = [node_id], 0
        seen.add(node_id)
        while stack:
            n = stack.pop()
            size += 1
            for v in adj[n] - seen:
                seen.add(v)
                stack.append(v)
        sizes.append(size)
    data["metadata"]["componentCount"] = len(sizes)
    data["metadata"]["largestComponentNodes"] = max(sizes)
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=ROOT / "apps/web/public/campus/navigation-data.json")
    parser.add_argument("--source", type=Path, default=ROOT / "docs/campus-navigation/pedestrian-source.json")
    parser.add_argument("--review", type=Path, default=ROOT / "docs/campus-navigation/pedestrian-review.json")
    args = parser.parse_args()
    original = json.loads(args.data.read_text(encoding="utf-8"))
    data = update(original, json.loads(args.source.read_text(encoding="utf-8")), json.loads(args.review.read_text(encoding="utf-8")))
    args.data.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"nodes": len(data["nodes"]), "edges": len(data["edges"]),
                      "MHMK-PINIT": route(data, "MHMK", "PINIT"),
                      "MHMK-TAB": route(data, "MHMK", "TAB"),
                      "MHMK-PHOTO": route(data, "MHMK", "PHOTO")}, indent=2))


if __name__ == "__main__":
    main()
