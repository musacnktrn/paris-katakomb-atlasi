// ureten: codex. Build injects immutable CORE/CACHE constants above this file.
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const existed=await caches.has(CACHE);const cache=await caches.open(CACHE);
  // ureten: opus: F4 every core file is SHA-256 checked, so the HTTP cache may serve it first (the page has often just downloaded the
  // 64 MB regional tiles); only a missing or mismatching copy is fetched again past the cache.
  try{for(const asset of CORE){const url=new URL(asset.url,self.registration.scope);let r=await fetch(url),bytes=r.ok?await r.arrayBuffer():null;if(!bytes||await sha(bytes)!==asset.sha256){r=await fetch(url,{cache:'reload'});if(!r.ok)throw Error('Core download failed');bytes=await r.arrayBuffer();if(await sha(bytes)!==asset.sha256)throw Error('Core integrity failed');}await cache.put(url,new Response(bytes,{headers:r.headers}));}}
  catch(e){if(!existed)await caches.delete(CACHE);throw e;}
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const previous=(await caches.keys()).filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE);for(const k of previous.slice(0,Math.max(0,previous.length-1)))await caches.delete(k);await self.clients.claim();})()));
async function sha(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function previewKey(value){try{const u=new URL(value);if(u.username||u.password||u.protocol!=='https:')return null;if(u.hostname==='assets.catacombes.xyz'&&u.pathname.startsWith('/assets/models/')&&/\.(webp|png|jpe?g)$/i.test(u.pathname)){u.searchParams.delete('_atlas_retry');return u.href;}if(u.origin==='https://catacombes.xyz'&&u.pathname==='/_next/image'&&['640','1080'].includes(u.searchParams.get('w'))&&u.searchParams.get('q')==='75'){const inner=new URL(u.searchParams.get('url'));if(inner.origin==='https://assets.catacombes.xyz'&&inner.pathname.startsWith('/assets/models/')){u.searchParams.delete('_atlas_retry');return u.href;}}}catch{}return null;}
async function activePackCaches(){return new Promise(resolve=>{const req=indexedDB.open(DATABASE_NAME);req.onupgradeneeded=()=>req.transaction.abort();req.onerror=()=>resolve([]);req.onsuccess=()=>{const d=req.result;if(!d.objectStoreNames.contains('packs')){d.close();resolve([]);return;}const r=d.transaction('packs').objectStore('packs').getAll();r.onsuccess=()=>{d.close();resolve(r.result.map(p=>p.cache));};r.onerror=()=>{d.close();resolve([]);};};});}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
 const picture=previewKey(request.url);
 if(request.method==='GET'&&request.destination==='image'&&picture){
  // ureten: opus: F4 an uncached preview that cannot be fetched (offline) answers with a plain 504 instead of rejecting respondWith,
  // so the page gets an ordinary image error (WebKit reported a rejected respondWith as "TypeError: Load failed").
  event.respondWith((async()=>{try{const cache=await caches.open(CACHE_PREFIX.replace(/core-$/,'')+'room-previews-v1'),saved=url.searchParams.has('_atlas_retry')?null:await cache.match(picture,{ignoreVary:true});if(saved)return saved;const response=await fetch(request);if(response.ok||response.type==='opaque'){try{await cache.put(picture,response.clone());const keys=await cache.keys();for(const key of keys.slice(0,Math.max(0,keys.length-100)))await cache.delete(key);}catch{}}return response;}catch{return new Response('',{status:504,statusText:'Preview unavailable offline',headers:{'Cache-Control':'no-store','Content-Type':'text/plain'}});}})());return;
 }
 if(request.method!=='GET'||request.cache==='no-store'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname)||url.pathname.endsWith('/sw.js'))return;
 event.respondWith((async()=>{
  const core=await caches.open(CACHE);let response=await core.match(request,{ignoreSearch:false});
  if(!response)for(const name of await activePackCaches()){response=await(await caches.open(name)).match(request);if(response)break;}
  if(!response&&!request.url.endsWith('/index.html')&&/\/assets\//.test(url.pathname))for(const name of await caches.keys())if(name.startsWith(CACHE_PREFIX)&&name!==CACHE){response=await(await caches.open(name)).match(request);if(response)break;}
  if(response)return response;
  try{return await fetch(request);}catch{
   if(request.mode==='navigate')return await core.match(new URL('./index.html',scope))||new Response('Çevrimdışı temel paket eksik.',{status:503});
   return new Response('Bu dosya çevrimdışı indirilmemiş.',{status:503});
  }
 })());
});
self.addEventListener('message',event=>{if(event.data?.type==='VERIFY_CORE')event.waitUntil((async()=>{let ok=true;const c=await caches.open(CACHE);for(const a of CORE){const r=await c.match(new URL(a.url,self.registration.scope));if(!r||await sha(await r.arrayBuffer())!==a.sha256){ok=false;break;}}event.ports[0]?.postMessage({ok,count:CORE.length,version:CACHE});})());});
self.addEventListener('message',event=>{if(event.data?.type==='FORGET_ROOM_PREVIEW')event.waitUntil((async()=>{const key=previewKey(event.data.url);if(key){const c=await caches.open(CACHE_PREFIX.replace(/core-$/,'')+'room-previews-v1');await c.delete(key,{ignoreVary:true});}event.ports[0]?.postMessage({type:'forgotten'});})());});
self.addEventListener('message',event=>{if(event.data?.type==='CACHE_ROOM_PREVIEWS')event.waitUntil((async()=>{const urls=[...new Set(Array.isArray(event.data.urls)?event.data.urls:[])].map(previewKey).filter(Boolean).slice(0,46),cache=await caches.open(CACHE_PREFIX.replace(/core-$/,'')+'room-previews-v1');let index=0,done=0,failed=0;const deadline=Date.now()+90000;async function job(){while(index<urls.length&&Date.now()<deadline){const url=urls[index++],c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);try{if(!await cache.match(url,{ignoreVary:true})){const response=await fetch(url,{mode:'no-cors',credentials:'omit',signal:c.signal});if(!response.ok&&response.type!=='opaque')throw Error('Image unavailable');await cache.put(url,response);}done++;}catch{failed++;}finally{clearTimeout(timer);event.ports[0]?.postMessage({type:'progress',done,total:urls.length,failed});}}}await Promise.all([job(),job()]);event.ports[0]?.postMessage({type:'done',done,total:urls.length,failed:failed+urls.length-index});})());});
