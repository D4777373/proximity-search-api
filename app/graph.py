"""Load 100x100 locations and convert coordinate-pair roads to graph edges."""
import csv
import hashlib
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

GRID_SIZE = 100


def grid_key(lat: float, lon: float) -> tuple[int, int]:
    """Map rounded six-decimal CSV coordinates to integer grid coordinates."""
    return (round(lat * (GRID_SIZE - 1)), round(lon * (GRID_SIZE - 1)))


@dataclass(frozen=True)
class Location:
    id: int
    lat: float
    lon: float
    category: str
    row: int
    col: int


class Network:
    def __init__(self, csv_path: str | Path):
        self.by_id: dict[int, Location] = {}
        self.by_grid: dict[tuple[int, int], int] = {}
        with open(csv_path, newline="", encoding="utf-8-sig") as f:
            for item in csv.DictReader(f):
                lat = float(item["Latitude"])
                lon = float(item["Longitude"])
                row, col = grid_key(lat, lon)
                loc = Location(int(item["ID"]), lat, lon, item["Category"].strip().lower(), row, col)
                if (row, col) in self.by_grid:
                    raise ValueError(f"Duplicate grid location: {(row, col)}")
                self.by_id[loc.id] = loc
                self.by_grid[(row, col)] = loc.id
        if not self.by_id:
            raise ValueError("CSV has no locations")
        self.categories = {loc.category for loc in self.by_id.values()}
        self._cached_hash: str | None = None
        self._cached_graph: dict[int, tuple[int, ...]] | None = None

    def graph_from_bytes(self, road_data: bytes) -> dict[int, tuple[int, ...]]:
        digest = hashlib.sha256(road_data).hexdigest()
        if digest == self._cached_hash and self._cached_graph is not None:
            return self._cached_graph
        adjacency: dict[int, set[int]] = defaultdict(set)
        for line_number, raw in enumerate(road_data.decode("utf-8-sig").splitlines(), 1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            values = line.split()
            if len(values) != 4:
                raise ValueError(f"Road file line {line_number}: expected four coordinate values")
            try:
                lat_a, lon_a, lat_b, lon_b = map(float, values)
            except ValueError as exc:
                raise ValueError(f"Road file line {line_number}: invalid number") from exc
            a_key = grid_key(lat_a, lon_a)
            b_key = grid_key(lat_b, lon_b)
            if a_key not in self.by_grid or b_key not in self.by_grid:
                raise ValueError(f"Road file line {line_number}: unknown endpoint")
            if abs(a_key[0] - b_key[0]) + abs(a_key[1] - b_key[1]) != 1:
                raise ValueError(f"Road file line {line_number}: road must connect neighboring grid nodes")
            a, b = self.by_grid[a_key], self.by_grid[b_key]
            adjacency[a].add(b)
            adjacency[b].add(a)
        graph = {loc_id: tuple(sorted(adjacency[loc_id])) for loc_id in self.by_id}
        self._cached_hash, self._cached_graph = digest, graph
        return graph
