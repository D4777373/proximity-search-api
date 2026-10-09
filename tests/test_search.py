from pathlib import Path
from fastapi.testclient import TestClient
from app.graph import Network
from app.search import closest
from app.main import app

BASE = Path(__file__).resolve().parents[1]
network = Network(BASE / "data" / "locations.csv")
road_bytes = (BASE / "data" / "link.txt").read_bytes()
graph = network.graph_from_bytes(road_bytes)


def test_network_size():
    assert len(network.by_id) == 10000
    assert sum(map(len, graph.values())) == 29600


def test_exact_source_zero_distance():
    point = network.by_id[1]
    result = closest(network, graph, point.lat, point.lon, point.category, 0.0)
    assert result[0]["id"] == 1
    assert result[0]["grid_distance"] == 0


def test_radius_membership_and_order():
    points = closest(network, graph, 0.5, 0.5, "bank", 0.15)
    assert len(points) == 10
    assert all(point["circular_distance"] <= 0.15 for point in points)
    assert [p["grid_distance"] for p in points] == sorted(p["grid_distance"] for p in points)


def test_http_contract():
    client = TestClient(app)
    response = client.post("/IP/search/", data={"lat": "0.5", "long": "0.5", "cat": "bank", "rad": "0.15"}, files={"link": ("link.txt", road_bytes, "text/plain")})
    assert response.status_code == 200, response.text
    assert len(response.json()["ids"]) == 10


def test_bad_road_format():
    client = TestClient(app)
    response = client.post("/IP/search/", data={"lat": "0.5", "long": "0.5", "cat": "bank", "rad": "0.15"}, files={"link": ("bad.txt", b"1 2\n", "text/plain")})
    assert response.status_code == 422
