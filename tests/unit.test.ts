// ureten: codex — integrity, geometry and source boundary tests.
import {describe,it,expect} from 'vitest';
import {digest,localAssetUrl,packSchema,validateGeoJSON,validateGlb} from '../src/core/validation';
import {normalizeSearch,safeExternalUrl,searchFeatures} from '../src/core/catalog';
import {readFileSync} from 'node:fs';
const base='https://example.org/paris-atlas/';
const fc=(geometry:unknown,properties:unknown={})=>({type:'FeatureCollection',features:[{type:'Feature',id:'a',properties,geometry}]});
function glb(doc:unknown){let b=new TextEncoder().encode(JSON.stringify(doc));const n=Math.ceil(b.length/4)*4;const out=new Uint8Array(20+n);out.fill(32,20);const v=new DataView(out.buffer);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,out.length,true);v.setUint32(12,n,true);v.setUint32(16,0x4e4f534a,true);out.set(b,20);return out.buffer;}
describe('Public paths and attribution',()=>{
 it('supports project subpaths',()=>expect(localAssetUrl('./data/a.json',base)).toBe(base+'data/a.json'));
 for(const p of ['../secret.json','/elsewhere/a','https://evil.example/x','//evil.example/x','.%2e/secret','data/a%2fb','data/a\\b','data/a?key=x','data/a#fragment'])it('rejects '+p,()=>expect(()=>localAssetUrl(p,base)).toThrow());
 it('rejects a pack without redistribution permission',()=>expect(()=>packSchema.parse({schema:1,id:'a',atlasId:'paris-catacombs',version:'1',title:'a',redistribution:'unknown',attribution:'test',assets:[{url:'./a',bytes:1,sha256:'0'.repeat(64)}]})).toThrow());
 it('rejects unsafe external links',()=>{expect(safeExternalUrl('javascript:alert(1)')).toBe(null);expect(safeExternalUrl('https://x:y@example.org')).toBe(null);});
 it('SHA-256 known vector',async()=>expect(await digest(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
});
describe('Real geometry, not fictional galleries',()=>{
 it('accepts a valid point',()=>expect(validateGeoJSON(fc({type:'Point',coordinates:[2.3,48.8]})).features.length).toBe(1));
 it('rejects non-WGS84 coordinates',()=>expect(()=>validateGeoJSON(fc({type:'Point',coordinates:[640000,6800000]}))).toThrow());
 it('rejects unclosed polygon',()=>expect(()=>validateGeoJSON(fc({type:'Polygon',coordinates:[[[2,48],[3,48],[3,49],[2,49]]]}))).toThrow());
 it('rejects one-point line',()=>expect(()=>validateGeoJSON(fc({type:'LineString',coordinates:[[2,48]]}))).toThrow());
 it('rejects a position pretending to be MultiPoint',()=>expect(()=>validateGeoJSON(fc({type:'MultiPoint',coordinates:[2.3,48.8]}))).toThrow());
 it('preserves polygon holes',()=>{const g={type:'Polygon',coordinates:[[[2,48],[3,48],[3,49],[2,48]],[[2.1,48.1],[2.2,48.1],[2.2,48.2],[2.1,48.1]]]};expect(validateGeoJSON(fc(g)).features[0].geometry).toEqual(g);});
 it('rejects duplicate ids',()=>{const v=fc({type:'Point',coordinates:[2,48]});v.features.push(v.features[0]);expect(()=>validateGeoJSON(v)).toThrow();});
 it('indexes actual official sheet metadata',()=>{const d=JSON.parse(readFileSync('public/data/igc-index.geojson','utf8'));expect(validateGeoJSON(d).features.length).toBe(458);expect(new Set(d.features.map((f:any)=>f.id)).size).toBe(458);expect(d.features.every((f:any)=>f.properties.recordType==='sheet'&&f.properties.accessStatus==='unknown')).toBe(true);});
 it('keeps surface coverage explicit',()=>{const d=JSON.parse(readFileSync('public/data/surface-grs.geojson','utf8'));expect(validateGeoJSON(d).features.length).toBe(3650);expect(d.coverageLabel).toContain('bütün Paris değildir');});
 it('searches French accents without internet',()=>{expect(normalizeSearch('Alésia')).toBe(normalizeSearch('Alesia'));expect(searchFeatures(validateGeoJSON(fc({type:'Point',coordinates:[2,48]},{title:'Alésia'})),'alesia').length).toBe(1);});
});
describe('Offline local model boundary',()=>{
 it('accepts self-contained uncompressed GLB JSON',()=>expect(validateGlb(glb({asset:{version:'2.0'},scenes:[]})).asset.version).toBe('2.0'));
 it('rejects external textures',()=>expect(()=>validateGlb(glb({asset:{version:'2.0'},images:[{uri:'https://example.org/a.png'}]}))).toThrow());
 it('rejects external buffers',()=>expect(()=>validateGlb(glb({asset:{version:'2.0'},buffers:[{uri:'a.bin'}]}))).toThrow());
 it('rejects an external decoder requirement',()=>expect(()=>validateGlb(glb({asset:{version:'2.0'},extensionsRequired:['KHR_draco_mesh_compression']}))).toThrow());
 it('rejects truncated GLB',()=>expect(()=>validateGlb(new ArrayBuffer(8))).toThrow());
 it('rejects missing BIN body referenced by a buffer',()=>expect(()=>validateGlb(glb({asset:{version:'2.0'},buffers:[{byteLength:12}],bufferViews:[{buffer:0,byteLength:12}]}))).toThrow());
 it('keeps external room models out of downloaded assets',()=>{const d=JSON.parse(readFileSync('public/data/rooms.json','utf8'));expect(d.rooms.length).toBe(46);expect(d.rooms.every((r:any)=>r.localModelAvailable===false&&r.coordinates===null)).toBe(true);});
});
