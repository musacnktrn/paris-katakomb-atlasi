#!/usr/bin/env python3
"""ureten: codex. Stream verified personal archives into bounded ZIP collections; retain original bytes and rights."""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import re
import shutil
import zipfile


def file_sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def split_collection(source, output, target_bytes=24 * 1024 * 1024):
    source, output = Path(source), Path(output)
    if target_bytes <= 0:
        raise ValueError('Positive target size required')
    before = source.stat()
    output.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source) as archive:
        meta = json.loads(archive.read('collection.json'))
        if meta.get('schema') != 1 or meta.get('atlasId') != 'paris-catacombs' or meta.get('rights') not in ['personal-copy', 'allowed']:
            raise ValueError('Unsupported collection or rights')
        if not re.fullmatch(r'[a-z0-9-]{1,60}', meta.get('id', '')):
            raise ValueError('Invalid parent collection id')
        assets, seen = meta['assets'], set()
        # Validate the complete source before producing any installable part.
        for asset in assets:
            name = asset['path']
            if not re.fullmatch(r'[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*', name) or any(p in ['.', '..'] for p in name.split('/')) or name in seen:
                raise ValueError('Invalid or duplicate asset path')
            seen.add(name)
            if archive.getinfo(name).file_size != asset['bytes'] or asset['bytes'] > 128 * 1024 * 1024:
                raise ValueError('Asset size mismatch')
            h = hashlib.sha256()
            with archive.open(name) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    h.update(block)
            if h.hexdigest() != asset['sha256']:
                raise ValueError('Asset SHA256 mismatch')
        groups, current, size = [], [], 0
        for asset in assets:
            if current and size + asset['bytes'] > target_bytes:
                groups.append(current)
                current, size = [], 0
            current.append(asset)
            size += asset['bytes']
        if current:
            groups.append(current)
        parent_sha, result = file_sha(source), []
        for index, group in enumerate(groups, 1):
            collection_id = meta['id'] + '-part-' + str(index).zfill(2)
            dest = output / (collection_id + '.zip')
            temp = output / (collection_id + '.zip.part')
            if dest.exists() or temp.exists():
                raise FileExistsError('Refusing to overwrite a previous part')
            child = {**meta, 'ureten': 'codex', 'id': collection_id, 'title': meta['title'] + ' · bölüm ' + str(index) + '/' + str(len(groups)),
                     'parentCollectionId': meta['id'], 'parentArchiveSha256': parent_sha, 'assets': group,
                     'createdAt': datetime.datetime.now().astimezone().isoformat()}
            try:
                with zipfile.ZipFile(temp, 'x', compression=zipfile.ZIP_STORED) as target:
                    target.writestr('collection.json', json.dumps(child, ensure_ascii=False))
                    for asset in group:
                        with archive.open(asset['path']) as src, target.open(asset['path'], 'w', force_zip64=True) as dst:
                            shutil.copyfileobj(src, dst, 1024 * 1024)
                # Verify generated parts independently; never infer success from write completion.
                with zipfile.ZipFile(temp) as verify:
                    for asset in group:
                        h = hashlib.sha256()
                        with verify.open(asset['path']) as stream:
                            for block in iter(lambda: stream.read(1024 * 1024), b''):
                                h.update(block)
                        if h.hexdigest() != asset['sha256']:
                            raise ValueError('Output asset SHA256 mismatch')
                temp.rename(dest)
            except BaseException:
                temp.unlink(missing_ok=True)
                raise
            result.append({'path': dest.name, 'sha256': file_sha(dest), 'bytes': dest.stat().st_size,
                           'assetCount': len(group), 'payloadBytes': sum(a['bytes'] for a in group),
                           'singleAssetExceedsTarget': len(group) == 1 and group[0]['bytes'] > target_bytes,
                           'rights': child['rights'], 'parentCollectionId': meta['id']})
    after = source.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise ValueError('Source archive changed during processing')
    return {'ureten': 'codex', 'sourceArchiveSha256': parent_sha, 'assetCount': len(assets),
            'allAssetHashesVerified': True, 'parts': result, 'sourceUnchanged': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('--output', required=True)
    parser.add_argument('--target-mib', type=int, default=24)
    args = parser.parse_args()
    report = split_collection(args.source, args.output, args.target_mib * 1024 * 1024)
    path = Path(args.output) / (Path(args.source).stem + '-split-proof.json')
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'parts': len(report['parts']), 'assets': report['assetCount'], 'verified': True}))
