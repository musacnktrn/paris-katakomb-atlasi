#!/usr/bin/env python3
"""ureten: codex. Ville de Paris ODbL display data, never a navigation graph.

Sequential acquisition only: four metadata requests and four complete JSON
exports; 30 s socket timeout, one retry, 40 MB aggregate response-body budget.
Output geometry is WGS84, rounded to six decimals, without line simplification.
Road segments sharing source road ID and level are grouped as MultiLineStrings.
Existing GRS data is neither read nor changed.
"""

from __future__ import annotations

import collections
import argparse
import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request


CODE = Path(__file__).resolve().parents[1]
PROOF = CODE.parent / "outputs/v3-kullanilabilirlik/PARIS-SURFACE-KANITI.json"
ROOT = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/"
BODY_BUDGET = 40_000_000
OUTPUT_LIMIT = 10 * 1024 * 1024
SCOPE_BBOX = [2.20, 48.80, 2.49, 48.92]
SPECS = [
    ("troncon_voie", "geom,n_sq_tv,n_sq_vo,c_niveau"),
    ("voie", "n_sq_vo,l_longmin,l_courtmin"),
    ("espaces_verts", "geom,geom_x_y,nsq_espace_vert,nom_ev,type_ev,categorie,adresse_codepostal"),
    ("plan-de-voirie-voies-deau", "geo_shape,objectid,lib_level"),
]


def digest(data):
    return hashlib.sha256(data).hexdigest()


class Fetcher:
    def __init__(self, reuse_cache=False):
        self.bytes = 0
        self.requests = []
        self.reuse_cache = reuse_cache
        self.cache = PROOF.parent / "paris-source-cache"

    def fetch_json(self, url):
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https" or parsed.hostname != "opendata.paris.fr":
            raise ValueError("Unexpected source host")
        cache_index = self.cache / (digest(url.encode()) + ".index.json")
        if self.reuse_cache and cache_index.exists():
            cached = json.loads(cache_index.read_text())
            data = (self.cache / (cached["sha256"] + ".json")).read_bytes()
            if digest(data) != cached["sha256"] or cached["url"] != url:
                raise ValueError("Invalid local source cache")
            self.requests.append({**cached, "reusedLocalCache": True, "networkBytes": 0})
            return json.loads(data)
        for attempt in range(1, 3):
            started = time.monotonic()
            entry = {"url": url, "attempt": attempt}
            try:
                request = urllib.request.Request(url, headers={"User-Agent": "ATLAS-Paris-surface-ingester/1.0"})
                with urllib.request.urlopen(request, timeout=30) as response:
                    if urllib.parse.urlparse(response.url).hostname != parsed.hostname:
                        raise ValueError("Unexpected response host")
                    data = bytearray()
                    while chunk := response.read(128 * 1024):
                        self.bytes += len(chunk)
                        if self.bytes > BODY_BUDGET:
                            raise ValueError("Aggregate source-body budget exceeded")
                        data.extend(chunk)
                    entry.update(status=response.status, bytes=len(data), sha256=digest(data))
                result = json.loads(data)
                cache_body = self.cache / (entry["sha256"] + ".json")
                if not cache_body.exists():
                    write_atomic(cache_body, data)
                write_atomic(cache_index, json.dumps({**entry, "retrievedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()}).encode())
                entry["seconds"] = round(time.monotonic() - started, 3)
                self.requests.append(entry)
                return result
            except Exception as error:
                entry.update(error=f"{type(error).__name__}: {error}", seconds=round(time.monotonic() - started, 3))
                self.requests.append(entry)
                if attempt == 2 or self.bytes > BODY_BUDGET:
                    raise
                time.sleep(1)


def positions(coords):
    if not coords:
        return
    if isinstance(coords[0], (float, int)):
        yield coords
    else:
        for child in coords:
            yield from positions(child)


def rounded(coords, digits=6):
    if isinstance(coords[0], (float, int)):
        if len(coords) < 2 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in coords[:2]):
            raise ValueError("Nonfinite position")
        x, y = coords[:2]
        if not (-180 <= x <= 180 and -90 <= y <= 90):
            raise ValueError("Coordinates are not WGS84")
        return [round(x, digits), round(y, digits)]
    return [rounded(child, digits) for child in coords]


def unique_neighbors(line):
    out = []
    for point in line:
        if not out or point != out[-1]:
            out.append(point)
    return out


def normalize_geometry(wrapped, allowed):
    geom = wrapped.get("geometry", wrapped) if wrapped else None
    if not geom or geom.get("type") not in allowed:
        raise ValueError("Missing or unexpected geometry type")
    for digits in (6, 7, 10):
        coords = rounded(geom["coordinates"], digits)
        kind = geom["type"]
        lines = [coords] if kind == "LineString" else coords if kind == "MultiLineString" else None
        if lines is not None:
            cleaned = [unique_neighbors(line) for line in lines]
            if any(len(line) < 2 for line in cleaned):
                continue
            coords = cleaned[0] if kind == "LineString" else cleaned
        else:
            polygons = [coords] if kind == "Polygon" else coords
            cleaned = []
            valid = True
            for polygon in polygons:
                rings = []
                for ring in polygon:
                    ring = unique_neighbors(ring)
                    if ring and ring[0] != ring[-1]:
                        ring.append(ring[0])
                    if len(ring) < 4 or len({tuple(p) for p in ring[:-1]}) < 3:
                        valid = False
                        break
                    rings.append(ring)
                if not rings:
                    valid = False
                cleaned.append(rings)
            if not valid:
                continue
            coords = cleaned[0] if kind == "Polygon" else cleaned
        return {"type": kind, "coordinates": coords}
    raise ValueError("Degenerate geometry after precision reduction")


def write_atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    temporary.write_bytes(data)
    os.replace(temporary, path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reuse-cache", action="store_true", help="Explicitly reproduce the last acquired source snapshots without fresh requests")
    args = parser.parse_args()
    fetcher = Fetcher(args.reuse_cache)
    sources, records = {}, {}
    for dataset, select in SPECS:
        meta_url = ROOT + dataset
        metadata = fetcher.fetch_json(meta_url)
        meta = metadata["metas"]["default"]
        if meta.get("license") != "Open Database License (ODbL)":
            raise ValueError(f"Unverified license for {dataset}")
        export_url = meta_url + "/exports/json?" + urllib.parse.urlencode({"select": select, "limit": -1})
        rows = fetcher.fetch_json(export_url)
        if not isinstance(rows, list) or len(rows) != meta["records_count"]:
            raise ValueError(f"Truncated {dataset}: {len(rows)} / {meta['records_count']}")
        records[dataset] = rows
        sources[dataset] = {
            "datasetId": dataset,
            "url": "https://opendata.paris.fr/explore/dataset/" + dataset + "/",
            "metadataUrl": meta_url,
            "exportUrl": export_url,
            "title": meta["title"],
            "publisher": meta["publisher"],
            "license": "ODbL-1.0",
            "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
            "sourceRecordCount": len(rows),
            "metadataModified": meta.get("modified"),
            "metadataDataProcessed": meta.get("data_processed"),
            "sourceDescriptionHtml": meta.get("description"),
        }
        print(f"{dataset}: {len(rows)} records", flush=True)

    names = {}
    for row in records["voie"]:
        key = row["n_sq_vo"]
        if key in names:
            raise ValueError(f"Duplicate road-name identifier {key}")
        names[key] = row.get("l_longmin") or row.get("l_courtmin")

    features, excluded, diagnostics = [], collections.Counter(), collections.Counter()
    excluded_records = []
    road_groups = {}

    def add(kind, dataset, identifier, name, geometry, **properties):
        features.append({
            "type": "Feature",
            "id": f"paris:{dataset}:{identifier}",
            "properties": {"name": name, "kind": kind, "sourceId": "paris-surface", "datasetId": dataset, **properties},
            "geometry": geometry,
        })

    for row in records["troncon_voie"]:
        try:
            geom = normalize_geometry(row.get("geom"), {"LineString", "MultiLineString"})
        except ValueError as error:
            excluded["roadInvalidGeometry:" + str(error)] += 1
            excluded_records.append({"datasetId": "troncon_voie", "id": row["n_sq_tv"], "reason": str(error)})
            continue
        key = (row["n_sq_vo"], row.get("c_niveau"))
        group = road_groups.setdefault(key, {"lines": [], "sourceSegments": []})
        group["lines"].extend([geom["coordinates"]] if geom["type"] == "LineString" else geom["coordinates"])
        group["sourceSegments"].append(row["n_sq_tv"])
        if not names.get(row["n_sq_vo"]):
            diagnostics["roadSegmentsWithoutName"] += 1

    for (road_id, level), group in road_groups.items():
        lines = group["lines"]
        geom = {"type": "LineString", "coordinates": lines[0]} if len(lines) == 1 else {"type": "MultiLineString", "coordinates": lines}
        add("road", "troncon_voie", f"road-{road_id}-level-{level}", names.get(road_id) or "Voie sans dénomination", geom, roadId=road_id, level=level, segmentCount=len(group["sourceSegments"]))

    for row in records["espaces_verts"]:
        postal = str(row.get("adresse_codepostal") or "")
        if not re.fullmatch(r"75\d{3}", postal):
            excluded["greenOutsideParisPostalOrMissingPostal"] += 1
            continue
        try:
            geom = normalize_geometry(row.get("geom"), {"Polygon", "MultiPolygon"})
        except ValueError as error:
            excluded["greenInvalidGeometry:" + str(error)] += 1
            excluded_records.append({"datasetId": "espaces_verts", "id": row["nsq_espace_vert"], "reason": str(error)})
            continue
        pts = list(positions(geom["coordinates"]))
        if not all(SCOPE_BBOX[0] <= p[0] <= SCOPE_BBOX[2] and SCOPE_BBOX[1] <= p[1] <= SCOPE_BBOX[3] for p in pts):
            excluded["greenOutsideParisDisplayBbox"] += 1
            continue
        identifier = row["nsq_espace_vert"]
        derived_identity = identifier is None
        if derived_identity:
            identifier = "derived-" + digest(json.dumps({"name": row.get("nom_ev"), "geometry": geom}, sort_keys=True, ensure_ascii=False).encode())
        add("park", "espaces_verts", identifier, row.get("nom_ev") or "Espace vert", geom, greenType=row.get("type_ev"), category=row.get("categorie"), identityDerived=derived_identity)

    for row in records["plan-de-voirie-voies-deau"]:
        try:
            geom = normalize_geometry(row.get("geo_shape"), {"Polygon", "MultiPolygon"})
        except ValueError as error:
            excluded["waterInvalidGeometry:" + str(error)] += 1
            excluded_records.append({"datasetId": "plan-de-voirie-voies-deau", "id": row["objectid"], "reason": str(error)})
            continue
        add("water", "plan-de-voirie-voies-deau", row["objectid"], "Voie d’eau", geom)

    ids = [f["id"] for f in features]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate output feature identifiers")
    all_pts = [p for f in features for p in positions(f["geometry"]["coordinates"])]
    bbox = [min(p[0] for p in all_pts), min(p[1] for p in all_pts), max(p[0] for p in all_pts), max(p[1] for p in all_pts)]
    if not all(SCOPE_BBOX[0] <= p[0] <= SCOPE_BBOX[2] and SCOPE_BBOX[1] <= p[1] <= SCOPE_BBOX[3] for p in all_pts):
        raise ValueError("Output outside the documented Paris display bbox")
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    attribution = "© Ville de Paris, ODbL 1.0 · troncon_voie / voie / espaces_verts / Plan de voirie – Voies d’eau"
    collection = {
        "type": "FeatureCollection", "ureten": "codex", "features": features, "bbox": bbox,
        "attribution": attribution, "source": "Ville de Paris Open Data", "retrievedAt": now,
        "coverage": SCOPE_BBOX, "coverageLabel": "Paris geneli · belediye yol eksenleri, yeşil alanlar ve su yüzeyleri",
    }
    body = (json.dumps(collection, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    if len(body) > OUTPUT_LIMIT:
        raise ValueError(f"Offline asset exceeds 10 MiB budget: {len(body)} bytes")
    counts = dict(collections.Counter(f["properties"]["kind"] for f in features))
    meta = {
        "schema": 1, "ureten": "codex", "id": "paris-surface", "retrievedAt": now,
        "crs": "EPSG:4326", "attribution": attribution, "license": "ODbL-1.0",
        "licenseUrl": "https://opendatacommons.org/licenses/odbl/1-0/",
        "dataUrl": "data/surface-paris.geojson", "bytes": len(body), "sha256": digest(body),
        "featureCount": len(features), "counts": counts, "bbox": bbox, "sources": list(sources.values()),
        "excluded": dict(excluded), "displayOnly": True, "routingGraph": False,
        "diagnostics": dict(diagnostics), "roadSegmentCount": sum(len(g["sourceSegments"]) for g in road_groups.values()),
        "transformation": "Geometry rounded to 6 decimal degrees (7/10 for very small rings); consecutive duplicates removed; no line simplification. Source road segments sharing n_sq_vo and c_niveau are grouped as independent parts of a MultiLineString, without connecting their endpoints. Road names joined through n_sq_vo. Green areas require a 75xxx postal code and the documented Paris display bbox. Missing green-area IDs are explicitly replaced by derived SHA256 identities of name and output geometry.",
        "limitations": [
            "The road source description says June 2018. Its October 2026 portal processing timestamp does not prove that every road was resurveyed then.",
            "The municipal green-area dataset also contains decorative planters, private institutional land, sports sites and cemeteries; park kind means display vegetation, not a public access guarantee. Out-of-Paris or missing-postal records are excluded.",
            "PVP water coverage and geometry do not guarantee complete or current coverage; the publisher excludes topographic use after source coordinate conversions.",
            "Road centerlines are schematic, may include private roads and multiple levels, and are not a pedestrian routing or access-permission graph.",
            "This is a bounded offline city display layer, not every feature from every map provider. The older GRS source is preserved independently.",
        ],
    }
    proof = {
        "ureten": "codex", "retrievedAt": now, "command": "python3 scripts/ingest-paris-surface.py",
        "scriptSha256": digest(Path(__file__).read_bytes()), "bodyBudgetBytes": BODY_BUDGET,
        "networkBodyBytes": fetcher.bytes, "timeoutSeconds": 30, "maxAttempts": 2, "concurrency": 1,
        "requestEvidence": fetcher.requests, "checks": {"sourceExportsMatchMetadataCounts": True, "uniqueFeatureIds": True, "finiteWgs84Positions": True, "withinParisDisplayBbox": True, "polygonRingMinimumSize": True, "offlineAssetBelow10MiB": True},
        "excludedGeometryRecords": excluded_records,
        "roadGroupSegmentMembership": [{"roadId": road_id, "level": level, "sourceSegmentIds": group["sourceSegments"]} for (road_id, level), group in road_groups.items()],
        "result": meta,
    }
    # Prepare all results before replacing public data; a failed acquisition leaves old files intact.
    write_atomic(PROOF, (json.dumps(proof, ensure_ascii=False, indent=2) + "\n").encode())
    write_atomic(CODE / "public/data/surface-paris.geojson", body)
    write_atomic(CODE / "public/data/surface-paris-meta.json", (json.dumps(meta, ensure_ascii=False, indent=2) + "\n").encode())
    print(json.dumps({"counts": counts, "bytes": len(body), "sha256": digest(body), "networkBodyBytes": fetcher.bytes, "excluded": dict(excluded)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
