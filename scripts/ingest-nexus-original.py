#!/usr/bin/env python3
"""ureten: codex — exact private Zoomify z5 archive; no invented map pixels.

576 source tiles are retained individually. A lossless, unlocated 6000x6002
PNG is assembled only if all tiles validate. Historical source date: 2011.
No georeferencing, public redistribution, external tools or third-party scripts.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import signal
import sys
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

sys.dont_write_bytecode = True
from PIL import Image, ImageChops

CODE = Path(__file__).resolve().parents[1]
PROJECT = CODE.parent
ARCHIVE = CODE / "private-data/nexus-original"
MANIFEST = ARCHIVE / "manifest.json"
EVIDENCE = PROJECT / "outputs/arastirma-tek-harita/NEXUS-ORIGINAL-KANITI.json"
BASE = "http://exploration.urban.free.fr/catacombes/v5-globale/"
WIDTH, HEIGHT, TILE, ZOOM, GRID = 6000, 6002, 256, 5, 24
TIER_OFFSET = 194
BUDGET = 60_000_000
TIMEOUT = 20
MAX_ATTEMPTS = 2
HEADERS = {"User-Agent": "ATLAS-Private-Nexus-Archive/1.0", "Accept-Encoding": "identity"}
RIGHTS = "unverified-personal-copy"


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def require(value, message):
    if not value:
        raise ValueError(message)


def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        while block := f.read(1024 * 1024):
            h.update(block)
    return h.hexdigest()


def valid_url(url):
    p = urlsplit(url)
    require(p.scheme in {"http", "https"} and p.hostname == "exploration.urban.free.fr"
            and not p.username and not p.password and not p.query and not p.fragment
            and p.path.startswith("/catacombes/v5-globale/"), "Unexpected source URL")


class TransferBudget:
    def __init__(self):
        self.bytes = 0
        self.lock = threading.Lock()
        self.exhausted = threading.Event()
        self.stop_requested = threading.Event()
        self.stop_reason = None

    def use(self, count):
        with self.lock:
            if self.bytes + count > BUDGET:
                self.exhausted.set()
                raise ValueError("60 MB transfer budget exhausted")
            self.bytes += count


def request_bytes(url, budget, cap=1024 * 1024):
    valid_url(url)
    require(not budget.exhausted.is_set(), "Transfer budget already exhausted")
    attempts = []
    for attempt in range(1, MAX_ATTEMPTS + 1):
        require(not budget.stop_requested.is_set(), budget.stop_reason or "Network scheduling stopped")
        started = time.monotonic()
        try:
            with urlopen(Request(url, headers=HEADERS), timeout=TIMEOUT) as response:
                valid_url(response.geturl())
                require(response.status == 200, f"Unexpected source status: {response.status}")
                declared = response.headers.get("Content-Length")
                blocks, count, deadline = [], 0, started + TIMEOUT
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise TimeoutError("Source request exceeded 20 seconds")
                    try:
                        response.fp.raw._sock.settimeout(remaining)
                    except (AttributeError, OSError):
                        pass
                    block = response.read(64 * 1024)
                    if not block:
                        break
                    budget.use(len(block))
                    count += len(block)
                    require(count <= cap, "Source tile exceeds 1 MiB safety cap")
                    blocks.append(block)
                    if response.length == 0:
                        break
                require(not declared or not declared.isdigit() or count == int(declared),
                        "Source body differs from HTTP Content-Length")
                attempts.append({"attempt": attempt, "status": 200,
                                 "bytes": count, "seconds": round(time.monotonic() - started, 3)})
                return b"".join(blocks), attempts
        except (OSError, ValueError, HTTPError, URLError) as error:
            status = error.code if isinstance(error, HTTPError) else None
            attempts.append({"attempt": attempt, "status": status, "error": str(error),
                             "seconds": round(time.monotonic() - started, 3)})
            retryable = isinstance(error, (OSError, URLError)) and not isinstance(error, HTTPError)
            retryable |= status is not None and (status >= 500 or status == 429)
            if not retryable or attempt == MAX_ATTEMPTS:
                raise RuntimeError(json.dumps({"url": url, "attempts": attempts})) from error
            time.sleep(1)


def tile_record(x, y):
    group = (TIER_OFFSET + y * GRID + x) // 256
    relative = f"tiles/TileGroup{group}/{ZOOM}-{x}-{y}.jpg"
    return {"id": f"nexus:z5:{x}:{y}", "x": x, "y": y, "zoom": ZOOM,
            "tileGroup": group, "sourceUrl": BASE + relative.removeprefix("tiles/"),
            "path": relative, "kind": "image", "rights": RIGHTS,
            "expectedDimensions": [min(TILE, WIDTH - x * TILE), min(TILE, HEIGHT - y * TILE)],
            "pixelOrigin": [x * TILE, y * TILE], "status": "pending"}


def obtain_tile(item, budget, previous):
    destination = ARCHIVE / item["path"]
    staged = destination.with_suffix(".jpg.part")
    try:
        old = previous.get(item["id"])
        if old and destination.exists() and sha(destination) == old.get("sha256"):
            with Image.open(destination) as image:
                image.load()
                require(list(image.size) == item["expectedDimensions"], "Cached tile dimensions changed")
            return {**old, **item, "status": "archived-private", "sha256": old["sha256"],
                    "bytes": destination.stat().st_size, "dimensions": item["expectedDimensions"],
                    "reusedAt": now()}
        data, attempts = request_bytes(item["sourceUrl"], budget)
        destination.parent.mkdir(parents=True, exist_ok=True)
        staged.write_bytes(data)
        with Image.open(staged) as image:
            require(image.format == "JPEG", "Source tile is not JPEG")
            image.load()
            dimensions = list(image.size)
            require(dimensions == item["expectedDimensions"],
                    f"Unexpected actual edge dimensions {dimensions}; expected {item['expectedDimensions']}")
        staged.replace(destination)
        return {**item, "status": "archived-private", "bytes": len(data),
                "sha256": hashlib.sha256(data).hexdigest(), "dimensions": dimensions,
                "downloadedAt": now(), "attempts": attempts}
    except Exception as error:
        staged.unlink(missing_ok=True)
        return {**item, "status": "not-archived-after-stop" if budget.stop_requested.is_set() else "missing",
                "bytes": None, "sha256": None,
                "error": str(error)}


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    staged = path.with_suffix(".json.tmp")
    staged.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    staged.replace(path)


def persist(manifest, evidence):
    atomic_json(MANIFEST, manifest)
    evidence["updatedAt"] = now()
    evidence["manifest"] = {"path": str(MANIFEST.relative_to(PROJECT)), "sha256": sha(MANIFEST)}
    atomic_json(EVIDENCE, evidence)


def assemble(tiles):
    raw_bytes = sum(t["bytes"] for t in tiles)
    canvas = Image.new("RGB", (WIDTH, HEIGHT))
    for item in tiles:
        with Image.open(ARCHIVE / item["path"]) as tile:
            canvas.paste(tile.convert("RGB"), tuple(item["pixelOrigin"]))
    destination = ARCHIVE / "nexus-2011-original-6000x6002.png"
    staged = destination.with_suffix(".png.part")
    canvas.save(staged, format="PNG", compress_level=6)
    del canvas
    require(raw_bytes + staged.stat().st_size <= BUDGET,
            "Raw tiles plus lossless joined raster exceed 60 MB archive budget")
    matched = 0
    with Image.open(staged) as joined:
        require(joined.size == (WIDTH, HEIGHT), "Joined dimensions differ from source")
        joined.load()
        for item in tiles:
            x, y = item["pixelOrigin"]
            w, h = item["dimensions"]
            with Image.open(ARCHIVE / item["path"]) as tile:
                require(ImageChops.difference(joined.crop((x, y, x + w, y + h)),
                                               tile.convert("RGB")).getbbox() is None,
                        f"Joined pixels differ from original tile: {item['id']}")
            matched += 1
    staged.replace(destination)
    return {"path": destination.name, "kind": "image", "format": "PNG",
            "bytes": destination.stat().st_size, "sha256": sha(destination),
            "dimensions": [WIDTH, HEIGHT], "sourceTileCount": matched,
            "pixelComparison": "All 576 decoded source tiles match their decoded PNG regions exactly",
            "sourceYear": 2011, "georeferenced": False, "crs": None,
            "rights": RIGHTS}


def main():
    started, timestamp, budget = time.monotonic(), now(), TransferBudget()
    def stop_after_active_requests(signum, _frame):
        budget.stop_reason = f"Signal {signum}: coordinator requested no new network jobs"
        budget.stop_requested.set()
    signal.signal(signal.SIGTERM, stop_after_active_requests)
    signal.signal(signal.SIGINT, stop_after_active_requests)
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    partial_manifest = ARCHIVE / "manifest.partial.json"
    previous_path = partial_manifest if partial_manifest.exists() else MANIFEST
    previous = ({t["id"]: t for t in json.loads(previous_path.read_text())["tiles"]}
                if previous_path.exists() else {})
    data, metadata_attempts = request_bytes(BASE + "ImageProperties.xml", budget, cap=10000)
    props = ET.fromstring(data).attrib
    require(props.get("WIDTH") == str(WIDTH) and props.get("HEIGHT") == str(HEIGHT)
            and props.get("TILESIZE") == str(TILE) and props.get("NUMTILES") == "770",
            "The source Zoomify metadata differs from the verified 2011 raster")
    (ARCHIVE / "ImageProperties.xml").write_bytes(data)
    tiles = [tile_record(x, y) for y in range(GRID) for x in range(GRID)]
    manifest = {"schema": 1, "ureten": "codex", "createdAt": timestamp,
                "title": "Nexus 2011 · original historical raster (private)",
                "sourceUrl": BASE, "sourceYear": 2011, "sourceLastUpdate": "2011-01-09",
                "rights": RIGHTS, "publicRedistributionApproved": False,
                "georeferenced": False, "crs": None, "dimensions": [WIDTH, HEIGHT],
                "sourceProperties": props, "tiles": tiles, "assembledRaster": None}
    evidence = {"ureten": "codex", "startedAt": timestamp, "command": ["python3", *sys.argv],
                "scriptSha256": sha(Path(__file__)), "phase": "downloading",
                "limits": {"maxConcurrency": 2, "requestTimeoutSeconds": TIMEOUT,
                           "maxAttempts": MAX_ATTEMPTS, "transferBudgetBytes": BUDGET,
                           "rawPlusJoinedRasterBudgetBytes": BUDGET},
                "sourceMetadata": {"url": BASE + "ImageProperties.xml", "bytes": len(data),
                                   "sha256": hashlib.sha256(data).hexdigest(), "attempts": metadata_attempts},
                "zoomify": {"level": ZOOM, "grid": [GRID, GRID], "tierOffset": TIER_OFFSET,
                            "tileCount": len(tiles), "tileGroupFormula": "floor((194 + y*24 + x)/256)"}}
    persist(manifest, evidence)
    by_id = {t["id"]: t for t in tiles}
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(obtain_tile, tile, budget, previous) for tile in tiles]
        for index, future in enumerate(as_completed(futures), 1):
            item = future.result()
            by_id[item["id"]] = item
            if index % 24 == 0 or index == len(tiles):
                manifest["tiles"] = sorted(by_id.values(), key=lambda t: (t["y"], t["x"]))
                evidence["progress"] = {"finished": index, "total": len(tiles),
                                        "networkBytes": budget.bytes}
                persist(manifest, evidence)
                print(json.dumps({"phase": "tiles", **evidence["progress"]}), flush=True)
    manifest["tiles"] = sorted(by_id.values(), key=lambda t: (t["y"], t["x"]))
    missing = [t for t in manifest["tiles"] if t["status"] != "archived-private"]
    evidence["missing"] = [{"id": t["id"], "sourceUrl": t["sourceUrl"], "error": t.get("error")}
                           for t in missing]
    evidence["stopReason"] = budget.stop_reason
    evidence["phase"] = "incomplete" if missing else "assembling"
    persist(manifest, evidence)
    if not missing:
        try:
            manifest["assembledRaster"] = assemble(manifest["tiles"])
            evidence["phase"] = "complete"
        except Exception as error:
            evidence["phase"] = "assembly-failed"
            evidence["assemblyError"] = str(error)
    archived = [t for t in manifest["tiles"] if t["status"] == "archived-private"]
    require(all((ARCHIVE / t["path"]).stat().st_size == t["bytes"]
                and sha(ARCHIVE / t["path"]) == t["sha256"] for t in archived),
            "Final raw tile byte/SHA verification failed")
    evidence["result"] = {"archivedTiles": len(archived), "expectedTiles": len(tiles),
                          "missingTiles": len(missing), "rawTileBytes": sum(t["bytes"] for t in archived),
                          "networkBytesIncludingRetries": budget.bytes,
                          "joinedRaster": manifest["assembledRaster"],
                          "finalRawHashRechecks": len(archived),
                          "noInventedPixels": not missing and evidence["phase"] == "complete",
                          "georeferenced": False, "sourceYear": 2011,
                          "seconds": round(time.monotonic() - started, 3)}
    persist(manifest, evidence)
    print(json.dumps({"phase": evidence["phase"], **evidence["result"]}), flush=True)


if __name__ == "__main__":
    main()
