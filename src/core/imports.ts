// ureten: codex — browser-only imports; never uploaded to the repository.
import { db, type LocalAsset } from './storage';
import { digest, validateGeoJSON, validateGlb } from './validation';
import {PMTiles,FileSource} from 'pmtiles';
export async function importFile(file:File) {
  if(!file.size || file.size>128*1024*1024)throw new Error('Dosya boş veya 128 MiB sınırından büyük.');
  const ext=file.name.split('.').pop()?.toLowerCase();
  const kind=ext==='json'||ext==='geojson'?'geojson':ext==='glb'?'glb':ext==='pmtiles'?'pmtiles':null;
  if(!kind)throw new Error('Bu altyapı sürümü GeoJSON, GLB ve PMTiles kabul eder; GPX ve raster konumlandırma sonraki entegrasyondadır.');
  const bytes=await file.arrayBuffer();
  if(kind==='geojson')validateGeoJSON(JSON.parse(new TextDecoder().decode(bytes)));
  if(kind==='glb')validateGlb(bytes);
  if(kind==='pmtiles' && (bytes.byteLength<127 || new TextDecoder().decode(bytes.slice(0,7))!=='PMTiles' || new Uint8Array(bytes)[7]!==3))throw new Error('PMTiles v3 başlığı gerekiyor.');
  if(kind==='pmtiles'){const archive=new PMTiles(new FileSource(file));await archive.getHeader();await archive.getMetadata();}
  const hash=await digest(bytes);const asset:LocalAsset={id:hash,name:file.name,kind,blob:new Blob([bytes]),sha256:hash,createdAt:new Date().toISOString()};
  await (await db()).put('assets',asset);return asset;
}
export async function importNotes(value:unknown) {
  const x=value as {schema?:number;atlasId?:string;notes?:unknown[]};
  if(x?.schema!==1 || x.atlasId!=='paris-catacombs' || !Array.isArray(x.notes) || x.notes.length>10000)throw new Error('Not yedeği biçimi geçersiz.');
  const notes=x.notes.map(row=>{
    const n=row as {id?:string;title?:string;text?:string;coordinates?:unknown;createdAt?:string;updatedAt?:string};
    if(typeof n.id!=='string' || n.id.length>100 || typeof n.title!=='string' || !n.title.trim() || n.title.length>200 || typeof n.text!=='string' || n.text.length>20000 || !Number.isFinite(Date.parse(n.createdAt??'')) || !Number.isFinite(Date.parse(n.updatedAt??'')))throw new Error('Yedekte geçersiz not var.');
    const c=n.coordinates;if(c!==null&&(!Array.isArray(c)||c.length!==2||!c.every(Number.isFinite)||Math.abs(c[0])>180||Math.abs(c[1])>90))throw new Error('Not koordinatı geçersiz.');
    return {id:n.id,title:n.title,text:n.text,coordinates:c as [number,number]|null,createdAt:n.createdAt!,updatedAt:n.updatedAt!};
  });
  if(new Set(notes.map(n=>n.id)).size!==notes.length)throw new Error('Yedekte yinelenen not kimliği var.');
  const d=await db(),tx=d.transaction('notes','readwrite');
  for(const n of notes){const previous=await tx.store.get(n.id);if(!previous || Date.parse(n.updatedAt)>Date.parse(previous.updatedAt))await tx.store.put(n);}
  await tx.done;return notes.length;
}
