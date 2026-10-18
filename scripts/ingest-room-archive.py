#!/usr/bin/env python3
"""ureten: codex — inventory and private personal copies of public room assets.

The supplied site bundle is parsed as text, never executed. No public or Git
asset copies are created. Copyright/license metadata is evidence, not a grant.
Only preview models and posters are downloaded; originals receive HEAD only.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import socket
import struct
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

CODE = Path(__file__).resolve().parents[1]
PROJECT = CODE.parent
BUNDLE = PROJECT / "outputs/arastirma-tek-harita/3760b09340046ac8.js"
ARCHIVE = CODE / "private-data/room-archive"
EVIDENCE = PROJECT / "outputs/arastirma-tek-harita/ROOM-ARCHIVE-KANITI.json"
ASSET_ORIGIN = "https://assets.catacombes.xyz"
BUDGET_BYTES = 350_000_000
TIMEOUT = 30
MAX_ATTEMPTS = 3
HEADERS = {"User-Agent": "ATLAS-Private-Room-Archive/1.0", "Accept-Encoding": "identity"}
RIGHTS = "unverified-personal-copy"
SELECTED_HEADERS = ("content-length", "content-type", "etag", "last-modified",
                    "access-control-allow-origin", "content-encoding")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def valid_url(url):
    p = urlsplit(url)
    require(p.scheme == "https" and p.hostname == "assets.catacombes.xyz"
            and p.port in (None, 443) and not p.username and not p.password
            and p.path.startswith("/assets/models/") and not p.query and not p.fragment,
            "Asset URL is outside the source asset host/path")
    require(".." not in p.path.split("/") and "\\" not in p.path, "Invalid asset path")
    return url


def parse_bundle(path):
    source = path.read_text(encoding="utf-8")
    require('s="https://assets.catacombes.xyz"' in source, "Unexpected bundle asset origin")
    blocks = re.split(r'(?=\{slug:")', source)[1:]

    def field(block, key):
        match = re.search(r'\b' + key + r':("(?:\\.|[^"\\])*"|`[^`]*`)', block)
        require(match, f"Missing bundle field: {key}")
        value = match.group(1)
        if value.startswith('"'):
            return json.loads(value)
        require("${" not in value.replace("${s}", ""), "Unexpected JS interpolation")
        return value[1:-1].replace("${s}", ASSET_ORIGIN)

    rooms = []
    for block in blocks:
        room = {key: field(block, key) for key in
                ("slug", "name", "title", "modelUrl", "previewModelUrl", "posterImage")}
        require(re.fullmatch(r"[A-Za-z0-9_-]{1,80}", room["slug"]), "Unsafe room slug")
        rooms.append(room)
    require(len(rooms) == 46 and len({r["slug"] for r in rooms}) == 46,
            "Expected 46 unique room records; source changed")
    return rooms


def head(url, *, timeout=20, max_attempts=2):
    attempts = []
    try:
        valid_url(url)
    except (ValueError, TypeError) as error:
        return {"url": url, "ok": False, "error": str(error), "attempts": []}
    for attempt in range(1, max_attempts + 1):
        started = time.monotonic()
        try:
            with urlopen(Request(url, method="HEAD", headers=HEADERS), timeout=timeout) as r:
                valid_url(r.geturl())
                headers = {key: r.headers.get(key) for key in SELECTED_HEADERS
                           if r.headers.get(key) is not None}
                length = headers.get("content-length")
                size = int(length) if length and length.isdigit() else None
                require(size is None or size > 0, "Empty remote asset")
                attempts.append({"attempt": attempt, "status": r.status,
                                 "seconds": round(time.monotonic() - started, 3)})
                return {"url": url, "finalUrl": r.geturl(), "ok": r.status == 200,
                        "bytes": size, "headers": headers, "checkedAt": now(),
                        "attempts": attempts}
        except (OSError, ValueError, HTTPError, URLError) as error:
            status = error.code if isinstance(error, HTTPError) else None
            attempts.append({"attempt": attempt, "status": status, "error": str(error),
                             "seconds": round(time.monotonic() - started, 3)})
            if status is not None and status < 500 and status != 429:
                break
            if attempt < max_attempts:
                time.sleep(attempt)
    return {"url": url, "ok": False, "checkedAt": now(), "attempts": attempts,
            "error": attempts[-1]["error"]}


def preview_candidates(room):
    initial = room["previewModelUrl"]
    candidates = [initial]
    # This suffix was independently observed on the source site, not inferred as
    # a working URL. Every candidate still needs its own successful HEAD/GET.
    if initial.endswith("_opt.glb"):
        candidates.append(initial[:-8] + "_opt2MB.glb")
    return list(dict.fromkeys(candidates))


def image_candidates(room):
    initial = room["posterImage"]
    candidates = [initial]
    # Preserve the malformed literal and independently probe the same-host fix.
    if initial.startswith(ASSET_ORIGIN + "assets/"):
        candidates.append(ASSET_ORIGIN + "/" + initial[len(ASSET_ORIGIN):])
    # A catalogue poster.webp can be missing while the source's normal
    # model-stem.webp asset exists. This remains a candidate until HEAD succeeds.
    candidates.append(room["modelUrl"].rsplit(".", 1)[0] + ".webp")
    return list(dict.fromkeys(candidates))


def inventory_item(room, role):
    candidates = preview_candidates(room) if role == "preview" else image_candidates(room)
    probes = []
    for url in candidates:
        result = head(url)
        probes.append(result)
        if result["ok"]:
            break
    selected = next((p for p in probes if p["ok"]), None)
    return {
        "id": f"xyz:{room['slug']}:{role}", "slug": room["slug"],
        "name": room["name"], "title": room["title"],
        "role": role, "kind": "glb" if role == "preview" else "image",
        "sourceUrl": room["previewModelUrl"] if role == "preview" else room["posterImage"],
        "url": selected["url"] if selected else None,
        "path": None, "sha256": None, "bytes": selected.get("bytes") if selected else None,
        "rights": RIGHTS, "status": "inventoried" if selected else "unavailable",
        "head": selected, "probes": probes,
        "fallbackUsed": bool(selected and selected["url"] != candidates[0]),
        "sharedOriginalAndPreviewUrl": role == "preview" and bool(selected)
            and selected["url"] == room["modelUrl"],
    }


def inventory_original(room):
    return {"slug": room["slug"], "name": room["name"], "url": room["modelUrl"],
            "role": "original-head-only", "downloadedAsOriginal": False,
            "metadataInspected": False, "head": head(room["modelUrl"], timeout=10, max_attempts=1)}


def metadata_notices(doc):
    result = []

    def walk(value, path=""):
        if isinstance(value, dict):
            for key, child in value.items():
                child_path = f"{path}.{key}" if path else key
                if key.lower() in {"copyright", "rights"} or any(
                        marker in key.lower() for marker in ("license", "licence")):
                    result.append({"path": child_path, "value": child})
                if isinstance(child, (dict, list)):
                    walk(child, child_path)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                walk(child, f"{path}[{index}]")
    walk(doc)
    return result


def inspect_glb(path):
    size = path.stat().st_size
    with path.open("rb") as f:
        header = f.read(12)
        require(len(header) == 12, "Truncated GLB header")
        magic, version, declared = struct.unpack("<III", header)
        require(magic == 0x46546C67 and version == 2 and declared == size,
                "Invalid GLB 2.0 header or file length")
        chunks, doc, cursor, bin_length = [], None, 12, None
        while cursor < size:
            require(cursor + 8 <= size, "Truncated GLB chunk header")
            f.seek(cursor)
            length, kind = struct.unpack("<II", f.read(8))
            require(length % 4 == 0 and cursor + 8 + length <= size, "Invalid GLB chunk bounds")
            chunks.append({"offset": cursor, "bytes": length, "type": hex(kind)})
            if len(chunks) == 1:
                require(kind == 0x4E4F534A and length <= 16 * 1024 * 1024,
                        "First GLB chunk must be bounded JSON")
                doc = json.loads(f.read(length).decode("utf-8").rstrip(" \x00"))
            elif kind == 0x004E4942:
                require(bin_length is None, "Duplicate BIN chunk")
                bin_length = length
            cursor += 8 + length
    require(isinstance(doc, dict) and doc.get("asset", {}).get("version") == "2.0",
            "Missing glTF 2.0 asset metadata")
    dependencies = []
    for section in ("buffers", "images"):
        for index, row in enumerate(doc.get(section, [])):
            uri = row.get("uri")
            if uri and not uri.startswith("data:"):
                dependencies.append({"path": f"{section}[{index}].uri", "uri": uri})
            if section == "buffers" and not uri:
                require(index == 0 and bin_length is not None
                        and isinstance(row.get("byteLength"), int)
                        and 0 <= bin_length - row["byteLength"] <= 3,
                        "Internal buffer is missing or differs from BIN chunk size")
    return {"containerValid": True, "chunks": chunks, "asset": doc["asset"],
            "copyrightLicenseMetadata": metadata_notices(doc),
            "externalDependencies": dependencies, "selfContainedResources": not dependencies,
            "extensionsUsed": doc.get("extensionsUsed", []),
            "extensionsRequired": doc.get("extensionsRequired", []),
            "meshCount": len(doc.get("meshes", [])), "nodeCount": len(doc.get("nodes", [])),
            "bufferCount": len(doc.get("buffers", [])), "imageCount": len(doc.get("images", [])),
            "validationScope": "Container/chunks/resource dependency inspection; not a renderer or complete glTF schema test"}


def inspect_image(path):
    with path.open("rb") as f:
        prefix = f.read(16)
    image_type = ("webp" if prefix[:4] == b"RIFF" and prefix[8:12] == b"WEBP" else
                  "png" if prefix.startswith(b"\x89PNG\r\n\x1a\n") else
                  "jpeg" if prefix.startswith(b"\xff\xd8\xff") else None)
    require(image_type, "Downloaded poster is not a recognized WebP/PNG/JPEG")
    return {"recognizedContainer": image_type}


def download(item):
    require(item["url"] and item["bytes"] and item["bytes"] <= BUDGET_BYTES,
            "Download requires a known, bounded HEAD size")
    valid_url(item["url"])
    suffix = ".glb" if item["kind"] == "glb" else Path(urlsplit(item["url"]).path).suffix.lower()
    require(suffix in {".glb", ".webp", ".png", ".jpg", ".jpeg"}, "Unsafe archive suffix")
    relative = f"{item['slug']}/{item['role']}{suffix}"
    destination = ARCHIVE / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + ".part")
    attempts = []
    for attempt in range(1, MAX_ATTEMPTS + 1):
        started = time.monotonic()
        try:
            with urlopen(Request(item["url"], headers=HEADERS), timeout=TIMEOUT) as response:
                valid_url(response.geturl())
                require(response.status == 200, f"Unexpected GET status: {response.status}")
                response_length = response.headers.get("Content-Length")
                require(response_length is None or int(response_length) == item["bytes"],
                        "Remote asset length changed after inventory")
                hasher, count = hashlib.sha256(), 0
                deadline = started + TIMEOUT
                with partial.open("wb") as output:
                    while True:
                        remaining = deadline - time.monotonic()
                        if remaining <= 0:
                            raise TimeoutError("Asset exceeded the 30-second request deadline")
                        # urllib's timeout covers stalled reads; use the remaining
                        # budget for each socket read when the socket is available.
                        try:
                            response.fp.raw._sock.settimeout(remaining)
                        except (AttributeError, OSError):
                            pass
                        chunk = response.read(64 * 1024)
                        if not chunk:
                            break
                        count += len(chunk)
                        require(count <= item["bytes"], "Response exceeds inventoried size")
                        hasher.update(chunk)
                        output.write(chunk)
                require(count == item["bytes"], "Incomplete download")
                inspected = inspect_glb(partial) if item["kind"] == "glb" else inspect_image(partial)
                partial.replace(destination)
                attempts.append({"attempt": attempt, "status": response.status,
                                 "seconds": round(time.monotonic() - started, 3)})
                return {**item, "path": relative, "sha256": hasher.hexdigest(),
                        "downloadedAt": now(), "status": "downloaded-private",
                        "getFinalUrl": response.geturl(), "getAttempts": attempts,
                        "inspection": inspected}
        except (OSError, ValueError, HTTPError, URLError, json.JSONDecodeError) as error:
            partial.unlink(missing_ok=True)
            status = error.code if isinstance(error, HTTPError) else None
            attempts.append({"attempt": attempt, "status": status, "error": str(error),
                             "seconds": round(time.monotonic() - started, 3)})
            retryable = isinstance(error, (OSError, URLError)) and not isinstance(error, HTTPError)
            retryable |= status is not None and (status >= 500 or status == 429)
            if not retryable or attempt == MAX_ATTEMPTS:
                break
            time.sleep(attempt)
    return {**item, "status": "download-failed", "getAttempts": attempts,
            "error": attempts[-1]["error"]}


def persist(manifest, evidence):
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    manifest_path = ARCHIVE / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    evidence["manifest"] = {"path": str(manifest_path.relative_to(PROJECT)),
                            "sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest()}
    evidence["updatedAt"] = now()
    evidence["sourceScript"] = {"path": str(Path(__file__).resolve().relative_to(PROJECT)),
                                "sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    EVIDENCE.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory-only", action="store_true")
    args = parser.parse_args()
    started = time.monotonic()
    started_at = now()
    rooms = parse_bundle(BUNDLE)
    assets, originals = [], []
    jobs = [(room, role) for room in rooms for role in ("preview", "poster")]
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(inventory_item, room, role): role
                   for room, role in jobs}
        for index, future in enumerate(as_completed(futures), 1):
            result = future.result()
            assets.append(result)
            if index % 15 == 0 or index == len(jobs):
                print(json.dumps({"phase": "HEAD", "done": index, "total": len(jobs)}), flush=True)
    assets.sort(key=lambda a: a["id"])
    known = [a for a in assets if a["url"] and a["bytes"] is not None]
    unknown = [a["id"] for a in assets if a["url"] and a["bytes"] is None]
    total = sum(a["bytes"] for a in known)
    manifest = {"schema": 1, "ureten": "codex", "createdAt": now(),
                "sourceUrl": "https://catacombes.xyz/", "rights": RIGHTS,
                "publicRedistributionApproved": False,
                "pathBase": str(ARCHIVE.relative_to(PROJECT)), "roomCount": len(rooms),
                "assets": assets, "originalsHeadOnly": originals,
                "limits": ["This is a personal private archive, not a redistribution license.",
                           "Room anchors do not establish common 3D orientation, scale or a tunnel network.",
                           "Originals are HEAD-only, except a source URL explicitly also labelled preview."]}
    evidence = {"ureten": "codex", "executionStartedAt": started_at,
                "inventoryCompletedAt": now(), "command": ["python3", *sys_argv()],
                "bundle": {"path": str(BUNDLE.relative_to(PROJECT)),
                           "sha256": hashlib.sha256(BUNDLE.read_bytes()).hexdigest()},
                "limits": {"maxConcurrency": 3, "requestTimeoutSeconds": TIMEOUT,
                           "maxAttempts": MAX_ATTEMPTS, "budgetBytes": BUDGET_BYTES,
                           "previewPosterHeadTimeoutSeconds": 20, "previewPosterHeadMaxAttempts": 2,
                           "originalHeadTimeoutSeconds": 10, "originalHeadMaxAttempts": 1},
                "inventory": {"rooms": len(rooms), "assets": len(assets),
                              "knownSizedAssets": len(known), "knownPreviewPosterBytes": total,
                              "unknownSizeIds": unknown,
                              "unavailableIds": [a["id"] for a in assets if not a["url"]],
                              "fallbackIds": [a["id"] for a in assets if a["fallbackUsed"]],
                              "originalHeadPending": len(rooms)},
                "phase": "inventory-complete", "downloadedOriginals": 0}
    persist(manifest, evidence)
    print(json.dumps({"phase": "inventory-complete", **evidence["inventory"]}), flush=True)
    allow_download = not args.inventory_only and not unknown and total <= BUDGET_BYTES
    result_by_id = {a["id"]: a for a in assets}
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(download, item): "download" for item in known} if allow_download else {}
        futures.update({pool.submit(inventory_original, room): "original" for room in rooms})
        for index, future in enumerate(as_completed(futures), 1):
            result = future.result()
            if futures[future] == "download":
                result_by_id[result["id"]] = result
                print(json.dumps({"phase": "GET", "done": index, "total": len(futures),
                                  "id": result["id"], "status": result["status"],
                                  "bytes": result["bytes"]}), flush=True)
            else:
                originals.append(result)
                if len(originals) % 10 == 0 or len(originals) == len(rooms):
                    print(json.dumps({"phase": "original-HEAD", "done": len(originals),
                                      "total": len(rooms)}), flush=True)
            if index % 10 == 0:
                manifest["assets"] = sorted(result_by_id.values(), key=lambda a: a["id"])
                manifest["originalsHeadOnly"] = sorted(originals, key=lambda a: a["slug"])
                evidence["phase"] = "downloading"
                persist(manifest, evidence)
    manifest["assets"] = sorted(result_by_id.values(), key=lambda a: a["id"])
    downloaded = [a for a in manifest["assets"] if a["status"] == "downloaded-private"]
    manifest["originalsHeadOnly"] = sorted(originals, key=lambda a: a["slug"])
    evidence["inventory"].update({"originalHeadPending": 0,
        "originalHeadSuccess": sum(o["head"]["ok"] for o in originals),
        "knownOriginalBytes": sum(o["head"].get("bytes") or 0 for o in originals)})
    evidence["phase"] = ("archive-complete-with-inventory" if allow_download else
                         "inventory-only" if args.inventory_only else "budget-or-size-blocked")
    evidence["result"] = {"downloadedAssets": len(downloaded),
                          "downloadedModels": sum(a["kind"] == "glb" for a in downloaded),
                          "downloadedPosters": sum(a["kind"] == "image" for a in downloaded),
                          "downloadedBytes": sum(a["bytes"] for a in downloaded),
                          "failedIds": [a["id"] for a in manifest["assets"] if a["status"] == "download-failed"],
                          "unavailableIds": evidence["inventory"]["unavailableIds"],
                          "modelsWithExternalDependencies": [a["id"] for a in downloaded if a["kind"] == "glb" and a["inspection"]["externalDependencies"]],
                          "modelsWithCopyrightLicenseMetadata": [a["id"] for a in downloaded if a["kind"] == "glb" and a["inspection"]["copyrightLicenseMetadata"]],
                          "seconds": round(time.monotonic() - started, 3)}
    persist(manifest, evidence)
    print(json.dumps({"phase": evidence["phase"], **evidence["result"]}), flush=True)


def sys_argv():
    import sys
    return sys.argv


if __name__ == "__main__":
    main()
