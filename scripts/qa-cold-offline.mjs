// ureten: codex. Native browser processes, real optional local archives, no source mocks and no physical-phone claim.
import {chromium,webkit,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const name=process.env.ATLAS_QA_BROWSER==='webkit'?'webkit':'chrome',browser=name==='webkit'?webkit:chromium;
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),out=path.resolve('../outputs/devam-20261023',`cold-${name}-${stamp}`),profile=path.resolve('private-data',`qa-cold-${name}-${stamp}`);
const target=process.env.ATLAS_QA_URL??'http://127.0.0.1:5184/paris-atlas/';
const vectors=[process.env.ATLAS_QA_VECTOR,process.env.ATLAS_QA_ADDITIONAL_VECTOR].filter(Boolean),photos=process.env.ATLAS_QA_PHOTOS;
const installManifest=process.env.ATLAS_QA_INSTALL_MANIFEST?JSON.parse(await readFile(process.env.ATLAS_QA_INSTALL_MANIFEST,'utf8')):null;
await mkdir(out,{recursive:true});
const proof={ureten:'codex',at:new Date().toISOString(),browser:name,target,physicalPhone:false,mockedSources:false,processReopened:false,blockedOutgoing:0,steps:[],errors:[]};
proof.outgoingWriteRequests=0;
const core=JSON.parse(await readFile('dist/core-manifest.json','utf8'));proof.coreVersion=core.version;
let context,page;
async function launch(offline=false){
 context=await browser.launchPersistentContext(profile,{headless:true,...(name==='chrome'?{channel:'chrome',args:['--enable-unsafe-swiftshader']} : {}),viewport:{width:390,height:844},hasTouch:true,isMobile:true,offline});
 // Reject outgoing traffic as well as emulating offline; cached responses are still produced by the real app SW.
 // https://playwright.dev/docs/service-workers documents routing the SW-owned network request, not the cached frame response.
 if(offline&&name==='chrome')await context.route('**/*',async route=>{proof.blockedOutgoing++;await route.abort('internetdisconnected');});
 page=context.pages()[0]??await context.newPage();page.on('pageerror',error=>proof.errors.push(error.message));
 context.on('request',request=>{if(!['GET','HEAD','OPTIONS'].includes(request.method()))proof.outgoingWriteRequests++;});
 await page.goto(target);await expect(page.getByTestId('status')).toContainText('Atlas hazır',{timeout:60000});
 await expect(page.locator('#map')).toHaveAttribute('data-region-ready','true',{timeout:60000});
 if(core.assets.some(a=>a.url==='./data/landcover.pmtiles'))await expect(page.locator('#map')).toHaveAttribute('data-landcover-ready','true',{timeout:60000});
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});
 // ureten: codex: a restored Chromium worker may attach after context launch. Reapply offline to the live worker too.
 if(offline)await context.setOffline(true);
}
async function closeDetail(){const b=page.getByRole('button',{name:'Ayrıntıyı kapat',exact:true});if(await b.isVisible())await b.click();}
async function room(title,expectedWidth){
 await page.getByRole('button',{name:'Haritayı keşfet',exact:true}).click();
 await page.getByRole('button',{name:/^Salonlar/}).click();await page.getByRole('textbox',{name:'Pafta ara'}).fill(title);
 await page.getByRole('button',{name:`${title} konumunu göster`,exact:true}).click();
 await expect.poll(()=>page.getByTestId('room-photo').evaluate(el=>el.complete?el.naturalWidth:0),{timeout:30000}).toBe(expectedWidth);
 const value=await page.getByTestId('room-photo').evaluate(el=>({width:el.naturalWidth,height:el.naturalHeight,local:el.src.startsWith('blob:')||el.src.startsWith(location.origin)}));
 value.personal=(await page.getByTestId('room-photo-credit').innerText()).includes('yalnız bu cihazda');await closeDetail();return value;
}
async function verifyCore(){
 await page.getByRole('button',{name:'Çevrimdışı atlası aç',exact:true}).click();await page.getByRole('button',{name:'Çevrimdışı hazırlığı doğrula',exact:true}).click();
 await expect(page.getByTestId('core-status')).toContainText('Hazır',{timeout:60000});const text=await page.getByTestId('core-status').innerText();
 await page.getByRole('button',{name:'Paneli kapat',exact:true}).click();return text;
}
async function countSaved(){return page.evaluate(()=>new Promise((resolve,reject)=>{const req=indexedDB.open('archify-atlas-paris-catacombs-'+encodeURIComponent(new URL('./',document.baseURI).pathname)+'-v1');req.onerror=()=>reject(Error('storage'));req.onsuccess=()=>{const db=req.result,tx=db.transaction(['assets','collections']);let a,c;const done=()=>{if(a!==undefined&&c!==undefined){db.close();resolve({assets:a,collections:c});}};const ar=tx.objectStore('assets').count();ar.onsuccess=()=>{a=ar.result;done();};const cr=tx.objectStore('collections').count();cr.onsuccess=()=>{c=cr.result;done();};};}));}
async function savedCollection(id){return page.evaluate(id=>new Promise((resolve,reject)=>{const req=indexedDB.open('archify-atlas-paris-catacombs-'+encodeURIComponent(new URL('./',document.baseURI).pathname)+'-v1');req.onerror=()=>reject(Error('storage'));req.onsuccess=()=>{const db=req.result,r=db.transaction('collections').objectStore('collections').get(id);r.onsuccess=()=>{db.close();resolve(r.result?.assetCount??0);};r.onerror=()=>reject(Error('storage'));};}),id);}
async function installedIntegrity(){return page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('archify-atlas-paris-catacombs-'+encodeURIComponent(new URL('./',document.baseURI).pathname)+'-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('storage'));});const assets=await new Promise((resolve,reject)=>{const r=db.transaction('assets').objectStore('assets').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('assets'));});db.close();let count=0,bytes=0,mismatches=0;const categories={};for(const a of assets){if(!a.collectionId)continue;const buffer=await a.blob.arrayBuffer(),sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(x=>x.toString(16).padStart(2,'0')).join('');count++;bytes+=buffer.byteLength;if(sha!==a.sha256)mismatches++;categories[a.category??a.kind]=(categories[a.category??a.kind]??0)+1;}return{count,bytes,mismatches,categories};});}
async function archiveModel(){
 await page.getByRole('button',{name:'Kaynak kütüphanesi',exact:true}).click();
 await page.getByRole('button',{name:'Fontaine des Chartreux modelini aç',exact:true}).click();
 const view=page.locator('#model');await expect(view).toHaveAttribute('data-model-ready','true',{timeout:90000});
 const optimized=Number(await view.getAttribute('data-model-bytes'));await page.getByLabel('3B modeli kes',{exact:true}).check();await expect(view).toHaveAttribute('data-section-enabled','true');
 await page.getByLabel('3B model kalitesi',{exact:true}).selectOption('original');
 await expect.poll(async()=>Number(await view.getAttribute('data-model-bytes')),{timeout:90000}).not.toBe(optimized);await expect(view).toHaveAttribute('data-model-ready','true');
 const original=Number(await view.getAttribute('data-model-bytes'));await page.screenshot({path:path.join(out,'cold-offline-room-original.png')});await page.getByRole('button',{name:'3B modeli kapat',exact:true}).click();
 await page.getByRole('button',{name:'Haritayı keşfet',exact:true}).click();return{optimizedBytes:optimized,originalBytes:original,actualFiles:true};
}
async function allRoomModels(){
 const catalogue=JSON.parse(await readFile('public/data/rooms.json','utf8'));let rendered=0,bytes=0,originals=0;
 await page.getByRole('button',{name:'Kaynak kütüphanesi',exact:true}).click();const more=page.getByRole('button',{name:/^Tüm \d+ mekânı göster/});if(await more.isVisible())await more.click();
 for(const room of catalogue.rooms){await page.getByRole('button',{name:`${room.title} modelini aç`,exact:true}).click();const view=page.locator('#model');await expect(view).toHaveAttribute('data-model-ready','true',{timeout:90000});bytes+=Number(await view.getAttribute('data-model-bytes'));rendered++;const quality=page.getByLabel('3B model kalitesi',{exact:true});if(await quality.locator('option[value="original"]').evaluate(option=>!option.disabled)){const optimized=await view.getAttribute('data-model-bytes');await quality.selectOption('original');await expect.poll(()=>view.getAttribute('data-model-bytes'),{timeout:90000}).not.toBe(optimized);await expect(view).toHaveAttribute('data-model-ready','true');bytes+=Number(await view.getAttribute('data-model-bytes'));rendered++;originals++;}await page.getByRole('button',{name:'3B modeli kapat',exact:true}).click();console.log(JSON.stringify({renderedModels:rendered,originals}));}
 await page.getByRole('button',{name:'Haritayı keşfet',exact:true}).click();return{rooms:catalogue.rooms.length,renderedModels:rendered,originals,bytes,allFromRealInstalledArchives:true};
}
try{
 await launch();
 let expectedFeatures=0,expectedUserPoints=0,index=0;
 for(const vector of vectors){const data=JSON.parse(await readFile(vector,'utf8'));expectedFeatures+=data.features.length;expectedUserPoints+=data.features.filter(f=>f.properties?.kind==='user-entrance').length;await page.getByLabel('Dosya içe aktar',{exact:true}).setInputFiles(vector);await expect(page.locator('#map')).toHaveAttribute('data-private-packages',String(++index));await expect(page.locator('#map')).toHaveAttribute('data-personal-features',String(expectedFeatures));}
 const onlineFeatures=Number(await page.locator('#map').getAttribute('data-personal-features'));
 if(photos){await page.getByLabel('Arşiv paketi içe aktar',{exact:true}).setInputFiles(photos);await expect(page.getByTestId('status')).toContainText('dosya çevrimdışı');}
 if(installManifest){await expect(page.getByLabel('Arşiv paketi içe aktar',{exact:true})).toBeEnabled();await page.getByLabel('Arşiv paketi içe aktar',{exact:true}).setInputFiles(installManifest.parts.map(p=>p.path));const last=installManifest.parts.at(-1);await expect.poll(()=>savedCollection(last.collectionId),{timeout:180000}).toBe(last.assetCount);await expect(page.getByLabel('Arşiv paketi içe aktar',{exact:true})).toBeEnabled({timeout:30000});for(const part of installManifest.parts)expect(await savedCollection(part.collectionId)).toBe(part.assetCount);proof.steps.push({name:'real-ui-local-archive-install',parts:installManifest.parts.length,singleMultiFileSelection:true,expectedAssets:installManifest.parts.reduce((n,p)=>n+p.assetCount,0),integrity:await installedIntegrity()});console.log(JSON.stringify({installedParts:installManifest.parts.length,verifiedAllCollections:true}));}
 proof.steps.push({name:'online-archives',features:onlineFeatures,storage:await countSaved()});
 if(photos)proof.steps.push({name:'online-real-personal-photo',...await room('Fontaine des Chartreux',1000)});
 proof.steps.push({name:'online-real-public-photo',...await room('Philibert Aspairt',2048)});
 proof.steps.push({name:'online-core-shas',status:await verifyCore()});
 await page.screenshot({path:path.join(out,'online-mobile.png')});await context.close();context=null;
 await launch(true);proof.processReopened=true;expect(await page.evaluate(()=>navigator.onLine)).toBe(false);
 await expect(page.locator('#map')).toHaveAttribute('data-personal-features',String(onlineFeatures));
 proof.steps.push({name:'cold-offline-archives',features:onlineFeatures,storage:await countSaved()});
 if(installManifest){const integrity=await installedIntegrity();expect(integrity.mismatches).toBe(0);expect(integrity.count).toBe(installManifest.parts.reduce((n,p)=>n+p.assetCount,photos?16:0));proof.steps.push({name:'cold-offline-all-installed-byte-shas',...integrity});}
 if(expectedUserPoints){await page.locator('.directory-switch button',{hasText:'Girişler'}).click();await expect(page.locator('[data-access-chip="user"] span')).toHaveText(String(expectedUserPoints));proof.steps.push({name:'cold-offline-private-user-marks',count:expectedUserPoints});}
 if(photos)proof.steps.push({name:'cold-offline-real-personal-photo',...await room('Fontaine des Chartreux',1000)});
 proof.steps.push({name:'cold-offline-real-public-photo',...await room('Philibert Aspairt',2048)});
 // A deliberately never-downloaded source URL tests the former WebKit rejected-respondWith path without network access.
 const uncached=`https://assets.catacombes.xyz/assets/models/synthetic-never-cached-${stamp}.webp`;
 if(name==='chrome'){
  await expect.poll(()=>context.serviceWorkers().length).toBeGreaterThan(0);
  const worker=context.serviceWorkers().find(w=>w.url().startsWith(target));if(!worker)throw Error('Owned app service worker not attached');
  const network=await worker.evaluate(async url=>{try{const r=await fetch(url);return r.status;}catch{return 'offline';}},uncached+'?network-probe');
  expect(network).toBe('offline');proof.steps.push({name:'restored-worker-network-is-offline',network});
 }
 const response=page.waitForResponse(r=>r.url()===uncached,{timeout:15000});
 const image=await page.evaluate(url=>new Promise(resolve=>{const i=new Image();i.onerror=()=>resolve('unavailable');i.onload=()=>resolve('loaded');i.src=url;}),uncached);
 const imageResponse=await response;proof.steps.push({name:'uncached-preview-cold-offline',status:imageResponse.status(),fromServiceWorker:imageResponse.fromServiceWorker(),pageErrors:proof.errors.length});expect(image).toBe('unavailable');expect(imageResponse.status()).toBe(504);
 await page.getByRole('button',{name:'Haritayı genişlet',exact:true}).click();await page.getByRole('button',{name:'Coğrafi 3B görünüm',exact:true}).click();
 await expect.poll(async()=>Number(await page.locator('#map').getAttribute('data-buildings-rendered'))).toBeGreaterThan(0);
 const overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));expect(overflow).toBe(0);
 proof.steps.push({name:'cold-offline-mobile-city',buildings:Number(await page.locator('#map').getAttribute('data-buildings-rendered')),overflow});
 if(core.assets.some(a=>a.url==='./data/landcover.pmtiles'))proof.steps.push({name:'cold-offline-landcover',loaded:await page.locator('#map').getAttribute('data-landcover-ready'),features:Number(await page.locator('#map').getAttribute('data-landcover-features'))});
 await page.screenshot({path:path.join(out,'cold-offline-city.png')});proof.steps.push({name:'cold-offline-core-shas',status:await verifyCore()});
 if(process.env.ATLAS_QA_LAYERED==='1'){
  await page.getByRole('button',{name:'3B derinlik görünümü',exact:true}).click();const view=page.getByTestId('layered-plan-view');
  await expect(view).toHaveAttribute('data-ready','true');await expect(view).toHaveAttribute('data-buildings-ready','true',{timeout:60000});
  const plan=await view.evaluate(el=>({paths:Number(el.dataset.planPaths),segments:Number(el.dataset.planSegments),points:Number(el.dataset.planPoints),buildings:Number(el.dataset.buildingSources),unknownBuildingHeights:Number(el.dataset.unknownBuildingHeights),depthModel:el.dataset.worldDepth}));
  expect(plan.paths).toBeGreaterThan(1000);expect(plan.segments).toBeGreaterThan(plan.paths);expect(plan.buildings).toBeGreaterThan(100);
  proof.steps.push({name:'cold-offline-all-source-layered-3d',...plan});await page.screenshot({path:path.join(out,'cold-offline-layered-mobile.png')});
  await page.getByLabel('Kaynak geometrisini kes',{exact:true}).check();await expect(view).toHaveAttribute('data-clip-planes','2');await page.getByLabel('Katmanlı kesit doğrultusu',{exact:true}).selectOption('z');await expect(view).toHaveAttribute('data-section-axis','z');
  proof.steps.push({name:'cold-offline-layered-geometry-cut',axis:'z',clipPlanes:2});await page.getByRole('button',{name:'3B derinlik görünümünü kapat',exact:true}).click();
 }
 if(installManifest){
  await page.getByRole('button',{name:'Harita katmanlarını aç',exact:true}).click();await page.getByLabel('Galeri planları katmanı',{exact:true}).check();
  const imageFilters=page.getByRole('region',{name:'Kaynak görüntü katmanları'});await expect(imageFilters).toBeVisible();
  const filters=imageFilters.getByRole('checkbox'),sourceCount=await filters.count();expect(sourceCount).toBeGreaterThan(10);
  const enabledBefore=await filters.evaluateAll(els=>els.filter(el=>el.checked).length);await imageFilters.getByRole('button',{name:'Tüm görüntü kaynakları',exact:true}).click();await expect.poll(()=>filters.evaluateAll(els=>els.filter(el=>el.checked).length)).toBe(sourceCount);
  await expect.poll(async()=>Number(await page.locator('#map').getAttribute('data-gallery-layers'))).toBeGreaterThan(0);
  proof.steps.push({name:'cold-offline-real-raster-source-switches',sources:sourceCount,defaultEnabled:enabledBefore,allEnabled:sourceCount,layers:Number(await page.locator('#map').getAttribute('data-gallery-layers'))});await page.screenshot({path:path.join(out,'cold-offline-raster-sources.png')});
  for(let i=0;i<sourceCount;i++)if(await filters.nth(i).isChecked())await filters.nth(i).uncheck();await expect(page.locator('#map')).toHaveAttribute('data-gallery-layers','0');await page.getByRole('button',{name:'Katmanları kapat',exact:true}).click();
  proof.steps.push({name:'cold-offline-real-room-optimized-and-original',...await archiveModel()});
  if(process.env.ATLAS_QA_ALL_MODELS==='1')proof.steps.push({name:'cold-offline-every-room-model-rendered',...await allRoomModels()});
  await page.getByRole('button',{name:'3B derinlik görünümü',exact:true}).click();await page.getByRole('button',{name:'Birleşik gerçek tarama',exact:true}).click();
  const survey=page.getByTestId('merged-survey-view');await expect(survey).toHaveAttribute('data-survey-ready','true',{timeout:90000});
  const triangles=Number(await survey.getAttribute('data-survey-triangles'));expect(triangles).toBeGreaterThan(100000);await expect(survey).toHaveAttribute('data-common-frame','source-author-local');
  await page.getByLabel('3B yerüstü binalar ve yollar',{exact:true}).check();await expect(survey).toHaveAttribute('data-surface-visible','true');await page.getByLabel('Birleşik galerileri kes',{exact:true}).check();await expect(survey).toHaveAttribute('data-section-enabled','true');await page.getByLabel('Birleşik tarama kesit ekseni',{exact:true}).selectOption('z');await expect(survey).toHaveAttribute('data-section-axis','z');
  const scene=await survey.locator('canvas').boundingBox();expect(scene?.height??0).toBeGreaterThan(180);expect((scene?.y??10000)+(scene?.height??10000)).toBeLessThan(844);
  proof.steps.push({name:'cold-offline-real-merged-survey-and-city-cut',triangles,commonFrame:'source-author-local',worldGeoreferenced:false,sceneRemainsVisibleAfterControls:true});await page.screenshot({path:path.join(out,'cold-offline-real-merged.png')});await page.getByRole('button',{name:'3B derinlik görünümünü kapat',exact:true}).click();
 }
 expect(proof.errors).toEqual([]);expect(proof.outgoingWriteRequests).toBe(0);proof.ok=true;
}catch(error){proof.ok=false;proof.failure=String(error.stack??error);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{if(context)await context.close();proof.finishedAt=new Date().toISOString();await writeFile(path.join(out,'KABUL.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({ok:proof.ok,browser:name,out,steps:proof.steps.length,errors:proof.errors.length,failure:proof.failure?.slice(0,300)}));}
