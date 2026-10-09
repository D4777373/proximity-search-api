"""Exact BFS nearest road-network matches inside a Euclidean circle."""
from collections import deque
from math import hypot
from .graph import Network


def closest(network: Network, graph: dict[int, tuple[int, ...]],
            lat: float, lon: float, cat: str, rad: float, limit: int = 10) -> list[dict]:
    # The source need not coincide with a grid intersection; use its nearest grid node.
    source = min(network.by_id.values(), key=lambda p: (hypot(p.lat - lat, p.lon - lon), p.id))
    distances = {source.id: 0}
    queue = deque([source.id])
    matches: list[tuple[int, float, int]] = []
    best_cutoff = None
    while queue:
        node = queue.popleft()
        steps = distances[node]
        if best_cutoff is not None and steps > best_cutoff:
            break
        point = network.by_id[node]
        circle_distance = hypot(point.lat - lat, point.lon - lon)
        if point.category == cat and circle_distance <= rad + 1e-12:
            matches.append((steps, circle_distance, node))
            if len(matches) >= limit and best_cutoff is None:
                best_cutoff = steps
        if best_cutoff is None or steps < best_cutoff:
            for neighbor in graph[node]:
                if neighbor not in distances:
                    distances[neighbor] = steps + 1
                    queue.append(neighbor)
    # Equal road lengths: closer Euclidean distance first, then smaller ID.
    matches.sort()
    return [{"id": node, "grid_distance": steps, "circular_distance": round(geo, 9)}
            for steps, geo, node in matches[:limit]]
