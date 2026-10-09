# Proximity Search API

## Run locally

```bash
cd proximity_search_api
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000/docs, choose **POST /IP/search/**, and upload `data/link.txt` under `link`.

Example request:

```bash
curl -X POST 'http://127.0.0.1:8000/IP/search/' \
  -F 'lat=0.5' -F 'long=0.5' -F 'cat=bank' -F 'rad=0.15' \
  -F 'link=@data/link.txt'
```

Run tests: `pytest -q`.

## Algorithm

- Each CSV record is a graph vertex. Input road lines contain **four coordinate fields** (`lat_a lon_a lat_b lon_b`), not two IDs. Convert each endpoint to its grid node; add undirected edges.
- For arbitrary query latitude/longitude, choose the closest grid vertex as source, breaking ties by smaller ID.
- Use BFS for shortest **number of road edges** from the source (all edges have identical grid lengths).
- Candidate qualification is by **Euclidean circular radius from original query point**, not graph distance.
- Rank eligible nodes by `(shortest_road_edges, straight_line_distance, ID)` and return 10 IDs. The secondary tie-break convention should be verified with the grader if exact tie ordering is important.
- Graph is cached by SHA-256 of uploaded file across requests within the process. For deployment with a fixed road map, avoid uploading every time by loading it once at startup; the specified endpoint still accepts `link`.

## Caveats

- The assignment's definition of distance does not clarify how a non-grid query location enters the road graph. Nearest grid-node snapping is a documented assumption; if the grading system uses a different rule, adapt it.
- Coordinates are treated as a normalized planar grid, not degrees of geographic Earth latitude/longitude. Here the CSV is in [0,1], step ~0.010101.
- No guarantee of exactly 10 matches when the radius/category/road network produces fewer reachable candidates; hidden tests promise at least 10 valid matches.
- `POST` multipart is used because `link` is a .txt upload. The path and multipart field names match the requirements.
