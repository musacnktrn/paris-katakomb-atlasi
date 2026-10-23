// ureten: codex. Fresh, disk-backed browser; no private file import, no mocked sources.
import {chromium,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),target=process.env.ATLAS_QA_URL??'http://127.0.0.1:5184/paris-atlas/';
const out=path.resolve('../outputs/devam-20261023',`public-boundary-${stamp}`),profile=path.resolve('private-data',`qa-public-${stamp}`);await mkdir(out,{recursive:true});
const proof={ureten:'codex',at:new Date().toISOString(),target,physicalPhone:false,mockedSources:false,errors:[],nonReadRequests:0};let context;
try{
 context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader'],viewport:{width:1440,height:950}});
 context.on('request',r=>{if(!['GET','HEAD','OPTIONS'].includes(r.method()))proof.nonReadRequests++;});
 const page=context.pages()[0]??await context.newPage();page.on('pageerror',e=>proof.errors.push(e.message));await page.goto(target);await expect(page.getByTestId('status')).toContainText('Atlas hazır',{timeout:60000});await expect(page.locator('#map')).toHaveAttribute('data-region-ready','true',{timeout:60000});await expect(page.locator('#map')).toHaveAttribute('data-landcover-ready','true',{timeout:60000});await expect(page.locator('#map')).toHaveAttribute('data-personal-features','0');
 proof.storage=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('archify-atlas-paris-catacombs-'+encodeURIComponent(new URL('./',document.baseURI).pathname)+'-v1');r.onerror=()=>reject(Error('storage'));r.onsuccess=()=>{const db=r.result,t=db.transaction(['assets','collections']),a=t.objectStore('assets').getAll(),c=t.objectStore('collections').count();t.oncomplete=()=>{db.close();resolve({collections:c.result,geojson:a.result.filter(x=>x.kind==='geojson').length,models:a.result.filter(x=>x.kind==='glb').length,cameraPhotos:a.result.filter(x=>x.category==='room-photo').length});};};}));
 expect(proof.storage).toEqual({collections:0,geojson:0,models:0,cameraPhotos:0});
 const local=JSON.parse(await readFile('dist/core-manifest.json','utf8')),remote=await page.evaluate(async()=>{const r=await fetch('./core-manifest.json',{cache:'no-store'});if(!r.ok)throw Error('Core manifest unavailable');return r.json();});expect(remote.version).toBe(local.version);proof.coreVersion=remote.version;proof.coreFiles=remote.assets.length;
 await page.getByRole('button',{name:'Çevrimdışı atlası aç',exact:true}).click();await page.getByRole('button',{name:'Çevrimdışı hazırlığı doğrula',exact:true}).click();await expect(page.getByTestId('core-status')).toContainText('Hazır',{timeout:60000});proof.verifiedCore=await page.getByTestId('core-status').innerText();await page.getByRole('button',{name:'Paneli kapat',exact:true}).click();
 expect(proof.nonReadRequests).toBe(0);expect(proof.errors).toEqual([]);await page.screenshot({path:path.join(out,'fresh-public.png')});proof.ok=true;
}catch(e){proof.ok=false;proof.failure=String(e.stack??e);process.exitCode=1;}
finally{if(context)await context.close();proof.finishedAt=new Date().toISOString();await writeFile(path.join(out,'KABUL.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({ok:proof.ok,out,coreVersion:proof.coreVersion,storage:proof.storage,failure:proof.failure?.slice(0,300)}));}
