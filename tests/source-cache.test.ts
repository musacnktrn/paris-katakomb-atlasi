// ureten: codex. Protect real source georeferencing and atomic personal downloads.
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import type {Feature} from 'geojson';
const records=vi.hoisted(()=>new Map());
vi.mock('../src/core/storage',()=>({db:async()=>({get:async(_:string,id:string)=>records.get(id),getAll:async()=>[...records.values()],put:async(_:string,a:any)=>records.set(a.id,a)})}));
import {checkedBounds,featureBounds,getIgcSheet,getSurveyAsset,lonlat,mercator} from '../src/core/source-cache';
const area:Feature={type:'Feature',properties:{sheetId:'technical-test'},geometry:{type:'Polygon',coordinates:[[[2.3,48.8],[2.31,48.8],[2.31,48.81],[2.3,48.81],[2.3,48.8]]]}};
const image=readFileSync('public/icons/icon-192.png');
function extent(){const [xmin,ymin]=mercator(2.298,48.798),[xmax,ymax]=mercator(2.312,48.812);return {xmin,ymin,xmax,ymax,spatialReference:{wkid:102100,latestWkid:3857}};}
beforeEach(()=>{records.clear();vi.stubGlobal('navigator',{onLine:true});});
afterEach(()=>vi.unstubAllGlobals());
describe('Source-aligned raster cache',()=>{
 it('uses the returned ArcGIS extent rather than stretching the requested sheet box',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({href:'https://capgeo2.paris.fr/public/rest/directories/test.png',extent:extent()})).mockResolvedValueOnce(new Response(image,{headers:{'content-type':'image/png'}}));vi.stubGlobal('fetch',fetcher);
  const a=await getIgcSheet(area);expect(a.mapBounds![0]).toBeCloseTo(2.298,8);expect(a.mapBounds![3]).toBeCloseTo(48.812,8);expect(a.mapBounds).not.toEqual(featureBounds(area));expect(a.blob.size).toBe(image.byteLength);expect(a.sha256).toMatch(/^[a-f0-9]{64}$/);expect(records.size).toBe(1);
  await getIgcSheet(area);expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('rejects a false CRS and never records a ready raster',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({href:'https://capgeo2.paris.fr/image.png',extent:{...extent(),spatialReference:{wkid:4326}}})));await expect(getIgcSheet(area)).rejects.toThrow('koordinat sistemi');expect(records.size).toBe(0);
 });
 it('rejects a redirected source host',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({href:'https://example.org/image.png',extent:extent()})));await expect(getIgcSheet(area)).rejects.toThrow('görüntü kaynağı');expect(records.size).toBe(0);});
 it('rejects an HTML/error body instead of caching it as a plan',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({href:'https://capgeo2.paris.fr/image.png',extent:extent()})).mockResolvedValueOnce(new Response('<html>error</html>')));await expect(getIgcSheet(area)).rejects.toThrow('görüntü dosyası');expect(records.size).toBe(0);});
 it('does not save a cancelled selection even after the image body arrives',async()=>{const c=new AbortController();vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({href:'https://capgeo2.paris.fr/image.png',extent:extent()})).mockImplementationOnce(async()=>{c.abort();return new Response(image);}));await expect(getIgcSheet(area,c.signal)).rejects.toThrow();expect(records.size).toBe(0);});
 it('returns the smallest installed covering plan offline without any request',async()=>{vi.stubGlobal('navigator',{onLine:false});records.set('a',{id:'a',category:'igc-raster-overview',mapBounds:[2,48,3,49]});records.set('b',{id:'b',category:'igc-raster-detail',mapBounds:[2.29,48.79,2.32,48.82]});const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);expect((await getIgcSheet(area)).id).toBe('b');expect(fetcher).not.toHaveBeenCalled();});
});
describe('Projection and factual datasets',()=>{
 it('round-trips the actual Paris projection with longitude before latitude',()=>{const p=lonlat(...mercator(2.334,48.833));expect(p[0]).toBeCloseTo(2.334,9);expect(p[1]).toBeCloseTo(48.833,9);expect(()=>checkedBounds([2.4,48.8,2.3,48.9])).toThrow();});
 it('has source road segments across northern and eastern Paris, preserving disconnected lines',()=>{const d=JSON.parse(readFileSync('public/data/surface-paris.geojson','utf8'));expect(d.features).toHaveLength(9389);const roads=d.features.filter((f:any)=>f.properties.kind==='road');expect(roads.some((f:any)=>f.geometry.type==='MultiLineString')).toBe(true);const points=roads.flatMap((f:any)=>f.geometry.type==='LineString'?f.geometry.coordinates:f.geometry.coordinates.flat());expect(points.some((p:number[])=>p[1]>48.89)).toBe(true);expect(points.some((p:number[])=>p[0]>2.4)).toBe(true);});
 it('keeps the merged scans in their shared author frame and records a fixed source commit',()=>{const m=JSON.parse(readFileSync('public/data/merged-survey.json','utf8'));expect(m.worldGeoreferenced).toBe(false);expect(m.worldAnchor).toBeNull();expect(m.assets).toHaveLength(2);expect(m.assets.every((a:any)=>a.sourceUrl.includes(m.sourceCommit)&&a.sceneTransform.translation.every((v:number)=>v===0))).toBe(true);});
 it('retains all independently verified poster URLs without publishing binary copies',()=>{const d=JSON.parse(readFileSync('public/data/rooms.json','utf8'));expect(d.rooms.every((r:any)=>r.posterUrl.startsWith('https://assets.catacombes.xyz/assets/models/')&&/^[a-f0-9]{64}$/.test(r.posterSha256))).toBe(true);});
 it('rejects a model checksum mismatch before saving a GLB',async()=>{const body=new TextEncoder().encode('incorrect technical test GLB');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(body)));await expect(getSurveyAsset({id:'test',title:'technical test',role:'underground',url:'https://raw.githubusercontent.com/test/test/model.glb',bytes:body.byteLength,sha256:'0'.repeat(64)})).rejects.toThrow('SHA-256');expect(records.size).toBe(0);});
});
