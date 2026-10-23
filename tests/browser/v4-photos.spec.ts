// ureten: opus: A2 room camera photos. Public: the unmodified Commons Philibert original from the offline core.
// Personal: a SYNTHETIC generated PNG in an inline ZIP (not a real photo). The real private ZIP test runs only when the file exists locally.
import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import {zipSync,strToU8,unzipSync,strFromU8} from 'fflate';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tinyPng} from '../helpers/tiny-png';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const REAL_PRIVATE_ZIP='private-data/v4-photos/atlas-private-room-photos-v1.zip';
async function open(page:Page){await page.goto('./');await expect(page.getByTestId('status')).toContainText('Atlas hazır',{timeout:30000});await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});}
// Scan posters come from a remote publisher; here they are replaced by the local app icon so the test is deterministic.
async function scans(context:BrowserContext){const png=await readFile('public/icons/icon-192.png');await context.route('https://assets.catacombes.xyz/**',r=>r.fulfill({body:png,contentType:'image/png'}));await context.route('https://catacombes.xyz/_next/image?**',r=>r.fulfill({body:png,contentType:'image/png'}));}
async function room(page:Page,title:string){await page.getByRole('button',{name:'Haritayı keşfet',exact:true}).click();await page.getByRole('textbox',{name:'Pafta ara'}).fill(title);await page.getByRole('button',{name:`${title} konumunu göster`,exact:true}).click();await expect(page.getByRole('complementary',{name:'Kayıt ayrıntısı'})).toContainText(title);}
const photoWidth=(page:Page)=>page.getByTestId('room-photo').evaluate((el:HTMLImageElement)=>el.complete?el.naturalWidth:0);
async function closeDetail(page:Page){await page.getByRole('button',{name:'Ayrıntıyı kapat'}).click();}
function syntheticZip(){
 const png=tinyPng(4,3,[176,96,48]);
 const manifest={schema:1,atlasId:'paris-catacombs',id:'synthetic-room-photos',title:'Sentetik salon fotoğrafı testi',rights:'personal-copy',assets:[{path:'photos/synthetic-fontaine.png',kind:'image',name:'Sentetik Fontaine fotoğrafı',sha256:sha(png),bytes:png.length,roomId:'fontaine',roomIds:['fontaine'],category:'room-photo',
  photo:{creator:'Sentetik Test Fotoğrafçısı',sourcePage:'https://example.org/synthetic-photo',captionExact:'Sentetik test görüntüsü, gerçek salon değil',captureDate:null,licenceName:'Test · yeniden yayın yok',licenceUrl:null,licenceStatus:'personal-cache-only',primary:true,width:4,height:3}}]};
 return Buffer.from(zipSync({'collection.json':strToU8(JSON.stringify(manifest)),'photos/synthetic-fontaine.png':png},{level:0}));
}
async function importZip(page:Page,name:string,buffer:Buffer){await page.getByLabel('Arşiv paketi içe aktar',{exact:true}).setInputFiles({name,mimeType:'application/zip',buffer});}
const collections=(page:Page)=>page.evaluate(async()=>new Promise<number>(resolve=>{const r=indexedDB.open('archify-atlas-paris-catacombs-'+encodeURIComponent(new URL('./',document.baseURI).pathname)+'-v1');r.onsuccess=()=>{const d=r.result,q=d.transaction('collections').objectStore('collections').count();q.onsuccess=()=>{d.close();resolve(q.result);};};}));

test('public Philibert camera photo shows with attribution, beats the scan on the marker and works offline',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await scans(context);await open(page);
 const core=JSON.parse(await readFile('dist/core-manifest.json','utf8'));expect(core.assets.some((a:{url:string})=>a.url==='./media/room-photos/stele-philibert-aspairt-021103.jpg')).toBe(true);
 await room(page,'Philibert Aspairt');
 await expect(page.getByRole('tab',{name:'Fotoğraflar (1)'})).toHaveAttribute('aria-selected','true');
 await expect.poll(()=>photoWidth(page),{timeout:15000}).toBe(2048);
 const credit=page.getByTestId('room-photo-credit');await expect(credit).toContainText('Fotoğraf: Rémi Villalongue · CC BY 2.5 · kaynak');await expect(credit).not.toContainText('yalnız bu cihazda');
 await expect(credit.getByRole('link',{name:'kaynak'})).toHaveAttribute('href','https://commons.wikimedia.org/wiki/File:St%C3%A8le_Philibert_Aspairt_021103.jpg');
 await expect(credit.getByRole('link',{name:'CC BY 2.5'})).toHaveAttribute('href','https://creativecommons.org/licenses/by/2.5');
 await page.getByRole('tab',{name:'3B tarama görüntüsü'}).click();await expect(page.getByTestId('room-scan-credit')).toContainText('3B tarama görüntüsü');await expect(page.getByTestId('room-scan-credit')).not.toContainText('Fotoğraf');
 await closeDetail(page);const marker=page.locator('[data-marker-id="philibert"]');await expect(marker).toHaveAttribute('data-image-kind','photo');await expect(marker.locator('.atlas-marker-scan-tag')).toHaveCount(0);
 await expect.poll(()=>marker.locator('img').evaluate((el:HTMLImageElement)=>el.complete?el.naturalWidth:0)).toBe(2048);
 await marker.hover();await expect(page.getByRole('tooltip')).toContainText('Fotoğraf · Rémi Villalongue · CC BY 2.5');
 // A scan-poster room keeps its badge and says what the picture is.
 await room(page,'Fontaine des Chartreux');await expect(page.getByRole('tab',{name:'Fotoğraflar (0)'})).toHaveAttribute('aria-selected','false');await expect(page.getByTestId('room-preview')).toBeVisible();await closeDetail(page);
 const fontaine=page.locator('[data-marker-id="fontaine"]');await expect(fontaine).toHaveAttribute('data-image-kind','scan');await expect(fontaine.locator('.atlas-marker-scan-tag')).toHaveText('3B');await fontaine.hover();await expect(page.getByRole('tooltip')).toContainText('3B tarama görüntüsü · Catacombes.xyz');
 // The photo bytes are in the service worker's core cache (precached at install), not only in the HTTP memory cache.
 const cached=await page.evaluate(async version=>{const name=(await caches.keys()).find(k=>k.endsWith('-core-'+version));if(!name)return 0;const r=await(await caches.open(name)).match(new URL('./media/room-photos/stele-philibert-aspairt-021103.jpg',document.baseURI).href);return r?(await r.arrayBuffer()).byteLength:0;},core.version);expect(cached).toBe(669433);
 await context.setOffline(true);await page.reload();await expect(page.getByTestId('status')).toContainText('Atlas hazır',{timeout:30000});
 await room(page,'Philibert Aspairt');await expect.poll(()=>photoWidth(page),{timeout:15000}).toBe(2048);await expect(page.getByTestId('room-photo-credit')).toContainText('Rémi Villalongue');
 expect(errors).toEqual([]);
});

test('a personal photo collection shows only on this device, wins the marker, survives offline and is removed with its collection',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await scans(context);await open(page);
 await importZip(page,'synthetic-room-photos.zip',syntheticZip());await expect(page.getByTestId('status')).toContainText('1 dosya çevrimdışı');
 async function personalVisible(){
  await room(page,'Fontaine des Chartreux');await expect(page.getByRole('tab',{name:'Fotoğraflar (1)'})).toHaveAttribute('aria-selected','true');
  await expect.poll(()=>photoWidth(page),{timeout:15000}).toBe(4);await expect(page.getByTestId('room-photo')).toHaveAttribute('src',/^blob:/);
  await expect(page.getByTestId('room-photo-credit')).toContainText('Fotoğraf: Sentetik Test Fotoğrafçısı · Test · yeniden yayın yok · kaynak · yalnız bu cihazda');
  await closeDetail(page);const marker=page.locator('[data-marker-id="fontaine"]');
  await expect(marker).toHaveAttribute('data-image-kind','photo');await expect(marker).toHaveAttribute('data-image-personal','true');await expect(marker.locator('img')).toHaveAttribute('src',/^blob:/);await expect(marker.locator('.atlas-marker-scan-tag')).toHaveCount(0);
  await marker.hover();await expect(page.getByRole('tooltip')).toContainText('Fotoğraf · Sentetik Test Fotoğrafçısı · yalnız bu cihazda');
 }
 await personalVisible();
 await context.setOffline(true);await page.reload();await expect(page.getByTestId('status')).toContainText('Atlas hazır',{timeout:30000});await personalVisible();
 await page.getByRole('button',{name:'Kaynak kütüphanesi',exact:true}).click();await page.getByRole('button',{name:'Arşiv paketi ekle',exact:true}).click();
 await page.getByRole('button',{name:'Sentetik salon fotoğrafı testi arşivini kaldır',exact:true}).click();await expect.poll(()=>collections(page)).toBe(0);
 await page.getByRole('button',{name:'Paneli kapat',exact:true}).click();
 await room(page,'Fontaine des Chartreux');await expect(page.getByRole('tab',{name:'Fotoğraflar (0)'})).toBeVisible();await expect(page.getByTestId('room-photo')).toHaveCount(0);await closeDetail(page);
 const marker=page.locator('[data-marker-id="fontaine"]');await expect(marker).toHaveAttribute('data-image-kind','scan');await expect(marker.locator('.atlas-marker-scan-tag')).toHaveText('3B');await expect(marker).not.toHaveAttribute('data-image-personal','true');
 expect(errors).toEqual([]);
});

test('a personal-only photo inside an archive marked as freely shareable is refused',async({page})=>{
 await open(page);const png=tinyPng(4,3);
 const manifest={schema:1,atlasId:'paris-catacombs',id:'wrong-rights',title:'Yanlış hak',rights:'allowed',assets:[{path:'p.png',kind:'image',name:'p',sha256:sha(png),bytes:png.length,roomId:'fontaine',category:'room-photo',photo:{creator:'x',sourcePage:'https://example.org/x',captionExact:'',captureDate:null,licenceName:'yok',licenceUrl:null,licenceStatus:'personal-cache-only'}}]};
 await importZip(page,'wrong.zip',Buffer.from(zipSync({'collection.json':strToU8(JSON.stringify(manifest)),'p.png':png},{level:0})));
 await expect(page.getByTestId('status')).toContainText('kişisel kopya');expect(await collections(page)).toBe(0);
});

test('local only: the real private room photo ZIP imports and fills the galleries',async({page,context})=>{
 test.skip(!existsSync(REAL_PRIVATE_ZIP),'Gerçek kişisel fotoğraf ZIP dosyası bu makinede yok.');
 test.setTimeout(180000);
 // ureten: opus: rooms, photo counts and creators are read from the private ZIP's own manifest at run time,
 // so this committed file holds no private-derived names or counts.
 const zip=await readFile(REAL_PRIVATE_ZIP);
 const manifest=JSON.parse(strFromU8(unzipSync(new Uint8Array(zip),{filter:f=>f.name==='collection.json'})['collection.json']!)) as {assets:{category?:string;roomId?:string;roomIds?:string[];sha256:string;photo?:{creator:string}}[]};
 const titles=new Map((JSON.parse(await readFile('public/data/rooms.json','utf8')).rooms as {id:string;title:string}[]).map(r=>[r.id,r.title]));
 const byRoom=new Map<string,{hashes:Set<string>;creators:Set<string>}>();
 for(const a of manifest.assets){if(a.category!=='room-photo'||!a.photo)continue;for(const r of a.roomIds?.length?a.roomIds:a.roomId?[a.roomId]:[]){const e=byRoom.get(r)??{hashes:new Set<string>(),creators:new Set<string>()};e.hashes.add(a.sha256);e.creators.add(a.photo.creator);byRoom.set(r,e);}}
 expect(byRoom.size).toBeGreaterThan(0);
 const anyOf=(names:Set<string>)=>new RegExp([...names].map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'));
 await scans(context);await open(page);
 await importZip(page,'atlas-private-room-photos-v1.zip',zip);await expect(page.getByTestId('status')).toContainText(`${manifest.assets.length} dosya çevrimdışı`,{timeout:60000});
 for(const [roomId,{hashes,creators}] of byRoom){
  const title=titles.get(roomId);expect(title,`rooms.json içinde ${roomId} yok`).toBeTruthy();
  await room(page,title!);await expect(page.getByRole('tab',{name:`Fotoğraflar (${hashes.size})`})).toHaveAttribute('aria-selected','true');await expect.poll(()=>photoWidth(page),{timeout:15000}).toBeGreaterThan(0);
  await expect(page.getByTestId('room-photo-credit')).toContainText(anyOf(creators));await expect(page.getByTestId('room-photo-credit')).toContainText('yalnız bu cihazda');await closeDetail(page);
 }
 // The public Philibert photo is unaffected and is not labelled as a device-only copy.
 await room(page,'Philibert Aspairt');await expect(page.getByRole('tab',{name:'Fotoğraflar (1)'})).toBeVisible();await expect(page.getByTestId('room-photo-credit')).not.toContainText('yalnız bu cihazda');
});
