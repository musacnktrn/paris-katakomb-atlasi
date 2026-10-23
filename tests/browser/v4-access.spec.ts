// ureten: opus: V4 access records (P1-P9): counts, chips, labels, single toggle, package family, hover.
// The fixture is SYNTHETIC and built inline: invented test positions west of the publisher rooms, not real places.
import {test,expect,type Page} from '@playwright/test';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {accessGroupOf,accessGroups,type AccessGroup} from '../../src/core/underground';
const NAME='ATLAS private historical Paris source package';
const [X,Y]=[2.3060,48.8360];
type Feature={type:'Feature';id:string;properties:Record<string,unknown>;geometry:{type:string;coordinates:unknown}};
const pt=(id:string,dx:number,dy:number,properties:Record<string,unknown>):Feature=>({type:'Feature',id,properties:{id,accessStatus:'unknown',depthMetres:null,unknownDepth:true,...properties},geometry:{type:'Point',coordinates:[X+dx,Y+dy]}});
const shaft=(id:string,dx:number,title:string,sourceCategory:string,sourceCategoryLabel:string)=>pt(id,dx,0,{kind:'shaft',title,sourceCategory,sourceCategoryLabel,calibrationCrossSourceRmsMetres:19.88});
function fixture(createdAt:string,extraShaft=false){
 const features:Feature[]=[
  shaft('syn-shaft-a',0,'Sentetik şaft A','getMaintenanceWellWithRungsMarkers','Basamaklı servis şaftı'),
  shaft('syn-shaft-b',.0010,'Sentetik şaft B','getMaintenanceWellWithRungsMarkers','Basamaklı servis şaftı'),
  shaft('syn-shaft-c',.0020,'Sentetik şaft C','getMaintenanceWellWithoutRungsMarkers','Basamaksız servis şaftı'),
  shaft('syn-shaft-d',.0030,'Sentetik şaft D','getCommunicationWellMarkers','Katlar arası şaft'),
  pt('syn-stair',0,.0010,{kind:'stair',title:'Sentetik döner merdiven',sourceCategory:'getSpiralStaircaseMarkers',sourceCategoryLabel:'Döner merdiven'}),
  pt('syn-well',.0010,.0010,{kind:'well',title:'Sentetik kuyu',sourceCategory:'getWellsMarkers',sourceCategoryLabel:'Kuyu'}),
  pt('historic-poi-getGeneralInformationMarkers-6',.0020,.0010,{kind:'feature',title:'Sentetik eski giriş',sourceCategory:'getGeneralInformationMarkers',sourceCategoryLabel:'Tarihî yer bilgisi'}),
  pt('syn-note',.0030,.0010,{kind:'feature',title:'Sentetik plan notu',sourceCategory:'getFeatureMarkers',sourceCategoryLabel:'Plan notu'}),
  pt('syn-room',.0040,.0010,{kind:'room',title:'Sentetik salon kaydı',publisherRoomId:'fontaine',sourceCategory:'getGeneralInformationMarkers',sourceCategoryLabel:'Tarihî yer bilgisi'}),
  {type:'Feature',id:'syn-line-1',properties:{id:'syn-line-1',kind:'linework',title:'Sentetik plan çizgisi 1',accessStatus:'unknown'},geometry:{type:'LineString',coordinates:[[X-.0010,Y-.0006],[X+.0040,Y-.0006]]}},
  {type:'Feature',id:'syn-line-2',properties:{id:'syn-line-2',kind:'linework',title:'Sentetik plan çizgisi 2',accessStatus:'unknown'},geometry:{type:'LineString',coordinates:[[X-.0010,Y-.0006],[X-.0010,Y+.0016]]}},
 ];
 if(extraShaft)features.push(shaft('syn-shaft-e',.0040,'Sentetik şaft E','getMaintenanceWellWithoutRungsMarkers','Basamaksız servis şaftı'));
 return {type:'FeatureCollection',name:NAME,createdAt,publicRedistributionApproved:false,features};
}
async function open(page:Page){await page.goto('./');await expect(page.getByTestId('status')).toContainText('Atlas hazır',{timeout:30000});await expect(page.locator('#map')).toHaveAttribute('data-region-ready','true');}
async function importGeo(page:Page,name:string,value:unknown){await page.getByLabel('Dosya içe aktar',{exact:true}).setInputFiles({name,mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(value))});}
const access=(page:Page)=>page.locator('.directory-switch button',{hasText:'Girişler'});
const chip=(page:Page,g:string)=>page.locator(`[data-access-chip="${g}"] span`);
async function jump(page:Page,center:[number,number],zoom:number){
 return page.evaluate(async({center,zoom})=>{const m=(window as any).__atlasMap;m.jumpTo({center,zoom,pitch:0,bearing:0});await new Promise(r=>{m.once('idle',r);m.triggerRepaint();});const r=m.getCanvas().getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};},{center,zoom});
}
async function screen(page:Page,lngLat:[number,number]){return page.evaluate(ll=>{const m=(window as any).__atlasMap,p=m.project(ll),r=m.getCanvas().getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y};},lngLat);}

test('Girişler counts every access group, labels shafts as historical with unknown access, and one switch hides them',async({page})=>{
 await open(page);await importGeo(page,'synthetic-access.geojson',fixture('2026-10-18T10:00:00Z'));
 await expect(page.locator('#map')).toHaveAttribute('data-personal-features','11');
 await access(page).click();await expect(access(page)).toContainText('9');await expect(page.getByTestId('result-count')).toHaveText('9 sonuç');
 for(const [g,n] of [['all','9'],['official','2'],['shaft','4'],['stair','1'],['well','1'],['former','1']])await expect(chip(page,g)).toHaveText(n);
 await page.locator('[data-access-chip="shaft"]').click();await expect(page.getByTestId('result-count')).toHaveText('4 sonuç');await expect(page.locator('.directory-item[data-access-group="shaft"]')).toHaveCount(4);
 await page.locator('[data-access-chip="all"]').click();await expect(page.getByTestId('result-count')).toHaveText('9 sonuç');
 // Depth labels: official is street level, never "−0 m"; historical records have no depth in the source.
 const official=page.getByRole('button',{name:'Resmî müze · ziyaretçi girişi konumunu göster',exact:true});await expect(official).toContainText('Yerüstü');await expect(official).not.toContainText('−0');
 const shaftRow=page.getByRole('button',{name:'Sentetik şaft A konumunu göster',exact:true});await expect(shaftRow).toContainText('Derinlik bilinmiyor');await expect(shaftRow).toContainText('Basamaklı servis şaftı');await expect(shaftRow.locator('.access-glyph')).toHaveText('↓');
 await expect(page.getByRole('button',{name:'Sentetik şaft D konumunu göster',exact:true}).locator('.access-glyph')).toHaveText('↕');
 // P1: a private shaft opens as a historical access record, never as the museum branch.
 await shaftRow.click();const detail=page.getByRole('complementary',{name:'Kayıt ayrıntısı'}),eyebrow=page.getByTestId('detail-eyebrow');
 await expect(eyebrow).toContainText('TARİHÎ ERİŞİM KAYDI');await expect(eyebrow).toContainText('GÜNCEL DURUM BİLİNMİYOR');await expect(eyebrow).not.toContainText('RESMÎ MÜZE');await expect(eyebrow).not.toContainText('YERÜSTÜ');
 await expect(detail).toContainText('Basamaklı servis şaftı');await expect(detail).toContainText('Bilinmiyor · açık giriş anlamına gelmez');await expect(detail).toContainText('Kaynakta belirtilmemiş');await expect(detail).toContainText('RMS 20 m');
 await page.getByRole('button',{name:'Sentetik eski giriş konumunu göster',exact:true}).click();await expect(eyebrow).toContainText('TARİHÎ ERİŞİM KAYDI');await expect(detail).toContainText('Kaynakta eski giriş');
 await official.click();await expect(eyebrow).toHaveText('YERÜSTÜ / RESMÎ MÜZE ERİŞİMİ');await expect(detail).not.toContainText('−0 m');await expect(detail).not.toContainText('Yüzeyden 0 m');
 await page.getByRole('button',{name:'Ayrıntıyı kapat'}).click();
 // P5: one switch for official + historical access, with computed counts in its description.
 await jump(page,[X+.0015,Y+.0003],16);
 await expect.poll(async()=>Number(await page.locator('#map').getAttribute('data-access-points-rendered'))).toBe(7);
 await page.getByRole('button',{name:'Harita katmanlarını aç',exact:true}).click();
 const row=page.locator('.atlas-layer-row.layer-access');await expect(row).toContainText('Girişler ve erişim kayıtları');await expect(row).toContainText('2 resmî · 7 tarihî kayıt · güncel erişim bilinmiyor');await expect(row).toContainText('9');
 await page.getByLabel('Girişler ve erişim kayıtları katmanı',{exact:true}).uncheck();
 await expect.poll(async()=>Number(await page.locator('#map').getAttribute('data-access-points-rendered'))).toBe(0);
 await expect(page.locator('[data-marker-id="museum-entry"]')).toBeHidden();
 await expect.poll(async()=>Number(await page.locator('#map').getAttribute('data-vector-lines-rendered'))).toBeGreaterThan(0);
 await page.getByLabel('Girişler ve erişim kayıtları katmanı',{exact:true}).check();
 await expect.poll(async()=>Number(await page.locator('#map').getAttribute('data-access-points-rendered'))).toBe(7);
 // P7: band is a separate, labelled visual widening; "Varsayılan" also resets vector filters.
 await expect(page.locator('.vector-band-note').first()).toContainText('ölçülmüş galeri genişliği ya da doğrulanmış bağlantı değildir');
 await expect(page.locator('#map')).toHaveAttribute('data-band-visible','true');
 await page.getByLabel('Galeri bandı (görsel kalınlaştırma)',{exact:true}).uncheck();await expect(page.locator('#map')).toHaveAttribute('data-band-visible','false');
 await page.getByRole('button',{name:'Varsayılan',exact:true}).click();await expect(page.locator('#map')).toHaveAttribute('data-band-visible','true');await expect(page.getByLabel('Galeri bandı (görsel kalınlaştırma)',{exact:true})).toBeChecked();
 const order=await page.evaluate(()=>{const ids=(window as any).__atlasMap.getStyle().layers.map((l:any)=>l.id);const p=ids.find((id:string)=>id.endsWith('-band'));return {band:ids.indexOf(p),line:ids.indexOf(p.replace('-band','-line')),labels:ids.indexOf('region-road-labels'),cap:(window as any).__atlasMap.getLayoutProperty(p.replace('-band','-line'),'line-cap')};});
 expect(order.band).toBeLessThan(order.line);expect(order.line).toBeLessThan(order.labels);expect(order.cap).toBe('round');
});

test('only the newest package of a name family is active; the older one stays stored and is labelled inactive',async({page})=>{
 await open(page);await importGeo(page,'synthetic-old.geojson',fixture('2026-10-18T10:00:00Z'));await expect(page.locator('#map')).toHaveAttribute('data-personal-features','11');
 await importGeo(page,'synthetic-new.geojson',fixture('2026-10-18T12:00:00Z',true));await expect(page.locator('#map')).toHaveAttribute('data-personal-features','12');
 await expect(page.locator('#map')).toHaveAttribute('data-private-packages','1');
 await access(page).click();await expect(access(page)).toContainText('10');await expect(page.getByTestId('result-count')).toHaveText('10 sonuç');await expect(chip(page,'shaft')).toHaveText('5');
 await page.getByRole('button',{name:'Kaynak kütüphanesi',exact:true}).click();
 const assets=page.getByTestId('assets');await expect(assets.locator('li')).toHaveCount(2);
 await expect(assets.locator('li',{hasText:'synthetic-old.geojson'}).locator('[data-package-state]')).toHaveAttribute('data-package-state','inactive');
 await expect(assets.locator('li',{hasText:'synthetic-old.geojson'})).toContainText('etkin değil');
 await expect(assets.locator('li',{hasText:'synthetic-new.geojson'}).locator('[data-package-state]')).toHaveAttribute('data-package-state','active');
 // Opening the stored older file never re-adds it beside the active one.
 await page.getByRole('button',{name:'synthetic-old.geojson dosyasını aç',exact:true}).click();await expect(page.getByTestId('status')).toContainText('etkin değil');
 // P9 parse cache: each package was parsed once; refreshes after import/open reuse it.
 await expect(page.locator('#map')).toHaveAttribute('data-private-parses','2');
 await page.reload();await expect(page.getByTestId('status')).toContainText('Atlas hazır',{timeout:30000});await expect(page.locator('#map')).toHaveAttribute('data-personal-features','12');
});

test('hovering a private shaft or plan line highlights that exact record',async({page})=>{
 await open(page);await importGeo(page,'synthetic-hover.geojson',fixture('2026-10-18T10:00:00Z'));await expect(page.locator('#map')).toHaveAttribute('data-personal-features','11');
 await jump(page,[X,Y],17);let p=await screen(page,[X,Y]);await page.mouse.move(p.x,p.y);
 await expect(page.locator('#map')).toHaveAttribute('data-hover-feature','syn-shaft-a');
 await expect(page.getByRole('tooltip')).toContainText('Sentetik şaft A');await expect(page.getByRole('tooltip')).toContainText('güncel erişim bilinmiyor');
 const glow=await page.evaluate(async()=>(window as any).__atlasMap.getSource('private-hover').getData());expect(glow.features).toHaveLength(1);expect(glow.features[0].geometry).toEqual({type:'Point',coordinates:[X,Y]});
 p=await screen(page,[X+.0005,Y-.0006]);await page.mouse.move(p.x,p.y);await expect(page.locator('#map')).toHaveAttribute('data-hover-feature','syn-line-1');
 p=await screen(page,[X+.0005,Y+.0005]);await page.mouse.move(p.x,p.y);await expect(page.locator('#map')).toHaveAttribute('data-hover-feature','');
 // Click on a historical point opens its historical detail (not the museum branch).
 p=await screen(page,[X+.0010,Y+.0010]);await page.mouse.click(p.x,p.y);await expect(page.getByTestId('detail-eyebrow')).toContainText('TARİHÎ ERİŞİM KAYDI');await expect(page.getByRole('complementary',{name:'Kayıt ayrıntısı'})).toContainText('Sentetik kuyu');
});

test('a private historical room record matched to a publisher room opens that room preview',async({page,context})=>{
 const png=await readFile('public/icons/icon-192.png');await context.route('https://assets.catacombes.xyz/**',r=>r.fulfill({body:png,contentType:'image/png'}));await context.route('https://catacombes.xyz/_next/image?**',r=>r.fulfill({body:png,contentType:'image/png'}));
 await open(page);await importGeo(page,'synthetic-room.geojson',fixture('2026-10-18T10:00:00Z'));await expect(page.locator('#map')).toHaveAttribute('data-personal-features','11');
 // ureten: opus: an import now opens the Girişler summary; the room record lives in the Yeraltı directory.
 await page.locator('.directory-switch button',{hasText:'Yeraltı'}).click();await page.getByRole('textbox',{name:'Pafta ara'}).fill('Sentetik salon');await page.getByRole('button',{name:'Sentetik salon kaydı konumunu göster',exact:true}).click();
 const detail=page.getByRole('complementary',{name:'Kayıt ayrıntısı'});await expect(page.getByTestId('detail-eyebrow')).toHaveText('YERALTI / SALON KAYDI');await expect(detail).toContainText('Fontaine des Chartreux');await expect(page.getByTestId('room-preview')).toBeVisible();
 // The same happens when the historical point itself is clicked on the map.
 await page.getByRole('button',{name:'Ayrıntıyı kapat'}).click();await jump(page,[X+.0040,Y+.0010],17);const p=await screen(page,[X+.0040,Y+.0010]);await page.mouse.click(p.x,p.y);
 await expect(page.getByTestId('detail-eyebrow')).toHaveText('YERALTI / SALON KAYDI');await expect(detail).toContainText('Fontaine des Chartreux');
});

// OPTIONAL, local only: the real private package never leaves private-data/ (gitignored). Skips cleanly when absent.
// ureten: opus: the newest existing candidate wins (v4e, then v4d, then v4c). Expected counts come from that package's own
// meta file and its features at run time, so this committed file holds no private-derived counts. Only the 2 official museum records are public.
const LOCAL=['v4e','v4d','v4c'].map(v=>({version:v,geo:path.resolve(`private-data/v4-underground/atlas-private-underground-${v}.geojson`),meta:path.resolve(`private-data/v4-underground/atlas-private-underground-${v}.meta.json`)})).find(c=>existsSync(c.geo)&&existsSync(c.meta));
test('local private package (newest of v4e/v4d/v4c): every access record counted and every feature loaded',async({page})=>{
 test.skip(!LOCAL,'No private v4c/v4d/v4e package on this machine.');
 test.setTimeout(180000);
 const bytes=await readFile(LOCAL!.geo),data=JSON.parse(bytes.toString('utf8')),meta=JSON.parse(await readFile(LOCAL!.meta,'utf8'));const total=data.features.length;
 test.info().annotations.push({type:'package',description:LOCAL!.version});
 expect(total).toBe(meta.featureCount);
 const groups:Record<AccessGroup,number>={official:2,shaft:0,stair:0,well:0,former:0,user:0,grs:0};
 for(const f of data.features){const g=accessGroupOf(f.properties,f.id);if(g&&g!=='official')groups[g]++;}
 // The package's own meta agrees with what the app groups (shafts, stairs and wells are historical records, never "entrances").
 for(const k of ['shaft','stair','well'] as const)expect(groups[k]).toBe(meta.pointKinds[k]);
 expect(groups.former).toBeGreaterThan(0);
 const all=Object.values(groups).reduce((a,b)=>a+b,0);
 test.info().annotations.push({type:'access-records',description:String(all)},{type:'features',description:String(total)});
 await open(page);await page.getByLabel('Dosya içe aktar',{exact:true}).setInputFiles({name:path.basename(LOCAL!.geo),mimeType:'application/geo+json',buffer:bytes});
 await expect(page.locator('#map')).toHaveAttribute('data-personal-features',String(total),{timeout:120000});
 await access(page).click();await expect(access(page)).toContainText(String(all));await expect(page.getByTestId('result-count')).toHaveText(`${all} sonuç`);
 for(const g of accessGroups)await expect(chip(page,g)).toHaveText(String(groups[g]));
 // Level filter counts equal the package's own sourceLevel counts (missing = Belirsiz); read from the file, never hard-coded.
 const levels:Record<string,number>={superieur:0,inferieur:0,unknown:0};for(const f of data.features)if(String(f.geometry?.type).includes('LineString')){const l=f.properties?.sourceLevel;levels[l==='superieur'||l==='inferieur'?l:'unknown']++;}
 await page.getByRole('button',{name:'Harita katmanlarını aç',exact:true}).click();
 for(const [l,n] of Object.entries(levels))await expect(page.locator(`label:has([data-level-filter="${l}"]) small`)).toHaveText(n.toLocaleString('tr-TR'));
 await page.getByRole('button',{name:'Katmanları kapat',exact:true}).click();
 // A publisher-matched historical room opens the publisher room detail (record read at run time; nothing private is committed).
 const matched=data.features.filter((f:any)=>f.properties?.publisherRoomId);expect(matched.length).toBe(meta.validation.schema.publisherRoomIds);
 await page.locator('.directory-switch button',{hasText:'Yeraltı'}).click();const first=matched[0].properties;await page.getByRole('textbox',{name:'Pafta ara'}).fill(String(first.id));
 await page.getByRole('button',{name:`${String(first.title).trim()} konumunu göster`,exact:true}).click();await expect(page.getByTestId('detail-eyebrow')).toHaveText('YERALTI / SALON KAYDI');
});

// ureten: opus: P4/P8 touch target. On a coarse pointer a tap 20 px beside a shaft still selects it.
test.describe('390px touch',()=>{
 test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 test('a tap 20 px beside a historical shaft opens its historical detail',async({page})=>{
  await open(page);expect(await page.evaluate(()=>matchMedia('(pointer:coarse)').matches)).toBe(true);
  await importGeo(page,'synthetic-touch.geojson',fixture('2026-10-18T10:00:00Z'));await expect(page.locator('#map')).toHaveAttribute('data-personal-features','11');
  const sheet=page.getByRole('button',{name:'Paneli küçült'});if(await sheet.isVisible())await sheet.click();
  await jump(page,[X+.0010,Y],16);
  // ureten: codex: pan from the actual projected point; padded mobile camera centres are not canvas.width/2.
  // Move the shaft to a spot where nothing (legend, sheet, buttons) covers the canvas, then tap 20 px beside it (old pick reach was about 11 px).
  const p=await page.evaluate(async ll=>{const m=(window as any).__atlasMap,canvas=m.getCanvas(),c=canvas.getBoundingClientRect();
   for(const [fx,fy] of [[.5,.62],[.5,.5],[.35,.62],[.65,.62],[.5,.4],[.5,.72]]){const sx=c.width*fx,sy=c.height*fy;if(document.elementFromPoint(c.left+sx+20,c.top+sy)!==canvas)continue;const q=m.project(ll);m.panBy([q.x-sx,q.y-sy],{duration:0});await new Promise(r=>{m.once('idle',r);m.triggerRepaint();});const z=m.project(ll);return {x:c.left+z.x,y:c.top+z.y};}
   throw new Error('no free spot on the mobile map');},[X+.0010,Y]);
  await page.touchscreen.tap(p.x+20,p.y);
  await expect(page.getByTestId('detail-eyebrow')).toContainText('TARİHÎ ERİŞİM KAYDI');await expect(page.getByRole('complementary',{name:'Kayıt ayrıntısı'})).toContainText('Sentetik şaft B');
 });
});
