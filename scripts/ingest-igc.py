#!/usr/bin/env python3
"""Fetch the official IGC sheet INDEX, never the copyrighted sheet PDFs.

Producer: codex. Python 3.10+, standard library only.
The vendored MIT code's query(), bbox() and GRS bounds are actually reused.
Polygon/MultiPolygon coordinates are the original ArcGIS sheet footprints;
they are not underground galleries, entrance locations or a navigable network.
"""

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

CODE = Path(__file__).resolve().parents[1]
PROJECT = CODE.parent
VENDOR = CODE / "third_party" / "catacombes-atlas"
OUTPUT = CODE / "public" / "data" / "igc-index.geojson"
EVIDENCE = PROJECT / "outputs" / "IGC-INGEST-KANITI.json"
LAYER = "https://capgeo2.paris.fr/public/rest/services/IGC/IGC_TA_Externe/MapServer/0"
OFFICIAL_API_HOSTS = frozenset({"capgeo2.paris.fr"})
OFFICIAL_PDF_HOSTS = frozenset({"capgeo.sig.paris.fr"})
MAX_SHEETS = 10000
MAX_JSON_BYTES = 10 * 1024 * 1024
USER_AGENT = "ATLAS-IGC-Sheet-Index/1.0 (metadata only)"
REQUIRED_PROPERTIES = frozenset({
    "sheetId", "sourceId", "title", "pdfUrl", "revisionYear", "network",
    "recordType", "accessStatus",
})


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def official_https(url, hosts):
    parsed = urlsplit(url)
    require(parsed.scheme == "https", f"Non-HTTPS URL: {url}")
    require(parsed.hostname in hosts, f"Unapproved official host: {parsed.hostname}")
    require(not parsed.username and not parsed.password and parsed.port in (None, 443),
            "Unexpected URL credentials or port")
    return url


def fetch_json(url, requests_log):
    official_https(url, OFFICIAL_API_HOSTS)
    started = time.monotonic()
    with urlopen(Request(url, headers={"User-Agent": USER_AGENT}), timeout=45) as response:
        official_https(response.geturl(), OFFICIAL_API_HOSTS)
        body = response.read(MAX_JSON_BYTES + 1)
        require(len(body) <= MAX_JSON_BYTES, "JSON response exceeds 10 MiB limit")
        result = json.loads(body)
    require("error" not in result, f"ArcGIS returned an error: {result.get('error')}")
    requests_log.append({"url": url, "bytes": len(body),
                         "seconds": round(time.monotonic() - started, 3)})
    return result


def query_json(params, requests_log):
    return fetch_json(f"{LAYER}/query?{urlencode(params)}", requests_log)


def count_sheets(requests_log):
    result = query_json({"where": "1=1", "returnCountOnly": "true", "f": "json"},
                        requests_log)
    count = result.get("count")
    require(type(count) is int and 0 < count <= MAX_SHEETS,
            f"Unexpected sheet count: {count}")
    return count


def load_upstream():
    provenance = json.loads((VENDOR / "PROVENANCE.json").read_text())
    for artifact in provenance["files"]:
        require(sha256(VENDOR / artifact["path"]) == artifact["sha256"],
                f"Vendored source no longer matches provenance: {artifact['path']}")
    # Do not create __pycache__ beside the unchanged upstream source.
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location("igc_upstream", VENDOR / "fetch_index.py")
    upstream = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(upstream)
    require(upstream.SERVICE == f"{LAYER}/query", "Unexpected upstream service")
    official_https(upstream.SERVICE, OFFICIAL_API_HOSTS)
    return upstream, provenance


def fetch_all(upstream, metadata, expected_count, requests_log):
    """Use upstream once; detect truncation and paginate independently if needed."""
    started = time.monotonic()
    raw = upstream.query(4326)
    require("error" not in raw, f"Upstream query failed: {raw.get('error')}")
    requests_log.append({
        "url": f"{upstream.SERVICE}?" + urlencode({
            "where": "1=1", "outFields": "numero_car,carte", "returnGeometry": "true",
            "outSR": "4326", "f": "json"}),
        "via": "vendored upstream query(4326)",
        "features": len(raw.get("features", [])),
        "seconds": round(time.monotonic() - started, 3),
        "exceededTransferLimit": raw.get("exceededTransferLimit", False),
    })
    sr = raw.get("spatialReference", {})
    require(sr.get("latestWkid", sr.get("wkid")) == 4326, "Response is not EPSG:4326")
    require(raw.get("geometryType") == "esriGeometryPolygon", "Unexpected source geometry")
    features = raw.get("features", [])
    if len(features) == expected_count and not raw.get("exceededTransferLimit", False):
        return features, False

    require(metadata.get("advancedQueryCapabilities", {}).get("supportsPagination"),
            "Query was truncated and the service does not advertise pagination")
    oid_fields = [f["name"] for f in metadata.get("fields", [])
                  if f["type"] == "esriFieldTypeOID"]
    require(len(oid_fields) == 1, "A stable object ID is required for pagination")
    page_size = min(1000, int(metadata.get("maxRecordCount", 1000)))
    require(page_size > 0, "Invalid maxRecordCount")
    features = []
    while len(features) < expected_count:
        result = query_json({
            "where": "1=1", "outFields": "numero_car,carte", "returnGeometry": "true",
            "outSR": "4326", "orderByFields": f"{oid_fields[0]} ASC",
            "resultOffset": len(features), "resultRecordCount": page_size, "f": "json",
        }, requests_log)
        page = result.get("features", [])
        require(page and len(page) <= page_size, "Empty or oversized pagination page")
        features.extend(page)
        require(len(features) <= expected_count, "Pagination returned more than server count")
        if len(features) < expected_count:
            require(result.get("exceededTransferLimit", False),
                    "Pagination ended before independent server count")
    return features, True


def area(ring):
    # Translate to the first vertex before the shoelace sum to reduce cancellation.
    x0, y0 = ring[0]
    return sum((a[0] - x0) * (b[1] - y0) - (b[0] - x0) * (a[1] - y0)
               for a, b in zip(ring, ring[1:])) / 2


def validate_ring(ring):
    require(isinstance(ring, list) and len(ring) >= 4, "Ring must have at least four positions")
    require(ring[0] == ring[-1], "Source ring is not closed")
    for position in ring:
        require(isinstance(position, list) and len(position) == 2, "Expected 2D coordinates")
        lon, lat = position
        require(all(type(v) in (float, int) and math.isfinite(v) for v in position),
                "Non-finite coordinate")
        require(-180 <= lon <= 180 and -90 <= lat <= 90, "Coordinate outside WGS84")
        # The dataset is Paris and its near suburbs; catch an unnoticed CRS mismatch.
        require(1.5 <= lon <= 3.0 and 48.0 <= lat <= 49.5, "Footprint outside Paris region")
    require(len({tuple(p) for p in ring[:-1]}) >= 3, "Degenerate ring")
    require(abs(area(ring)) > 1e-12, "Zero-area ring")


def contains(point, ring):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y):
            intersection = a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
            if x < intersection:
                inside = not inside
    return inside


def to_geojson_geometry(geometry):
    """Group ArcGIS rings by containment and preserve all footprint vertices."""
    rings = geometry.get("rings", [])
    require(rings, "Missing source rings")
    for ring in rings:
        validate_ring(ring)
    magnitudes = [abs(area(r)) for r in rings]
    parents = []
    for index, ring in enumerate(rings):
        containers = [j for j, other in enumerate(rings)
                      if magnitudes[j] > magnitudes[index] and contains(ring[0], other)]
        parents.append(min(containers, key=lambda j: magnitudes[j]) if containers else None)
    depths = []
    for index in range(len(rings)):
        depth, cursor = 0, parents[index]
        while cursor is not None:
            depth += 1
            require(depth <= len(rings), "Invalid ring containment cycle")
            cursor = parents[cursor]
        depths.append(depth)
    polygons = []
    for index, ring in enumerate(rings):
        if depths[index] % 2:
            continue
        # GeoJSON right-hand rule: outer CCW; holes CW.
        outer = ring if area(ring) > 0 else list(reversed(ring))
        holes = [r if area(r) < 0 else list(reversed(r))
                 for j, r in enumerate(rings) if parents[j] == index and depths[j] % 2]
        polygons.append([outer, *holes])
    require(polygons, "No exterior footprint rings")
    return {"type": "Polygon", "coordinates": polygons[0]} if len(polygons) == 1 else {
        "type": "MultiPolygon", "coordinates": polygons}


def normalize_pdf(url):
    if url is None or url == "":
        return None
    require(isinstance(url, str) and url == url.strip(), "Malformed PDF URL")
    official_https(url, OFFICIAL_PDF_HOSTS)
    parsed = urlsplit(url)
    require(parsed.path.startswith("/PdfEtImages/AtlasAnciennesCarrieres/")
            and parsed.path.lower().endswith(".pdf"), "Unexpected official PDF path")
    require(not parsed.query and not parsed.fragment, "Unexpected PDF query/fragment")
    return url


def make_collection(raw_features, upstream, retrieved_at):
    features = []
    for raw in raw_features:
        attributes = raw["attributes"]
        sheet_id = attributes.get("numero_car")
        require(isinstance(sheet_id, str) and re.fullmatch(r"[A-Za-z0-9_-]+", sheet_id),
                f"Invalid sheet number: {sheet_id}")
        pdf_url = normalize_pdf(attributes.get("carte"))
        match = re.search(r"_(\d{4})\.pdf$", pdf_url or "", flags=re.IGNORECASE)
        year = int(match.group(1)) if match else None
        require(year is None or 1700 <= year <= datetime.now(timezone.utc).year,
                f"Impossible revision year: {year}")
        bounds = upstream.bbox(raw["geometry"])
        grs = upstream.GRS
        overlaps_grs = (bounds[2] >= grs["west"] and bounds[0] <= grs["east"]
                        and bounds[3] >= grs["south"] and bounds[1] <= grs["north"])
        features.append({
            "type": "Feature", "id": f"igc:{sheet_id}",
            "geometry": to_geojson_geometry(raw["geometry"]),
            "properties": {
                "sheetId": sheet_id, "sourceId": "igc-atlas", "title": f"IGC · {sheet_id}",
                "pdfUrl": pdf_url, "revisionYear": year,
                "network": "GRS" if overlaps_grs else "outside-GRS",
                "recordType": "sheet", "accessStatus": "unknown",
            },
        })
    features.sort(key=lambda feature: feature["properties"]["sheetId"])
    return {
        "type": "FeatureCollection", "name": "Official IGC atlas sheet index",
        "metadata": {
            "producer": "codex", "retrievedAt": retrieved_at,
            "sourceUrl": LAYER, "coordinateReferenceSystem": "EPSG:4326",
            "geometryMeaning": "Official sheet footprints; not tunnels or entrance locations",
            "networkClassification": "Approximate sheet intersection with upstream GRS bounding box",
            "grsBoundingBox": upstream.GRS,
            "revisionYearMeaning": "Year parsed from the PDF filename; not a live conditions date",
            "rights": "Factual sheet index only. No PDF/raster redistribution permission inferred. "
                      "Upstream MIT license covers code only. Official PDFs remain external links.",
            "offlineScope": "This footprint index can be cached; linked PDFs are not downloaded.",
        },
        "features": features,
    }


def validate_collection(collection, expected_count=None):
    require(collection.get("type") == "FeatureCollection", "Expected GeoJSON FeatureCollection")
    features = collection["features"]
    require(expected_count is None or len(features) == expected_count,
            "Feature count differs from independent server count")
    ids = [f["id"] for f in features]
    require(len(ids) == len(set(ids)), "Duplicate sheet IDs")
    for feature in features:
        properties = feature["properties"]
        require(set(properties) == REQUIRED_PROPERTIES, "Unexpected feature property schema")
        require(feature["type"] == "Feature" and feature["id"] == f"igc:{properties['sheetId']}",
                "Feature identity mismatch")
        require(isinstance(properties["sheetId"], str)
                and bool(re.fullmatch(r"[A-Za-z0-9_-]+", properties["sheetId"]))
                and isinstance(properties["title"], str) and bool(properties["title"]),
                "Missing sheet identifier/title")
        require(properties["sourceId"] == "igc-atlas" and properties["recordType"] == "sheet"
                and properties["accessStatus"] == "unknown", "Invalid record provenance/status")
        require(properties["network"] in {"GRS", "outside-GRS"}, "Invalid network classification")
        normalize_pdf(properties["pdfUrl"])
        year = properties["revisionYear"]
        require(year is None or type(year) is int and 1700 <= year <= datetime.now(timezone.utc).year,
                "Invalid revision year")
        year_match = re.search(r"_(\d{4})\.pdf$", properties["pdfUrl"] or "", flags=re.IGNORECASE)
        require(year == (int(year_match.group(1)) if year_match else None),
                "Revision year differs from the official PDF filename")
        geometry = feature["geometry"]
        require(geometry["type"] in {"Polygon", "MultiPolygon"}, "Footprint must be polygonal")
        polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
        require(bool(polygons), "Empty footprint")
        for polygon in polygons:
            require(bool(polygon), "Empty footprint polygon")
            for index, ring in enumerate(polygon):
                validate_ring(ring)
                require((area(ring) > 0) == (index == 0), "Invalid GeoJSON ring winding")
    years = [f["properties"]["revisionYear"] for f in features
             if f["properties"]["revisionYear"] is not None]
    return {
        "features": len(features), "uniqueIds": len(set(ids)), "duplicates": len(ids) - len(set(ids)),
        "withPdf": sum(f["properties"]["pdfUrl"] is not None for f in features),
        "withoutPdf": sum(f["properties"]["pdfUrl"] is None for f in features),
        "withRevisionYear": len(years), "revisionYearRange": [min(years), max(years)] if years else None,
        "networkCounts": dict(Counter(f["properties"]["network"] for f in features)),
        "geometryCounts": dict(Counter(f["geometry"]["type"] for f in features)),
        "allGeometriesValidated": True, "allPdfUrlsOfficialHttps": True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate-only", action="store_true",
                        help="Validate existing GeoJSON without network or file writes")
    args = parser.parse_args()
    if args.validate_only:
        print(json.dumps(validate_collection(json.loads(OUTPUT.read_text())), ensure_ascii=False))
        return

    started = time.monotonic()
    retrieved_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    upstream, provenance = load_upstream()
    requests_log = []
    metadata = fetch_json(f"{LAYER}?f=json", requests_log)
    expected_count = count_sheets(requests_log)
    raw_features, paginated = fetch_all(upstream, metadata, expected_count, requests_log)
    collection = make_collection(raw_features, upstream, retrieved_at)
    summary = validate_collection(collection, expected_count)
    # Catch a count change while reading instead of silently certifying a partial snapshot.
    require(count_sheets(requests_log) == expected_count, "Source count changed during ingestion; retry")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(collection, ensure_ascii=False, separators=(",", ":"),
                                 allow_nan=False) + "\n", encoding="utf-8")
    require(validate_collection(json.loads(OUTPUT.read_text()), expected_count) == summary,
            "Written artifact differs from validated collection")
    evidence = {
        "producer": "codex", "retrievedAt": retrieved_at,
        "finishedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "command": ["python3", *sys.argv], "workingDirectory": str(Path.cwd()),
        "officialLayer": LAYER, "officialServerCountBeforeAndAfter": expected_count,
        "upstreamRepository": provenance["repository"], "upstreamCommit": provenance["commit"],
        "upstreamFunctionsReused": ["query(4326)", "bbox(geometry)", "GRS"],
        "serviceMaxRecordCount": metadata.get("maxRecordCount"), "paginationNeeded": paginated,
        "measurements": summary, "networkRequests": requests_log,
        "downloadedPdfCount": 0, "downloadedRasterCount": 0,
        "seconds": round(time.monotonic() - started, 3),
        "artifacts": [
            {"path": str(path.relative_to(PROJECT)), "bytes": path.stat().st_size,
             "sha256": sha256(path)}
            for path in [OUTPUT, Path(__file__).resolve(), VENDOR / "fetch_index.py",
                         VENDOR / "LICENSE", VENDOR / "PROVENANCE.json"]
        ],
        "limits": [
            "Footprints describe atlas sheets, not galleries or underground navigation.",
            "GRS classification is a coarse bounding-box intersection inherited from upstream.",
            "Revision years are parsed from PDF filenames, not verified survey dates.",
            "External PDF availability is not probed; four sheets currently have no PDF URL.",
            "The MIT license covers upstream code only; sheet PDF/raster reuse is not licensed by it.",
            "This factual index snapshot is offline-capable; no complete underground map is bundled.",
        ],
    }
    EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE.write_text(json.dumps(evidence, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    print(json.dumps({**summary, "output": str(OUTPUT), "evidence": str(EVIDENCE)}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"IGC ingestion failed: {error}", file=sys.stderr)
        sys.exit(1)
