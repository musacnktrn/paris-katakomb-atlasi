// ureten: opus. Privacy gate for the public package (public/ and dist/).
// 1. Text scan (always, also in CI): no local path, private-data path or private-source marker in any text file,
//    nor in the JSON metadata of a PMTiles archive (that metadata is compressed, so a plain grep misses it).
// 2. Byte scan (only when private-data/ exists on this machine): no file under private-data/ may appear byte for byte
//    in public/ or dist/, except the open-licence photos listed in public/data/room-photos.json and the IGN tile build
//    when it is identical to the verified public tiles. Browser profiles and QA caches are skipped (they hold copies
//    OF public assets), as are files over 300 MB.
// Private-source names are not written here: they are read at run time from private-data (catalogues and an optional
// private-data/verify-no-private.markers.json), so this committed file names no private source.
import {readFile,readdir,stat,lstat} from 'node:fs/promises';import {existsSync} from 'node:fs';import {createHash} from 'node:crypto';
import {gunzipSync,brotliDecompressSync} from 'node:zlib';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const BASE_MARKERS=[{label:'/Users/',re:/\/Users\//},{label:'private-data',re:/private-data/i},{label:'nexus-alkhemia',re:/nexus-alkhemia/i},{label:'hacky-raw',re:/hacky-raw/i}];
export const MAX_PRIVATE_BYTES=300*1024*1024;
// Hosts that public files may legitimately name; a private catalogue URL on these hosts is not a marker by itself.
const PUBLIC_HOSTS=new Set(['commons.wikimedia.org','upload.wikimedia.org','creativecommons.org','catacombes.xyz','assets.catacombes.xyz','example.org']);
const sha=b=>createHash('sha256').update(b).digest('hex');
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const BINARY_EXT=/\.(?:jpe?g|png|webp|gif|avif|ico|glb|zip|woff2?|ttf|otf|wasm|pbf|mvt|mp4|webm|gz|br)$/i;
async function walk(dir,{skipDir}={}){const out=[],skipped=[];if(!existsSync(dir))return {files:out,skipped};
 const visit=async d=>{for(const e of await readdir(d,{withFileTypes:true})){const p=path.join(d,e.name);
  if(e.isSymbolicLink())continue;
  if(e.isDirectory()){if(skipDir&&await skipDir(p,e.name)){skipped.push(p);continue;}await visit(p);}else if(e.isFile())out.push(p);}};
 await visit(dir);return {files:out,skipped};}
// A browser profile or QA cache directory: copies of public assets live there, so it is not private source material.
// ureten: opus: a frozen local preview copy of the BUILT app (snapshot-<hex> holding core-manifest.json and sw.js) is also a copy of public assets.
async function isBrowserCache(p,name){if(/^qa-/i.test(name)||/^profile(?:-\d+)?$/i.test(name))return true;if(/^snapshot-[0-9a-f]{8,64}$/.test(name)&&existsSync(path.join(p,'core-manifest.json'))&&existsSync(path.join(p,'sw.js')))return true;return existsSync(path.join(p,'Local State'))||existsSync(path.join(p,'CacheStorage'))||existsSync(path.join(p,'ServiceWorkers'));}
// Decompressed JSON metadata of a PMTiles v3 archive (null when the file is not PMTiles v3).
export function pmtilesMetadata(b){
 if(b.length<127||b.toString('latin1',0,7)!=='PMTiles'||b[7]!==3)return null;
 const off=Number(b.readBigUInt64LE(24)),len=Number(b.readBigUInt64LE(32)),c=b[97],raw=b.subarray(off,off+len);
 if(off+len>b.length)throw Error('PMTiles metadata bölümü dosya dışına taşıyor.');
 if(c===0||c===1)return raw.toString('utf8');if(c===2)return gunzipSync(raw).toString('utf8');if(c===3)return brotliDecompressSync(raw).toString('utf8');
 throw Error('PMTiles metadata sıkıştırması desteklenmiyor: '+c);
}
// Extra markers from the private catalogues on this machine: creators and non-public source hosts of personal-only photos.
async function privateMarkers(root,publicCreators){
 const out=[],dir=path.join(root,'private-data');if(!existsSync(dir))return out;
 const local=path.join(dir,'verify-no-private.markers.json');
 if(existsSync(local)){const j=JSON.parse(await readFile(local,'utf8'));for(const m of j.markers??[])if(typeof m==='string'&&m.trim().length>=4)out.push(m.trim());}
 for(const rel of ['v4-photos/room-photos-private-v1.json']){const p=path.join(dir,rel);if(!existsSync(p))continue;
  const c=JSON.parse(await readFile(p,'utf8'));
  for(const item of c.items??c.photos??[]){
   const creator=String(item.creator??'').replace(/\s*\(.*\)\s*$/,'').trim();if(creator.length>=4&&!publicCreators.has(creator))out.push(creator);
   for(const key of ['sourcePage','originalUrl']){try{const h=new URL(item[key]).hostname.replace(/^www\./,'');if(!PUBLIC_HOSTS.has(h)&&!PUBLIC_HOSTS.has('www.'+h))out.push(h);}catch{}}
  }}
 // ureten: codex: private user identifiers are read locally, never embedded in the public gate or its fixtures.
 const userDir=path.join(dir,'v4-user');
 if(existsSync(userDir))for(const file of (await walk(userDir)).files.filter(f=>/\.geojson$/i.test(f))){
  const data=JSON.parse(await readFile(file,'utf8'));
  for(const feature of data.features??[]){const id=feature.properties?.id??feature.id;if(typeof id==='string'&&id.length>=8)out.push(id);}
 }
 return [...new Set(out)];
}
export async function verifyNoPrivate({root=ROOT,targets=['public','dist'],sourceTargets=['src','tests','scripts','README.md']}={}){
 const errors=[],fail=m=>errors.push(m),started=Date.now();
 const roomPhotosPath=path.join(root,'public/data/room-photos.json');
 const roomPhotos=existsSync(roomPhotosPath)?JSON.parse(await readFile(roomPhotosPath,'utf8')).photos??[]:[];
 const approvedPhotoHashes=new Set(roomPhotos.map(p=>p.sha256).filter(Boolean));
 const extra=await privateMarkers(root,new Set(roomPhotos.map(p=>p.creator)));
 const markers=[...BASE_MARKERS,...extra.map(m=>({label:'kişisel kaynak işareti #'+(extra.indexOf(m)+1),re:new RegExp(escape(m),'i')}))];
 // Public / dist inventory.
 const targetFiles=[];for(const t of targets){const dir=path.join(root,t);for(const f of (await walk(dir)).files){const s=await stat(f);targetFiles.push({path:f,rel:path.relative(root,f).split(path.sep).join('/'),size:s.size});}}
 // 1. Text scan.
 let textFiles=0,pmtilesScanned=0;
 for(const f of targetFiles){
  if(/\.pmtiles$/i.test(f.rel)){const meta=pmtilesMetadata(await readFile(f.path));if(meta===null){fail(f.rel+': PMTiles v3 başlığı okunamadı.');continue;}pmtilesScanned++;for(const m of markers)if(m.re.test(meta))fail(`${f.rel}: PMTiles metadata içinde ${m.label} var.`);continue;}
  if(BINARY_EXT.test(f.rel))continue;
  const b=await readFile(f.path);if(b.subarray(0,8192).includes(0))continue;textFiles++;
  const s=b.toString('utf8');for(const m of markers)if(m.re.test(s))fail(`${f.rel}: ${m.label} geçiyor.`);
 }
 // ureten: codex: publishing includes source, tests and build scripts as well as built assets.
 // Documentation/tests may legitimately mention private-data as a path rule; actual private source markers and the
 // current user's absolute home path may never be committed. Strict path checks still apply to public/ and dist/.
 let sourceTextFiles=0;
 const sourceMarkers=[{label:'yerel ev dizini',re:new RegExp(escape(homedir().replaceAll('\\','/')),'i')},...extra.map((m,i)=>({label:'kişisel kaynak işareti #'+(i+1),re:new RegExp(escape(m),'i')}))];
 for(const target of sourceTargets){const p=path.join(root,target);if(!existsSync(p))continue;const paths=(await stat(p)).isDirectory()?(await walk(p)).files:[p];
  for(const file of paths){if(BINARY_EXT.test(file))continue;const b=await readFile(file);if(b.subarray(0,8192).includes(0))continue;sourceTextFiles++;
   for(const marker of sourceMarkers)if(marker.re.test(b.toString('utf8')))fail(`${path.relative(root,file)}: ${marker.label} geçiyor.`);
  }
 }
 // 2. Byte scan against private-data (local only).
 const privateDir=path.join(root,'private-data');const result={hashCheck:'atlandı (private-data yok)'};
 if(existsSync(privateDir)){
  const {files:privateFiles,skipped}=await walk(privateDir,{skipDir:isBrowserCache});
  const bySize=new Map();for(const f of targetFiles){if(!f.size)continue;if(!bySize.has(f.size))bySize.set(f.size,[]);bySize.get(f.size).push(f);}
  const targetHash=new Map();const hashOf=async f=>{if(!targetHash.has(f.path))targetHash.set(f.path,sha(await readFile(f.path)));return targetHash.get(f.path);};
  const regionMetaPath=path.join(root,'public/data/region-tiles-meta.json');const regionSha=existsSync(regionMetaPath)?JSON.parse(await readFile(regionMetaPath,'utf8')).sha256:null;
  // ureten: codex: only the explicitly verified open IGN landcover archive is eligible, never arbitrary private media.
  const landcoverMetaPath=path.join(root,'public/data/landcover-meta.json'),landcover=existsSync(landcoverMetaPath)?JSON.parse(await readFile(landcoverMetaPath,'utf8')):null;
  const landcoverSha=landcover?.license==='etalab-2.0'&&landcover?.sourceUrl==='https://geoservices.ign.fr/bdtopo'&&landcover?.verification?.allSelectedSourceidsPreserved===true?landcover.sha256:null;
  const landcoverMetadataSha=landcoverSha?sha(await readFile(landcoverMetaPath)):null;
  let hashed=0,tooLarge=0;const allowed=[];
  for(const p of privateFiles){const s=await lstat(p);if(!s.isFile()||!s.size)continue;if(s.size>MAX_PRIVATE_BYTES){tooLarge++;continue;}
   const candidates=bySize.get(s.size);if(!candidates)continue;
   const h=sha(await readFile(p));hashed++;const rel=path.relative(root,p).split(path.sep).join('/');
   for(const c of candidates){if(await hashOf(c)!==h)continue;
    if(approvedPhotoHashes.has(h)){allowed.push({private:rel,public:c.rel,reason:'room-photos.json açık lisanslı fotoğraf'});continue;}
    if(rel==='private-data/v4-surface/region.build.pmtiles'&&h===regionSha){allowed.push({private:rel,public:c.rel,reason:'doğrulanmış IGN karo arşivi'});continue;}
    if(rel.startsWith('private-data/v4-landcover/')&&/\.pmtiles(?:\.|$)/i.test(rel)&&h===landcoverSha){allowed.push({private:rel,public:c.rel,reason:'doğrulanmış açık IGN arazi örtüsü karoları'});continue;}
    if(rel.startsWith('private-data/v4-landcover/')&&rel.endsWith('/landcover-meta.json')&&h===landcoverMetadataSha){allowed.push({private:rel,public:c.rel,reason:'doğrulanmış açık IGN arazi örtüsü metadata'});continue;}
    fail(`Özel dosya kamu paketinde: ${rel} = ${c.rel}`);}
  }
  result.hashCheck={privateFiles:privateFiles.length,skippedCacheDirs:skipped.length,skippedOver300MB:tooLarge,hashedSizeMatches:hashed,allowed};
 }
 if(errors.length)throw Object.assign(Error('Gizlilik kapısı başarısız:\n - '+errors.join('\n - ')),{errors});
 return {ok:true,targets:targets.filter(t=>existsSync(path.join(root,t))),sourceTargets,sourceTextFiles,files:targetFiles.length,textFiles,pmtilesScanned,markers:markers.length,privateMarkers:extra.length,...result,ms:Date.now()-started};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await verifyNoPrivate()));}catch(e){console.error(e.message);process.exit(1);}
}
