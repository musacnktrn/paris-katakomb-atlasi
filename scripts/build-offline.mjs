// ureten: codex
import {readdir,readFile,writeFile,stat} from 'node:fs/promises';import {createHash} from 'node:crypto';import path from 'node:path';
import {existsSync} from 'node:fs';
const root=path.resolve('dist');async function files(dir){let out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await files(p));else out.push(p);}return out;}
const region=JSON.parse(await readFile('public/data/region-tiles-meta.json','utf8'));
// ureten: codex: an additional large archive is admitted only by its explicit open-data, decoded-ID manifest.
const approvedLarge=[region];if(existsSync('public/data/landcover-meta.json')){const land=JSON.parse(await readFile('public/data/landcover-meta.json','utf8'));if(land.url==='data/landcover.pmtiles'&&land.sourceUrl==='https://geoservices.ign.fr/bdtopo'&&land.verification?.allSelectedSourceidsPreserved===true)approvedLarge.push(land);}
const core=[];for(const p of (await files(root)).sort()){const rel=path.relative(root,p).split(path.sep).join('/');if(['sw.js','core-manifest.json'].includes(rel))continue;const b=await readFile(p),hash=createHash('sha256').update(b).digest('hex');if(b.length>10*1024*1024 && !approvedLarge.some(meta=>rel===meta.url&&meta.license==='etalab-2.0'&&b.length===meta.bytes&&b.length<80*1024*1024&&hash===meta.sha256))throw Error('Unverified large core asset: '+rel);core.push({url:'./'+rel,bytes:b.length,sha256:hash});}
const swTemplate=await readFile('src/sw-template.js','utf8');
const namespace='paris-catacombs-path-v1';
const version=createHash('sha256').update(JSON.stringify({core,namespace,swTemplate})).digest('hex').slice(0,16);const manifest={schema:1,version,atlasId:'paris-catacombs',assets:core,totalBytes:core.reduce((s,a)=>s+a.bytes,0)};
await writeFile(path.join(root,'core-manifest.json'),JSON.stringify(manifest,null,2));
const manifestBytes=await readFile(path.join(root,'core-manifest.json'));
core.push({url:'./core-manifest.json',bytes:manifestBytes.length,sha256:createHash('sha256').update(manifestBytes).digest('hex')});
await writeFile(path.join(root,'sw.js'),`const APP_SCOPE=encodeURIComponent(new URL(self.registration.scope).pathname);const DATABASE_NAME="archify-atlas-paris-catacombs-"+APP_SCOPE+"-v1";const CACHE_PREFIX="atlas-paris-catacombs-"+APP_SCOPE+"-core-";const CACHE=CACHE_PREFIX+${JSON.stringify(version)};const CORE=${JSON.stringify(core)};\n`+swTemplate);
console.log(JSON.stringify({version,files:core.length,bytes:manifest.totalBytes}));
