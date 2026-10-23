#!/usr/bin/env python3
# ureten: codex. Reuse SHA-verified IGN responses already acquired by Opus; no downloads or private-source derivatives.
"""Build and decode-check an open-data landcover archive, one cached response at a time.

Input geometry/holes are preserved. Land use does not imply vegetation: sports/cemeteries/protected
areas have distinct classes, and generic public-space/school/business polygons are not painted green.
"""
from __future__ import annotations
import argparse, collections, datetime, hashlib, json, math, os, signal, shutil, subprocess, sys, time
from pathlib import Path

CODE = Path(__file__).resolve().parent.parent
LAYERS = {'zone_de_vegetation': 'vegetation', 'parc_ou_reserve': 'protected', 'cimetiere': 'cemetery',
          'terrain_de_sport': 'sports', 'zone_d_activite_ou_d_interet': 'park',
          'surface_hydrographique': 'water', 'plan_d_eau': 'water-body'}
PARK_TYPES = {'Parc de loisirs', 'Parc zoologique', 'Aire de détente'}
LICENSE_URL = 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/'
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def sha(data): return hashlib.sha256(data).hexdigest()
def packed(value): return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
def write(path, value): path.write_bytes(json.dumps(value, ensure_ascii=False, indent=2).encode()+b'\n')
def positions(value):
    if not isinstance(value, list) or not value: raise ValueError('empty polygon coordinates')
    if isinstance(value[0], (int, float)):
        if len(value)<2 or not all(isinstance(x,(int,float)) and math.isfinite(x) for x in value[:2]): raise ValueError('invalid coordinate')
        if not (-180 <= value[0] <= 180 and -90 <= value[1] <= 90): raise ValueError('not CRS84 coordinates')
        yield value
    else:
        for child in value: yield from positions(child)

def prepare(cache, work):
    expected, reports, source_dates = {}, [], []
    for name, kind in LAYERS.items():
        manifest_path=cache/'pages'/(name+'.pages.json');manifest=json.loads(manifest_path.read_text())
        seen=set();kept=set();counts=collections.Counter();offset=0;page_proof=[]
        destination=work/(name+'.jsonl')
        with destination.open('wb') as output:
            for page in manifest['pages']:
                body=(cache/'raw'/(page['bodySha256']+'.body')).read_bytes()
                if sha(body)!=page['bodySha256'] or len(body)!=page['bodyBytes']: raise ValueError(name+': raw SHA/bytes mismatch')
                if page['offset']!=offset: raise ValueError(name+': pagination gap')
                data=json.loads(body);features=data['features']
                if len(features)!=page['returned'] or data.get('numberMatched',data.get('totalFeatures'))!=manifest['numberMatched']: raise ValueError(name+': response count mismatch')
                for f in features:
                    p=f['properties'];cid=p.get('cleabs')
                    if not isinstance(cid,str) or not cid or cid in seen: raise ValueError(name+': missing/duplicate source ID')
                    seen.add(cid);nature=p.get('nature');counts[str(nature)]+=1
                    if name=='zone_d_activite_ou_d_interet' and nature not in PARK_TYPES: continue
                    geometry=f.get('geometry')
                    if not geometry or geometry.get('type') not in ('Polygon','MultiPolygon'): raise ValueError(name+': non polygon geometry')
                    for _ in positions(geometry['coordinates']): pass
                    polygons=[geometry['coordinates']] if geometry['type']=='Polygon' else geometry['coordinates']
                    for polygon in polygons:
                        for ring in polygon:
                            if len(ring)<4 or ring[0][:2]!=ring[-1][:2]: raise ValueError(name+': unclosed/degenerate source ring')
                    props={'sourceid':cid,'sourceLayer':name,'kind':kind,'nature':nature,'name':p.get('toponyme'),
                           'sourceModifiedAt':p.get('date_modification'),'sourceId':'ign-landcover','sourceRetrievedAt':page['retrievedAt']}
                    if name=='surface_hydrographique': props.update(persistence=p.get('persistance'),groundPosition=p.get('position_par_rapport_au_sol'))
                    output.write(packed({'type':'Feature','properties':props,'geometry':geometry})+b'\n');kept.add(cid)
                offset+=len(features);source_dates.append(page['retrievedAt']);page_proof.append({'sha256':page['bodySha256'],'bytes':len(body),'returned':len(features)})
        if len(seen)!=manifest['numberMatched'] or offset!=manifest['numberMatched']: raise ValueError(name+': incomplete inventory')
        expected[name]=kept;reports.append({'layer':name,'kind':kind,'sourceCount':len(seen),'selectedCount':len(kept),'excludedByDeclaredLandUse':len(seen)-len(kept),'natures':dict(counts),'manifestSha256':sha(manifest_path.read_bytes()),'pages':page_proof,'fileSha256':sha(destination.read_bytes())})
        print(json.dumps({'prepared':name,'source':len(seen),'selected':len(kept)}),flush=True)
    return expected,reports,source_dates

def owned_command(command, cwd, log):
    env={**os.environ,'TIPPECANOE_MAX_THREADS':'2'};peak=0;start=time.monotonic()
    with log.open('wb') as stderr:
        process=subprocess.Popen(command,cwd=cwd,stdout=stderr,stderr=stderr,env=env,start_new_session=True)
        try:
            while process.poll() is None:
                if time.monotonic()-start>240: raise TimeoutError('owned tile build exceeded 240 seconds')
                r=subprocess.run(['ps','-o','rss=','-p',str(process.pid)],capture_output=True,text=True)
                try: peak=max(peak,int(r.stdout.strip() or 0))
                except ValueError: pass
                time.sleep(.25)
        except BaseException:
            os.killpg(process.pid,signal.SIGTERM)
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: os.killpg(process.pid,signal.SIGKILL);process.wait()
            raise
    if process.returncode: raise RuntimeError('tile build failed; see owned build log')
    return {'seconds':round(time.monotonic()-start,2),'peakRssKiB':peak,'threads':2}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--publish-data',action='store_true');args=parser.parse_args()
    cache=CODE/'private-data/v4-landcover';work=cache/('tiles-'+datetime.datetime.now().strftime('%Y%m%dT%H%M%S'));work.mkdir()
    expected,inputs,source_dates=prepare(cache,work)
    binary=CODE/'private-data/tools/tippecanoe/tippecanoe';decoder=binary.with_name('tippecanoe-decode')
    command=[str(binary),'-o','landcover.pmtiles','-Z9','-z17','--full-detail=14','--simplify-only-low-zooms','--no-tiny-polygon-reduction-at-maximum-zoom','--no-feature-limit','--no-tile-size-limit','--name=Paris IGN landcover','--attribution=IGN BD TOPO V3, Licence Ouverte Etalab 2.0']
    for layer in LAYERS:command+=['-L',layer+':'+layer+'.jsonl']
    metrics=owned_command(command,work,work/'build.log');tiles=work/'landcover.pmtiles'
    header=tiles.read_bytes()[:127]
    if header[:7]!=b'PMTiles' or header[7]!=3 or header[100]!=9 or header[101]!=17: raise ValueError('unexpected archive header/zoom')
    found={k:set() for k in expected};instances=collections.Counter();unknown=[]
    with (work/'decode.log').open('wb') as stderr:
        process=subprocess.Popen([str(decoder),'-c','-I','-Z17','-z17','-y','sourceid','-y','sourceLayer',str(tiles)],stdout=subprocess.PIPE,stderr=stderr,text=True,env={**os.environ,'TIPPECANOE_MAX_THREADS':'2'})
        for line in process.stdout:
            if not line.strip():continue
            f=json.loads(line);p=f.get('properties',{});layer=p.get('sourceLayer');cid=p.get('sourceid')
            if layer not in expected or cid not in expected[layer]:unknown.append({'layer':layer,'id':cid});continue
            found[layer].add(cid);instances[layer]+=1
        if process.wait():raise RuntimeError('decode failed')
    missing={k:sorted(ids-found[k]) for k,ids in expected.items()}
    audit={'ureten':'codex','at':now(),'source':'cached IGN WFS responses','networkRequests':0,'sourceRetrievedAtRange':[min(source_dates),max(source_dates)],'sourceInputs':inputs,'sourceCount':sum(x['sourceCount'] for x in inputs),'selectedCount':sum(len(x) for x in expected.values()),'maxzoom':17,'decodedUniqueSourceids':{k:len(v) for k,v in found.items()},'decodedInstancesIncludingTileBoundaries':dict(instances),'missingSourceids':missing,'unknownSourceids':unknown,'allSelectedSourceidsPreserved':not any(missing.values()) and not unknown,'build':metrics,'geometryPolicy':'Source CRS84 geometry including holes is copied unchanged to input. MVT quantizes/simplifies geometry; no invented polygon/land use.','scriptSha256':sha(Path(__file__).read_bytes()),'publicDataCopied':False}
    write(work/'LANDCOVER-KABUL.json',audit)
    if not audit['allSelectedSourceidsPreserved']:raise ValueError('source ID completeness failed; archive retained private')
    subprocess.run([sys.executable,'-I',str(CODE/'scripts/clean-pmtiles-metadata.py'),str(tiles)],check=True,capture_output=True)
    metadata={'schema':1,'ureten':'codex','id':'ign-landcover','url':'data/landcover.pmtiles','bytes':tiles.stat().st_size,'sha256':sha(tiles.read_bytes()),'minzoom':9,'maxzoom':17,'layers':list(LAYERS),'kinds':LAYERS,'sourceCount':audit['sourceCount'],'selectedCount':audit['selectedCount'],'layerCounts':{x['layer']:x['selectedCount'] for x in inputs},'verifiedAt':now(),'sourceRetrievedAtRange':audit['sourceRetrievedAtRange'],'sourceEdition':None,'sourceUrl':'https://geoservices.ign.fr/bdtopo','license':'etalab-2.0','licenseUrl':LICENSE_URL,'attribution':'IGN BD TOPO V3 · extrait 2026-10-18 · Licence Ouverte Etalab 2.0','verification':{'maxzoom':17,'allSelectedSourceidsPreserved':True,'decodedUniqueSourceids':audit['decodedUniqueSourceids']},'limitations':['Retrieval date is not the survey/edition date; sourceEdition is unknown.','Protected/cemetery/sports are land-use classes, not verified tree/grass cover.','Generic public space/schools/businesses excluded from green classification.','Lower zooms generalize; maximum-zoom source IDs were decoded, not field surveyed.','Surface water classes are source records, not current water-level observations.']}
    write(work/'landcover-meta.json',metadata)
    if args.publish_data:
        shutil.copyfile(tiles,CODE/'public/data/landcover.pmtiles');write(CODE/'public/data/landcover-meta.json',metadata);audit['publicDataCopied']=True;write(work/'LANDCOVER-KABUL.json',audit)
    proof=CODE.parent/'outputs/devam-20261023/LANDCOVER-KABUL.json';write(proof,{**audit,'archiveMetadata':metadata,'localBuild':str(work.relative_to(CODE))})
    print(json.dumps({'ok':True,'sourceCount':audit['sourceCount'],'selectedCount':audit['selectedCount'],'bytes':metadata['bytes'],'build':metrics,'localBuild':str(work.relative_to(CODE))}),flush=True)

if __name__=='__main__':main()
