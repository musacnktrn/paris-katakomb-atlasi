#!/usr/bin/env python3
"""ureten: codex. Bounded IGN Open Licence orthophoto export, not OSM tile scraping."""
from urllib.request import Request,urlopen
from urllib.parse import urlencode
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import math,json,hashlib,time
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'public/raster/orthophoto';OUT.mkdir(parents=True,exist_ok=True)
R=6378137.;BOUNDS=[2.24,48.80,2.42,48.91]
def xy(lon,lat):return R*math.radians(lon),R*math.log(math.tan(math.pi/4+math.radians(lat)/2))
def ll(x,y):return math.degrees(x/R),math.degrees(2*math.atan(math.exp(y/R))-math.pi/2)
a,b=xy(*BOUNDS[:2]),xy(*BOUNDS[2:]);jobs=[('overview',(*a,*b),1024)]
for row in range(4):
 for col in range(4):
  x0=a[0]+(b[0]-a[0])*col/4;x1=a[0]+(b[0]-a[0])*(col+1)/4;y0=a[1]+(b[1]-a[1])*row/4;y1=a[1]+(b[1]-a[1])*(row+1)/4
  jobs.append((f'{col}-{row}',(x0,y0,x1,y1),2048))
def one(job):
 name,box,size=job;path=OUT/(name+'.jpg');params={'SERVICE':'WMS','VERSION':'1.3.0','REQUEST':'GetMap','LAYERS':'ORTHOIMAGERY.ORTHOPHOTOS','STYLES':'','CRS':'EPSG:3857','BBOX':','.join(map(str,box)),'WIDTH':size,'HEIGHT':size,'FORMAT':'image/jpeg'};url='https://data.geopf.fr/wms-r?'+urlencode(params)
 if not path.exists():
  for attempt in range(3):
   try:
    with urlopen(Request(url,headers={'User-Agent':'Archify-Paris-Atlas/0.2 bounded IGN export'}),timeout=40) as res:data=res.read(8*1024*1024+1)
    if len(data)>8*1024*1024 or not data.startswith(b'\xff\xd8\xff'):raise ValueError('Invalid/oversized orthophoto')
    path.write_bytes(data);break
   except Exception:
    if attempt==2:raise
    time.sleep(1+attempt)
 data=path.read_bytes();w,s=ll(*box[:2]);e,n=ll(*box[2:]);return {'id':'ortho-'+name,'url':'./raster/orthophoto/'+path.name,'bounds':[w,s,e,n],'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'sourceUrl':url,'overview':name=='overview'}
with ThreadPoolExecutor(max_workers=2) as pool:assets=list(pool.map(one,jobs))
d={'ureten':'codex','schema':1,'id':'ign-orthophoto-paris','title':'Paris · IGN hava fotoğrafı','retrievedAt':datetime.now().astimezone().isoformat(),'sourceId':'ign-bd-ortho','license':'Licence Ouverte / Open Licence 2.0','licenseUrl':'https://www.etalab.gouv.fr/licence-ouverte-open-licence/','sourceUrl':'https://www.data.gouv.fr/datasets/bd-ortho-r','attribution':'© IGN · BD ORTHO® · Licence Ouverte 2.0','coverage':BOUNDS,'acquisitionDate':None,'acquisitionDateNote':'Service retrieval date is not the aerial acquisition date. Mosaic acquisition varies.','assets':assets}
(ROOT/'public/data/orthophoto.json').write_text(json.dumps(d,ensure_ascii=False,indent=2));evidence=ROOT.parent/'outputs/arastirma-tek-harita/IGN-ORTHOPHOTO-KANITI.json';evidence.write_text(json.dumps(d,ensure_ascii=False,indent=2));print(json.dumps({'assets':len(assets),'bytes':sum(x['bytes'] for x in assets),'coverage':BOUNDS}))
