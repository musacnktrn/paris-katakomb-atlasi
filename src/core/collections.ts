// ureten: codex — verified ZIP collections stay on this device; atomic asset commit.
import {unzip,unzipSync,type Unzipped} from 'fflate';
import {z} from 'zod';
import {db,type LocalAsset,type CollectionRecord} from './storage';
import {digest,validateGlb} from './validation';
import {jpegOrientation,photoSizeMatches} from './image-meta';
export type {CollectionRecord} from './storage';
const safePath=(p:string)=>/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(p)&&!p.split('/').some(x=>x==='..'||x==='.');
const bounds=z.tuple([z.number().min(-180).max(180),z.number().min(-90).max(90),z.number().min(-180).max(180),z.number().min(-90).max(90)]).refine(b=>b[0]<b[2]&&b[1]<b[3],'Görsel sınır sırası geçersiz.');
// ureten: opus: room camera photos keep their source, creator and licence; a personal-only photo needs a personal-copy archive.
const httpsUrl=(v:string)=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
export const roomPhotoMetaSchema=z.object({creator:z.string().trim().min(1).max(200),sourcePage:z.string().max(2000).refine(httpsUrl,'Fotoğraf kaynak sayfası https adresi olmalı.'),captionExact:z.string().max(1000),captureDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),licenceName:z.string().trim().min(1).max(200),licenceUrl:z.string().max(2000).refine(httpsUrl,'Lisans adresi https olmalı.').nullable(),licenceStatus:z.enum(['personal-cache-only','open']),primary:z.boolean().optional(),width:z.number().int().positive().max(20000).optional(),height:z.number().int().positive().max(20000).optional()});
const mapSourceSchema=z.object({id:z.string().regex(/^[a-z0-9-]{1,100}$/),title:z.string().min(1).max(200),placement:z.enum(['native','approximate','unlocated']),positionNote:z.string().min(1).max(1000),sourceUrl:z.string().max(2000).refine(httpsUrl).optional(),defaultVisible:z.boolean().optional()});
const assetSchema=z.object({path:z.string().refine(safePath),kind:z.enum(['glb','image','raster']),name:z.string().min(1).max(200),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().positive().max(128*1024*1024),roomId:z.string().max(100).optional(),roomIds:z.array(z.string().min(1).max(100)).max(50).optional(),featureIds:z.array(z.string().min(1).max(120)).max(50).optional(),category:z.string().max(80).optional(),mapBounds:bounds.optional(),photo:roomPhotoMetaSchema.optional(),mapSource:mapSourceSchema.optional()});
export const collectionSchema=z.object({schema:z.literal(1),atlasId:z.literal('paris-catacombs'),id:z.string().regex(/^[a-z0-9-]{1,80}$/),title:z.string().min(1).max(200),rights:z.enum(['allowed','personal-copy']),assets:z.array(assetSchema).min(1).max(1500)}).refine(m=>new Set(m.assets.map(a=>a.path)).size===m.assets.length,'Arşivde yinelenen dosya yolu var.').refine(m=>m.assets.every(a=>a.kind!=='raster'||a.mapBounds),'Raster dosyası gerçek coğrafi sınır gerektirir.').refine(m=>m.assets.reduce((n,a)=>n+a.bytes,0)<=512*1024*1024,'Arşiv paketi 512 MiB sınırını aşıyor.')
 .refine(m=>m.assets.every(a=>a.category!=='room-photo'||a.kind==='image'&&!!a.photo&&!!(a.roomId||a.roomIds?.length||a.featureIds?.length)),'Salon fotoğrafı kaynak, lisans ve salon bağlantısı gerektirir.')
 .refine(m=>m.assets.every(a=>!a.photo||a.category==='room-photo'),'Fotoğraf bilgisi yalnız salon fotoğrafı kaydında kullanılabilir.')
 .refine(m=>m.assets.every(a=>a.mapSource?.placement!=='unlocated'||!a.mapBounds),'Konumu bilinmeyen görsele coğrafi sınır atanamaz.')
 .refine(m=>m.assets.every(a=>a.category!=='source-map-georeferenced'||a.mapBounds&&a.mapSource&&a.mapSource.placement!=='unlocated'),'Kaynak harita katmanı konum kaydı ve kaynak açıklaması gerektirir.')
 .refine(m=>m.assets.every(a=>a.photo?.licenceStatus!=='personal-cache-only'||m.rights==='personal-copy'),'Yalnız kişisel kopya olarak işaretli fotoğraf, kişisel kopya arşivinde olmalı.');
export function validateRasterHeader(bytes:Uint8Array){const a=(s:number,e:number)=>new TextDecoder().decode(bytes.slice(s,e));return bytes[0]===255&&bytes[1]===216&&bytes[2]===255||bytes[0]===137&&a(1,4)==='PNG'&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10||a(0,4)==='RIFF'&&a(8,12)==='WEBP';}
// ureten: opus: a declared photo size must match the decoded image (bytes were already SHA-256 verified).
// F4: orientation-aware; a rotated phone JPEG (EXIF Orientation 5-8) decodes with width and height swapped and is accepted.
async function checkPhotoSize(buffer:ArrayBuffer,width:number,height:number,name:string){if(typeof createImageBitmap!=='function')return;let image:ImageBitmap;try{image=await createImageBitmap(new Blob([buffer]));}catch{throw new Error('Arşivdeki fotoğraf çözümlenemedi: '+name);}const ok=photoSizeMatches({width:image.width,height:image.height},{width,height},jpegOrientation(new Uint8Array(buffer)));image.close();if(!ok)throw new Error('Arşivdeki fotoğrafın boyutu manifestle eşleşmiyor: '+name);}
export async function importCollection(file:File,onProgress:(done:number,total:number)=>void=()=>{}){
 if(!file.size||file.size>512*1024*1024)throw new Error('ZIP arşivi boş veya 512 MiB sınırını aşıyor.');
 const zipped=new Uint8Array(await file.arrayBuffer());
 const meta=unzipSync(zipped,{filter:f=>f.name==='collection.json'&&f.originalSize<=1024*1024})['collection.json'];
 if(!meta)throw new Error('ZIP içinde collection.json manifesti bulunamadı.');
 const manifest=collectionSchema.parse(JSON.parse(new TextDecoder().decode(meta)));const paths=new Map(manifest.assets.map(a=>[a.path,a]));
 const total=manifest.assets.reduce((n,a)=>n+a.bytes,0);const estimate=await navigator.storage?.estimate?.();if(estimate?.quota&&estimate.quota-(estimate.usage??0)<total*1.15)throw new Error('Bu arşiv için cihazda yeterli tarayıcı alanı yok.');
 let invalidSize=false;const files=await new Promise<Unzipped>((resolve,reject)=>unzip(zipped,{filter:f=>{const a=paths.get(f.name);if(!a)return false;if(f.originalSize!==a.bytes){invalidSize=true;return false;}return true;}},(error,data)=>error?reject(error):resolve(data)));
 if(invalidSize)throw new Error('Arşiv dosya boyutları manifestle eşleşmiyor.');
 const prepared:LocalAsset[]=[];let done=0;
 for(const entry of manifest.assets){const bytes=files[entry.path];if(!bytes||bytes.byteLength!==entry.bytes)throw new Error('Arşiv dosyası eksik veya boyutu hatalı: '+entry.name);const buffer=bytes.slice().buffer;if(await digest(buffer)!==entry.sha256)throw new Error('Arşiv SHA-256 doğrulaması başarısız: '+entry.name);
  if(entry.kind==='glb')validateGlb(buffer);else if(!validateRasterHeader(bytes))throw new Error('Arşivde geçersiz görsel dosyası var.');
  if(entry.photo?.width&&entry.photo.height)await checkPhotoSize(buffer,entry.photo.width,entry.photo.height,entry.name);
  prepared.push({id:manifest.id+':'+entry.sha256+':'+entry.path,name:entry.name,kind:entry.kind==='glb'?'glb':'image',blob:new Blob([buffer]),sha256:entry.sha256,createdAt:new Date().toISOString(),roomId:entry.roomId,roomIds:[...new Set([...(entry.roomId?[entry.roomId]:[]),...(entry.roomIds??[])])],...(entry.featureIds?{featureIds:entry.featureIds}:{}),...(entry.photo?{photo:entry.photo}:{}),...(entry.mapSource?{mapSource:entry.mapSource}:{}),category:entry.category??(entry.kind==='raster'?'igc-raster':entry.kind==='glb'?'room-model':'room-poster'),mapBounds:entry.mapBounds,collectionId:manifest.id});delete files[entry.path];done+=entry.bytes;onProgress(done,total);
 }
 const record:CollectionRecord={id:manifest.id,title:manifest.title,assetCount:prepared.length,bytes:total,installedAt:new Date().toISOString(),assetIds:prepared.map(a=>a.id),rights:manifest.rights};
 const d=await db(),tx=d.transaction(['assets','collections'],'readwrite');const currentIds=new Set(record.assetIds);for(const a of await tx.objectStore('assets').getAll())if(a.collectionId===record.id&&!currentIds.has(a.id))await tx.objectStore('assets').delete(a.id);for(const a of prepared){await tx.objectStore('assets').put(a);}await tx.objectStore('collections').put(record);await tx.done;return record;
}
export async function activeAssets(){const d=await db(),[assets,collections]=await Promise.all([d.getAll('assets'),d.getAll('collections')]);const active=new Map(collections.map(c=>[c.id,c.assetIds?new Set(c.assetIds):null]));return assets.filter(a=>!a.collectionId||active.has(a.collectionId)&&(!active.get(a.collectionId)||active.get(a.collectionId)!.has(a.id)));}
export async function getRoomAsset(roomId:string,quality:'optimized'|'original'='optimized'){const assets=(await activeAssets()).filter(a=>a.kind==='glb'&&(a.roomId===roomId||a.roomIds?.includes(roomId))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return quality==='original'?(assets.find(a=>a.category==='room-original')??null):(assets.find(a=>a.category==='room-model')??assets[0]??null);}
export async function getRasterAssets(){return (await activeAssets()).filter(a=>(a.category?.startsWith('igc-raster')||a.category==='source-map-georeferenced')&&a.mapBounds);}
export async function listCollections(){return (await(await db()).getAll('collections'));}

export async function removeCollection(id:string){const d=await db(),tx=d.transaction(['assets','collections'],'readwrite');for(const a of await tx.objectStore('assets').getAll())if(a.collectionId===id)await tx.objectStore('assets').delete(a.id);await tx.objectStore('collections').delete(id);await tx.done;}
