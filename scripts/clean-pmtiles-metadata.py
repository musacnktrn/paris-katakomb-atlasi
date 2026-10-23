# ureten: opus
"""Rewrite only the JSON metadata of a PMTiles v3 archive so it carries no local paths.

tippecanoe writes its full command line into metadata.generator_options, including absolute
paths of the build machine (home directory and private-data layout). This script replaces each
absolute path in that one field with its bare file name, keeps every other metadata key exactly
as written, and leaves the root directory, leaf directories and tile data byte-identical.
Only the header fields that depend on the metadata length (metadata length and the offsets of
sections stored after it) change. The output is verified before it replaces anything.

Usage: python3 scripts/clean-pmtiles-metadata.py IN.pmtiles [--output OUT.pmtiles] [--check]
  --check  only report whether the metadata contains local paths (exit 1 if it does).
"""
import argparse
import gzip
import hashlib
import json
import os
import re
import struct
import sys

HEADER_BYTES = 127
FIELDS = ["root_off", "root_len", "meta_off", "meta_len", "leaf_off", "leaf_len", "data_off", "data_len",
          "n_addressed", "n_entries", "n_contents"]
# Any of these in the metadata means the build machine leaks through.
FORBIDDEN = [re.compile(p, re.I) for p in (r"/Users/", r"/home/", r"[A-Za-z]:\\\\", r"private-data")]
# An absolute path token: starts with '/' after start, whitespace, quote, '=' or ':' and has at least one more '/'.
ABSOLUTE_PATH = re.compile(r"(?<=[\s'\"=:])/(?:[^\s'\"/]+/)+([^\s'\"/]+)|^/(?:[^\s'\"/]+/)+([^\s'\"/]+)")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def parse_header(raw):
    if len(raw) < HEADER_BYTES or raw[:7] != b"PMTiles" or raw[7] != 3:
        raise ValueError("Not a PMTiles v3 archive")
    header = dict(zip(FIELDS, struct.unpack("<11Q", raw[8:96])))
    header["internal_compression"] = raw[97]
    return header


def decompress(data, compression):
    if compression == 1:  # none
        return data
    if compression == 2:  # gzip
        return gzip.decompress(data)
    raise ValueError(f"Unsupported internal compression {compression}")


def compress(data, compression):
    if compression == 1:
        return data
    # mtime=0 keeps the output reproducible.
    return gzip.compress(data, compresslevel=9, mtime=0)


def leaks(text):
    return [p.pattern for p in FORBIDDEN if p.search(text)]


def strip_paths(value):
    return ABSOLUTE_PATH.sub(lambda m: m.group(1) or m.group(2), value)


def clean(raw):
    header = parse_header(raw)
    if len(raw) != max(header["root_off"] + header["root_len"], header["meta_off"] + header["meta_len"],
                       header["leaf_off"] + header["leaf_len"], header["data_off"] + header["data_len"]):
        raise ValueError("Archive has trailing bytes or truncated sections; refusing to rewrite")
    sections = sorted([("header", 0, HEADER_BYTES), ("root", header["root_off"], header["root_len"]),
                       ("meta", header["meta_off"], header["meta_len"]), ("leaf", header["leaf_off"], header["leaf_len"]),
                       ("data", header["data_off"], header["data_len"])], key=lambda s: (s[1], s[0] != "header"))
    cursor = 0
    for name, offset, length in sections:
        if offset != cursor:
            raise ValueError(f"Sections are not contiguous at {name} (offset {offset}, expected {cursor})")
        cursor = offset + length
    compressed = raw[header["meta_off"]:header["meta_off"] + header["meta_len"]]
    text = decompress(compressed, header["internal_compression"]).decode("utf-8")
    before = json.loads(text)
    found = leaks(text)
    report = {"leaksBefore": found}
    if not found:
        return raw, report
    value = before.get("generator_options")
    if not isinstance(value, str) or not leaks(value):
        raise ValueError("Local paths found outside generator_options; refusing to guess a rewrite")
    old_token = json.dumps(value, ensure_ascii=False)
    if text.count(old_token) != 1:
        raise ValueError("generator_options is not stored as a plain JSON string; refusing to rewrite")
    new_value = strip_paths(value)
    new_text = text.replace(old_token, json.dumps(new_value, ensure_ascii=False))
    after = json.loads(new_text)
    if leaks(new_text):
        raise ValueError("Metadata still contains local paths after rewrite: " + ", ".join(leaks(new_text)))
    if {k: v for k, v in after.items() if k != "generator_options"} != {k: v for k, v in before.items() if k != "generator_options"} or list(after) != list(before):
        raise ValueError("Rewrite changed metadata other than generator_options")
    new_meta = compress(new_text.encode("utf-8"), header["internal_compression"])
    delta = len(new_meta) - header["meta_len"]
    updated = dict(header)
    updated["meta_len"] = len(new_meta)
    for key in ("root_off", "leaf_off", "data_off"):
        if header[key] > header["meta_off"]:
            updated[key] = header[key] + delta
    new_header = raw[:8] + struct.pack("<11Q", *[updated[k] for k in FIELDS]) + raw[96:HEADER_BYTES]
    parts = {"header": new_header, "meta": new_meta}
    for name, offset, length in sections:
        if name not in parts:
            parts[name] = raw[offset:offset + length]
    order = [name for name, _, _ in sections]
    out = b"".join(parts[name] for name in order)
    # Verify: the rewritten archive parses, every section other than header/meta is byte-identical.
    check = parse_header(out)
    for name in ("root", "leaf", "data"):
        a = raw[header[name + "_off"]:header[name + "_off"] + header[name + "_len"]]
        b = out[check[name + "_off"]:check[name + "_off"] + check[name + "_len"]]
        if a != b:
            raise ValueError(f"Section {name} changed during rewrite")
    if raw[96:HEADER_BYTES] != out[96:HEADER_BYTES] or any(header[k] != check[k] for k in FIELDS if k not in ("meta_len", "root_off", "leaf_off", "data_off")):
        raise ValueError("Header fields other than metadata length and section offsets changed")
    reread = json.loads(decompress(out[check["meta_off"]:check["meta_off"] + check["meta_len"]], check["internal_compression"]).decode("utf-8"))
    if reread != after:
        raise ValueError("Rewritten metadata does not read back")
    report.update({
        "changedKeys": ["generator_options"],
        "generatorOptionsAfter": new_value,
        "metadataBytesBefore": header["meta_len"], "metadataBytesAfter": len(new_meta),
        "headerBefore": {k: header[k] for k in FIELDS}, "headerAfter": {k: check[k] for k in FIELDS},
        "sectionSha256": {name: sha(raw[header[name + "_off"]:header[name + "_off"] + header[name + "_len"]]) for name in ("root", "leaf", "data")},
        "leaksAfter": leaks(new_text),
    })
    return out, report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("--output")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with open(args.input, "rb") as handle:
        raw = handle.read()
    out, report = clean(raw)
    report.update({"ureten": "opus", "input": os.path.basename(args.input), "bytesBefore": len(raw), "sha256Before": sha(raw),
                   "bytesAfter": len(out), "sha256After": sha(out)})
    if args.check:
        print(json.dumps(report, ensure_ascii=False))
        sys.exit(1 if report["leaksBefore"] else 0)
    target = args.output or args.input
    if out is not raw or target != args.input:
        temp = target + ".part"
        with open(temp, "wb") as handle:
            handle.write(out)
        os.replace(temp, target)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
