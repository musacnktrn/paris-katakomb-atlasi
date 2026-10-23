// ureten: codex — browser-only imports; never uploaded to the repository.
import { db, type LocalAsset } from './storage';
import { digest, validateGeoJSON, validateGlb } from './validation';
import {PMTiles,FileSource} from 'pmtiles';
export async function importFile(file:File) {
  if(!file.size || file.size>128*1024*1024)throw new Error('Dosya boş veya 128 MiB sınırından büyük.');
  const ext=file.name.split('.').pop()?.toLowerCase();
  const kind=ext==='json'||ext==='geojson'?'geojson':ext==='glb'?'glb':ext==='pmtiles'?'pmtiles':['png','jpg','jpeg','webp'].includes(ext??'')?'image':null;
  if(!kind)throw new Error('GeoJSON, GLB, PMTiles veya PNG/JPEG/WebP görseli seçin.');
  const bytes=await file.arrayBuffer();
  if(kind==='image'){
    if(file.size>16*1024*1024)throw new Error('Harita görseli 16 MiB sınırını aşıyor.');
    const b=new Uint8Array(bytes),ascii=(a:number,z:number)=>new TextDecoder().decode(bytes.slice(a,z));
    const png=b[0]===137&&ascii(1,4)==='PNG'&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10;
    const jpeg=b[0]===255&&b[1]===216&&b[2]===255;
    const webp=ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';
    if(!png&&!jpeg&&!webp)throw new Error('PNG, JPEG veya WebP dosya başlığı geçersiz.');
    let image:ImageBitmap;try{image=await createImageBitmap(file);}catch{throw new Error('Harita görseli çözümlenemedi.');}
    const pixels=image.width*image.height;image.close();if(!pixels||pixels>64000000)throw new Error('Harita görseli 64 megapiksel sınırını aşıyor.');
  }
  // ureten: opus: F4 the package header (top-level name/createdAt) is kept with the asset; the features are not stored twice.
  let header:{packageName?:string;packageCreatedAt?:string}={};
  if(kind==='geojson'){const raw=JSON.parse(new TextDecoder().decode(bytes)) as {name?:unknown;createdAt?:unknown};validateGeoJSON(raw);header={packageName:typeof raw.name==='string'?raw.name:'',packageCreatedAt:typeof raw.createdAt==='string'?raw.createdAt:''};}
  if(kind==='glb')validateGlb(bytes);
  if(kind==='pmtiles' && (bytes.byteLength<127 || new TextDecoder().decode(bytes.slice(0,7))!=='PMTiles' || new Uint8Array(bytes)[7]!==3))throw new Error('PMTiles v3 başlığı gerekiyor.');
  if(kind==='pmtiles'){const archive=new PMTiles(new FileSource(file));await archive.getHeader();await archive.getMetadata();}
  const hash=await digest(bytes);const asset:LocalAsset={id:hash,name:file.name,kind,blob:new Blob([bytes]),sha256:hash,createdAt:new Date().toISOString(),...header};
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
