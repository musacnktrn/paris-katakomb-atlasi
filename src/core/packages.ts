// ureten: codex — a verified pack is committed only after every asset succeeds.
import { db, CACHE_PREFIX, type InstalledPack } from './storage';
import { digest, localAssetUrl, packSchema, type PackManifest } from './validation';
import {CURRENT_ATLAS} from './catalog';
export async function installPack(input:unknown,base:string,onProgress:(done:number,total:number)=>void=()=>{},signal?:AbortSignal) {
  const pack=packSchema.parse(input); const assets=pack.assets.map(a=>({...a,url:localAssetUrl(a.url,base)}));
  if(pack.atlasId!==CURRENT_ATLAS.id)throw new Error('Bu paket farklı bir atlas için hazırlanmış.');
  if(new Set(assets.map(a=>a.url)).size!==assets.length)throw new Error('Paket aynı dosyayı iki kez içeriyor.');
  const total=assets.reduce((s,a)=>s+a.bytes,0);
  if(total>256*1024*1024)throw new Error('Bu sürümde paket 256 MiB sınırını aşıyor.');
  const database=await db();const previous=await database.get('packs',pack.id);
  const cacheName=`${CACHE_PREFIX}pack-${pack.id}-${crypto.randomUUID()}`;const cache=await caches.open(cacheName);let done=0;
  try {
    for(const asset of assets) {
      signal?.throwIfAborted(); const response=await fetch(asset.url,{signal,cache:'no-store'});
      if(!response.ok || response.type==='opaque')throw new Error(`Dosya alınamadı: ${new URL(asset.url).pathname}`);
      const bytes=await response.arrayBuffer();
      if(bytes.byteLength!==asset.bytes || await digest(bytes)!==asset.sha256)throw new Error('Dosya boyutu veya SHA-256 doğrulaması başarısız.');
      await cache.put(asset.url,new Response(bytes,{headers:response.headers}));done+=bytes.byteLength;onProgress(done,total);
    }
    signal?.throwIfAborted();
    const installed: InstalledPack={id:pack.id,version:pack.version,cache:cacheName,bytes:total,installedAt:new Date().toISOString(),assets};
    await database.put('packs',installed);
  } catch(error) {await caches.delete(cacheName);throw error;}
  // Cleanup failure cannot invalidate the successfully committed replacement.
  if(previous?.cache && previous.cache!==cacheName)await caches.delete(previous.cache).catch(()=>false);
  return (await database.get('packs',pack.id))!;
}
export async function verifyPack(id:string) {
  const pack=await (await db()).get('packs',id);if(!pack)return false;
  const cache=await caches.open(pack.cache);
  for(const a of pack.assets){const response=await cache.match(a.url);if(!response)return false;const bytes=await response.arrayBuffer();if(bytes.byteLength!==a.bytes || await digest(bytes)!==a.sha256)return false;}
  return true;
}
export async function removePack(id:string) {const d=await db();const p=await d.get('packs',id);if(p){await d.delete('packs',id);await caches.delete(p.cache);}}
export async function fetchPackManifest(url:string):Promise<PackManifest> {const r=await fetch(url);if(!r.ok)throw new Error('Paket manifesti alınamadı.');return packSchema.parse(await r.json());}
