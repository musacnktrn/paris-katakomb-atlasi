#!/usr/bin/env python3
"""ureten: codex. Personal native-georeferenced IGC mosaic archive; never public rehosting."""
from urllib.request import Request,urlopen
from urllib.parse import urlencode,urlsplit
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import json,math,hashlib,time,threading
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'private-data/igc-raster';OUT.mkdir(parents=True,exist_ok=True)
SOURCE='https://capgeo2.paris.fr/public/rest/services/IGC/IGC_Atlas_v2/MapServer';R=6378137.;LOCK=threading.Lock();total=0
# The complete published sheet index bounds, plus a higher-detail GRS core.
B=[2.15249,48.74296,2.59860,48.97139]
def xy(lon,lat):return R*math.radians(lon),R*math.log(math.tan(math.pi/4+math.radians(lat)/2))
def ll(x,y):return math.degrees(x/R),math.degrees(2*math.atan(math.exp(y/R))-math.pi/2)
def grid(bounds,step,size,prefix):
 a,b=xy(*bounds[:2]),xy(*bounds[2:]);jobs=[]
 for row in range(math.ceil((b[1]-a[1])/step)):
  for col in range(math.ceil((b[0]-a[0])/step)):
   x=a[0]+col*step;y=a[1]+row*step;jobs.append((f'{prefix}-{col}-{row}',[x,y,x+step,y+step],size,prefix))
 return jobs
jobs=[('overview',[*xy(*B[:2]),*xy(*B[2:])],1024,'overview')]+grid(B,3072,2048,'region')+grid([2.30,48.818,2.348,48.847],1024,2048,'grs-detail')
def one(job):
 global total
 name,box,size,level=job;path=OUT/(name+'.jpg');meta=OUT/(name+'.json');url=SOURCE+'/export?'+urlencode({'bbox':','.join(map(str,box)),'bboxSR':3857,'imageSR':3857,'size':f'{size},{size}','format':'jpg','dpi':96,'f':'json'})
 if not path.exists() or not meta.exists():
  for attempt in range(2):
   try:
    with urlopen(Request(url,headers={'User-Agent':'Archify Atlas personal archive/0.2'}),timeout=35) as response:d=json.load(response)
    if not d.get('href') or urlsplit(d['href']).hostname!='capgeo2.paris.fr':raise ValueError('Invalid IGC response')
    with urlopen(Request(d['href'],headers={'User-Agent':'Archify Atlas personal archive/0.2'}),timeout=35) as response:data=response.read(12*1024*1024+1)
    if not data.startswith(b'\xff\xd8\xff') or len(data)>12*1024*1024:raise ValueError('Invalid or oversized exported JPEG')
    path.write_bytes(data);meta.write_text(json.dumps(d));break
   except Exception:
    if attempt:raise
    time.sleep(1)
 data=path.read_bytes();d=json.loads(meta.read_text());e=d['extent'];w,s=ll(e['xmin'],e['ymin']);east,n=ll(e['xmax'],e['ymax'])
 with LOCK:
  total+=len(data)
  if total>420*1024*1024:raise ValueError('Personal raster archive exceeds 420 MiB bound')
 return {'path':'rasters/'+path.name,'kind':'raster','name':'IGC '+name+'.jpg','sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'category':'igc-raster-'+('detail' if level=='grs-detail' else level),'mapBounds':[w,s,east,n],'sourceUrl':url,'sourceExtent3857':e,'detailLevel':level,'renderedMetresPerPixel3857':(e['xmax']-e['xmin'])/d['width']}
assets=[]
with ThreadPoolExecutor(max_workers=2) as pool:
 for i,a in enumerate(pool.map(one,jobs),1):
  assets.append(a)
  if i%20==0:print(json.dumps({'done':i,'total':len(jobs),'bytes':sum(a['bytes'] for a in assets)}),flush=True)
manifest={'ureten':'codex','schema':1,'atlasId':'paris-catacombs','id':'igc-gallery-raster','title':'IGC · koordinatlandırılmış galeri atlası','rights':'personal-copy','sourceUrl':SOURCE,'retrievedAt':datetime.now().astimezone().isoformat(),'coverage':B,'surveyRevision':None,'note':'Official raster mosaic, native server reprojection and returned extent. Not a complete current navigable gallery/entrance vector network. Public redistribution license unverified; personal local collection only. White map areas are not proof of absent galleries.','assets':assets}
(OUT/'collection.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));(ROOT.parent/'outputs/arastirma-tek-harita'/('IGC-RASTER-KANITI-'+datetime.now().strftime('%Y%m%dT%H%M%S')+'.json')).write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print(json.dumps({'done':len(assets),'bytes':total,'manifest':str(OUT/'collection.json')}))
