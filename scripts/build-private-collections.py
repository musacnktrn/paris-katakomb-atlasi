#!/usr/bin/env python3
"""ureten: codex. Build hash-verified personal offline ZIPs; never publish these archives."""
from pathlib import Path
from datetime import datetime
import argparse, hashlib, json, zipfile

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'private-data/packages'
OUT.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--originals',action='store_true');parser.add_argument('--allow-incomplete',action='store_true');args=parser.parse_args()
inventory=[];missing=[]

def package(ident,title,items,base):
    assets=[]
    for a in items:
        p=base/a['path'];body=p.read_bytes()
        if len(body)!=a['bytes'] or hashlib.sha256(body).hexdigest()!=a['sha256']:
            raise ValueError('Source archive verification failed: '+a['path'])
        row={k:a[k] for k in ['path','kind','name','bytes','sha256','category','mapBounds','roomId','sourceUrl'] if k in a}
        assets.append(row)
    total=sum(a['bytes'] for a in assets)
    if total>250*1024*1024:raise ValueError('Package exceeds conservative 250 MiB working-memory budget')
    manifest={'ureten':'codex','schema':1,'atlasId':'paris-catacombs','id':ident,'title':title,'rights':'personal-copy',
      'note':'Source author rights retained. Private device copy, not licensed for public redistribution.', 'assets':assets}
    target=OUT/(ident+'.zip');temporary=target.with_suffix('.zip.tmp')
    with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_STORED) as z:
        z.writestr('collection.json',json.dumps(manifest,ensure_ascii=False,indent=2))
        for a in assets:z.write(base/a['path'],a['path'])
    temporary.replace(target)
    # Re-read the complete ZIP and every payload, rather than trusting source hashes alone.
    with zipfile.ZipFile(target) as z:
        for a in assets:
            payload=z.read(a['path'])
            assert len(payload)==a['bytes'] and hashlib.sha256(payload).hexdigest()==a['sha256']
    record={'id':ident,'title':title,'path':str(target.relative_to(ROOT)),'assets':len(assets),'payloadBytes':total,'zipBytes':target.stat().st_size,'sha256':hashlib.file_digest(target.open('rb'),'sha256').hexdigest(),'rights':'personal-copy'}
    inventory.append(record);print(json.dumps(record,ensure_ascii=False),flush=True)

previews=json.loads((ROOT/'private-data/room-archive/manifest.json').read_text())
preview_items=[]
for a in previews['assets']:
    if a['status']!='downloaded-private':raise ValueError('Incomplete preview archive')
    preview_items.append({**a,'roomId':a['slug'],'category':'room-model' if a['kind']=='glb' else 'room-poster'})
package('rooms-3d-archive','46 salon · 3B modeller ve kapaklar',preview_items,ROOT/'private-data/room-archive')
igc=json.loads((ROOT/'private-data/igc-raster/collection.json').read_text())
# The source manifest's ZIP paths are namespaced; local exports are flat files.
raster_base=ROOT/'private-data/igc-raster'
(raster_base/'rasters').mkdir(exist_ok=True)
for a in igc['assets']:
    link=raster_base/a['path']
    if not link.exists():link.symlink_to(Path('..')/Path(a['path']).name)
package(igc['id'],igc['title'],igc['assets'],raster_base)
if args.originals:
    originals=json.loads((ROOT/'private-data/room-originals/manifest.json').read_text())
    missing=[{'roomId':a.get('roomId',a['slug']),'status':a.get('status'),'sourceUrl':a.get('sourceUrl'),'expectedBytes':a.get('bytes')} for a in originals['assets'] if a.get('status')!='archived-private']
    if len(originals['assets'])!=46 or missing and not args.allow_incomplete:
        raise ValueError('Original archive has not completed all 46 models')
    groups=[];group=[];size=0
    for a in [a for a in originals['assets'] if a.get('status')=='archived-private']:
        if size+a['bytes']>210*1024*1024 and group:groups.append(group);group=[];size=0
        group.append(a);size+=a['bytes']
    if group:groups.append(group)
    for i,group in enumerate(groups,1):
        package(f'room-originals-{i:02}',f'Özgün 3B modeller · {i}/{len(groups)}',group,ROOT/'private-data/room-originals')
proof={'ureten':'codex','createdAt':datetime.now().astimezone().isoformat(),'originalsIncluded':args.originals,'originalsMissing':missing,'packages':inventory,'publicRedistributionApproved':False,'modelAuthor':'Paul Maréchal / DevXR (Catacombes.xyz); importer producer codex is not model authorship','allPayloadsRereadAndSha256Verified':True}
stamp=datetime.now().strftime('%Y%m%dT%H%M%S')
(ROOT.parent/'outputs/arastirma-tek-harita'/('PRIVATE-PACKAGES-'+stamp+'.json')).write_text(json.dumps(proof,ensure_ascii=False,indent=2))
(OUT/'PAKETLER.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2))
