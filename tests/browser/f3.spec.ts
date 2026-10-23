// ureten: opus: F3 review fixes. Every GeoJSON/ZIP here is SYNTHETIC and built inline (invented test positions, invented names).
// Publisher rooms (Cellier, Fontaine) come from the public exploration catalogue; scan posters are replaced by the local app icon.
import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {tinyPng} from '../helpers/tiny-png';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const [X,Y]=[2.3060,48.8360];
const CELLIER:[number,number]=[2.33076472851395,48.8266455787018],FONTAINE:[number,number]=[2.3350554913657717,48.842567670617655];
type Feature={type:'Feature';id:string;properties:Record<string,unknown>;geometry:{type:string;coordinates:unknown}};
const pt=(id:string,dx:number,dy:number,properties:Record<string,unknown>):Feature=>({type:'Feature',id,properties:{id,accessStatus:'unknown',depthMetres:null,unknownDepth:true,...properties},geometry:{type:'Point',coordinates:[X+dx,Y+dy]}});
const line=(id:string,dy:number,properties:Record<string,unknown>):Feature=>({type:'Feature',id,properties:{id,kind:'linework',title:'Sentetik çizgi '+id,accessStatus:'unknown',...properties},geometry:{type:'LineString',coordinates:[[X-.0010,Y+dy],[X+.0030,Y+dy]]}});
function fixture(){return {type:'FeatureCollection',name:'Sentetik F3 paketi',createdAt:'2026-10-18T10:00:00Z',publicRedistributionApproved:false,features:[
 line('syn-upper',-.0006,{inkClass:'grey',sourceLevel:'superieur'}),
 line('syn-lower',-.0010,{inkClass:'blue-grey',sourceLevel:'inferieur'}),
 line('syn-dark',-.0014,{inkClass:'dark',sourceLevel:'unknown'}),
 pt('syn-shaft-plain',0,0,{kind:'shaft',title:'Basamaksız servis şaftı · getMaintenanceWellWithoutRungsMarkers:59',originalTitle:'',titleDerived:true,sourceCategory:'getMaintenanceWellWithoutRungsMarkers',sourceCategoryLabel:'Basamaksız servis şaftı'}),
 pt('syn-shaft-rungs',.0012,0,{kind:'shaft',title:'Sentetik basamaklı şaft',sourceCategory:'getMaintenanceWellWithRungsMarkers',sourceCategoryLabel:'Basamaklı servis şaftı'}),
 pt('syn-named',.0006,.0007,{kind:'feature',title:'Sentetik adlı yer',originalTitle:'Sentetik adlı yer',sourceCategory:'getGeneralInformationMarkers',sourceCategoryLabel:'Tarihî yer bilgisi'}),
 pt('syn-room-x',.0018,.0007,{kind:'feature',title:'Sentetik fotoğraflı kayıt',originalTitle:'Sentetik fotoğraflı kayıt',sourceCategory:'getGeneralInformationMarkers',sourceCategoryLabel:'Tarihî yer bilgisi'}),
]};}
// An older package family without inkClass/sourceLevel: it must look exactly like before (grey ink, unknown level).
function olderPackage(){return {type:'FeatureCollection',name:'Sentetik eski paket',createdAt:'2026-10-18T09:00:00Z',features:[line('syn-old',-.0018,{})]};}
async function open(page:Page){await page.goto('./');await expect(page.getByTestId('status')).toContainText('Atlas hazır',{timeout:30000});await expect(page.locator('#map')).toHaveAttribute('data-region-ready','true');}
async function importGeo(page:Page,name:string,value:unknown){await page.getByLabel('Dosya içe aktar',{exact:true}).setInputFiles({name,mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(value))});}
async function scans(context:BrowserContext){const png=await readFile('public/icons/icon-192.png');await context.route('https://assets.catacombes.xyz/**',r=>r.fulfill({body:png,contentType:'image/png'}));await context.route('https://catacombes.xyz/_next/image?**',r=>r.fulfill({body:png,contentType:'image/png'}));}
async function jump(page:Page,center:[number,number],zoom:number){await page.evaluate(async({center,zoom})=>{const m=(window as any).__atlasMap;m.jumpTo({center,zoom,pitch:0,bearing:0});await new Promise(r=>{m.once('idle',r);m.triggerRepaint();});},{center,zoom});}
async function screen(page:Page,lngLat:[number,number]){return page.evaluate(ll=>{const m=(window as any).__atlasMap,p=m.project(ll),r=m.getCanvas().getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y};},lngLat);}
// ureten: codex: the mobile legend now lives in Layers; assert against the actual unobscured DOM band.
async function visibleBand(page:Page){return page.evaluate(()=>{const map=document.querySelector('#map')!.getBoundingClientRect(),bar=document.querySelector('.map-command-bar')!.getBoundingClientRect();const low=['.explorer-panel','.detail-panel','.navigation-rail'].map(q=>document.querySelector(q)).filter((x):x is Element=>!!x).map(x=>({r:x.getBoundingClientRect(),s:getComputedStyle(x)})).filter(x=>x.r.width>0&&x.r.height>0&&x.s.display!=='none'&&x.s.visibility!=='hidden'&&x.r.top>map.top+map.height*.25);return {top:bar.bottom,bottom:Math.min(map.bottom,...low.map(x=>x.r.top))};});}
const dataset=(page:Page,key:string)=>page.locator('#map').evaluate((el,k)=>(el as HTMLElement).dataset[k]??'',key);
const json=async(page:Page,key:string)=>JSON.parse((await dataset(page,key))||'{}');
async function collapseSheet(page:Page){const b=page.getByRole('button',{name:'Paneli küçült',exact:true});if(await b.isVisible())await b.click();}

test('plan lines follow the package ink class and source level; an older package keeps the old style',async({page})=>{
 await open(page);await importGeo(page,'synthetic-f3.geojson',fixture());await expect(page.locator('#map')).toHaveAttribute('data-personal-features','7');
 await jump(page,[X+.0010,Y-.0008],16);
 await expect.poll(()=>json(page,'linesByInk')).toEqual({grey:1,'blue-grey':1,dark:1});
 await expect.poll(()=>json(page,'linesByLevel')).toEqual({superieur:1,inferieur:1,unknown:1});
 // Evaluated per-feature colours: grey = the green tunnel ink, blue-grey = a distinct cool band, dark = a darker wall stroke.
 const colours=async()=>page.evaluate(()=>{const m=(window as any).__atlasMap,layers=m.getStyle().layers.filter((l:any)=>/^private-.*-line$/.test(l.id)).map((l:any)=>l.id),out:Record<string,string>={};
  for(const f of m.queryRenderedFeatures(undefined,{layers})){const c=f.layer.paint['line-color'];out[f.properties.id]=[c.r,c.g,c.b].map((v:number)=>Math.round(v*255).toString(16).padStart(2,'0')).join('');}return out;});
 const c=await colours();expect(c['syn-upper']).toBe('0b5a43');expect(c['syn-lower']).toBe('2f5179');expect(c['syn-dark']).toBe('1c2420');
 await page.getByRole('button',{name:'Harita katmanlarını aç',exact:true}).click();
 await expect(page.locator('[data-ink-key="blue-grey"]')).toContainText('Alt kat (kaynak renk efsanesine göre)');
 await expect(page.locator('[data-ink-key="dark"]')).toContainText('Koyu duvar çizimi (kaynakta, anlamı kesin değil)');
 await expect(page.locator('.vector-ink-key')).toContainText('ölçülmüş kot ya da derinlik değildir');
 for(const [l,n] of [['superieur','1'],['inferieur','1'],['unknown','1']])await expect(page.locator(`label:has([data-level-filter="${l}"]) small`)).toHaveText(n);
 await page.getByLabel('Alt kat çizgileri',{exact:true}).uncheck();
 await expect(page.locator('#map')).toHaveAttribute('data-line-levels','superieur,unknown');
 await expect.poll(()=>json(page,'linesByLevel')).toEqual({superieur:1,unknown:1});
 await page.getByRole('button',{name:'Varsayılan',exact:true}).click();await expect(page.getByLabel('Alt kat çizgileri',{exact:true})).toBeChecked();
 await expect.poll(()=>json(page,'linesByLevel')).toEqual({superieur:1,inferieur:1,unknown:1});
 await page.getByRole('button',{name:'Katmanları kapat',exact:true}).click();
 // Older package (another name family, so both are active): no inkClass/sourceLevel, drawn in the same green ink, counted as Belirsiz.
 await importGeo(page,'synthetic-older.geojson',olderPackage());await expect(page.locator('#map')).toHaveAttribute('data-private-packages','2');
 await jump(page,[X+.0010,Y-.0010],16);
 await expect.poll(()=>json(page,'linesByLevel')).toEqual({superieur:1,inferieur:1,unknown:2});
 expect((await colours())['syn-old']).toBe('0b5a43');
 await page.getByRole('button',{name:'Harita katmanlarını aç',exact:true}).click();await expect(page.locator('label:has([data-level-filter="unknown"]) small')).toHaveText('2');
});

test('derived shaft titles read as plain Turkish, the raw id has its own row, and the map uses the legend glyphs',async({page})=>{
 await open(page);await importGeo(page,'synthetic-f3.geojson',fixture());await expect(page.locator('#map')).toHaveAttribute('data-personal-features','7');
 // The import opens the Girişler summary; the plain shaft row has a plain title and its own glyph.
 await expect(page.locator('.directory-switch button.is-active')).toContainText('Girişler');
 const row=page.getByRole('button',{name:'Basamaksız servis şaftı · kayıt 59 konumunu göster',exact:true});await expect(row).toBeVisible();await expect(row.locator('.access-glyph')).toHaveText('⇣');
 await expect(page.getByRole('button',{name:'Sentetik basamaklı şaft konumunu göster',exact:true}).locator('.access-glyph')).toHaveText('↓');
 await row.click();const detail=page.getByRole('complementary',{name:'Kayıt ayrıntısı'});
 await expect(detail.locator('h2')).toHaveText('Basamaksız servis şaftı · kayıt 59');await expect(page.getByTestId('detail-source-id')).toHaveText('syn-shaft-plain');
 await expect(detail).toContainText('DERİNLİK BELGELENMEMİŞ');await expect(detail).not.toContainText('PROFONDEUR');await expect(detail).not.toContainText('getMaintenanceWell');
 await expect(page.locator('#map')).toHaveAttribute('data-selected-feature','syn-shaft-plain');
 await page.getByRole('button',{name:'Ayrıntıyı kapat'}).click();await expect(page.locator('#map')).toHaveAttribute('data-selected-feature','syn-shaft-plain');
 // ureten: codex: F4a keeps the selection after closing, as requested; the search still finds the raw source string.
 await page.getByRole('textbox',{name:'Pafta ara'}).fill('WithoutRungsMarkers:59');await expect(page.getByTestId('result-count')).toHaveText('1 sonuç');await page.getByRole('textbox',{name:'Pafta ara'}).fill('');
 // Map symbol layer and legend read the same glyph table.
 const field=await page.evaluate(()=>{const m=(window as any).__atlasMap,l=m.getStyle().layers.find((x:any)=>/^private-.*-symbol$/.test(x.id));return {field:m.getLayoutProperty(l.id,'text-field'),minzoom:l.minzoom};});
 const pairs=Object.fromEntries((field.field as unknown[]).slice(2,-1).reduce((a:unknown[][],v,i,arr)=>i%2?a:[...a,[v,arr[i+1]]],[]) as [string,string][]);
 expect(pairs['shaft-plain']).toBe('⇣');expect(pairs['shaft-rungs']).toBe('↓');expect(field.minzoom).toBeGreaterThanOrEqual(14.5);
 await page.getByRole('button',{name:'Harita katmanlarını aç',exact:true}).click();
 await expect(page.locator('.vector-symbol-key')).toContainText('⇣Basamaksız şaft');await expect(page.locator('.vector-symbol-key')).toContainText('↓Basamaklı şaft');
 await page.getByRole('button',{name:'Katmanları kapat',exact:true}).click();
 // Hover card shows the plain title too.
 await jump(page,[X,Y],17);const p=await screen(page,[X,Y]);await page.mouse.move(p.x,p.y);
 await expect(page.getByRole('tooltip')).toContainText('Basamaksız servis şaftı · kayıt 59');await expect(page.getByRole('tooltip')).not.toContainText('getMaintenanceWell');
});

test('named historical places get a label from z16 and stay source marks, never rooms',async({page})=>{
 await open(page);await importGeo(page,'synthetic-f3.geojson',fixture());await expect(page.locator('#map')).toHaveAttribute('data-personal-features','7');
 await jump(page,[X+.0006,Y+.0007],15);await expect.poll(()=>dataset(page,'placeLabelsRendered')).toBe('0');
 await jump(page,[X+.0006,Y+.0007],16.5);await expect.poll(async()=>Number(await dataset(page,'placeLabelsRendered'))).toBeGreaterThanOrEqual(1);
 const p=await screen(page,[X+.0006,Y+.0007]);await page.mouse.click(p.x,p.y);
 await expect(page.getByTestId('detail-eyebrow')).toHaveText('YERALTI / TARİHÎ KAYNAK İŞARETİ');await expect(page.getByRole('complementary',{name:'Kayıt ayrıntısı'}).locator('h2')).toHaveText('Sentetik adlı yer');
});

test('success notices close by themselves; errors stay until closed',async({page})=>{
 await open(page);await importGeo(page,'synthetic-f3.geojson',fixture());
 await expect(page.getByTestId('status')).toContainText('bu cihaza eklendi');await expect(page.getByTestId('status')).toHaveAttribute('data-tone','info');
 await expect(page.getByTestId('status')).toHaveCount(0,{timeout:9000});
 await importGeo(page,'bad.geojson',{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'MultiPoint',coordinates:[2.3,48.8]},properties:{}}]});
 await expect(page.getByTestId('status')).toHaveAttribute('data-tone','error');await page.waitForTimeout(7500);await expect(page.getByTestId('status')).toBeVisible();
});

test('a private record with photos bound only by featureIds shows them in its detail (photos only, no scan tab)',async({page})=>{
 await open(page);await importGeo(page,'synthetic-f3.geojson',fixture());await expect(page.locator('#map')).toHaveAttribute('data-personal-features','7');
 const png=tinyPng(5,4,[90,120,160]);
 const manifest={schema:1,atlasId:'paris-catacombs',id:'synthetic-feature-photo',title:'Sentetik kayıt fotoğrafı',rights:'personal-copy',assets:[{path:'photos/syn.png',kind:'image',name:'Sentetik kayıt fotoğrafı',sha256:sha(png),bytes:png.length,featureIds:['syn-room-x'],category:'room-photo',
  photo:{creator:'Sentetik Fotoğrafçı',sourcePage:'https://example.org/synthetic',captionExact:'Sentetik görüntü, gerçek yer değil',captureDate:null,licenceName:'Test · yeniden yayın yok',licenceUrl:null,licenceStatus:'personal-cache-only',primary:true,width:5,height:4}}]};
 await page.getByLabel('Arşiv paketi içe aktar',{exact:true}).setInputFiles({name:'synthetic-feature-photo.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'collection.json':strToU8(JSON.stringify(manifest)),'photos/syn.png':png},{level:0}))});
 await expect(page.getByTestId('status')).toContainText('1 dosya çevrimdışı');
 await page.locator('.directory-switch button',{hasText:'Yeraltı'}).click();await page.getByRole('textbox',{name:'Pafta ara'}).fill('Sentetik fotoğraflı');
 await page.getByRole('button',{name:'Sentetik fotoğraflı kayıt konumunu göster',exact:true}).click();
 await expect(page.getByTestId('detail-eyebrow')).toHaveText('YERALTI / TARİHÎ KAYNAK İŞARETİ');
 await expect(page.getByRole('tab',{name:'Fotoğraflar (1)'})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('tab',{name:'3B tarama görüntüsü'})).toHaveCount(0);
 await expect.poll(()=>page.getByTestId('room-photo').evaluate((el:HTMLImageElement)=>el.complete?el.naturalWidth:0)).toBe(5);
 await expect(page.getByTestId('room-photo-credit')).toContainText('Sentetik Fotoğrafçı');await expect(page.getByTestId('room-photo-credit')).toContainText('yalnız bu cihazda');
});

test('Sources show an http-only address as plain text, and the page declares its own icon',async({page})=>{
 const missing:string[]=[];page.on('response',r=>{if(r.status()===404&&/favicon/.test(r.url()))missing.push(r.url());});
 await open(page);expect(await page.locator('link[rel="icon"]').getAttribute('href')).toBe('./icons/icon-192.png');
 const sources=JSON.parse(await readFile('public/data/sources.json','utf8')).sources as {url:string;title:string}[];const plain=sources.filter(s=>s.url.startsWith('http://'));expect(plain.length).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Kaynaklar ve kapsam',exact:true}).click();
 for(const s of plain){const card=page.locator('.source-card',{hasText:s.title});await expect(card.getByTestId('source-url-plain')).toContainText(s.url);await expect(card.getByRole('link',{name:'Kaynağı aç'})).toHaveCount(0);}
 await expect(page.getByRole('link',{name:'Kaynağı aç'}).first()).toHaveAttribute('href',/^https:/);
 expect(missing).toEqual([]);
});

test('Cellier 2023 and 2026 share one point: the chooser stays open and each choice opens its room (mouse)',async({page,context})=>{
 await scans(context);await open(page);await jump(page,CELLIER,18);
 const cluster=page.locator('[data-marker-id="cluster-cellier-cellier-v2"]');await expect(cluster).toBeVisible();await cluster.click();
 const menu=page.getByTestId('cluster-menu');await expect(menu).toBeVisible();
 const first=menu.getByRole('menuitem',{name:'Cellier - 2023',exact:true});await first.hover();await expect(menu).toBeVisible();await first.click();
 const detail=page.getByRole('complementary',{name:'Kayıt ayrıntısı'});await expect(detail.locator('h2')).toHaveText('Cellier - 2023');await expect(menu).toHaveCount(0);
 await page.getByRole('button',{name:'Ayrıntıyı kapat'}).click();await jump(page,CELLIER,18);
 await page.locator('[data-marker-id="cluster-cellier-cellier-v2"]').click();await page.getByTestId('cluster-menu').getByRole('menuitem',{name:'Cellier - 2026',exact:true}).click();
 await expect(detail.locator('h2')).toHaveText('Cellier - 2026');
});

test('at z16 the mouse on Fontaine shows Fontaine, not a neighbouring room',async({page,context})=>{
 await scans(context);await open(page);await jump(page,FONTAINE,16);
 const p=await screen(page,FONTAINE);await page.mouse.move(p.x,p.y);
 await expect(page.getByRole('tooltip')).toContainText('Fontaine des Chartreux');
 const hit=await page.evaluate(({x,y})=>(document.elementFromPoint(x,y)?.closest('.atlas-place-marker') as HTMLElement|null)?.getAttribute('aria-label')??'',p);expect(hit).toContain('Fontaine des Chartreux');
});

test.describe('390px touch',()=>{
 test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 test('tapping the shared Cellier point and then a choice opens that room',async({page,context})=>{
  await scans(context);await open(page);await collapseSheet(page);await jump(page,CELLIER,18);
  // Lift the point above the legend strip and the bottom sheet before tapping.
  await page.evaluate(async()=>{const m=(window as any).__atlasMap;m.panBy([0,90],{duration:0});await new Promise(r=>{m.once('idle',r);m.triggerRepaint();});});
  const box=await page.locator('[data-marker-id="cluster-cellier-cellier-v2"]').boundingBox();expect(box).not.toBeNull();
  await page.touchscreen.tap(box!.x+box!.width/2,box!.y+box!.height/2);
  const choice=page.getByTestId('cluster-menu').getByRole('menuitem',{name:'Cellier - 2026',exact:true});await expect(choice).toBeVisible();
  const c=await choice.boundingBox();await page.touchscreen.tap(c!.x+c!.width/2,c!.y+c!.height/2);
  await expect(page.getByRole('complementary',{name:'Kayıt ayrıntısı'}).locator('h2')).toHaveText('Cellier - 2026');
 });
 test('a GeoJSON import keeps the map in view, opens the Girişler summary and fits the package',async({page})=>{
  await open(page);const before=Number(await dataset(page,'mapZoom'));
  await importGeo(page,'synthetic-f3.geojson',fixture());await expect(page.locator('#map')).toHaveAttribute('data-personal-features','7');
  await expect(page.getByRole('button',{name:'Paneli genişlet',exact:true})).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('.directory-switch button.is-active')).toContainText('Girişler');
  await expect.poll(async()=>Number(await dataset(page,'mapZoom'))).toBeGreaterThan(before+1);
  const center=JSON.parse(await dataset(page,'mapCenter'));expect(Math.abs(center[0]-X)).toBeLessThan(.01);expect(Math.abs(center[1]-Y)).toBeLessThan(.01);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  // A package that spans the official museum entry (public record) opens at z15 on that entry, above the legend strip.
  const entry=(JSON.parse(await readFile('public/data/exploration.geojson','utf8')).features as {properties:{id:string};geometry:{coordinates:[number,number]}}[]).find(f=>f.properties.id==='museum-entry')!.geometry.coordinates;
  await importGeo(page,'synthetic-span.geojson',{type:'FeatureCollection',name:'Sentetik geniş paket',createdAt:'2026-10-18T11:00:00Z',features:[{type:'Feature',id:'syn-span',properties:{id:'syn-span',kind:'linework',title:'Sentetik geniş çizgi'},geometry:{type:'LineString',coordinates:[[entry[0]-.02,entry[1]-.015],[entry[0]+.02,entry[1]+.015]]}}]});
  await expect(page.locator('#map')).toHaveAttribute('data-private-packages','2');
  await expect.poll(async()=>Number(await dataset(page,'mapZoom'))).toBeCloseTo(15,0);
  await page.evaluate(()=>new Promise(r=>{const m=(window as any).__atlasMap;if(!m.isMoving())r(null);else m.once('moveend',r);}));
  const q=await screen(page,entry),band=await visibleBand(page);expect(q.y).toBeGreaterThan(band.top);expect(q.y).toBeLessThan(band.bottom);
 });
 test('a record chosen from a list stays visible and keeps its ring after the detail closes',async({page})=>{
  await open(page);await importGeo(page,'synthetic-f3.geojson',fixture());await expect(page.locator('#map')).toHaveAttribute('data-personal-features','7');
  await page.getByRole('button',{name:'Paneli genişlet',exact:true}).click();
  await page.getByRole('button',{name:'Basamaksız servis şaftı · kayıt 59 konumunu göster',exact:true}).click();
  await expect(page.locator('#map')).toHaveAttribute('data-selected-feature','syn-shaft-plain');
  await page.getByRole('button',{name:'Ayrıntıyı kapat'}).click();await expect(page.locator('#map')).toHaveAttribute('data-selected-feature','syn-shaft-plain');await expect(page.locator('#map')).toHaveAttribute('data-hover-feature','');
  // After the camera settles, the record sits above the legend strip (and therefore above the bottom sheet).
  await page.evaluate(()=>new Promise(r=>{const m=(window as any).__atlasMap;if(!m.isMoving())r(null);else m.once('moveend',r);}));
  const p=await screen(page,[X,Y]),band=await visibleBand(page);expect(p.y).toBeLessThan(band.bottom);expect(p.y).toBeGreaterThan(band.top);
 });
});
