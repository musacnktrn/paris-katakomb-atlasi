#!/usr/bin/env python3
"""ureten: codex — private originals, separate from the sealed preview archive.

Consumes the already measured original HEAD inventory. At most three GETs run
at once, each with a 60-second deadline and one retry. Files are staged, hashed,
inspected, and atomically renamed. Existing verified originals are reusable.
No public assets, Git operations or changes to preview evidence are performed.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

sys.dont_write_bytecode = True
CODE = Path(__file__).resolve().parents[1]
PROJECT = CODE.parent
PREVIEW = CODE / "private-data/room-archive"
SOURCE_MANIFEST = PREVIEW / "manifest.json"
TARGET = CODE / "private-data/room-originals"
MANIFEST = TARGET / "manifest.json"
EVIDENCE = PROJECT / "outputs/arastirma-tek-harita/ROOM-ORIGINALS-KANITI.json"
HELPER_PATH = Path(__file__).with_name("ingest-room-archive.py")
spec = importlib.util.spec_from_file_location("room_archive_inspection", HELPER_PATH)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
BUDGET_BYTES = 1_400_000_000
MIN_FREE_BYTES = 8 * 1024 ** 3
TIMEOUT = 60
MAX_ATTEMPTS = 2
RIGHTS = "unverified-personal-copy"
RANGE_FAILED = False
RANGE_BYTES = 4 * 1024 * 1024


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def hash_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as file:
        while chunk := file.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    staged = path.with_suffix(path.suffix + ".tmp")
    staged.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    staged.replace(path)


def transfer_ranges(item, previous):
    """A distinct recovery strategy: bounded 206 requests, never a third full GET."""
    destination = TARGET / item["plannedPath"]
    staged = destination.with_suffix(".glb.part")
    checks, digest = [], hashlib.sha256()
    source_modified = item["head"].get("headers", {}).get("last-modified")
    source_etag = item["head"].get("headers", {}).get("etag")
    try:
        with staged.open("wb") as output:
            for start in range(0, item["bytes"], RANGE_BYTES):
                end = min(item["bytes"] - 1, start + RANGE_BYTES - 1)
                expected, checkpoint, success = end - start + 1, digest.copy(), False
                for attempt in range(1, MAX_ATTEMPTS + 1):
                    output.seek(start)
                    output.truncate(start)
                    digest = checkpoint.copy()
                    started = time.monotonic()
                    try:
                        headers = {**helper.HEADERS, "Range": f"bytes={start}-{end}"}
                        if source_etag:
                            headers["If-Match"] = source_etag
                        elif source_modified:
                            headers["If-Unmodified-Since"] = source_modified
                        with urlopen(Request(item["url"], headers=headers), timeout=TIMEOUT) as response:
                            helper.valid_url(response.geturl())
                            helper.require(response.status == 206, "Source did not honor the bounded Range request")
                            helper.require(response.headers.get("Content-Range")
                                           == f"bytes {start}-{end}/{item['bytes']}",
                                           "Content-Range differs from requested bounds/known original size")
                            if source_modified:
                                helper.require(response.headers.get("Last-Modified") == source_modified,
                                               "Source Last-Modified changed between HEAD and Range")
                            if source_etag:
                                helper.require(response.headers.get("ETag") == source_etag,
                                               "Source ETag changed between HEAD and Range")
                            count, deadline = 0, started + TIMEOUT
                            while True:
                                remaining = deadline - time.monotonic()
                                if remaining <= 0:
                                    raise TimeoutError("Range exceeded the 60-second request deadline")
                                try:
                                    response.fp.raw._sock.settimeout(remaining)
                                except (AttributeError, OSError):
                                    pass
                                chunk = response.read(128 * 1024)
                                if not chunk:
                                    break
                                count += len(chunk)
                                helper.require(count <= expected, "Range response exceeded bounded size")
                                output.write(chunk)
                                digest.update(chunk)
                            helper.require(count == expected, "Truncated Range response")
                            checks.append({"start": start, "end": end, "attempt": attempt,
                                           "status": 206, "bytes": count,
                                           "contentRange": response.headers.get("Content-Range"),
                                           "seconds": round(time.monotonic() - started, 3)})
                        success = True
                        break
                    except (OSError, ValueError, HTTPError, URLError) as error:
                        status = error.code if isinstance(error, HTTPError) else None
                        checks.append({"start": start, "end": end, "attempt": attempt,
                                       "status": status, "error": str(error),
                                       "seconds": round(time.monotonic() - started, 3)})
                        retryable = isinstance(error, (OSError, URLError)) and not isinstance(error, HTTPError)
                        retryable |= status is not None and (status >= 500 or status == 429)
                        if not retryable or attempt == MAX_ATTEMPTS:
                            raise
                        time.sleep(1)
                helper.require(success, "Range attempts exhausted")
        helper.require(staged.stat().st_size == item["bytes"], "Recovered original size mismatch")
        inspected = helper.inspect_glb(staged)
        staged.replace(destination)
        return {**item, "status": "archived-private", "path": item["plannedPath"],
                "sha256": digest.hexdigest(), "inspection": inspected,
                "method": "bounded-HTTP-Range-recovery", "rangeRequests": checks,
                "previousFailedFullGet": previous, "completedAt": now()}
    except (OSError, ValueError, HTTPError, URLError) as error:
        staged.unlink(missing_ok=True)
        return {**item, "status": "failed", "path": None, "sha256": None,
                "method": "bounded-HTTP-Range-recovery", "rangeRequests": checks,
                "previousFailedFullGet": previous, "error": str(error)}


def transfer(item, preview_matches, previous):
    destination = TARGET / item["plannedPath"]
    destination.parent.mkdir(parents=True, exist_ok=True)
    staged = destination.with_suffix(".glb.part")
    initial = time.monotonic()
    previous_item = previous.get(item["id"])
    if previous_item and previous_item.get("sha256") and destination.exists():
        if destination.stat().st_size == item["bytes"] and hash_file(destination) == previous_item["sha256"]:
            return {**previous_item, **item, "status": "archived-private", "path": item["plannedPath"],
                    "sha256": previous_item["sha256"], "inspection": helper.inspect_glb(destination),
                    "method": previous_item.get("method", "reused-verified-original"),
                    "reuseVerifications": [*previous_item.get("reuseVerifications", []), {"executedAt": now(),
                                           "sha256AndBytesRechecked": True}]}
    if RANGE_FAILED and previous_item and previous_item.get("status") == "failed":
        return transfer_ranges(item, previous_item)
    shared = preview_matches.get(item["url"])
    if shared:
        source = PREVIEW / shared["path"]
        helper.require(source.stat().st_size == item["bytes"] == shared["bytes"]
                       and hash_file(source) == shared["sha256"],
                       "Shared preview/original source failed SHA/size verification")
        shutil.copyfile(source, staged)
        helper.require(staged.stat().st_size == item["bytes"]
                       and hash_file(staged) == shared["sha256"], "Verified copy changed")
        inspected = helper.inspect_glb(staged)
        staged.replace(destination)
        return {**item, "status": "archived-private", "path": item["plannedPath"],
                "sha256": shared["sha256"], "inspection": inspected,
                "method": "verified-copy-of-identical-preview-original-url",
                "copySource": str(source.relative_to(PROJECT)), "completedAt": now(),
                "seconds": round(time.monotonic() - initial, 3)}
    attempts = []
    for attempt in range(1, MAX_ATTEMPTS + 1):
        started = time.monotonic()
        try:
            helper.valid_url(item["url"])
            request = Request(item["url"], headers=helper.HEADERS)
            with urlopen(request, timeout=TIMEOUT) as response:
                helper.valid_url(response.geturl())
                helper.require(response.status == 200, "Expected HTTP 200 for full original")
                length = response.headers.get("Content-Length")
                helper.require(length is None or int(length) == item["bytes"],
                               "Original length changed since HEAD inventory")
                digest, count, deadline = hashlib.sha256(), 0, started + TIMEOUT
                with staged.open("wb") as output:
                    while True:
                        remaining = deadline - time.monotonic()
                        if remaining <= 0:
                            raise TimeoutError("Original exceeded the 60-second request deadline")
                        try:
                            response.fp.raw._sock.settimeout(remaining)
                        except (AttributeError, OSError):
                            pass
                        chunk = response.read(128 * 1024)
                        if not chunk:
                            break
                        count += len(chunk)
                        helper.require(count <= item["bytes"], "Original exceeds inventoried size")
                        digest.update(chunk)
                        output.write(chunk)
                helper.require(count == item["bytes"], "Truncated original download")
                inspected = helper.inspect_glb(staged)
                staged.replace(destination)
                attempts.append({"attempt": attempt, "status": response.status,
                                 "seconds": round(time.monotonic() - started, 3)})
                return {**item, "status": "archived-private", "path": item["plannedPath"],
                        "sha256": digest.hexdigest(), "inspection": inspected,
                        "method": "GET", "attempts": attempts, "completedAt": now(),
                        "finalUrl": response.geturl(),
                        "seconds": round(time.monotonic() - initial, 3)}
        except (OSError, ValueError, HTTPError, URLError) as error:
            staged.unlink(missing_ok=True)
            status = error.code if isinstance(error, HTTPError) else None
            attempts.append({"attempt": attempt, "status": status, "error": str(error),
                             "seconds": round(time.monotonic() - started, 3)})
            retryable = (isinstance(error, (OSError, URLError)) and not isinstance(error, HTTPError))
            retryable |= status is not None and (status >= 500 or status == 429)
            if not retryable or attempt == MAX_ATTEMPTS:
                break
            time.sleep(1)
    return {**item, "status": "failed", "path": None, "sha256": None,
            "attempts": attempts, "error": attempts[-1]["error"]}


def persist(manifest, evidence):
    atomic_json(MANIFEST, manifest)
    evidence["updatedAt"] = now()
    evidence["manifest"] = {"path": str(MANIFEST.relative_to(PROJECT)),
                            "sha256": hash_file(MANIFEST)}
    atomic_json(EVIDENCE, evidence)


def main():
    global RANGE_FAILED, EVIDENCE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--range-failed", action="store_true",
                        help="Recover previously failed full GETs with validated 4 MiB HTTP 206 requests")
    args = parser.parse_args()
    RANGE_FAILED = args.range_failed
    if RANGE_FAILED:
        helper.require(MANIFEST.exists(), "Range recovery needs the previous original manifest")
        EVIDENCE = EVIDENCE.with_name("ROOM-ORIGINALS-RANGE-KANITI.json")
    started, started_at = time.monotonic(), now()
    source_sha = hash_file(SOURCE_MANIFEST)
    source = json.loads(SOURCE_MANIFEST.read_text())
    originals = source["originalsHeadOnly"]
    helper.require(len(originals) == 46 and len({o["slug"] for o in originals}) == 46,
                   "Expected a measured inventory of 46 unique originals")
    helper.require(all(o["head"]["ok"] and isinstance(o["head"].get("bytes"), int)
                       and o["head"]["bytes"] > 0 for o in originals),
                   "All original HEAD sizes must be known before download")
    preview_by_slug = {a["slug"]: a for a in source["assets"] if a["kind"] == "glb"}
    assets = [{"id": f"xyz:{o['slug']}:original", "slug": o["slug"], "roomId": o["slug"],
               "name": o["name"], "title": preview_by_slug[o["slug"]]["title"],
               "kind": "glb", "role": "original", "category": "room-original",
               "url": o["url"], "sourceUrl": o["url"], "head": o["head"],
               "bytes": o["head"]["bytes"], "plannedPath": f"{o['slug']}/original.glb",
               "path": None, "sha256": None, "rights": RIGHTS, "status": "inventoried"}
              for o in originals]
    total, free = sum(a["bytes"] for a in assets), shutil.disk_usage(CODE).free
    largest = max(assets, key=lambda a: a["bytes"])
    preview_matches = {a["url"]: a for a in source["assets"]
                       if a["kind"] == "glb" and a["status"] == "downloaded-private"}
    previous = ({a["id"]: a for a in json.loads(MANIFEST.read_text())["assets"]}
                if MANIFEST.exists() else {})
    manifest = {"schema": 1, "ureten": "codex", "createdAt": started_at,
                "title": "Paris · source room originals (private archive)",
                "sourceUrl": source["sourceUrl"], "rights": RIGHTS,
                "publicRedistributionApproved": False, "roomCount": 46,
                "pathBase": str(TARGET.relative_to(PROJECT)), "assets": assets}
    evidence = {"ureten": "codex", "executionStartedAt": started_at,
                "command": ["python3", *sys.argv], "phase": "preflight",
                "sourcePreviewManifest": {"path": str(SOURCE_MANIFEST.relative_to(PROJECT)),
                                          "sha256Before": source_sha},
                "script": {"path": str(Path(__file__).resolve().relative_to(PROJECT)),
                           "sha256": hash_file(Path(__file__))},
                "inspectionHelper": {"path": str(HELPER_PATH.relative_to(PROJECT)),
                                     "sha256": hash_file(HELPER_PATH)},
                "limits": {"budgetBytes": BUDGET_BYTES, "minFreeBytes": MIN_FREE_BYTES,
                           "maxNetworkConcurrency": 3, "requestTimeoutSeconds": TIMEOUT,
                           "maxAttempts": MAX_ATTEMPTS, "rangeRecovery": RANGE_FAILED,
                           "rangeBytes": RANGE_BYTES if RANGE_FAILED else None},
                "preflight": {"roomCount": len(assets), "expectedBytes": total,
                              "diskFreeBytes": free, "largestOriginal": {
                                  key: largest[key] for key in ("id", "slug", "bytes", "url")},
                              "originalsOver128MiB": [a["id"] for a in assets
                                                      if a["bytes"] > 128 * 1024 ** 2],
                              "identicalPreviewOriginalUrlIds": [a["id"] for a in assets
                                                                  if a["url"] in preview_matches]}}
    print(json.dumps({"phase": "preflight", **evidence["preflight"]}), flush=True)
    if total > BUDGET_BYTES or free < MIN_FREE_BYTES:
        evidence["phase"] = "blocked-budget-or-disk"
        persist(manifest, evidence)
        return
    persist(manifest, evidence)
    result_by_id = {a["id"]: a for a in assets}
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(transfer, a, preview_matches, previous): a for a in assets}
        for index, future in enumerate(as_completed(futures), 1):
            asset = futures[future]
            try:
                result = future.result()
            except Exception as error:
                (TARGET / asset["plannedPath"]).with_suffix(".glb.part").unlink(missing_ok=True)
                result = {**asset, "status": "failed", "error": str(error)}
            result_by_id[result["id"]] = result
            manifest["assets"] = sorted(result_by_id.values(), key=lambda a: a["id"])
            evidence["phase"] = "downloading"
            evidence["progress"] = {"finished": index, "total": 46,
                                    "archived": sum(a["status"] == "archived-private"
                                                    for a in manifest["assets"])}
            persist(manifest, evidence)
            print(json.dumps({"phase": "original", "done": index, "total": 46,
                              "id": result["id"], "status": result["status"],
                              "bytes": result["bytes"], "method": result.get("method"),
                              "error": result.get("error")}), flush=True)
    archived = [a for a in manifest["assets"] if a["status"] == "archived-private"]
    rechecked = []
    for asset in archived:
        path = TARGET / asset["path"]
        helper.require(path.stat().st_size == asset["bytes"] and hash_file(path) == asset["sha256"],
                       f"Final byte/SHA recheck failed: {asset['id']}")
        rechecked.append(asset["id"])
    helper.require(hash_file(SOURCE_MANIFEST) == source_sha,
                   "The sealed preview manifest changed during this independent phase")
    evidence["sourcePreviewManifest"]["sha256After"] = hash_file(SOURCE_MANIFEST)
    evidence["phase"] = "complete" if len(archived) == 46 else "incomplete"
    evidence["result"] = {"archivedModels": len(archived), "expectedModels": 46,
                          "archivedBytes": sum(a["bytes"] for a in archived),
                          "failedIds": [a["id"] for a in manifest["assets"] if a["status"] != "archived-private"],
                          "GETCount": sum(a.get("method") == "GET" for a in archived),
                          "verifiedCopyCount": sum(a.get("method") == "verified-copy-of-identical-preview-original-url" for a in archived),
                          "rangeRecoveryCount": sum(a.get("method") == "bounded-HTTP-Range-recovery" for a in archived),
                          "externalDependencyIds": [a["id"] for a in archived if a["inspection"]["externalDependencies"]],
                          "copyrightLicenseMetadataIds": [a["id"] for a in archived if a["inspection"]["copyrightLicenseMetadata"]],
                          "requiredExtensions": {a["slug"]: a["inspection"]["extensionsRequired"]
                                                 for a in archived if a["inspection"]["extensionsRequired"]},
                          "finalShaByteRechecks": len(rechecked),
                          "partialFilesRemaining": len(list(TARGET.rglob("*.part"))),
                          "sealedPreviewManifestUnchanged": True,
                          "diskFreeBytesAfter": shutil.disk_usage(CODE).free,
                          "seconds": round(time.monotonic() - started, 3)}
    persist(manifest, evidence)
    print(json.dumps({"phase": evidence["phase"], **evidence["result"]}), flush=True)


if __name__ == "__main__":
    main()
