"""Focused safety regressions for the reviewed pedestrian topology compiler."""
import importlib.util
import json
import math
import unittest
from pathlib import Path
from shapely.geometry import LineString, Polygon, mapping

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("update_graph", HERE / "update_graph.py")
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)
ROOT = HERE.parents[1]


def node(x, y):
    return {"x": x, "y": y, "tags": {}}


def sample_snapshot():
    return {"nodes": {"a": node(0, 0), "b": node(10, 0), "c": node(10, 10), "d": node(0, 10)},
            "areas": [{"id": "1", "tags": {"highway": "pedestrian", "area": "yes"},
                       "nodes": ["a", "b", "c", "d", "a"], "source": "test"}],
            "obstacles": [], "barriers": []}


class PedestrianTopologyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "apps/web/public/campus/navigation-data.json").read_text(encoding="utf-8"))
        cls.source = json.loads((ROOT / "docs/campus-navigation/pedestrian-source.json").read_text(encoding="utf-8"))
        cls.review = json.loads((ROOT / "docs/campus-navigation/pedestrian-review.json").read_text(encoding="utf-8"))

    def test_regression_uses_tunnel_without_breaking_tab(self):
        route = router.route(self.data, "MHMK", "PINIT")
        self.assertLess(route["distanceM"], 450)
        self.assertGreater(route["distanceM"], 250)
        self.assertTrue(route["usesTunnel"])
        self.assertIn("836151467", route["wayIds"])
        self.assertAlmostEqual(router.route(self.data, "MHMK", "TAB")["distanceM"], 192.227, places=3)
        self.assertAlmostEqual(router.route(self.data, "PINIT", "MHMK")["distanceM"], route["distanceM"], places=3)

    def test_all_generated_area_edges_stay_in_surfaces_and_clear_obstacles(self):
        nodes = {n["id"]: n for n in self.data["nodes"]}
        areas = {a["id"]: Polygon([router.coordinates(self.source["nodes"][n]) for n in a["nodes"]])
                 for a in self.source["areas"]}
        for edge in self.data["edges"]:
            if not edge.get("pedestrianArea"):
                continue
            line = LineString([router.coordinates(nodes[edge["a"]]), router.coordinates(nodes[edge["b"]])])
            self.assertTrue(areas[edge["wayId"]].covers(line))
            self.assertFalse(router.blocked(line, edge["a"], edge["b"], self.source))
            self.assertEqual(nodes[edge["a"]]["elevationM"], 0)
            self.assertEqual(nodes[edge["b"]]["elevationM"], 0)

    def test_exactly_four_original_gate_segments_are_restored(self):
        added = [e for e in self.data["edges"] if e.get("evidenceId")]
        self.assertEqual(len(added), 4)
        self.assertEqual({e["evidenceId"] for e in added}, {i["id"] for i in self.review["approaches"]})
        for edge in added:
            refs = self.source["ways"][edge["wayId"]]["nodes"]
            self.assertIn((edge["a"], edge["b"]), list(zip(refs, refs[1:])))
            self.assertTrue(edge["accessNoteRequired"])

    def test_compilation_is_idempotent_and_preserves_building_index(self):
        result = router.update(self.data, self.source, self.review)
        self.assertEqual(result, self.data)
        self.assertEqual(result["buildings"], self.data["buildings"])
        self.assertEqual(len({n["id"] for n in result["nodes"]}), len(result["nodes"]))

    def test_all_lengths_and_heights_are_finite(self):
        nodes = {n["id"]: n for n in self.data["nodes"]}
        for n in nodes.values():
            self.assertTrue(math.isfinite(n["elevationM"]))
        for edge in self.data["edges"]:
            self.assertGreater(edge["lengthM"], 0)
            expected = math.dist(router.coordinates(nodes[edge["a"]]), router.coordinates(nodes[edge["b"]]))
            self.assertAlmostEqual(edge["lengthM"], expected, delta=0.002)
        tunnel = [e for e in self.data["edges"] if e["wayId"] == "836151467"]
        self.assertTrue(all(nodes[e[k]]["elevationM"] == -3 for e in tunnel for k in ["a", "b"]))

    def test_area_obstacles_include_water_planting_and_buildings(self):
        for kind in ["water", "planting", "building"]:
            snapshot = sample_snapshot()
            snapshot["obstacles"] = [{"id": "block", "kind": kind,
                                       "geometry": mapping(Polygon([(4, 4), (6, 4), (6, 6), (4, 6)]))}]
            nodes = {n: {"id": n, **p} for n, p in snapshot["nodes"].items()}
            edges = [{"a": "a", "b": "b", "highway": "footway", "lengthM": 10}]
            router.add_areas(nodes, edges, snapshot)
            self.assertFalse(any({e["a"], e["b"]} == {"a", "c"} for e in edges))

    def test_concave_surface_has_no_shortcuts_outside_polygon(self):
        snapshot = sample_snapshot()
        snapshot["nodes"].update({"c": node(10, 4), "e": node(4, 4), "f": node(4, 10)})
        snapshot["areas"][0]["nodes"] = ["a", "b", "c", "e", "f", "d", "a"]
        nodes = {n: {"id": n, **p} for n, p in snapshot["nodes"].items()}
        edges = [{"a": "a", "b": "b", "highway": "footway", "lengthM": 10}]
        router.add_areas(nodes, edges, snapshot)
        self.assertFalse(any({e["a"], e["b"]} == {"c", "f"} for e in edges))

    def test_polygon_hole_is_not_walkable(self):
        snapshot = sample_snapshot()
        snapshot["nodes"].update({"h1": node(4, 4), "h2": node(6, 4),
                                  "h3": node(6, 6), "h4": node(4, 6)})
        snapshot["areas"][0]["holes"] = [["h1", "h2", "h3", "h4", "h1"]]
        nodes = {n: {"id": n, **p} for n, p in snapshot["nodes"].items()}
        edges = [{"a": "a", "b": "b", "highway": "footway", "lengthM": 10}]
        router.add_areas(nodes, edges, snapshot)
        self.assertFalse(any({e["a"], e["b"]} == {"a", "c"} for e in edges))
        self.assertFalse(any({e["a"], e["b"]} == {"h1", "h3"} for e in edges))

    def test_fence_exception_does_not_ignore_another_fence_or_building(self):
        snapshot = sample_snapshot()
        snapshot["barriers"] = [
            {"id": "reviewed", "nodes": [], "coordinates": [(3, -1), (3, 1)]},
            {"id": "other", "nodes": [], "coordinates": [(6, -1), (6, 1)]},
        ]
        line = LineString([(0, 0), (10, 0)])
        self.assertTrue(router.blocked(line, "a", "b", snapshot, ["reviewed"]))
        snapshot["barriers"].pop()
        self.assertFalse(router.blocked(line, "a", "b", snapshot, ["reviewed"]))
        snapshot["obstacles"] = [{"id": "wall", "kind": "building", "geometry": mapping(Polygon([(4, -2), (7, -2), (7, 2), (4, 2)]))}]
        self.assertTrue(router.blocked(line, "a", "b", snapshot, ["reviewed"]))

    def test_shared_interior_node_does_not_connect_grades(self):
        nodes = {n: {"id": n, "x": x, "y": y} for n, x, y in [("a", -10, 0), ("x", 0, 0), ("b", 10, 0), ("c", 0, -10), ("d", 0, 10)]}
        edges = [{"a": a, "b": b, "wayId": wid, "highway": "footway", "layer": layer}
                 for a, b, wid, layer in [("a", "x", "1", "0"), ("x", "b", "1", "0"), ("c", "x", "2", "-1"), ("x", "d", "2", "-1")]]
        ways = {"1": {"nodes": ["a", "x", "b"]}, "2": {"nodes": ["c", "x", "d"]}}
        self.assertEqual(len(router.separate_grades(nodes, edges, ways)), 1)
        self.assertEqual(edges[0]["b"], "x")
        self.assertEqual(edges[2]["b"], "x@-1")

    def test_bridge_and_tunnel_do_not_require_layer_tag(self):
        self.assertEqual(router.level({"bridge": "yes"}), 1)
        self.assertEqual(router.level({"tunnel": "yes"}), -1)
        self.assertEqual(router.level({"tunnel": "building_passage"}), 0)
        snapshot = sample_snapshot()
        nodes = {n: {"id": n, **p} for n, p in snapshot["nodes"].items()}
        edges = [{"a": "a", "b": "c", "highway": "footway", "lengthM": 14, "bridge": "yes"}]
        router.add_areas(nodes, edges, snapshot)
        self.assertEqual(len(edges), 1)

    def test_stair_transition_is_retained_and_interpolated(self):
        nodes = {n: {"id": n, "x": i, "y": 0} for i, n in enumerate(["a", "b", "c", "d", "e"])}
        edges = [
            {"a": "a", "b": "b", "wayId": "1", "highway": "footway", "lengthM": 1},
            {"a": "b", "b": "c", "wayId": "2", "highway": "steps", "lengthM": 1},
            {"a": "c", "b": "d", "wayId": "2", "highway": "steps", "lengthM": 1},
            {"a": "d", "b": "e", "wayId": "3", "highway": "footway", "tunnel": "yes", "lengthM": 1},
        ]
        ways = {"1": {"nodes": ["a", "b"]}, "2": {"nodes": ["b", "c", "d"]}, "3": {"nodes": ["d", "e"]}}
        self.assertEqual(router.separate_grades(nodes, edges, ways), [])
        result = {n["id"]: n for n in router.assign_elevations(nodes, edges)}
        self.assertEqual(result["b"]["elevationM"], 0)
        self.assertEqual(result["c"]["elevationM"], -1.5)
        self.assertEqual(result["d"]["elevationM"], -3)

    def test_restricted_and_conditional_areas_cannot_expand_graph(self):
        for tags in [{"access": "private"}, {"foot": "no"}, {"access:conditional": "yes @ (Mo)"}, {"locked": "yes"}]:
            self.assertFalse(router.accessible(tags))
        snapshot = sample_snapshot()
        snapshot["nodes"]["c"]["tags"] = {"barrier": "wall"}
        nodes = {n: {"id": n, **p} for n, p in snapshot["nodes"].items()}
        edges = [{"a": "a", "b": "b", "highway": "footway", "lengthM": 10}]
        router.add_areas(nodes, edges, snapshot)
        self.assertFalse(any(e["a"] == "c" or e["b"] == "c" for e in edges))


if __name__ == "__main__":
    unittest.main()
