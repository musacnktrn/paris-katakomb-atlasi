// ureten: codex — production bundle, actual service worker, real IndexedDB/Cache API.
import {test,expect,type Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function open(page:Page){await page.goto('./');await expect(page.getByTestId('status')).toContainText('Atlas hazır',{timeout:30000});await expect(page.locator('#map canvas')).toBeVisible();}
async function ready(page:Page){await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));return r.scope;});}
async function addNote(page:Page,title='Alan kaydı'){await page.getByRole('button',{name:'Kişisel notlar',exact:true}).click();await page.getByRole('textbox',{name:'Not başlığı'}).fill(title);await page.getByRole('textbox',{name:'Not metni'}).fill('Bu kayıt elle işaretlenmiştir.');await page.getByRole('button',{name:'Notu kaydet',exact:true}).click();await expect(page.getByTestId('notes')).toContainText(title);}
async function state(page:Page){return page.evaluate(async()=>{const name='archify-atlas-paris-catacombs-'+encodeURIComponent(new URL('./',document.baseURI).pathname)+'-v1';return new Promise<{pack:any;notes:number;assets:number}>(resolve=>{const r=indexedDB.open(name);r.onsuccess=()=>{const d=r.result,tx=d.transaction(['notes','packs','assets']);const p=tx.objectStore('packs').get('sample'),n=tx.objectStore('notes').count(),a=tx.objectStore('assets').count();tx.oncomplete=()=>{d.close();resolve({pack:p.result,notes:n.result,assets:a.result});};};});});}
function manifest(bytes:Buffer,version:string,sha=hash(bytes)){return {schema:1,id:'sample',atlasId:'paris-catacombs',version,title:'Test',redistribution:'allowed',attribution:'ATLAS technical test',assets:[{url:'./sample/about.json',bytes:bytes.length,sha256:sha}]};}
async function uploadManifest(page:Page,obj:unknown){await page.getByLabel('Paket manifesti',{exact:true}).setInputFiles({name:'manifest.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(obj))});}
function triangleGLB(external=false){const doc:any={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,0],max:[1,1,0]}],bufferViews:[{buffer:0,byteLength:36}],buffers:[{byteLength:36}]};if(external)doc.buffers[0].uri='https://example.org/private.bin';let j=Buffer.from(JSON.stringify(doc));j=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]);const b=Buffer.alloc(12+8+j.length+8+36);b.writeUInt32LE(0x46546c67,0);b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(j.length,12);b.writeUInt32LE(0x4e4f534a,16);j.copy(b,20);const o=20+j.length;b.writeUInt32LE(36,o);b.writeUInt32LE(0x004e4942,o+4);[-1,0,0,1,0,0,0,1,0].forEach((n,i)=>b.writeFloatLE(n,o+8+i*4));return b;}

test('desktop: real map, source-linked selection and filters',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Worker|WebGL|GeoJSON/.test(m.text()))errors.push(m.text());});await open(page);
 const canvas=page.locator('#map canvas');const box=(await canvas.boundingBox())!;await canvas.click({position:{x:box.width/2,y:box.height/2}});await expect(page.getByRole('complementary',{name:'Kayıt ayrıntısı'})).toBeVisible();await page.getByRole('button',{name:'Ayrıntıyı kapat'}).click();await page.screenshot({path:'test-results/default-map.png',fullPage:true});
 await expect(page.getByTestId('result-count')).toHaveText('60 sonuç');await page.getByRole('button',{name:'Tüm paftalar',exact:true}).click();await expect(page.getByTestId('result-count')).toHaveText('458 sonuç');
 await page.getByRole('textbox',{name:'Pafta ara'}).fill('no-such-sheet');await expect(page.getByTestId('result-count')).toHaveText('0 sonuç');await page.getByRole('button',{name:'Aramayı temizle'}).click();
 await page.getByRole('button',{name:/IGC .* paftasını seç/}).first().click();await expect(page.getByRole('complementary',{name:'Kayıt ayrıntısı'})).toBeVisible();
 await page.getByRole('button',{name:'Favorilere ekle',exact:true}).click();await expect(page.getByRole('button',{name:'Favorilerden çıkar',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Ayrıntıyı kapat'}).click();await page.getByRole('button',{name:'Yalnız favorileri göster'}).click();await expect(page.getByTestId('result-count')).toHaveText('1 sonuç');
 await page.getByLabel('Yerüstü katmanı',{exact:true}).uncheck();await page.getByLabel('IGC pafta katmanı',{exact:true}).uncheck();await expect(page.getByText('Haritayı görmek için bir katman aç.')).toBeVisible();
 await page.getByRole('button',{name:'Katmanları göster'}).click();await page.screenshot({path:'test-results/desktop.png',fullPage:true});expect(errors).toEqual([]);
});

test('offline: cold reopen preserves notes, search, map and core verification',async({page,context})=>{
 await open(page);await ready(page);await addNote(page);await context.setOffline(true);await page.reload();await expect(page.getByTestId('status')).toContainText('Atlas hazır');
 await page.getByRole('button',{name:'Kişisel notlar',exact:true}).click();await expect(page.getByTestId('notes')).toContainText('Alan kaydı');
 await page.getByRole('button',{name:'Haritayı keşfet',exact:true}).click();await page.getByRole('button',{name:'Tüm paftalar',exact:true}).click();await page.getByRole('textbox',{name:'Pafta ara'}).fill('2026');await expect(page.getByTestId('result-count')).not.toHaveText('0 sonuç');
 await page.getByRole('button',{name:'Çevrimdışı atlası aç',exact:true}).click();await page.getByRole('button',{name:'Çevrimdışı hazırlığı doğrula',exact:true}).click();await expect(page.getByTestId('core-status')).toContainText('Hazır',{timeout:30000});
 await page.screenshot({path:'test-results/offline.png',fullPage:true});
});

test('same URL pack v2 bypasses old cache; corrupt v3 preserves v2 and notes',async({page,request})=>{
 await open(page);await ready(page);await addNote(page,'Paketlerden bağımsız not');
 let payload=Buffer.from('{"version":1}');await request.post('/__test__/pack',{data:payload});
 await uploadManifest(page,manifest(payload,'1'));await expect(page.getByTestId('status')).toContainText('doğrulanıp');expect((await state(page)).pack.version).toBe('1');
 payload=Buffer.from('{"version":2}');await request.post('/__test__/pack',{data:payload});await uploadManifest(page,manifest(payload,'2'));await expect.poll(async()=>(await state(page)).pack.version).toBe('2');
 const before=await state(page);payload=Buffer.from('{"version":3}');await request.post('/__test__/pack',{data:payload});await uploadManifest(page,manifest(payload,'3','0'.repeat(64)));await expect(page.getByTestId('status')).toContainText('SHA-256');const after=await state(page);expect(after.pack.cache).toBe(before.pack.cache);expect(after.pack.version).toBe('2');expect(after.notes).toBe(1);
 await page.getByRole('button',{name:'Çevrimdışı atlası aç',exact:true}).click();await page.getByRole('button',{name:'sample paketini kaldır',exact:true}).click();await expect.poll(async()=>(await state(page)).pack).toBeUndefined();expect((await state(page)).notes).toBe(1);await request.post('/__test__/pack',{data:Buffer.from('')});
});

test('local files: invalid geometry/model rejected, valid local GLB renders offline',async({page,context})=>{
 await open(page);await ready(page);const invalid={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'MultiPoint',coordinates:[2.3,48.8]},properties:{}}]};
 await page.getByLabel('Dosya içe aktar',{exact:true}).setInputFiles({name:'bad.geojson',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await expect(page.getByTestId('status')).toContainText('Çoklu nokta');expect((await state(page)).assets).toBe(0);
 await page.getByLabel('3B model içe aktar',{exact:true}).setInputFiles({name:'external.glb',mimeType:'model/gltf-binary',buffer:triangleGLB(true)});await expect(page.getByTestId('status')).toContainText('dış dosyaya');expect((await state(page)).assets).toBe(0);
 await context.setOffline(true);await page.getByLabel('3B model içe aktar',{exact:true}).setInputFiles({name:'technical-test-triangle.glb',mimeType:'model/gltf-binary',buffer:triangleGLB()});await expect(page.locator('#model canvas')).toBeVisible();expect((await state(page)).assets).toBe(1);await page.screenshot({path:'test-results/local-model.png',fullPage:true});
});

test('1857 original plan opens and zooms with no network',async({page,context})=>{
 await open(page);await ready(page);await context.setOffline(true);await page.getByRole('button',{name:'Kaynak kütüphanesi',exact:true}).click();await page.getByRole('button',{name:'1857 arşiv planını aç',exact:true}).click();
 await expect(page.getByTestId('historic-image')).toBeVisible();expect(await page.getByTestId('historic-image').evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth===7561)).toBe(true);await page.getByRole('button',{name:'Arşiv planını yakınlaştır',exact:true}).click();await expect(page.locator('.historic-toolbar output')).toHaveText('140%');await page.getByRole('button',{name:'Arşiv planını kapat',exact:true}).click();await expect(page.getByTestId('historic-image')).toHaveCount(0);
});

test('390px mobile: reachable map, no horizontal overflow, working notebook',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect(await page.locator('#map').evaluate(el=>el.clientHeight)).toBeGreaterThan(350);await addNote(page,'Mobil not');await page.screenshot({path:'test-results/mobile.png',fullPage:true});
});

test('same-origin second Pages path cannot erase first app notes or offline core',async({page,context})=>{
 await open(page);await ready(page);await addNote(page,'Birinci kurulum');const second=await context.newPage();await second.goto('/second/');await expect(second.getByTestId('status')).toContainText('Atlas hazır');await ready(second);await second.getByRole('button',{name:'Kişisel notlar',exact:true}).click();await expect(second.getByTestId('notes')).not.toContainText('Birinci kurulum');await addNote(second,'İkinci kurulum');await context.setOffline(true);await page.reload();await expect(page.getByTestId('status')).toContainText('Atlas hazır');await page.getByRole('button',{name:'Kişisel notlar',exact:true}).click();await expect(page.getByTestId('notes')).toContainText('Birinci kurulum');await expect(page.getByTestId('notes')).not.toContainText('İkinci kurulum');
});


test('personal image: reject disguised SVG, save and reopen real raster offline',async({page,context})=>{
 await open(page);await ready(page);
 await page.getByLabel('Harita görseli içe aktar',{exact:true}).setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')});await expect(page.getByTestId('status')).toContainText('dosya başlığı geçersiz');expect((await state(page)).assets).toBe(0);
 await context.setOffline(true);await page.getByLabel('Harita görseli içe aktar',{exact:true}).setInputFiles({name:'own-plan.png',mimeType:'image/png',buffer:await readFile('public/icons/icon-192.png')});await expect(page.getByTestId('local-plan-image')).toBeVisible();expect(await page.getByTestId('local-plan-image').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth===192)).toBe(true);expect((await state(page)).assets).toBe(1);await page.getByRole('button',{name:'Kişisel planı yakınlaştır',exact:true}).click();await expect(page.locator('.historic-toolbar output')).toHaveText('140%');await page.getByRole('button',{name:'Kişisel planı kapat',exact:true}).click();await page.reload();await expect(page.getByTestId('status')).toContainText('Atlas hazır');await page.getByRole('button',{name:'Kaynak kütüphanesi',exact:true}).click();await page.getByRole('button',{name:'own-plan.png dosyasını aç',exact:true}).click();await expect(page.getByTestId('local-plan-image')).toBeVisible();
});
