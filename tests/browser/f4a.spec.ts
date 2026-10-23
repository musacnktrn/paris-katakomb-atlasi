// ureten: codex. F4a acceptance; all imported positions and private labels below are synthetic.
import type {Page} from '@playwright/test';
import {test,expect} from '../helpers/persistent-browser';
import {zipSync,strToU8} from 'fflate';
import {createHash} from 'node:crypto';
// ureten: codex: exercise a real persistent data store. Ephemeral WebKit reported a Blob storage preparation error;
// the standalone native cold-reopen acceptance also uses persistent storage and remains a separate gate.
async function open(page:Page){await page.goto('./');await expect(page.getByTestId('status')).toContainText('Atlas hazır',{timeout:30000});}
async function controlled(page:Page){await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});}

test('regional download failure keeps search and the base map usable, and retry succeeds',async({page,context})=>{
 let fail=true;await context.route('**/data/region.pmtiles',r=>fail?r.abort('failed'):r.continue());
 await open(page);await expect(page.getByTestId('region-notice')).toContainText('Paris yüzeyi gösteriliyor');
 await page.getByRole('textbox',{name:'Pafta ara'}).fill('Fontaine');await expect(page.getByTestId('result-count')).toHaveText('1 sonuç');
 fail=false;await page.getByRole('button',{name:'Yeniden dene',exact:true}).click();await expect(page.locator('#map')).toHaveAttribute('data-region-ready','true');
 await expect(page.getByTestId('region-notice')).toHaveCount(0);
});
test('regional bytes must match the declared SHA before the optional layer becomes ready',async({page,context})=>{
 let mismatch=true;await context.route('**/data/region-tiles-meta.json',async route=>{const response=await route.fetch(),meta=await response.json();await route.fulfill({response,json:mismatch?{...meta,sha256:'0'.repeat(64)}:meta,headers:{'Cache-Control':'no-store'}});});
 await open(page);await expect(page.getByTestId('region-notice')).toContainText('Paris yüzeyi gösteriliyor');await expect(page.locator('#map')).toHaveAttribute('data-region-ready','false');
 mismatch=false;await page.getByRole('button',{name:'Yeniden dene',exact:true}).click();await expect(page.locator('#map')).toHaveAttribute('data-region-ready','true');
});

test('uncached offline preview returns an image failure without a rejected SW promise',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await controlled(page);
 await context.setOffline(true);await page.reload();await expect(page.locator('#map')).toHaveAttribute('data-region-ready','true');
 const preview='https://assets.catacombes.xyz/assets/models/synthetic-uncached-f4a.webp';
 const response=page.waitForResponse(r=>r.url()===preview);
 const result=await page.evaluate(url=>new Promise(resolve=>{const image=new Image();image.onerror=()=>resolve('unavailable');image.onload=()=>resolve('loaded');image.src=url;document.body.append(image);}),preview);
 expect(result).toBe('unavailable');expect((await response).status()).toBe(504);expect(errors).toEqual([]);
});

test('returning to GRS keeps the 3D mode and camera in agreement',async({page})=>{
 await open(page);await expect(page.locator('#map')).toHaveAttribute('data-region-ready','true');
 await page.getByRole('button',{name:'Coğrafi 3B görünüm',exact:true}).click();await page.getByRole('button',{name:'Güney ağına dön',exact:true}).click();
 const b=page.getByRole('button',{name:'Coğrafi 3B görünüm',exact:true});
 await expect.poll(()=>page.evaluate(()=>{const m=(window as any).__atlasMap;return {active:document.querySelector('[aria-label="Coğrafi 3B görünüm"]')?.getAttribute('aria-pressed')==='true',pitched:m.getPitch()>30};})).toEqual({active:true,pitched:true});
 await expect(b).toHaveAttribute('aria-pressed','true');
});

test('inactive historical packages are kept on disk but not parsed after reopening',async({page})=>{
 await open(page);
 for(const [name,date,x] of [['old','2026-01-01T00:00:00Z',2.31],['new','2026-01-02T00:00:00Z',2.32]] as const){
  const value={type:'FeatureCollection',name:'Synthetic F4a family',createdAt:date,features:[{type:'Feature',id:name,properties:{id:name,kind:'feature',title:'Synthetic '+name},geometry:{type:'Point',coordinates:[x,48.83]}}]};
  await page.getByLabel('Dosya içe aktar',{exact:true}).setInputFiles({name:name+'.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(value))});
  await expect(page.getByTestId('status')).toContainText('bu cihaza eklendi');
 }
 await page.reload();await expect(page.locator('#map')).toHaveAttribute('data-private-packages','1');await expect(page.locator('#map')).toHaveAttribute('data-private-parses','1');
 await page.getByRole('button',{name:'Kaynak kütüphanesi',exact:true}).click();await expect(page.getByRole('button',{name:'old.geojson dosyasını aç',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'new.geojson dosyasını aç',exact:true})).toBeVisible();
});

test('a rotated synthetic phone JPEG imports using its raw header dimensions',async({page})=>{
 await open(page);
 const raw=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=4;c.height=3;c.getContext('2d')!.fillRect(0,0,4,3);return Array.from(Uint8Array.from(atob(c.toDataURL('image/jpeg').split(',')[1]!),x=>x.charCodeAt(0)));}));
 const exif=Buffer.alloc(36);exif.set([255,225,0,34,69,120,105,102,0,0,73,73]);exif.writeUInt16LE(42,12);exif.writeUInt32LE(8,14);exif.writeUInt16LE(1,18);exif.writeUInt16LE(0x112,20);exif.writeUInt16LE(3,22);exif.writeUInt32LE(1,24);exif.writeUInt16LE(6,28);
 const jpeg=Buffer.concat([raw.subarray(0,2),exif,raw.subarray(2)]),hash=createHash('sha256').update(jpeg).digest('hex');
 const manifest={schema:1,atlasId:'paris-catacombs',id:'synthetic-oriented-photo',title:'Sentetik döndürülmüş fotoğraf',rights:'personal-copy',assets:[{path:'test.jpg',kind:'image',name:'Synthetic rotated pixels',sha256:hash,bytes:jpeg.length,roomId:'philibert',category:'room-photo',photo:{creator:'Synthetic fixture',sourcePage:'https://example.org/synthetic',captionExact:'Generated test pixels; not a camera photograph',captureDate:null,licenceName:'Synthetic test only',licenceUrl:null,licenceStatus:'personal-cache-only',width:4,height:3}}]};
 await page.getByLabel('Arşiv paketi içe aktar',{exact:true}).setInputFiles({name:'synthetic-oriented.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'collection.json':strToU8(JSON.stringify(manifest)),'test.jpg':jpeg}))});
 await expect(page.getByTestId('status')).toContainText('1 dosya çevrimdışı');await page.getByRole('textbox',{name:'Pafta ara'}).fill('Philibert Aspairt');await page.getByRole('button',{name:'Philibert Aspairt konumunu göster',exact:true}).click();
 await expect.poll(()=>page.getByTestId('room-photo').evaluate((el:HTMLImageElement)=>el.complete?[el.naturalWidth,el.naturalHeight]:[])).toEqual([3,4]);
});
