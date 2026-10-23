// ureten: codex. Source visibility and re-registering identical image bytes are actual map behaviours.
import {expect} from '@playwright/test';
import {test} from '../helpers/persistent-browser';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
async function archive(corrected=false){
 const image=await readFile('public/icons/icon-192.png'),sha=createHash('sha256').update(image).digest('hex');
 const assets=[{path:'maps/first.png',name:'Sentetik ilk kaynak',kind:'raster',category:'source-map-georeferenced',bytes:image.length,sha256:sha,mapBounds:corrected?[2.33,48.831,2.334,48.835]:[2.32,48.831,2.324,48.835],mapSource:{id:'synthetic-first',title:'Sentetik ilk plan',placement:'approximate',positionNote:'Sentetik kalibrasyon testi',defaultVisible:true}},
 {path:'maps/second.png',name:'Sentetik ikinci kaynak',kind:'raster',category:'source-map-georeferenced',bytes:image.length,sha256:sha,mapBounds:[2.324,48.831,2.328,48.835],mapSource:{id:'synthetic-second',title:'Sentetik ikinci plan',placement:'approximate',positionNote:'Sentetik ikinci kaynak',defaultVisible:false}}];
 return Buffer.from(zipSync({'collection.json':strToU8(JSON.stringify({schema:1,atlasId:'paris-catacombs',id:'synthetic-raster-sources',title:'Sentetik görüntü kaynakları',rights:'personal-copy',assets})),'maps/first.png':image,'maps/second.png':image},{level:0}));
}
test('source images switch independently; correcting bounds updates the source without changing image bytes',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('./');await expect(page.getByTestId('status')).toContainText('Atlas hazır');
 await page.getByLabel('Arşiv paketi içe aktar',{exact:true}).setInputFiles({name:'synthetic-source-images.zip',mimeType:'application/zip',buffer:await archive()});await expect(page.getByTestId('status')).toContainText('2 dosya çevrimdışı');
 const close=page.getByRole('button',{name:'Paneli kapat',exact:true});if(await close.isVisible())await close.click();
 await page.evaluate(()=>{(window as any).__atlasMap.jumpTo({center:[2.326,48.833],zoom:14,pitch:0});});
 await page.getByRole('button',{name:'Harita katmanlarını aç',exact:true}).click();await page.getByLabel('Galeri planları katmanı',{exact:true}).check();
 await expect(page.getByLabel('Sentetik ilk plan görüntüleri',{exact:true})).toBeChecked();await expect(page.getByLabel('Sentetik ikinci plan görüntüleri',{exact:true})).not.toBeChecked();await expect(page.locator('#map')).toHaveAttribute('data-gallery-layers','1');
 await page.getByLabel('Sentetik ikinci plan görüntüleri',{exact:true}).check();await expect(page.locator('#map')).toHaveAttribute('data-gallery-layers','2');await page.getByLabel('Sentetik ikinci plan görüntüleri',{exact:true}).uncheck();await expect(page.locator('#map')).toHaveAttribute('data-gallery-layers','1');
 await page.getByRole('button',{name:'Katmanları kapat',exact:true}).click();
 const west=()=>page.evaluate(()=>{const m=(window as any).__atlasMap,id=Object.keys(m.getStyle().sources).find((id:string)=>id.startsWith('image-gallery-')&&id.includes('first.png'));return id?m.getSource(id).serialize().coordinates[0][0]:null;});await expect.poll(west).toBe(2.32);
 await page.getByLabel('Arşiv paketi içe aktar',{exact:true}).setInputFiles({name:'synthetic-source-images-corrected.zip',mimeType:'application/zip',buffer:await archive(true)});await expect(page.getByTestId('status')).toContainText('2 dosya çevrimdışı');await expect.poll(west).toBe(2.33);expect(errors).toEqual([]);
});
