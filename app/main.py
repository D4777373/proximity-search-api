"""FastAPI road-network nearest-location API."""
import os
from pathlib import Path
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from .graph import Network
from .search import closest

BASE = Path(__file__).resolve().parents[1]
CSV_PATH = Path(os.environ.get("LOCATIONS_CSV", BASE / "data" / "locations.csv"))
network = Network(CSV_PATH)
app = FastAPI(title="Proximity Search API", version="1.0.0")
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(BASE / "static" / "index.html")


@app.get("/IP/categories/")
def categories():
    return {"categories": sorted(network.categories)}


@app.get("/health")
def health():
    return {"status": "ok", "locations": len(network.by_id)}


@app.post("/IP/search/")
async def search(lat: float = Form(...), long: float = Form(...),
                 cat: str = Form(...), rad: float = Form(...),
                 link: UploadFile = File(...)):
    if not (0 <= lat <= 1 and 0 <= long <= 1):
        raise HTTPException(422, "lat and long must lie in [0,1]")
    if not (0 <= rad <= 2):
        raise HTTPException(422, "rad must be between 0 and 2 (coordinate units)")
    category = cat.strip().lower()
    if category not in network.categories:
        raise HTTPException(422, f"Invalid category. Allowed: {', '.join(sorted(network.categories))}")
    content = await link.read()
    if len(content) > 10_000_000:
        raise HTTPException(413, "Link file too large")
    try:
        graph = network.graph_from_bytes(content)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(422, str(exc)) from exc
    results = closest(network, graph, lat, long, category, rad)
    return {"ids": [point["id"] for point in results], "results": results, "count": len(results)}


@app.post("/IP/map/")
async def map_data(link: UploadFile = File(...)):
    """Coordinates and supplied roads for the visualization; not used to rank results."""
    content = await link.read()
    if len(content) > 10_000_000:
        raise HTTPException(413, "Link file too large")
    try:
        graph = network.graph_from_bytes(content)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(422, str(exc)) from exc
    return {
        "size": 100,
        "nodes": [[p.id, p.row, p.col] for p in network.by_id.values()],
        "edges": [[a, b] for a, neighbors in graph.items() for b in neighbors if a < b],
        "roads": sum(map(len, graph.values())) // 2,
    }


@app.get("/IP/sample-link/", include_in_schema=False)
def sample_link():
    return FileResponse(BASE / "data" / "link.txt", media_type="text/plain", filename="link.txt")
