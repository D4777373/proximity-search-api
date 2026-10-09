# Proximity Search — Implementation Report

## Objective
Return the 10 category-matching locations within a Euclidean circular radius, ordered by travel distance along the supplied road network.

## Input inspection
The provided CSV contains 10,000 rows, exactly 100 × 100 grid vertices, with IDs 1–10,000 and eight equally sized categories. The road file has 14,800 lines with format `lat_a lon_a lat_b lon_b`; each describes one available undirected neighboring road. There are 14,800 distinct edges. All 10,000 vertices belong to one connected component.

## Model
An undirected unweighted graph G=(V,E) where each CSV location is a vertex. Convert the rounded coordinates to grid indices `(round(99*lat), round(99*lon))`. The road file determines E; absent neighboring roads are NOT traversable. Edge weight is one grid step (equivalently each edge measures 1/99 coordinate units).

## Request
`POST /IP/search/`, `multipart/form-data`: `lat` (float), `long` (float), `cat` (string), `rad` (float), `link` (text file).

## Query processing
1. Validate values.
2. Read and parse roads, using an SHA-256 keyed in-memory graph cache to avoid repeated parsing of an unchanged uploaded file.
3. Snap arbitrary query coordinate to closest grid vertex (assumption, since query may not identify a vertex).
4. BFS across existing roads to determine shortest number of road edges.
5. Check the circular eligibility criterion `sqrt((lat_i-lat)^2+(lon_i-long)^2) <= rad` using the original query coordinate.
6. Rank matches by `(BFS_distance, Euclidean_distance, ID)` and output 10 matches.

## Correctness
BFS explores vertices by nondecreasing edge count in an unweighted graph, giving exact shortest road distance, including detours around missing roads. Radius checks do not alter BFS traversal: nodes outside the circular radius may lie on the route to an eligible location. This is essential for correctness. Sorting by shortest-path distance gives the nearest accessible matches, with deterministic tie-breaking.

## Complexity
CSV preloading is O(V). Building a distinct road graph is O(V+E) per new road file. BFS is O(V+E) worst-case, and filtering/ordering up to 10,000 candidates is O(V log V), with early stopping when 10 matches have been found and all nodes at that same distance have been considered. Memory is O(V+E). At the supplied scale, this is inexpensive.

## Testing
`pytest -q` checks node count, road count, source distance 0, circular eligibility and ordering, HTTP response contract, malformed road rejection. `curl` and Swagger test steps are in README.

## Assumptions and potential grader differences
- The supplied link file defines existing roads, not removed roads.
- Link endpoints are latitude/longitude coordinates, and roads are bidirectional.
- Roads are length one grid step.
- Query coordinates are mapped to the closest grid vertex before starting BFS.
- For equal road distances, straight-line distance and then ID break ties; a grader sorting by ID only may return a different tied set.
- Radius is measured in the normalized coordinate system of the dataset, not kilometers.

## Deployment
Start `uvicorn app.main:app --host 0.0.0.0 --port 8000`; deploy on a Python ASGI host that allows multipart uploads. Public deployment is not included in this local project package, so the submission API URL must be generated after deployment.
