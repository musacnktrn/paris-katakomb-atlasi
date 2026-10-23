// ureten: codex. Actual THREE renderer, real decoded IGN tile archive, offline reload and geometric clipping.
import {expect} from '@playwright/test';
import {test} from '../helpers/persistent-browser';
const source={type:'FeatureCollection',name:'synthetic-layered-sources',features:[
 {type:'Feature',id:'syn-upper',properties:{kind:'linework',sourceLevel:'superieur',sourceId:'syn-plan'},geometry:{type:'MultiLineString',coordinates:[[[2.326,48.834],[2.327,48.834]],[[2.33,48.834],[2.331,48.834]]]}},
 {type:'Feature',id:'syn-lower',properties:{kind:'linework',sourceLevel:'inferieur',sourceId:'syn-plan'},geometry:{type:'LineString',coordinates:[[2.325,48.833],[2.329,48.833]]}},
 {type:'Feature',id:'syn-unknown',properties:{kind:'linework',sourceId:'syn-other'},geometry:{type:'LineString',coordinates:[[2.325,48.832],[2.329,48.832]]}},
]};
test('all source paths render together with real IGN building heights and remain available offline',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('./');await expect(page.getByTestId('status')).toContainText('Atlas hazır');
 await page.getByLabel('Dosya içe aktar',{exact:true}).setInputFiles({name:'synthetic-layers.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(source))});await expect(page.locator('#map')).toHaveAttribute('data-personal-features','3');
 await page.getByRole('button',{name:'3B derinlik görünümü',exact:true}).click();const view=page.getByTestId('layered-plan-view');await expect(view).toHaveAttribute('data-ready','true');await expect(view).toHaveAttribute('data-plan-paths','4');await expect(view).toHaveAttribute('data-plan-segments','4');
 await expect(view).toHaveAttribute('data-buildings-ready','true',{timeout:60000});expect(Number(await view.getAttribute('data-building-sources'))).toBeGreaterThan(100);expect(Number(await view.getAttribute('data-building-segments'))).toBeGreaterThan(100);
 await expect(page.getByRole('dialog',{name:'Katmanlı 3B kaynak haritası'})).toContainText('ölçülmüş derinlik değildir');await page.getByLabel('Katmanlı Alt kat',{exact:true}).uncheck();await expect(view).toHaveAttribute('data-levels','superieur,unknown');
 await page.getByLabel('Kaynak geometrisini kes',{exact:true}).check();await expect(view).toHaveAttribute('data-clip-planes','2');await page.getByLabel('Katmanlı kesit doğrultusu',{exact:true}).selectOption('z');await expect(view).toHaveAttribute('data-section-axis','z');
 await page.getByRole('button',{name:'Tüm kaynaklara sığdır',exact:true}).click();await page.screenshot({path:'test-results/layered-cut.png'});await page.getByRole('button',{name:'3B derinlik görünümünü kapat',exact:true}).click();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));});
 await context.setOffline(true);await page.reload();await expect(page.locator('#map')).toHaveAttribute('data-personal-features','3');await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'3B derinlik görünümü',exact:true}).click();await expect(view).toHaveAttribute('data-plan-paths','4');await expect(view).toHaveAttribute('data-buildings-ready','true',{timeout:60000});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/layered-mobile-offline.png'});expect(errors).toEqual([]);
});
test('native vector source colours and proximity notes stay attached to the same map record',async({page,context})=>{
 await page.goto('./');await expect(page.getByTestId('status')).toContainText('Atlas hazır');
 const feature={type:'Feature',id:'synthetic-native-polygon',properties:{kind:'feature',title:'Sentetik özgün plan alanı',sourceId:'synthetic-native-plan',style:{fill:[255,215,80],stroke:[14,51,177],fillOpacity:.25},sourceProximity:{sampleCount:10,radiusM:30,withinRadiusFraction:.9,medianM:4,p90M:8},sourceAlignmentNote:'Cadde eksenlerine dolaylı hizalama; saha ölçümü değildir.'},geometry:{type:'Polygon',coordinates:[[[2.36,48.831],[2.362,48.831],[2.362,48.833],[2.36,48.833],[2.36,48.831]]]}};
 await page.getByLabel('Dosya içe aktar',{exact:true}).setInputFiles({name:'synthetic-native.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify({type:'FeatureCollection',features:[feature]}))});await expect(page.locator('#map')).toHaveAttribute('data-personal-features','1');
 await page.evaluate(()=>{const m=(window as any).__atlasMap;m.jumpTo({center:[2.361,48.832],zoom:17,pitch:0});});
 await expect.poll(()=>page.evaluate(()=>{const m=(window as any).__atlasMap,layer=m.getStyle().layers.find((l:any)=>/^private-.*-area$/.test(l.id)),f=m.queryRenderedFeatures(m.project([2.361,48.832]),{layers:[layer.id]})[0];return f?{fill:f.properties.sourceFillColor,opacity:f.properties.sourceFillOpacity}:null;})).toEqual({fill:'#ffd750',opacity:.25});
 const pageCount=context.pages().length,point=await page.evaluate(()=>{const m=(window as any).__atlasMap,p=m.project([2.361,48.832]),r=m.getCanvas().getBoundingClientRect();return{x:r.x+p.x,y:r.y+p.y};});await page.mouse.click(point.x,point.y);
 await expect(page.getByTestId('source-proximity')).toContainText('bağımsız ölçüm doğrulaması değildir');await expect(page.getByRole('complementary',{name:'Kayıt ayrıntısı'})).toContainText('Cadde eksenlerine dolaylı hizalama');expect(context.pages()).toHaveLength(pageCount);
});
// ureten: codex. The phone must retain the scene when the last control is used.
test('mobile keeps the 3D scene visible while scrolling its controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('./');await expect(page.getByTestId('status')).toContainText('Atlas hazır');await page.getByRole('button',{name:'3B derinlik görünümü',exact:true}).click();
 const canvas=page.getByTestId('layered-plan-view').locator('canvas');await expect(canvas).toBeVisible();
 const last=page.locator('.spatial-layout aside').locator('input,select,button').last();await last.scrollIntoViewIfNeeded();
 const b=await canvas.boundingBox();expect(b).not.toBeNull();expect(b!.y).toBeGreaterThan(0);expect(b!.height).toBeGreaterThan(180);expect(b!.y+b!.height).toBeLessThan(844);expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
});
