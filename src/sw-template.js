// ureten: codex. Build injects immutable CORE/CACHE constants above this file.
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const existed=await caches.has(CACHE);const cache=await caches.open(CACHE);
  try{for(const asset of CORE){const url=new URL(asset.url,self.registration.scope);const r=await fetch(url,{cache:'reload'});if(!r.ok)throw Error('Core download failed');const bytes=await r.arrayBuffer();if(await sha(bytes)!==asset.sha256)throw Error('Core integrity failed');await cache.put(url,new Response(bytes,{headers:r.headers}));}}
  catch(e){if(!existed)await caches.delete(CACHE);throw e;}
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const previous=(await caches.keys()).filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE);for(const k of previous.slice(0,Math.max(0,previous.length-1)))await caches.delete(k);await self.clients.claim();})()));
async function sha(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function activePackCaches(){return new Promise(resolve=>{const req=indexedDB.open(DATABASE_NAME);req.onupgradeneeded=()=>req.transaction.abort();req.onerror=()=>resolve([]);req.onsuccess=()=>{const d=req.result;if(!d.objectStoreNames.contains('packs')){d.close();resolve([]);return;}const r=d.transaction('packs').objectStore('packs').getAll();r.onsuccess=()=>{d.close();resolve(r.result.map(p=>p.cache));};r.onerror=()=>{d.close();resolve([]);};};});}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
 if(request.method==='GET'&&request.destination==='image'&&url.protocol==='https:'&&url.hostname==='assets.catacombes.xyz'&&url.pathname.startsWith('/assets/models/')&&/\.(webp|png|jpe?g)$/i.test(url.pathname)){
  event.respondWith((async()=>{const cache=await caches.open(CACHE_PREFIX.replace(/core-$/,'')+'room-previews-v1'),saved=await cache.match(request);if(saved)return saved;const response=await fetch(request);if(response.ok||response.type==='opaque'){try{await cache.put(request,response.clone());const keys=await cache.keys();for(const key of keys.slice(0,Math.max(0,keys.length-100)))await cache.delete(key);}catch{/* Display remains available when device cache is full. */}}return response;})());return;
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
self.addEventListener('message',event=>{if(event.data?.type==='CACHE_ROOM_PREVIEWS')event.waitUntil((async()=>{const urls=[...new Set(Array.isArray(event.data.urls)?event.data.urls:[])].filter(value=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='assets.catacombes.xyz'&&u.pathname.startsWith('/assets/models/')&&/\.(webp|png|jpe?g)$/i.test(u.pathname);}catch{return false;}}).slice(0,46),cache=await caches.open(CACHE_PREFIX.replace(/core-$/,'')+'room-previews-v1');let index=0,done=0,failed=0;const deadline=Date.now()+90000;async function job(){while(index<urls.length&&Date.now()<deadline){const url=urls[index++],c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);try{if(!await cache.match(url)){const response=await fetch(url,{mode:'no-cors',credentials:'omit',signal:c.signal});if(!response.ok&&response.type!=='opaque')throw Error('Image unavailable');await cache.put(url,response);}done++;}catch{failed++;}finally{clearTimeout(timer);event.ports[0]?.postMessage({type:'progress',done,total:urls.length,failed});}}}await Promise.all([job(),job()]);event.ports[0]?.postMessage({type:'done',done,total:urls.length,failed:failed+urls.length-index});})());});
