// ureten: codex. Synthetic source layers and user marks; no real private identifiers, names or positions.
import {test,expect} from '../helpers/persistent-browser';
import type {Page} from '@playwright/test';
const xy:[number,number]=[2.31,48.83];
const pt=(id:string,x:number,p:Record<string,unknown>)=>({type:'Feature',id,properties:{id,accessStatus:'unknown',depthMetres:null,...p},geometry:{type:'Point',coordinates:[xy[0]+x,xy[1]]}});
function fixture(){return {type:'FeatureCollection',name:'Synthetic multi-source family',createdAt:'2026-01-01T00:00:00Z',features:[
 pt('synthetic-primary-star',0,{kind:'user-entrance',title:'Synthetic first mark',sourceId:'synthetic-alpha',sourceLabel:'Synthetic Alpha',displayColor:'#7c3aed',displayStyle:'first-primary',cameraHeadingDeg:110}),
 pt('synthetic-other-star',.001,{kind:'user-entrance',title:'Synthetic other mark',sourceId:'synthetic-alpha',sourceLabel:'Synthetic Alpha',displayColor:'#dc2626'}),
 pt('synthetic-sump',.002,{kind:'feature',title:'Sump',sourceId:'synthetic-beta',sourceLabel:'Synthetic Beta',sourceYear:2000}),
 pt('synthetic-aqueduct',.003,{kind:'feature',title:'Aqueduct',sourceId:'synthetic-beta',sourceLabel:'Synthetic Beta',sourceYear:2000}),
 {type:'Feature',id:'synthetic-red-line',properties:{id:'synthetic-red-line',kind:'linework',title:'Synthetic red line',sourceId:'synthetic-beta',sourceLabel:'Synthetic Beta',legend_label:'NON ACCESSIBLE'},geometry:{type:'LineString',coordinates:[[xy[0]-.001,xy[1]-.001],[xy[0]+.004,xy[1]-.001]]}},
]};}
async function open(page:Page){await page.goto('./');await expect(page.locator('#map')).toHaveAttribute('data-region-ready','true');}
async function seed(page:Page){await page.getByLabel('Dosya içe aktar',{exact:true}).setInputFiles({name:'synthetic-sources.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(fixture()))});await expect(page.locator('#map')).toHaveAttribute('data-personal-features','5');}
async function layers(page:Page){await page.getByRole('button',{name:'Harita katmanlarını aç',exact:true}).click();}
test('personal stars retain distinct colours, an honest type and their saved source after reload',async({page,context})=>{
 await open(page);await seed(page);await page.getByRole('button',{name:'Synthetic first mark konumunu göster',exact:true}).click();
 await expect(page.getByTestId('detail-eyebrow')).toContainText('KİŞİSEL İŞARET');await expect(page.getByTestId('detail-eyebrow')).not.toContainText('RESMÎ');
 await expect(page.getByRole('complementary',{name:'Kayıt ayrıntısı'})).toContainText('Kaynak görüntüsü bakışı');
 await page.getByRole('button',{name:'Ayrıntıyı kapat',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>{const m=(window as any).__atlasMap,ids=m.getStyle().layers.filter((l:any)=>l.id.endsWith('-point')&&l.id.startsWith('private-')).map((l:any)=>l.id),out:Record<string,string>={};for(const f of m.queryRenderedFeatures(undefined,{layers:ids})){if(f.properties.accessGroup!=='user')continue;const c=f.layer.paint['circle-color'];out[f.properties.id]=[c.r,c.g,c.b].map((n:number)=>Math.round(n*255).toString(16).padStart(2,'0')).join('');}return out;})).toMatchObject({'synthetic-primary-star':'7c3aed'});
 await context.setOffline(true);await page.reload();await expect(page.locator('#map')).toHaveAttribute('data-personal-features','5');await page.locator('.directory-switch button',{hasText:'Girişler'}).click();
 await page.locator('[data-access-chip="user"]').click();await expect(page.getByTestId('result-count')).toHaveText('2 sonuç');
 await expect(page.getByRole('button',{name:'Synthetic first mark konumunu göster',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Synthetic other mark konumunu göster',exact:true})).toBeVisible();
});
test('source switch filters both map and access directory; source water overlays can be disabled',async({page})=>{
 await open(page);await seed(page);await layers(page);
 const panel=page.getByRole('region',{name:'Yeraltı kaynak katmanları'});await expect(panel).toContainText('Synthetic Alpha');await expect(panel).toContainText('Synthetic Beta');
 await page.getByLabel('Synthetic Alpha',{exact:false}).uncheck();await page.getByRole('button',{name:'Katmanları kapat',exact:true}).click();
 await page.locator('.directory-switch button',{hasText:'Girişler'}).click();await page.locator('[data-access-chip="user"]').click();await expect(page.getByTestId('result-count')).toHaveText('0 sonuç');
 await layers(page);await page.getByLabel('Kaynaklardaki su işaretleri',{exact:false}).uncheck();
 expect(await page.evaluate(()=>{const m=(window as any).__atlasMap;return m.getStyle().layers.filter((l:any)=>l.id.startsWith('private-')&&l.id.endsWith('-water')).every((l:any)=>m.getLayoutProperty(l.id,'visibility')==='none');})).toBe(true);
 await expect(panel).toContainText('Su kemeri veya kuyu, su basmış galeri anlamına gelmez');
});
test('open IGN landcover draws real vegetation and water, switches independently, and reopens offline',async({page,context})=>{
 await open(page);await expect(page.locator('#map')).toHaveAttribute('data-landcover-ready','true');
 await expect.poll(()=>page.evaluate(()=>{const m=(window as any).__atlasMap;return m.queryRenderedFeatures(undefined,{layers:['landcover-vegetation','landcover-water']}).length;})).toBeGreaterThan(0);
 await layers(page);await page.getByLabel('Yeşil ve açık alanlar katmanı',{exact:true}).uncheck();
 expect(await page.evaluate(()=>{const m=(window as any).__atlasMap;return m.getLayoutProperty('landcover-vegetation','visibility');})).toBe('none');
 expect(await page.evaluate(()=>{const m=(window as any).__atlasMap;return m.getLayoutProperty('landcover-water','visibility');})).toBe('visible');
 await page.getByLabel('Yüzey su kayıtları katmanı',{exact:true}).uncheck();expect(await page.evaluate(()=>{const m=(window as any).__atlasMap;return m.getLayoutProperty('landcover-water','visibility');})).toBe('none');
 await page.getByRole('button',{name:'Katmanları kapat',exact:true}).click();await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});
 await context.setOffline(true);await page.reload();await expect(page.locator('#map')).toHaveAttribute('data-landcover-ready','true');
});
