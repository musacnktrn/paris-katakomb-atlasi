#!/usr/bin/env python3
"""ureten: codex. Minimal factual publisher metadata; never evaluate downloaded JS."""
from pathlib import Path
from datetime import datetime
import re,json,hashlib
ROOT=Path(__file__).resolve().parents[1];SOURCE=ROOT.parent/'outputs/arastirma-tek-harita/3760b09340046ac8.js';text=SOURCE.read_text();now=datetime.now().astimezone().isoformat();rooms=[];features=[]
# Verified URL corrections/fallbacks are metadata, not publicly copied media.
media={r['id']:r for r in json.loads((ROOT/'source-records/room-media-verified.json').read_text())['rooms']}
def string(body,key):
 m=re.search(r'(?:^|,)'+re.escape(key)+r':"((?:[^"\\]|\\.)*)"',body);return json.loads('"'+m[1]+'"') if m else None
for m in re.finditer(r'\{slug:"([^"\\]+)"(.*?)coordinates:\{lat:([^,}]+),lon:([^}]+)\}',text,re.S):
 slug,body=m[1],m[2];lat=None if m[3]=='null' else float(m[3]);lon=None if m[4]=='null' else float(m[4]);coordinates=None if lat is None or lon is None else [lon,lat]
 if coordinates and not(2.2<lon<2.45 and 48.78<lat<48.93):raise ValueError('Out-of-region published room')
 depth=string(body,'depth');match=re.fullmatch(r'([0-9]+(?:\.[0-9]+)?)\s*m',depth or '');metres=float(match[1]) if match else None
 row={'id':slug,'title':string(body,'title') or string(body,'name') or slug,'url':'https://catacombes.xyz/rooms/'+slug,'sourceId':'catacombes-xyz','localModelAvailable':False,'coordinates':coordinates,'depthMetres':metres,'depthSourceLabel':depth,'district':string(body,'district'),'verification':'publisher-coordinate' if coordinates else 'publisher-withheld','sourceCheckedAt':now,'sourceUrl':'https://catacombes.xyz/map'}
 assert slug in media,'Missing independently verified room media record'
 row.update({k:v for k,v in media[slug].items() if k!='id'})
 rooms.append(row)
 if coordinates:features.append({'type':'Feature','id':'room:'+slug,'properties':{'id':slug,'kind':'room','title':row['title'],'sourceUrl':row['url'],'sourceId':'catacombes-xyz','depthMetres':metres,'verification':'publisher-coordinate','district':row['district'],'description':'Yayıncının yayımladığı konum ve derinlik; bağımsız ölçüm doğruluğu verilmemiştir.','checkedAt':now},'geometry':{'type':'Point','coordinates':coordinates}})
assert len(rooms)==46 and len(features)==40
# Actual entrance node, independently paired with the official visitor address.
features.append({'type':'Feature','id':'access:museum-entry','properties':{'id':'museum-entry','kind':'access','title':'Resmî müze · ziyaretçi girişi','sourceUrl':'https://www.catacombes.paris.fr/en/visit/useful-information','coordinateSourceUrl':'https://www.openstreetmap.org/node/6496084588','verification':'official-address-osm-entrance','description':'1 avenue du Colonel Henri Rol-Tanguy. Resmî ziyaretçi adresi, OSM entrance=main düğümüyle eşleştirildi. Açıklık durumu canlı izlenmez.','depthMetres':0,'checkedAt':now},'geometry':{'type':'Point','coordinates':[2.3322560,48.8337578]}})
features.append({'type':'Feature','id':'access:museum-exit','properties':{'id':'museum-exit','kind':'access','title':'Resmî müze · ziyaretçi çıkışı','sourceUrl':'https://www.catacombes.paris.fr/en/visit/useful-information','coordinateSourceUrl':'https://data.geopf.fr/geocodage/search?q=21%20bis%20avenue%20Rene%20Coty%2075014%20Paris&index=address&limit=3','verification':'official-address-ban-geocode','description':'21 bis avenue René Coty. Resmî çıkış adresinin IGN/BAN adres koordinatı; kapı ölçümü değildir. Kaynak eşleşme puanı 0.7278. Açıklık durumu canlı izlenmez.','depthMetres':0,'checkedAt':now},'geometry':{'type':'Point','coordinates':[2.334431,48.829515]}})
(ROOT/'public/data/rooms.json').write_text(json.dumps({'ureten':'codex','checkedAt':now,'sourceId':'catacombes-xyz','sourceUrl':'https://catacombes.xyz/map','rooms':rooms},ensure_ascii=False,indent=2))
(ROOT/'public/data/exploration.geojson').write_text(json.dumps({'ureten':'codex','type':'FeatureCollection','features':features,'checkedAt':now,'sourceCoverage':'40 publisher-positioned rooms; 6 source-withheld locations omitted. Official museum entry and address-geocoded exit mapped separately; no claim of complete entrance inventory.'},ensure_ascii=False,separators=(',',':')))
e={'ureten':'codex','checkedAt':now,'sourceBundle':'https://catacombes.xyz/_next/static/chunks/3760b09340046ac8.js','bundleSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'roomRecords':46,'positionedRecords':40,'uniquePositions':len({tuple(r['coordinates']) for r in rooms if r['coordinates']}),'withheldLocations':6,'depthRecords':sum(r['depthMetres'] is not None for r in rooms),'officialEntryCoordinateNode':6496084588,'sources':['https://catacombes.xyz/map','https://www.catacombes.paris.fr/en/visit/useful-information','https://www.openstreetmap.org/node/6496084588']}
e['officialAccessRecords']=2;e['exitGeocode']={'coordinates':[2.334431,48.829515],'score':0.7278,'precision':'address-geocode-not-door-survey'}
(ROOT.parent/'outputs/arastirma-tek-harita'/('EXPLORATION-KANITI-'+datetime.now().strftime('%Y%m%dT%H%M%S')+'.json')).write_text(json.dumps(e,ensure_ascii=False,indent=2));print(json.dumps(e,ensure_ascii=False))
