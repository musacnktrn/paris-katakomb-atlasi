// ureten: opus: privacy gate (scripts/verify-no-private.mjs) on SYNTHETIC temporary folders only; no private data.
import {describe,it,expect,afterEach} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {verifyNoPrivate,pmtilesMetadata} from '../scripts/verify-no-private.mjs';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const roots:string[]=[];
afterEach(()=>{for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true});});
function put(root:string,rel:string,data:string|Buffer){const p=path.join(root,rel);mkdirSync(path.dirname(p),{recursive:true});writeFileSync(p,data);}
function fixture(photos:unknown[]=[]){const root=mkdtempSync(path.join(tmpdir(),'atlas-gate-'));roots.push(root);
 put(root,'public/data/room-photos.json',JSON.stringify({schema:1,photos}));put(root,'public/index.html','<!doctype html><title>Sentetik</title>');put(root,'dist/index.html','<!doctype html><title>Sentetik</title>');return root;}
// Minimal PMTiles v3 header with gzip-compressed JSON metadata right after it.
function pmtiles(meta:object){const m=gzipSync(Buffer.from(JSON.stringify(meta)));const h=Buffer.alloc(127);h.write('PMTiles',0,'latin1');h[7]=3;h.writeBigUInt64LE(127n,24);h.writeBigUInt64LE(BigInt(m.length),32);h[97]=2;return Buffer.concat([h,m]);}
const fails=async(root:string,pattern:RegExp)=>{await expect(verifyNoPrivate({root})).rejects.toThrow(pattern);};

describe('Privacy gate: text scan (runs everywhere, also in CI)',()=>{
 it('passes a clean package and skips the byte scan when private-data is absent',async()=>{const r=await verifyNoPrivate({root:fixture()});expect(r.ok).toBe(true);expect(r.hashCheck).toMatch(/atlandı/);});
 it('fails on a local home path or a private-data path in a public text file',async()=>{
  let root=fixture();put(root,'public/data/x.json','{"p":"/Users/someone/atlas/x"}');await fails(root,/\/Users\//);
  root=fixture();put(root,'dist/assets/x.js','fetch("../private-data/x.geojson")');await fails(root,/private-data/);
 });
 it('reads the compressed PMTiles metadata, where a plain grep sees nothing',async()=>{
  const bad=pmtiles({name:'Sentetik',generator_options:'tippecanoe -o /Users/someone/private-data/out.pmtiles'});
  expect(bad.includes(Buffer.from('/Users/'))).toBe(false);expect(pmtilesMetadata(bad)).toContain('/Users/');
  let root=fixture();put(root,'public/data/t.pmtiles',bad);await fails(root,/PMTiles metadata/);
  root=fixture();put(root,'public/data/t.pmtiles',pmtiles({name:'Sentetik',generator_options:'tippecanoe -o out.pmtiles -L a:a.jsonl'}));expect((await verifyNoPrivate({root})).pmtilesScanned).toBe(1);
 });
 it('adds markers from the local private catalogues and marker file, without naming them in committed code',async()=>{
  let root=fixture();put(root,'private-data/verify-no-private.markers.json',JSON.stringify({markers:['sentetik-kaynak-imi']}));put(root,'public/notes.txt','Sentetik-Kaynak-Imi burada');await fails(root,/kişisel kaynak işareti/);
  root=fixture();put(root,'private-data/v4-photos/room-photos-private-v1.json',JSON.stringify({items:[{creator:'Sentetik Fotoğrafçı (blog)',sourcePage:'https://www.sentetik-blog.test/a'}]}));
  put(root,'dist/assets/a.js','const c="Sentetik Fotoğrafçı"');await fails(root,/kişisel kaynak işareti/);
  rmSync(path.join(root,'dist/assets/a.js'));put(root,'dist/assets/b.js','const u="https://sentetik-blog.test/x"');await fails(root,/kişisel kaynak işareti/);
 });
 // ureten: codex: a source leak must fail even if Vite tree-shakes it out of the built package.
 it.each(['src/new.ts','tests/fixture.ts','scripts/new.mjs','README.md'])('rejects a private marker in %s',async file=>{
  const root=fixture();put(root,'private-data/verify-no-private.markers.json',JSON.stringify({markers:['synthetic-personal-source-927']}));
  put(root,file,'const source = "synthetic-personal-source-927";');await fails(root,/kişisel kaynak işareti/);
 });
 it('checks device-only user point identifiers without committing the actual identifiers',async()=>{
  const root=fixture();put(root,'private-data/v4-user/test.geojson',JSON.stringify({features:[{id:'synthetic-device-point-892'}]}));
  put(root,'src/fixture.ts','const id="synthetic-device-point-892";');await fails(root,/kişisel kaynak işareti/);
 });
 it('permits path-only documentation while covering source files',async()=>{
  const root=fixture();put(root,'README.md','Keep personal data under private-data/.');const r=await verifyNoPrivate({root});expect(r.sourceTextFiles).toBe(1);
 });
});

describe('Privacy gate: byte scan against private-data (local only)',()=>{
 it('fails when any private file appears byte for byte in public or dist, under any name',async()=>{
  const root=fixture();const secret=Buffer.from('sentetik özel GeoJSON '+'x'.repeat(100));put(root,'private-data/v4-underground/s.geojson',secret);put(root,'dist/data/renamed.bin',secret);
  await fails(root,/Özel dosya kamu paketinde: private-data\/v4-underground\/s\.geojson = dist\/data\/renamed\.bin/);
 });
 it('skips browser profiles and QA caches, which hold copies of public assets',async()=>{
  const root=fixture();const asset=Buffer.from('sentetik kamu varlığı '+'y'.repeat(100));put(root,'public/data/a.json',asset);
  put(root,'private-data/qa-run-1/CacheStorage/a',asset);put(root,'private-data/preview/profile/Default/a',asset);put(root,'private-data/other/Local State','{}');put(root,'private-data/other/cache/a',asset);
  const r=await verifyNoPrivate({root});expect(typeof r.hashCheck==='object'&&r.hashCheck.skippedCacheDirs).toBe(3);
 });
 // ureten: opus: a frozen copy of the built app for a local preview is skipped only when it really is a build (manifest + worker).
 it('skips a frozen build snapshot, but not a look-alike folder without the build files',async()=>{
  const root=fixture();const asset=Buffer.from('sentetik kamu varlığı '+'w'.repeat(100));put(root,'public/data/a.json',asset);
  put(root,'private-data/preview/snapshot-0123456789abcdef/data/a.json',asset);put(root,'private-data/preview/snapshot-0123456789abcdef/core-manifest.json','{}');put(root,'private-data/preview/snapshot-0123456789abcdef/sw.js','//');
  const r=await verifyNoPrivate({root});expect(typeof r.hashCheck==='object'&&r.hashCheck.skippedCacheDirs).toBe(1);
  put(root,'private-data/other/snapshot-fedcba9876543210/a.json',asset);await fails(root,/snapshot-fedcba9876543210\/a\.json = public\/data\/a\.json/);
 });
 it('allows only open-licence photos listed in room-photos.json and the verified IGN tile build',async()=>{
  const photo=Buffer.from('sentetik açık lisanslı fotoğraf '+'z'.repeat(100));const root=fixture([{sha256:sha(photo),creator:'Sentetik Açık Fotoğrafçı'}]);
  put(root,'private-data/v4-photos/verified/p.jpg',photo);put(root,'public/media/room-photos/p.jpg',photo);
  const tiles=pmtiles({name:'Sentetik IGN'});put(root,'public/data/region.pmtiles',tiles);put(root,'public/data/region-tiles-meta.json',JSON.stringify({sha256:sha(tiles)}));put(root,'private-data/v4-surface/region.build.pmtiles',tiles);
  const r=await verifyNoPrivate({root});expect(typeof r.hashCheck==='object'&&r.hashCheck.allowed.map(a=>a.reason).sort()).toEqual(['doğrulanmış IGN karo arşivi','room-photos.json açık lisanslı fotoğraf']);
  // The same tile bytes under another private name are not allowlisted.
  put(root,'private-data/v4-surface/copy.pmtiles',tiles);await fails(root,/copy\.pmtiles/);
 });
 it('allows only a decoded, explicitly open-licence landcover build',async()=>{
  const root=fixture(),tiles=pmtiles({name:'Synthetic landcover'});put(root,'public/data/landcover.pmtiles',tiles);put(root,'private-data/v4-landcover/tiles-test/landcover.pmtiles',tiles);
  const meta={sha256:sha(tiles),license:'etalab-2.0',sourceUrl:'https://geoservices.ign.fr/bdtopo',verification:{allSelectedSourceidsPreserved:true}};
  put(root,'public/data/landcover-meta.json',JSON.stringify(meta));put(root,'private-data/v4-landcover/tiles-test/landcover-meta.json',JSON.stringify(meta));expect((await verifyNoPrivate({root})).ok).toBe(true);
  put(root,'public/data/landcover-meta.json',JSON.stringify({...meta,verification:{allSelectedSourceidsPreserved:false}}));await fails(root,/Özel dosya kamu paketinde/);
 });
});

describe('Privacy gate on the real public folder',()=>{
 it('the committed public/ passes (byte scan runs only where private-data exists)',async()=>{
  const r=await verifyNoPrivate({targets:['public']});expect(r.ok).toBe(true);expect(r.pmtilesScanned).toBe(2);
  expect(pmtilesMetadata(readFileSync('public/data/region.pmtiles'))).not.toMatch(/\/Users\/|private-data/);
  expect(pmtilesMetadata(readFileSync('public/data/landcover.pmtiles'))).not.toMatch(/\/Users\/|private-data/);
 });
});
