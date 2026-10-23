#!/usr/bin/env python3
"""ureten: codex. Bounded IGN BD TOPO regional roads and Paris-priority buildings.

Two concurrent workers in one process; each layer is paginated sequentially and
sorted by the stable IGN cleabs identifier. Raw response bodies are retained in
private-data/v4-surface/. No basemap tiles, Google data, or invented heights.
The --reuse-cache mode verifies the prior exact request/body SHA before reuse.
Large derived datasets remain private JSONL inputs for root's vector tiler.
"""

from __future__ import annotations

import argparse
import collections
import concurrent.futures
import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys  # ureten: opus: used to run the metadata cleaner with the same interpreter
import threading
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


CODE = Path(__file__).resolve().parents[1]
PRIVATE = CODE / "private-data/v4-surface"
OUTPUTS = CODE.parent / "outputs/v4-kaynaklar"
WFS = "https://data.geopf.fr/wfs/ows"
CRS84 = "urn:ogc:def:crs:OGC:1.3:CRS84"
RAW_SOFT_LIMIT = 290_000_000
PUBLIC_FILE_LIMIT = 60_000_000
PAGE_SIZE = 5000
NS = {"wfs": "http://www.opengis.net/wfs/2.0", "fes": "http://www.opengis.net/fes/2.0", "gml": "http://www.opengis.net/gml/3.2"}
LICENSE_URL = "https://www.data.gouv.fr/pages/legal/licences/etalab-2.0"
LICENSE_EVIDENCE = "https://www.data.gouv.fr/datasets/bd-topo-r"
HEIGHT_FIELDS = {
    "hauteur": "heightM",
    "altitude_minimale_sol": "zMinSolM",
    "altitude_maximale_sol": "zMaxSolM",
    "altitude_minimale_toit": "zMinToitM",
    "altitude_maximale_toit": "zMaxToitM",
}


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def packed(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode()


def atomic(path, body):
    path.parent.mkdir(parents=True, exist_ok=True)
    part = path.with_suffix(path.suffix + ".part")
    part.write_bytes(body)
    os.replace(part, path)


def points(coords):
    if not coords:
        return
    if isinstance(coords[0], (int, float)):
        yield coords
    else:
        for child in coords:
            yield from points(child)


def extent(geometries):
    pts = [p for g in geometries for p in points(g["coordinates"])]
    return [min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)]


def transform_geometry(geometry):
    if not geometry or geometry.get("type") not in {"LineString", "MultiLineString", "Polygon", "MultiPolygon"}:
        raise ValueError("missing-or-unsupported-geometry")

    def line(coords, ring, precision):
        output = []
        for pt in coords:
            x, y = pt[:2]
            if not (isinstance(x, (int, float)) and isinstance(y, (int, float)) and math.isfinite(x) and math.isfinite(y) and -180 <= x <= 180 and -90 <= y <= 90):
                raise ValueError("invalid-WGS84-position")
            pt2 = [round(x, precision), round(y, precision)]
            if not output or output[-1] != pt2:
                output.append(pt2)
        if ring:
            if output and output[0] != output[-1]:
                output.append(output[0])
            if len(output) < 4 or len({tuple(p) for p in output[:-1]}) < 3:
                return None
        elif len(output) < 2:
            return None
        return output

    kind = geometry["type"]
    for precision in (6, 8):
        c = geometry["coordinates"]
        if kind == "LineString":
            result = line(c, False, precision)
        elif kind == "MultiLineString":
            result = [line(v, False, precision) for v in c]
            if any(v is None for v in result):
                result = None
        else:
            polys = [c] if kind == "Polygon" else c
            result = [[line(r, True, precision) for r in poly] for poly in polys]
            if not result or any(not p or any(r is None for r in p) for p in result):
                result = None
            elif kind == "Polygon":
                result = result[0]
        if result is not None:
            if kind == "MultiPolygon" and len(result) == 1:
                return {"type": "Polygon", "coordinates": result[0]}
            return {"type": kind, "coordinates": result}
    raise ValueError("degenerate-geometry")


class Acquisition:
    def __init__(self, reuse):
        self.reuse = reuse
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.bytes = sum(p.stat().st_size for p in PRIVATE.glob("*") if p.is_file() and p.suffix in (".xml", ".html", ".json"))
        self.initial_bytes = self.bytes
        self.requests = []
        self.raw_dir = PRIVATE / "raw-pages"
        self.raw_dir.mkdir(parents=True, exist_ok=True)

    def get(self, url, body=None):
        if urllib.parse.urlparse(url).scheme != "https" or urllib.parse.urlparse(url).hostname != "data.geopf.fr":
            raise ValueError("Unexpected WFS source host")
        request_id = sha(url.encode() + b"\0" + (body or b""))
        index_path = self.raw_dir / (request_id + ".index.json")
        if self.reuse and index_path.exists():
            entry = json.loads(index_path.read_text())
            raw = (self.raw_dir / (entry["sha256"] + ".body")).read_bytes()
            if sha(raw) != entry["sha256"]:
                raise ValueError("Cached WFS response checksum mismatch")
            with self.lock:
                self.requests.append({**entry, "reusedLocalCache": True})
            return raw
        if body is not None:
            request_body_path = self.raw_dir / (request_id + ".request.xml")
            if not request_body_path.exists():
                atomic(request_body_path, body)
        for attempt in range(1, 3):
            if self.stop.is_set():
                raise RuntimeError("Acquisition stopped")
            entry = {"url": url, "method": "POST" if body is not None else "GET", "requestId": request_id, "requestBodySha256": sha(body) if body else None, "attempt": attempt, "retrievedAt": now()}
            started = time.monotonic()
            try:
                headers = {"User-Agent": "ATLAS-IGN-regional-ingester/1.0"}
                if body is not None:
                    headers["Content-Type"] = "application/xml"
                req = urllib.request.Request(url, data=body, headers=headers)
                data = bytearray()
                with urllib.request.urlopen(req, timeout=40) as response:
                    if urllib.parse.urlparse(response.url).hostname != "data.geopf.fr":
                        raise ValueError("Unexpected redirect host")
                    while chunk := response.read(128 * 1024):
                        with self.lock:
                            self.bytes += len(chunk)
                            if self.bytes > RAW_SOFT_LIMIT:
                                self.stop.set()
                                raise ValueError("Raw acquisition budget exceeded; stop before 300 MB")
                        if self.stop.is_set():
                            raise RuntimeError("Acquisition stopped")
                        data.extend(chunk)
                        if len(data) > 32_000_000:
                            raise ValueError("Unexpectedly large single WFS response")
                    entry.update(status=response.status, contentType=response.headers.get("content-type"))
                entry.update(bytes=len(data), sha256=sha(data), seconds=round(time.monotonic() - started, 3))
                atomic(self.raw_dir / (entry["sha256"] + ".body"), data)
                atomic(index_path, packed(entry))
                with self.lock:
                    self.requests.append(entry)
                return bytes(data)
            except Exception as error:
                entry.update(error=f"{type(error).__name__}: {error}", seconds=round(time.monotonic() - started, 3))
                with self.lock:
                    self.requests.append(entry)
                if attempt == 2 or self.stop.is_set():
                    self.stop.set()
                    raise
                time.sleep(1)


def query(layer, bbox, *, count=None, start=None, hits=False, fields=None):
    params = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": "BDTOPO_V3:" + layer, "srsName": CRS84, "bbox": ",".join(map(str, bbox)) + "," + CRS84}
    if hits:
        params["resultType"] = "hits"
    else:
        params.update(outputFormat="application/json", count=count, startIndex=start, sortBy="cleabs A", propertyName=",".join(fields))
    return WFS + "?" + urllib.parse.urlencode(params)


def building_request(*, count=None, start=None, hits=False):
    doc = ET.fromstring((PRIVATE / "buildings-priority-filter.xml").read_bytes())
    doc.set("xmlns:BDTOPO_V3", "http://BDTOPO_V3")
    q = doc.find("{" + NS["wfs"] + "}Query")
    if hits:
        doc.set("resultType", "hits")
    else:
        doc.attrib.pop("resultType", None)
        doc.set("outputFormat", "application/json")
        doc.set("count", str(count))
        doc.set("startIndex", str(start))
        for i, field in enumerate(["cleabs", "geometrie", *HEIGHT_FIELDS]):
            element = ET.Element("{" + NS["wfs"] + "}PropertyName")
            element.text = field
            q.insert(i, element)
        sort = ET.SubElement(q, "{" + NS["fes"] + "}SortBy")
        prop = ET.SubElement(sort, "{" + NS["fes"] + "}SortProperty")
        ET.SubElement(prop, "{" + NS["fes"] + "}ValueReference").text = "cleabs"
        ET.SubElement(prop, "{" + NS["fes"] + "}SortOrder").text = "ASC"
    return ET.tostring(doc, encoding="utf-8", xml_declaration=True)


def ensure_source_and_filter(acq, grs_bbox):
    """Bootstrap the real boundary on a fresh checkout; protect the pinned edition."""
    capabilities_url = WFS + "?" + urllib.parse.urlencode({"service": "WFS", "version": "2.0.0", "request": "GetCapabilities", "namespace": "BDTOPO_V3", "sections": "FeatureTypeList"})
    doc = ET.fromstring(acq.get(capabilities_url))
    editions = {}
    for layer in doc.iter("{" + NS["wfs"] + "}FeatureType"):
        name = layer.findtext("{" + NS["wfs"] + "}Name")
        if name in ("BDTOPO_V3:batiment", "BDTOPO_V3:troncon_de_route"):
            abstract = layer.findtext("{" + NS["wfs"] + "}Abstract") or ""
            dates = re.findall(r"\d{4}-\d{2}-\d{2}", abstract)
            editions[name] = dates[-1] if dates else None
    if set(editions.values()) != {"2026-06-15"} or len(editions) != 2:
        raise ValueError(f"This ingester pins the verified June 2026 edition; reverify the new source before changing attribution: {editions}")
    target = PRIVATE / "buildings-priority-filter.xml"
    if target.exists():
        existing = ET.fromstring(target.read_bytes())
        lower = existing.find(".//{" + NS["gml"] + "}lowerCorner")
        upper = existing.find(".//{" + NS["gml"] + "}upperCorner")
        actual = [float(v) for v in (lower.text + " " + upper.text).split()]
        if any(abs(a - b) > 1e-10 for a, b in zip(actual, grs_bbox)):
            raise ValueError("Existing private filter belongs to another GRS envelope; preserve it and prepare a new verified phase")
        return
    params = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": "BDTOPO_V3:commune", "outputFormat": "application/json", "srsName": CRS84, "count": 1, "cql_filter": "code_insee='75056'"}
    raw = acq.get(WFS + "?" + urllib.parse.urlencode(params))
    boundary = json.loads(raw)
    if len(boundary.get("features", [])) != 1 or boundary["features"][0]["properties"].get("code_insee") != "75056":
        raise ValueError("IGN did not return the unique Paris commune boundary")
    atomic(PRIVATE / "paris-commune.bootstrap.json", raw)
    geom = boundary["features"][0]["geometry"]
    polygons = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]

    def sub(parent, prefix, tag, attrs=None, text=None):
        node = ET.SubElement(parent, "{" + NS[prefix] + "}" + tag, attrs or {})
        node.text = text
        return node

    root = ET.Element("{" + NS["wfs"] + "}GetFeature", {"service": "WFS", "version": "2.0.0", "resultType": "hits", "xmlns:BDTOPO_V3": "http://BDTOPO_V3"})
    query_node = sub(root, "wfs", "Query", {"typeNames": "BDTOPO_V3:batiment", "srsName": CRS84})
    filter_node = sub(query_node, "fes", "Filter")
    either = sub(filter_node, "fes", "Or")
    intersects = sub(either, "fes", "Intersects")
    sub(intersects, "fes", "ValueReference", text="geometrie")
    surfaces = sub(intersects, "gml", "MultiSurface", {"srsName": CRS84})
    for polygon in polygons:
        member = sub(surfaces, "gml", "surfaceMember")
        poly = sub(member, "gml", "Polygon")
        for index, ring in enumerate(polygon):
            outer = sub(poly, "gml", "exterior" if index == 0 else "interior")
            linear = sub(outer, "gml", "LinearRing")
            sub(linear, "gml", "posList", {"srsDimension": "2"}, " ".join(str(n) for pt in ring for n in pt[:2]))
    bbox_node = sub(either, "fes", "BBOX")
    sub(bbox_node, "fes", "ValueReference", text="geometrie")
    envelope = sub(bbox_node, "gml", "Envelope", {"srsName": CRS84})
    sub(envelope, "gml", "lowerCorner", text=f"{grs_bbox[0]} {grs_bbox[1]}")
    sub(envelope, "gml", "upperCorner", text=f"{grs_bbox[2]} {grs_bbox[3]}")
    atomic(target, ET.tostring(root, encoding="utf-8", xml_declaration=True))


def clean_measure(value, height=False):
    if value is None or isinstance(value, bool):
        return None
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(value) or value in (0, -1000) or (height and value <= 0):
        return None
    return int(value) if value.is_integer() else value


def ingest(layer, acq, bbox):
    if layer == "roads":
        hit_body = acq.get(query("troncon_de_route", bbox, hits=True))
    else:
        hit_body = acq.get(WFS, building_request(hits=True))
    expected = int(ET.fromstring(hit_body).attrib["numberMatched"])
    part = PRIVATE / (layer + ".jsonl.part")
    destination = PRIVATE / (layer + ".jsonl")
    seen, offset, output_count, page_count = set(), 0, 0, 0
    invalid, missing = [], collections.Counter()
    minimum = [math.inf, math.inf]
    maximum = [-math.inf, -math.inf]
    properties_minmax = {}
    pages = []
    with part.open("wb") as handle:
        while offset < expected:
            if page_count > 300:
                raise ValueError("Pagination request guard exceeded")
            if layer == "roads":
                raw = acq.get(query("troncon_de_route", bbox, count=PAGE_SIZE, start=offset, fields=["cleabs", "geometrie", "nature", "nom_voie_ban_gauche", "nom_voie_ban_droite"]))
            else:
                raw = acq.get(WFS, building_request(count=PAGE_SIZE, start=offset))
            page = json.loads(raw)
            matched = page.get("numberMatched", page.get("totalFeatures"))
            features = page.get("features", [])
            if matched != expected or not features:
                raise ValueError(f"{layer}: changing/truncated WFS result {matched}/{expected}, offset {offset}")
            if page.get("numberReturned", len(features)) != len(features):
                raise ValueError("WFS returned-count mismatch")
            pages.append({"offset": offset, "returned": len(features), "bodyBytes": len(raw), "bodySha256": sha(raw)})
            for source in features:
                original = source["properties"]
                identifier = original.get("cleabs")
                if not identifier or identifier in seen:
                    raise ValueError(f"Missing or duplicate stable IGN identifier: {identifier}")
                seen.add(identifier)
                try:
                    geom = transform_geometry(source.get("geometry"))
                except ValueError as error:
                    invalid.append({"id": identifier, "reason": str(error)})
                    continue
                if layer == "roads":
                    name = original.get("nom_voie_ban_gauche") or original.get("nom_voie_ban_droite")
                    if not name:
                        missing["name"] += 1
                    properties = {"kind": "road", "name": name or original.get("nature") or "Voie sans dénomination", "sourceId": "ign-surface-region", "nature": original.get("nature")}
                else:
                    properties = {"kind": "building", "sourceId": "ign-buildings-region"}
                    for original_field, output_field in HEIGHT_FIELDS.items():
                        value = clean_measure(original.get(original_field), height=original_field == "hauteur")
                        properties[output_field] = value
                        if value is None:
                            missing[output_field] += 1
                        else:
                            bounds = properties_minmax.setdefault(output_field, [value, value])
                            bounds[0], bounds[1] = min(bounds[0], value), max(bounds[1], value)
                for pt in points(geom["coordinates"]):
                    for axis in (0, 1):
                        minimum[axis] = min(minimum[axis], pt[axis])
                        maximum[axis] = max(maximum[axis], pt[axis])
                feature = {"type": "Feature", "id": "ign:" + identifier, "properties": properties, "geometry": geom}
                handle.write(packed(feature) + b"\n")
                output_count += 1
            offset += len(features)
            page_count += 1
            print(f"{layer}: {offset}/{expected}, output {output_count}, downloaded total {acq.bytes} B", flush=True)
    if offset != expected or len(seen) != expected:
        raise ValueError("Final source count does not match unique stable IDs")
    os.replace(part, destination)
    hasher = hashlib.sha256()
    with destination.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            hasher.update(chunk)
    return {"layer": layer, "sourceCount": expected, "featureCount": output_count, "invalidGeometryRecords": invalid, "missingValues": dict(missing), "measuredPropertyRanges": properties_minmax, "geometryBbox": minimum + maximum, "privateJsonl": str(destination), "bytes": destination.stat().st_size, "sha256": hasher.hexdigest(), "pages": pages}


def export_collection(result, public_name, shared):
    source = Path(result["privateJsonl"])
    # Keep the combined public GeoJSON export budget at 60 MB; JSONL always survives.
    if source.stat().st_size + 100_000 > shared["remainingPublicBytes"]:
        return None
    dest = CODE / "public/data" / public_name
    part = dest.with_suffix(dest.suffix + ".part")
    with part.open("wb") as target, source.open("rb") as origin:
        target.write(b'{"type":"FeatureCollection","ureten":"codex","features":[')
        first = True
        for line in origin:
            if not first:
                target.write(b",")
            target.write(line.rstrip())
            first = False
        target.write(b'],"attribution":"IGN BD TOPO V3 2026-06-15, Licence Ouverte Etalab 2.0"}\n')
    size = part.stat().st_size
    if size > shared["remainingPublicBytes"]:
        part.unlink()
        return None
    os.replace(part, dest)
    shared["remainingPublicBytes"] -= size
    digest = hashlib.sha256()
    with dest.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return {"url": "data/" + public_name, "bytes": size, "sha256": digest.hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reuse-cache", action="store_true")
    parser.add_argument("--tiles-only", action="store_true", help="Build and verify PMTiles from the completed private JSONL snapshots; no network requests")
    args = parser.parse_args()
    if args.tiles_only:
        build_tiles()
        return
    PRIVATE.mkdir(parents=True, exist_ok=True)
    OUTPUTS.mkdir(parents=True, exist_ok=True)
    igc = json.loads((CODE / "public/data/igc-index.geojson").read_text())
    bbox = extent(f["geometry"] for f in igc["features"])
    grs = [f["geometry"] for f in igc["features"] if f["properties"]["network"] == "GRS"]
    grs_bbox = extent(grs)
    acq = Acquisition(args.reuse_cache)
    ensure_source_and_filter(acq, grs_bbox)
    regional_buildings = int(ET.fromstring(acq.get(query("batiment", bbox, hits=True))).attrib["numberMatched"])
    results, errors = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        future_map = {pool.submit(ingest, layer, acq, bbox): layer for layer in ("roads", "buildings")}
        for future in concurrent.futures.as_completed(future_map):
            try:
                results.append(future.result())
            except Exception as error:
                acq.stop.set()
                errors.append({"layer": future_map[future], "error": f"{type(error).__name__}: {error}"})
    proof = {"ureten": "codex", "verifiedAt": now(), "command": "python3 scripts/ingest-regional-surface.py" + (" --reuse-cache" if args.reuse_cache else ""), "scriptSha256": sha(Path(__file__).read_bytes()), "concurrency": 2, "timeoutSeconds": 40, "maxAttempts": 2, "sourceResponseBodyBytesIncludingInitialProbes": acq.bytes, "initialProbeBytes": acq.initial_bytes, "rawSoftLimitBytes": RAW_SOFT_LIMIT, "igcFeatureCount": len(igc["features"]), "igcBbox": bbox, "grsSheetCount": len(grs), "grsSheetEnvelope": grs_bbox, "sourceEdition": "2026-06-15", "sourceRegionalBuildingCount": regional_buildings, "results": results, "errors": errors, "requests": acq.requests}
    if errors:
        atomic(OUTPUTS / ("SURFACE-INGEST-FAILED-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".json"), packed(proof))
        raise RuntimeError(json.dumps(errors, ensure_ascii=False))
    shared = {"remainingPublicBytes": PUBLIC_FILE_LIMIT}
    # Prefer the building GeoJSON if one compact export fits; road JSONL is for tiling.
    results.sort(key=lambda r: 0 if r["layer"] == "buildings" else 1)
    for result in results:
        is_building = result["layer"] == "buildings"
        filename = "buildings-region.geojson" if is_building else "surface-region.geojson"
        public = export_collection(result, filename, shared)
        meta = {
            "schema": 1, "ureten": "codex", "id": "ign-buildings-region" if is_building else "ign-surface-region", "verifiedAt": now(),
            "source": "IGN BD TOPO V3", "sourceUrl": "https://geoservices.ign.fr/bdtopo", "sourceEdition": "2026-06-15", "sourceSurveyDate": None,
            "sourceTypeName": "BDTOPO_V3:batiment" if is_building else "BDTOPO_V3:troncon_de_route", "license": "etalab-2.0", "licenseUrl": LICENSE_URL, "licenseEvidenceUrl": LICENSE_EVIDENCE,
            "attribution": "IGN BD TOPO V3 · édition 2026-06-15 · Licence Ouverte Etalab 2.0", "crs": "EPSG:4326", "igcBbox": bbox, "geometryBbox": result["geometryBbox"],
            "featureCount": result["featureCount"], "sourceCount": result["sourceCount"], "allSourceIdentifiersUnique": True, "allPagesCountMatched": True,
            "missingValues": result["missingValues"], "invalidGeometryCount": len(result["invalidGeometryRecords"]), "measuredPropertyRanges": result["measuredPropertyRanges"],
            "publicGeojson": public, "deliveryFormat": "geojson-and-private-jsonl" if public else "private-jsonl-for-vector-tiling",
            "heightSourceMapping": HEIGHT_FIELDS if is_building else None,
            "transformation": "XY rounded to 6 decimal degrees, 8 for tiny/degenerate shapes; neighboring duplicate points removed. Source vertex Z is discarded; building vertical attributes are preserved separately. No road/footprint simplification or invented heights.",
            "coverage": {"type": "Paris-commune-or-GRS-sheet-envelope", "communeCode": "75056", "grsSheetEnvelope": grs_bbox, "includesParisXIIIAndXVI": True, "sourceRegionalBuildingCount": regional_buildings, "sourceRegionalBuildingsNotAcquired": regional_buildings - result["sourceCount"], "entireIgcBboxBuildings": False} if is_building else {"type": "entire-IGC458-envelope", "queryBbox": bbox, "includesPathsAndPrivateRoads": True},
            "limitations": [
                "The source edition is 2026-06-15, not the date every object was surveyed. Retrieval/processing time is recorded separately.",
                "Building height 0 and unknown altitude sentinels 0/-1000 become null. Null height must not receive a random fallback extrusion.",
                "Ground/roof min/max properties are source measurements, not values synthesized from floor counts or height. Source vertex Z=-1000 is never terrain elevation.",
                "The building dataset is complete only for the declared Paris commune OR GRS-sheet-envelope spatial filter; the remainder of the large IGC envelope is not acquired in this phase." if is_building else "The road layer covers the full IGC envelope query, including public/private roads and paths; it does not establish access rights or provide a routing graph.",
                "This is measured-footprint/altitude data for a derived 2.5D display, not a textured roof mesh or photorealistic survey.",
            ],
        }
        name = "buildings-region-meta.json" if is_building else "surface-region-meta.json"
        atomic(CODE / "public/data" / name, json.dumps(meta, ensure_ascii=False, indent=2).encode() + b"\n")
        result["publicMetadata"] = "data/" + name
        result["publicGeojson"] = public
    proof["publicGeojsonBytes"] = PUBLIC_FILE_LIMIT - shared["remainingPublicBytes"]
    atomic(OUTPUTS / "SURFACE-INGEST-KANITI.json", json.dumps(proof, ensure_ascii=False, indent=2).encode() + b"\n")
    print(json.dumps({"results": [{k: r[k] for k in ("layer", "featureCount", "bytes", "sha256", "privateJsonl", "publicGeojson")} for r in results], "downloadedBodyBytesIncludingInitialProbes": acq.bytes}, ensure_ascii=False), flush=True)


def build_tiles():
    """Only measured IGN features; bounded two-thread local vector tiling."""
    binary = CODE / "private-data/tools/tippecanoe/tippecanoe"
    decoder = binary.with_name("tippecanoe-decode")
    if not binary.is_file() or not decoder.is_file():
        raise FileNotFoundError("Root-owned local tippecanoe and decoder binaries are required")
    source_proof = json.loads((OUTPUTS / "SURFACE-INGEST-KANITI.json").read_text())
    expected_ids, expected_heights, inputs = {}, {}, []
    for layer in ("roads", "buildings"):
        source = PRIVATE / (layer + ".jsonl")
        target = PRIVATE / (layer + ".tiles.jsonl")
        digest = hashlib.sha256()
        ids = set()
        with source.open("rb") as origin, target.open("wb") as dest:
            for ordinal, line in enumerate(origin, 1):
                digest.update(line)
                feature = json.loads(line)
                identifier = feature["id"].removeprefix("ign:")
                if identifier in ids:
                    raise ValueError("Duplicate tile-input sourceid")
                ids.add(identifier)
                feature["id"] = ordinal
                props = feature["properties"]
                props["sourceid"] = identifier
                props["type"] = "building" if layer == "buildings" else props.get("nature") or "road"
                if layer == "buildings":
                    expected_heights[identifier] = tuple(props.get(k) for k in HEIGHT_FIELDS.values())
                dest.write(packed(feature) + b"\n")
        source_result = next(r for r in source_proof["results"] if r["layer"] == layer)
        if digest.hexdigest() != source_result["sha256"] or len(ids) != source_result["featureCount"]:
            raise ValueError("Source JSONL no longer matches the sealed acquisition proof")
        expected_ids[layer] = ids
        inputs.append({"layer": layer, "path": str(target), "features": len(ids), "sourceSha256": digest.hexdigest()})
    build_path = PRIVATE / "region.build.pmtiles"
    log_path = OUTPUTS / "SURFACE-TILES-BUILD.log"
    command = [str(binary), "-o", str(build_path), "--force", "-Z9", "-z16", "--drop-densest-as-needed", "--extend-zooms-if-still-dropping", "--extend-zooms-if-still-dropping-maximum=1", "--simplify-only-low-zooms", "--no-tiny-polygon-reduction-at-maximum-zoom", "--full-detail=14", "--low-detail=12", "--name=Paris Catacomb Atlas – IGN regional surface", "--attribution=IGN BD TOPO V3, édition 2026-06-15, Licence Ouverte Etalab 2.0"]
    for item in inputs:
        command.extend(["-L", item["layer"] + ":" + item["path"]])
    env = os.environ.copy()
    env["TIPPECANOE_MAX_THREADS"] = "2"
    started = time.monotonic()
    peak_rss_kib = 0
    last_report = 0
    with log_path.open("wb") as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, env=env, start_new_session=True)
        while process.poll() is None:
            try:
                rss = subprocess.check_output(["ps", "-o", "rss=", "-p", str(process.pid)], text=True).strip()
                peak_rss_kib = max(peak_rss_kib, int(rss or "0"))
            except (subprocess.CalledProcessError, ValueError):
                pass
            elapsed = time.monotonic() - started
            if elapsed > 1200:
                import signal
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                raise TimeoutError("Local tiling exceeded 20 minute bound")
            if elapsed - last_report >= 20:
                print(f"tiles: {elapsed:.0f}s, sampled peak RSS {peak_rss_kib / 1024:.1f} MiB", flush=True)
                last_report = elapsed
            time.sleep(1)
        if process.returncode:
            raise RuntimeError(f"tippecanoe failed with {process.returncode}; see {log_path}")
    size = build_path.stat().st_size
    if size >= 80_000_000:
        raise ValueError(f"PMTiles exceeds 80 MB notification gate: {size}; retained privately")
    header = build_path.read_bytes()[:127]
    if header[:8] != b"PMTiles\x03":
        raise ValueError("Invalid PMTiles v3 header")
    minzoom, maxzoom = header[100], header[101]
    if minzoom != 9 or maxzoom not in (16, 17):
        raise ValueError(f"Unexpected tile zoom range: {minzoom}-{maxzoom}")
    decode_command = [str(decoder), "-c", "-I", "-Z" + str(maxzoom), "-z" + str(maxzoom), "-y", "sourceid"]
    for prop in HEIGHT_FIELDS.values():
        decode_command.extend(["-y", prop])
    decode_command.append(str(build_path))
    found = {"roads": set(), "buildings": set()}
    decoded_instances = collections.Counter()
    mismatch, unknown_ids = [], []
    decode_log = OUTPUTS / "SURFACE-TILES-DECODE.log"
    with decode_log.open("wb") as stderr:
        proc = subprocess.Popen(decode_command, stdout=subprocess.PIPE, stderr=stderr, text=True, env=env)
        for line in proc.stdout:
            if not line.strip():
                continue
            feature = json.loads(line)
            identifier = feature.get("properties", {}).get("sourceid")
            layer = feature.get("tippecanoe", {}).get("layer")
            if layer not in found:
                layer = "buildings" if identifier and identifier.startswith("BATIMENT") else "roads"
            decoded_instances[layer] += 1
            if identifier not in expected_ids[layer]:
                unknown_ids.append({"layer": layer, "sourceid": identifier})
                continue
            found[layer].add(identifier)
            if layer == "buildings":
                actual = tuple(feature["properties"].get(k) for k in HEIGHT_FIELDS.values())
                if actual != expected_heights[identifier]:
                    mismatch.append({"sourceid": identifier, "expected": expected_heights[identifier], "actual": actual})
        if proc.wait():
            raise RuntimeError("PMTiles decoding failed; see decode log")
    missing = {layer: sorted(expected_ids[layer] - found[layer]) for layer in found}
    verification = {"maxzoom": maxzoom, "expectedUniqueSourceids": {k: len(v) for k, v in expected_ids.items()}, "decodedUniqueSourceids": {k: len(v) for k, v in found.items()}, "decodedFeatureInstancesIncludingTileBoundaryDuplicates": dict(decoded_instances), "missingSourceids": missing, "unknownSourceids": unknown_ids, "heightAttributeMismatches": mismatch, "allSourceFeaturesPreservedAtMaximumZoom": not any(missing.values()) and not unknown_ids, "sourceHeightsUnchanged": not mismatch}
    audit = {"ureten": "codex", "verifiedAt": now(), "command": command, "environment": {"TIPPECANOE_MAX_THREADS": "2"}, "scriptSha256": sha(Path(__file__).read_bytes()), "acquisitionScriptSnapshot": str(PRIVATE / "ingest-regional-surface-acquisition-v1.py"), "inputs": inputs, "seconds": round(time.monotonic() - started, 2), "sampledPeakRssKiB": peak_rss_kib, "privateBuildBytes": size, "decodeCommand": decode_command, "verification": verification, "publicPublished": False, "limitations": ["Lower zooms are generalized and may omit dense features; maximum zoom sourceid preservation is explicitly decoded and measured.", "MVT has no null property type: source null measurements are absent in tile properties, and must remain unknown in the renderer.", "Geometric footprints plus source altitudes support a derived 2.5D extrusion, not photorealistic roof geometry.", "Roads cover the full IGC458 envelope, buildings only the declared Paris commune OR GRS sheet envelope."]}
    atomic(OUTPUTS / "SURFACE-TILES-VERIFICATION.json", json.dumps(audit, ensure_ascii=False, indent=2).encode() + b"\n")
    if not verification["allSourceFeaturesPreservedAtMaximumZoom"] or mismatch:
        raise ValueError("High-zoom preservation/height validation failed; PMTiles remains private")
    public_path = CODE / "public/data/region.pmtiles"
    shutil.copyfile(build_path, public_path.with_suffix(".pmtiles.part"))
    os.replace(public_path.with_suffix(".pmtiles.part"), public_path)
    # ureten: opus: tippecanoe writes absolute build paths into metadata.generator_options; strip them
    # (metadata only, tiles and directories stay byte-identical) before the public file is hashed.
    subprocess.run([sys.executable, "-I", str(CODE / "scripts/clean-pmtiles-metadata.py"), str(public_path)], check=True)
    size = public_path.stat().st_size
    digest = hashlib.sha256()
    with public_path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    metadata = {"schema": 1, "ureten": "codex", "id": "ign-region-tiles", "url": "data/region.pmtiles", "format": "pmtiles-v3-mvt", "bytes": size, "sha256": digest.hexdigest(), "minzoom": minzoom, "maxzoom": maxzoom, "verifiedAt": now(), "layers": ["roads", "buildings"], "sourceEdition": "2026-06-15", "sourceUrl": "https://geoservices.ign.fr/bdtopo", "license": "etalab-2.0", "licenseUrl": LICENSE_URL, "attribution": "IGN BD TOPO V3 · édition 2026-06-15 · Licence Ouverte Etalab 2.0", "sourceMetadata": ["data/surface-region-meta.json", "data/buildings-region-meta.json"], "verification": {k: verification[k] for k in ["expectedUniqueSourceids", "decodedUniqueSourceids", "allSourceFeaturesPreservedAtMaximumZoom", "sourceHeightsUnchanged"]}, "igcBbox": source_proof["igcBbox"], "heightProperties": list(HEIGHT_FIELDS.values()), "nullSemantics": "Source unknown 0/-1000/nonfinite measurements remain unknown; null properties are omitted in MVT and must never receive invented height defaults.", "municipalCompanion": {"metadata": "data/surface-paris-meta.json", "license": "ODbL-1.0", "includedInThisArchive": False}, "limitations": audit["limitations"]}
    atomic(CODE / "public/data/region-tiles-meta.json", json.dumps(metadata, ensure_ascii=False, indent=2).encode() + b"\n")
    atomic(OUTPUTS / "SURFACE-TILES-DELIVERY.json", json.dumps({"ureten": "codex", "verifiedAt": now(), "publicPath": str(public_path), "metadata": metadata, "localPublicDirectoryWriteOnly": True, "remotePublicationPerformed": False}, ensure_ascii=False, indent=2).encode() + b"\n")
    print(json.dumps({"bytes": size, "sha256": digest.hexdigest(), "zoomRange": [minzoom, maxzoom], "verification": verification}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
