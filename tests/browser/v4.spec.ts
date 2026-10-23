// ureten: codex. Regional real tiles and explicit fixtures for photo repair/private imports.
import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
// ureten: opus. Imports for the fresh-process corrupt photo test below.
import {chromium,type BrowserContext} from '@playwright/test';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
async function open(page:Page){await page.goto('./');await expect(page.getByTestId('status')).toContainText('Atlas hazır',{timeout:30000});await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});}
async function photo(page:Page){await page.getByRole('textbox',{name:'Pafta ara'}).fill('Fontaine');await page.getByRole('button',{name:'Fontaine des Chartreux konumunu göster',exact:true}).click();await expect.poll(()=>page.getByTestId('room-preview').evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth),{timeout:15000}).toBe(192);}
test('bad original images fall back to decoded alternate format and survive offline',async({page,context})=>{
 const png=await readFile('public/icons/icon-192.png');await context.route('https://assets.catacombes.xyz/**',r=>r.fulfill({body:'broken image',contentType:'image/webp'}));await context.route('https://catacombes.xyz/_next/image?**',r=>r.fulfill({body:png,contentType:'image/png'}));await open(page);await photo(page);await expect(page.getByTestId('room-preview')).toHaveAttribute('src',/catacombes.xyz\/_next\/image/);
 await expect.poll(()=>page.evaluate(async()=>{for(const n of await caches.keys())if(n.endsWith('room-previews-v1'))return (await(await caches.open(n)).keys()).some(k=>k.url.includes('_next/image')&&k.url.toLowerCase().includes('fontaine'));return false;})).toBe(true);
 await context.setOffline(true);await page.reload();await expect(page.getByTestId('status')).toContainText('Atlas hazır');await photo(page);
});
// ureten: opus. Real user case: an undecodable body persisted in Cache API, app reopened later in a NEW browser process
// (empty Blink memory cache), so the SW-served corrupt entry is really what the <img> receives.
test('a corrupt persisted photo is evicted without deleting the rest of the offline app',async({},testInfo)=>{
 test.setTimeout(240000);
 const png=await readFile('public/icons/icon-192.png'),coreVersion=JSON.parse(await readFile('dist/core-manifest.json','utf8')).version as string,use=testInfo.project.use,dir=await mkdtemp(path.join(tmpdir(),'atlas-corrupt-photo-'));
 const launch=()=>chromium.launchPersistentContext(dir,{channel:use.channel,headless:true,args:use.launchOptions?.args,viewport:use.viewport??null,baseURL:use.baseURL});
 const kind=(b:Buffer)=>b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))?'png':b.subarray(0,4).toString('latin1')==='RIFF'&&b.subarray(8,12).toString('latin1')==='WEBP'?'webp':b[0]===0xff&&b[1]===0xd8&&b[2]===0xff?'jpeg':'corrupt';
 // DevTools protocol reads opaque (no-cors) cached bodies, which page JS cannot; result: deleted | png | webp | jpeg | corrupt.
 async function cached(page:Page,url:string){const cdp=await page.context().newCDPSession(page);try{const {caches}=await cdp.send('CacheStorage.requestCacheNames',{securityOrigin:'http://127.0.0.1:5184'});const c=caches.find(x=>x.cacheName.endsWith('room-previews-v1'));if(!c)return 'no-preview-cache';const {cacheDataEntries}=await cdp.send('CacheStorage.requestEntries',{cacheId:c.cacheId});const e=cacheDataEntries.find(x=>x.requestURL===url);if(!e)return 'deleted';const {response}=await cdp.send('CacheStorage.requestCachedResponse',{cacheId:c.cacheId,requestURL:url,requestHeaders:e.requestHeaders});return kind(Buffer.from(response.body,'base64'));}finally{await cdp.detach().catch(()=>{});}}
 const evidence:Record<string,unknown>={};let context:BrowserContext|undefined;
 try{
  // Phase 1: healthy install; all originals decode. Fallback requests are aborted so no fallback copy is pre-seeded.
  context=await launch();let page=context.pages()[0]??await context.newPage();
  await context.route('https://assets.catacombes.xyz/**',r=>r.fulfill({body:png,contentType:'image/png'}));await context.route('https://catacombes.xyz/_next/image?**',r=>r.abort());
  await open(page);
  const original:string=await page.evaluate(async()=>(await(await fetch('./data/rooms.json')).json()).rooms.find((r:any)=>r.id==='fontaine').posterUrl),fallback='https://catacombes.xyz/_next/image?'+new URLSearchParams({url:original,w:'640',q:'75'});
  // Wait until the automatic preload stored every original (46 posters), so it cannot race with the fixture.
  await expect.poll(()=>page.evaluate(async()=>{const n=(await caches.keys()).find(k=>k.endsWith('room-previews-v1'));return n?(await(await caches.open(n)).keys()).filter(k=>k.url.startsWith('https://assets.catacombes.xyz/')).length:0;}),{timeout:90000}).toBe(46);
  expect(await cached(page,original)).toBe('png');
  await page.evaluate(async url=>{const name=(await caches.keys()).find(n=>n.endsWith('room-previews-v1'))!;await(await caches.open(name)).put(url,new Response('invalid image body',{headers:{'Content-Type':'image/webp'}}));},original);
  expect(await page.evaluate(async url=>{const name=(await caches.keys()).find(n=>n.endsWith('room-previews-v1'))!;return (await(await caches.open(name)).match(url))?.text();},original)).toBe('invalid image body');
  expect(await cached(page,original)).toBe('corrupt');expect(await cached(page,fallback)).toBe('deleted');
  await context.close();context=undefined;
  // Phase 2: same profile, fresh browser process. The source still serves a broken original; the proxy works.
  context=await launch();page=context.pages()[0]??await context.newPage();const hits={original:0,fallback:0};evidence.hits=hits;
  await context.route('https://assets.catacombes.xyz/**',r=>{hits.original++;return r.fulfill({body:'still broken',contentType:'image/webp'});});await context.route('https://catacombes.xyz/_next/image?**',r=>{hits.fallback++;return r.fulfill({body:png,contentType:'image/png'});});
  // Out-of-scope 404 on the same origin: gives CDP a frame for the storage key without starting the app or its worker.
  await page.goto('/__atlas-cache-probe__');evidence.originalBeforeReopen=await cached(page,original);expect(evidence.originalBeforeReopen).toBe('corrupt');
  await open(page);await photo(page);await expect(page.getByTestId('room-preview')).toHaveAttribute('src',/_next\/image/);
  await expect.poll(()=>cached(page,fallback),{timeout:20000}).toBe('png');
  // Correct end state: the corrupt original is DELETED (FORGET_ROOM_PREVIEW), not kept and not re-cached from the still-broken source.
  await expect.poll(()=>cached(page,original),{timeout:20000}).toBe('deleted');
  await expect(page.locator('#map')).toHaveAttribute('data-region-ready','true');
  const core=await page.evaluate(async()=>({keys:await caches.keys(),verify:await new Promise<any>(r=>{const c=new MessageChannel();c.port1.onmessage=e=>r(e.data);navigator.serviceWorker.controller!.postMessage({type:'VERIFY_CORE'},[c.port2]);})}));
  expect(core.keys.some(k=>k.endsWith('-core-'+coreVersion))).toBe(true);expect(core.verify).toMatchObject({ok:true});expect(core.verify.version.endsWith(coreVersion)).toBe(true);
  // Offline: no route can answer; only the device cache can.
  await context.unrouteAll({behavior:'ignoreErrors'});await context.route(/^https:\/\/(assets\.)?catacombes\.xyz\//,r=>r.abort('internetdisconnected'));await context.setOffline(true);
  await page.reload();await expect(page.getByTestId('status')).toContainText('Atlas hazır',{timeout:30000});await photo(page);await expect(page.getByTestId('room-preview')).toHaveAttribute('src',/_next\/image/);
  evidence.originalAfterOffline=await cached(page,original);expect(evidence.originalAfterOffline).not.toBe('corrupt');
  Object.assign(evidence,{coreCache:core.keys.find(k=>k.endsWith('-core-'+coreVersion)),verify:core.verify});
 }finally{await testInfo.attach('corrupt-photo-evidence',{body:JSON.stringify(evidence,null,1),contentType:'application/json'});await context?.close().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});
test('regional roads cover an eastern outer sheet and source-height buildings render offline',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await page.getByRole('button',{name:'Paftalar',exact:true}).click();await expect(page.getByTestId('result-count')).toHaveText('458 sonuç');
 const sheets=JSON.parse(await readFile('public/data/igc-index.geojson','utf8'));const max=(a:any)=>Math.max(...a.geometry.coordinates.flat(2).filter((_:any,i:number)=>i%2===0));const edge=sheets.features.sort((a:any,b:any)=>max(b)-max(a))[0];await page.getByRole('textbox',{name:'Pafta ara'}).fill(String(edge.properties.sheetId));await page.getByRole('button',{name:`IGC ${edge.properties.sheetId} paftasını seç`,exact:true}).click();await expect.poll(async()=>Number(await page.locator('#map').getAttribute('data-region-roads-rendered'))).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Güney ağına dön',exact:true}).click();await page.getByRole('button',{name:'Coğrafi 3B görünüm',exact:true}).click();await expect.poll(async()=>Number(await page.locator('#map').getAttribute('data-buildings-rendered'))).toBeGreaterThan(0);await expect.poll(async()=>Number(await page.locator('#map').getAttribute('data-map-pitch'))).toBe(60);
 await context.setOffline(true);await page.reload();await expect(page.getByTestId('status')).toContainText('Atlas hazır');await expect(page.locator('#map')).toHaveAttribute('data-region-ready','true');await page.getByRole('button',{name:'Coğrafi 3B görünüm',exact:true}).click();await expect.poll(async()=>Number(await page.locator('#map').getAttribute('data-buildings-rendered'))).toBeGreaterThan(0);expect(errors).toEqual([]);
});
test('personal vector lines and shafts reload automatically, remain selectable and toggle offline',async({page,context})=>{
 await open(page);const geo={type:'FeatureCollection',features:[{type:'Feature',id:'shaft-test',properties:{id:'shaft-test',kind:'shaft',title:'Historical test shaft',accessStatus:'unknown'},geometry:{type:'Point',coordinates:[2.326,48.833]}},{type:'Feature',id:'line-test',properties:{id:'line-test',kind:'linework',title:'Historical plan strokes'},geometry:{type:'LineString',coordinates:[[2.325,48.832],[2.327,48.834]]}}]};
 await page.getByLabel('Dosya içe aktar',{exact:true}).setInputFiles({name:'private-network.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(geo))});await expect(page.locator('#map')).toHaveAttribute('data-personal-features','2');await context.setOffline(true);await page.reload();await expect(page.getByTestId('status')).toContainText('Atlas hazır');await expect(page.locator('#map')).toHaveAttribute('data-personal-features','2');await page.getByRole('button',{name:/Yeraltı 2/}).click();await page.getByRole('textbox',{name:'Pafta ara'}).fill('Historical test shaft');await page.getByRole('button',{name:'Historical test shaft konumunu göster',exact:true}).click();await expect(page.getByRole('complementary',{name:'Kayıt ayrıntısı'})).toContainText('güncel erişim durumu bilinmiyor');
});

test('desktop expanding the map retains a visible canvas in the third grid column',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Haritayı genişlet',exact:true}).click();expect(await page.locator('#map').evaluate(el=>el.clientWidth)).toBeGreaterThan(1000);await expect(page.locator('#map canvas')).toBeVisible();await expect(page.getByRole('button',{name:'Gezgin panelini göster',exact:true})).toBeVisible();
});
test('room portraits react to hover/focus and access symbols have distinct labels',async({page,context})=>{
 const png=await readFile('public/icons/icon-192.png');await context.route('https://assets.catacombes.xyz/**',r=>r.fulfill({body:png,contentType:'image/png'}));await context.route('https://catacombes.xyz/_next/image?**',r=>r.fulfill({body:png,contentType:'image/png'}));await open(page);
 await page.getByRole('textbox',{name:'Pafta ara'}).fill('Fontaine');await page.getByRole('button',{name:'Fontaine des Chartreux konumunu göster',exact:true}).click();await page.getByRole('button',{name:'Ayrıntıyı kapat'}).click();const room=page.locator('[data-marker-id="fontaine"]');await expect(room.locator('img')).toBeVisible();await room.hover();await expect(page.getByRole('tooltip')).toContainText('Fontaine des Chartreux');await expect(page.getByRole('tooltip')).toContainText('21 m');await room.focus();await expect(page.getByRole('tooltip')).toBeVisible();await room.press('Enter');await expect(page.getByRole('complementary',{name:'Kayıt ayrıntısı'})).toContainText('Fontaine des Chartreux');
 await page.getByRole('button',{name:'Ayrıntıyı kapat'}).click();await page.getByRole('button',{name:'Güney ağına dön',exact:true}).click();await expect(page.locator('[data-marker-id="museum-entry"]')).toHaveClass(/is-entry/);await expect(page.locator('[data-marker-id="museum-exit"]')).toHaveClass(/is-exit/);await page.locator('[data-marker-id="museum-entry"]').hover();await expect(page.getByRole('tooltip')).toContainText('Resmî müze girişi');
});
