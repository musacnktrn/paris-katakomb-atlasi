// ureten: opus: public photo catalogue, build gate, personal collection photo schema and image preference.
// Only synthetic images are generated here; the real private ZIP is read only when it exists on this machine.
import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync,mkdtempSync,mkdirSync,writeFileSync,cpSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {unzipSync} from 'fflate';
import {publicPhotoCatalogSchema,publicPhotoViews,groupPhotos,roomImage,isActiveCollectionAsset,personalPhotoView,SCAN_CAPTION,type PhotoView} from '../src/core/room-photos';
import {collectionSchema} from '../src/core/collections';
import type {LocalAsset} from '../src/core/storage';
import {verifyRoomPhotos,imageSize} from '../scripts/verify-room-photos.mjs';
import {tinyPng} from './helpers/tiny-png';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const catalog=JSON.parse(readFileSync('public/data/room-photos.json','utf8'));
const rooms=new Set(JSON.parse(readFileSync('public/data/rooms.json','utf8')).rooms.map((r:{id:string})=>r.id));
const photo=catalog.photos[0];

describe('Public room photo catalogue',()=>{
 it('parses and every public file matches its bytes, SHA-256, size and a known room',()=>{
  const parsed=publicPhotoCatalogSchema.parse(catalog);expect(parsed.photos.length).toBeGreaterThan(0);
  for(const p of parsed.photos){const b=readFileSync(path.join('public',p.file.slice(2)));expect(b.length).toBe(p.bytes);expect(sha(b)).toBe(p.sha256);expect(imageSize(b)).toMatchObject({width:p.width,height:p.height});for(const r of p.roomIds)expect(rooms.has(r)).toBe(true);expect(p.modified).toBe(false);}
 });
 it('the only public photo is the unmodified Commons Philibert original (CC BY 2.5)',()=>{
  expect(catalog.photos.map((p:{id:string})=>p.id)).toEqual(['commons-stele-philibert-aspairt-021103']);
  expect(photo).toMatchObject({roomIds:['philibert'],creator:'Rémi Villalongue',width:2048,height:1536,bytes:669433,captureDate:null,licence:{name:'CC BY 2.5',attributionRequired:true,shareAlike:false}});
  expect(createHash('sha1').update(readFileSync('public/media/room-photos/stele-philibert-aspairt-021103.jpg')).digest('hex')).toBe('fd5198137c574d9f72d50f835eae852baaf07cac');
 });
 const bad:[string,Record<string,unknown>][]=[
  ['a private-data path',{file:'./media/room-photos/../../private-data/x.jpg'}],
  ['a non-Commons source page',{sourcePage:'https://photos.example.net/a'}],
  ['an all-rights-reserved licence',{licence:{...photo.licence,name:'Tüm hakları saklı'}}],
  ['a modified file',{modified:true}],
  ['an empty creator',{creator:' '}],
  ['a scan poster kind',{imageKind:'scan-poster'}],
  ['a ShareAlike mismatch',{licence:{...photo.licence,name:'CC BY-SA 4.0'}}],
  ['no room binding',{roomIds:[],featureIds:[]}],
  ['an unverified free-text capture date',{captureDate:'021103'}],
 ];
 for(const [name,patch] of bad)it('rejects '+name,()=>expect(()=>publicPhotoCatalogSchema.parse({...catalog,photos:[{...photo,...patch}]})).toThrow());
 it('turns catalogue rows into public photo views',()=>expect(publicPhotoViews(catalog)[0]).toMatchObject({personal:false,primary:true,url:'./media/room-photos/stele-philibert-aspairt-021103.jpg',licenceName:'CC BY 2.5'}));
});

describe('Build gate scripts/verify-room-photos.mjs',()=>{
 it('passes on the real public folder',async()=>expect((await verifyRoomPhotos()).photos).toHaveLength(1));
 function fixture(){
  const root=mkdtempSync(path.join(tmpdir(),'atlas-photo-gate-')),pub=path.join(root,'public');mkdirSync(path.join(pub,'data'),{recursive:true});mkdirSync(path.join(pub,'media/room-photos'),{recursive:true});
  const png=tinyPng(4,3);writeFileSync(path.join(pub,'media/room-photos/test-photo.png'),png);
  cpSync('public/data/rooms.json',path.join(pub,'data/rooms.json'));
  const entry={...photo,id:'test-photo',file:'./media/room-photos/test-photo.png',bytes:png.length,width:4,height:3,sha256:sha(png),sha1:undefined,creator:'Test Creator'};
  writeFileSync(path.join(pub,'data/room-photos.json'),JSON.stringify({schema:1,photos:[entry]}));
  writeFileSync(path.join(pub,'data/sources.json'),JSON.stringify({sources:[{id:'commons-room-photos',rights:'Fotoğraf: Test Creator · CC BY 2.5'}]}));
  writeFileSync(path.join(pub,'THIRD-PARTY-NOTICES.txt'),`Test Creator ${photo.licence.name} ${photo.sourcePage}`);
  return {root,pub,png,entry};
 }
 it('accepts a correct synthetic catalogue',async()=>{const f=fixture();try{expect((await verifyRoomPhotos({root:f.root,privateCatalogs:[]})).photos).toHaveLength(1);}finally{rmSync(f.root,{recursive:true,force:true});}});
 const cases:[string,(f:ReturnType<typeof fixture>)=>void,RegExp][]=[
  ['an uncatalogued file dropped beside the photos',f=>writeFileSync(path.join(f.pub,'media/room-photos/extra.jpg'),'x'),/Kataloglanmamış/],
  ['changed bytes',f=>writeFileSync(path.join(f.pub,'media/room-photos/test-photo.png'),tinyPng(4,3,[1,2,3])),/SHA-256/],
  ['an unknown room id',f=>writeFileSync(path.join(f.pub,'data/room-photos.json'),JSON.stringify({schema:1,photos:[{...f.entry,roomIds:['no-such-room']}]})),/rooms\.json/],
  ['a non-open licence',f=>writeFileSync(path.join(f.pub,'data/room-photos.json'),JSON.stringify({schema:1,photos:[{...f.entry,licence:{...f.entry.licence,name:'All rights reserved'}}]})),/izin listesinde/],
  ['a host other than Commons',f=>writeFileSync(path.join(f.pub,'data/room-photos.json'),JSON.stringify({schema:1,photos:[{...f.entry,sourcePage:'https://example.org/p'}]})),/commons\.wikimedia\.org/],
  ['missing attribution in the notices',f=>writeFileSync(path.join(f.pub,'THIRD-PARTY-NOTICES.txt'),'nothing'),/THIRD-PARTY/],
  ['a personal photo copied into the public package',f=>writeFileSync(path.join(f.root,'private.json'),JSON.stringify({items:[{sha256:sha(f.png)}]})),/Kişisel fotoğraf/],
 ];
 for(const [name,mutate,error] of cases)it('rejects '+name,async()=>{const f=fixture();try{mutate(f);const priv=existsSync(path.join(f.root,'private.json'))?[path.join(f.root,'private.json')]:[];await expect(verifyRoomPhotos({root:f.root,privateCatalogs:priv})).rejects.toThrow(error);}finally{rmSync(f.root,{recursive:true,force:true});}});
});

describe('Personal collection photos keep their metadata',()=>{
 const png=tinyPng(4,3);
 const meta={creator:'Sentetik Fotoğrafçı',sourcePage:'https://example.org/photo',captionExact:'Sentetik açıklama',captureDate:null,licenceName:'Açık lisans yok',licenceUrl:null,licenceStatus:'personal-cache-only' as const,primary:true,width:4,height:3};
 const asset={path:'photos/a.png',kind:'image' as const,name:'Sentetik foto',sha256:sha(png),bytes:png.length,roomId:'fontaine',roomIds:['fontaine'],category:'room-photo',photo:meta};
 const manifest={schema:1,atlasId:'paris-catacombs',id:'test-photos',title:'Test',rights:'personal-copy',assets:[asset]};
 it('preserves creator, source, caption, licence status, primary and room/feature ids',()=>{const parsed=collectionSchema.parse({...manifest,assets:[{...asset,featureIds:['historic-poi-x']}]});expect(parsed.assets[0]).toMatchObject({roomIds:['fontaine'],featureIds:['historic-poi-x'],photo:meta});});
 it('rejects a room photo without photo metadata',()=>expect(()=>collectionSchema.parse({...manifest,assets:[{...asset,photo:undefined}]})).toThrow());
 it('rejects a personal-only photo inside an archive marked allowed',()=>expect(()=>collectionSchema.parse({...manifest,rights:'allowed'})).toThrow(/kişisel kopya/));
 it('rejects photo metadata on a scan poster',()=>expect(()=>collectionSchema.parse({...manifest,assets:[{...asset,category:'room-poster'}]})).toThrow());
 it('rejects a non-https source page',()=>expect(()=>collectionSchema.parse({...manifest,assets:[{...asset,photo:{...meta,sourcePage:'http://example.org/p'}}]})).toThrow());
 it('rejects a photo bound to no room or feature',()=>expect(()=>collectionSchema.parse({...manifest,assets:[{...asset,roomId:undefined,roomIds:[]}]})).toThrow());
 it('keeps older collections (posters/models) valid',()=>expect(collectionSchema.parse({...manifest,rights:'allowed',assets:[{path:'p.png',kind:'image',name:'poster',sha256:sha(png),bytes:png.length,roomId:'fontaine',category:'room-poster'}]}).assets[0].category).toBe('room-poster'));
 it.skipIf(!existsSync('private-data/v4-photos/atlas-private-room-photos-v1.zip'))('the real private photo ZIP (local only) passes the app schema and every payload hash',()=>{
  const files=unzipSync(new Uint8Array(readFileSync('private-data/v4-photos/atlas-private-room-photos-v1.zip')));const m=collectionSchema.parse(JSON.parse(new TextDecoder().decode(files['collection.json'])));
  expect(m.rights).toBe('personal-copy');for(const a of m.assets){expect(a.category).toBe('room-photo');expect(a.photo?.licenceStatus).toBe('personal-cache-only');expect(sha(files[a.path]!)).toBe(a.sha256);for(const r of a.roomIds??[])expect(rooms.has(r)).toBe(true);}
  // Root-session decision: the public Philibert photo is not inside the personal ZIP and no personal photo is public.
  expect(m.assets.some(a=>a.sha256===photo.sha256)).toBe(false);
 });
});

describe('Image preference and grouping',()=>{
 const view=(id:string,o:Partial<PhotoView>):PhotoView=>({id,url:'u-'+id,sha256:id,roomIds:['fontaine'],featureIds:[],creator:'C-'+id,licenceName:'L',licenceUrl:null,sourcePage:'https://example.org',captionExact:'',captureDate:null,personal:false,primary:false,width:1,height:1,...o});
 it('orders personal before public, primary first, and shows the same bytes once',()=>{
  const g=groupPhotos([view('pub',{primary:true}),view('p2',{personal:true}),view('p1',{personal:true,primary:true}),view('dup',{personal:true,sha256:'pub'})]);
  expect(g.fontaine!.map(v=>v.id)).toEqual(['p1','dup','p2']);
 });
 it('marker image: personal photo > public photo > installed scan > remote scan',()=>{
  expect(roomImage('fontaine',groupPhotos([view('pub',{}),view('mine',{personal:true})]),{fontaine:'blob:poster'},'https://remote')).toMatchObject({src:'u-mine',kind:'photo',personal:true,caption:'Fotoğraf · C-mine · yalnız bu cihazda'});
  expect(roomImage('fontaine',groupPhotos([view('pub',{})]),{fontaine:'blob:poster'},'https://remote')).toMatchObject({src:'u-pub',kind:'photo',caption:'Fotoğraf · C-pub · L'});
  expect(roomImage('fontaine',{},{fontaine:'blob:poster'},'https://remote')).toEqual({src:'blob:poster',kind:'scan',caption:SCAN_CAPTION,personal:false});
  expect(roomImage('fontaine',{},{},'https://remote')).toMatchObject({src:'https://remote',kind:'scan'});
  expect(roomImage('fontaine',{},{})).toBe(null);
  expect(SCAN_CAPTION).toBe('3B tarama görüntüsü · Catacombes.xyz');
 });
 it('a removed or replaced collection asset is not active',()=>{
  const a={id:'c:1',collectionId:'c',kind:'image',category:'room-photo',photo:{creator:'x',sourcePage:'https://e.org',captionExact:'',captureDate:null,licenceName:'L',licenceUrl:null,licenceStatus:'personal-cache-only'},roomIds:['fontaine'],sha256:'s',name:'n',blob:new Blob(),createdAt:''} as LocalAsset;
  expect(isActiveCollectionAsset(a,[])).toBe(false);expect(isActiveCollectionAsset(a,[{id:'c',title:'',assetCount:1,bytes:1,installedAt:'',assetIds:['c:2']}])).toBe(false);expect(isActiveCollectionAsset(a,[{id:'c',title:'',assetCount:1,bytes:1,installedAt:'',assetIds:['c:1']}])).toBe(true);
  expect(personalPhotoView(a,'blob:x')).toMatchObject({personal:true,roomIds:['fontaine'],url:'blob:x'});
 });
});
