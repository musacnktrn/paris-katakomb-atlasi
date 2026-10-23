// ureten: opus. Build/release gate for public room photos. A photo ships only when its bytes, hash, size,
// open licence, creator, Commons source and room binding are all verified; personal photos never ship.
import {readFile,readdir,stat} from 'node:fs/promises';import {existsSync} from 'node:fs';import {createHash} from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const OPEN_LICENCE=/^(?:CC0 1\.0|Public domain|CC BY(?:-SA)? [1-4]\.[0-9])$/;
export const DEFAULT_PRIVATE_CATALOGS=['private-data/v4-photos/room-photos-private-v1.json'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const httpsHost=(v,hosts)=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&hosts.includes(u.hostname);}catch{return false;}};
// Real decoded header size for JPEG / PNG / WebP (no image library needed).
export function imageSize(b){
 if(b[0]===0x89&&b.toString('latin1',1,4)==='PNG')return {type:'png',width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
 if(b.toString('latin1',0,4)==='RIFF'&&b.toString('latin1',8,12)==='WEBP'){const c=b.toString('latin1',12,16);
  if(c==='VP8X')return {type:'webp',width:1+b.readUIntLE(24,3),height:1+b.readUIntLE(27,3)};
  if(c==='VP8 ')return {type:'webp',width:b.readUInt16LE(26)&0x3fff,height:b.readUInt16LE(28)&0x3fff};
  if(c==='VP8L')return {type:'webp',width:1+(((b[22]&0x3f)<<8)|b[21]),height:1+(((b[24]&0xf)<<10)|(b[23]<<2)|((b[22]&0xc0)>>6))};}
 if(b[0]===0xff&&b[1]===0xd8){let i=2;while(i+9<b.length){if(b[i]!==0xff){i++;continue;}const m=b[i+1];if(m===0xff){i++;continue;}if(m===0xd8||m===0x01||(m>=0xd0&&m<=0xd7)){i+=2;continue;}const len=b.readUInt16BE(i+2);if(m>=0xc0&&m<=0xcf&&![0xc4,0xc8,0xcc].includes(m))return {type:'jpeg',width:b.readUInt16BE(i+7),height:b.readUInt16BE(i+5)};i+=2+len;}}
 return null;
}
async function files(dir){const out=[];if(!existsSync(dir))return out;for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())out.push(...await files(p));else out.push(p);}return out;}
export async function verifyRoomPhotos({root=ROOT,publicDir='public',dist=false,privateCatalogs=DEFAULT_PRIVATE_CATALOGS}={}){
 const errors=[],fail=m=>errors.push(m),base=path.join(root,dist?'dist':publicDir);
 const catalogPath=path.join(base,'data/room-photos.json');if(!existsSync(catalogPath))throw Error('room-photos.json bulunamadı: '+catalogPath);
 const raw=await readFile(catalogPath,'utf8');if(/private-data/i.test(raw))fail('Kamu fotoğraf kataloğu private-data yolu içeriyor.');
 const catalog=JSON.parse(raw);if(catalog.schema!==1||!Array.isArray(catalog.photos))throw Error('room-photos.json şeması 1 değil.');
 const rooms=new Set(JSON.parse(await readFile(path.join(base,'data/rooms.json'),'utf8')).rooms.map(r=>r.id));
 const sources=JSON.parse(await readFile(path.join(base,'data/sources.json'),'utf8')).sources??[];
 const notices=await readFile(path.join(base,'THIRD-PARTY-NOTICES.txt'),'utf8');
 const ids=new Set(),catalogued=new Set();const verified=[];
 for(const p of catalog.photos){
  const at=`fotoğraf ${p?.id??'?'}`;
  if(typeof p.id!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(p.id)||ids.has(p.id)){fail(at+': kimlik geçersiz veya yinelenmiş.');continue;}ids.add(p.id);
  if(p.imageKind!=='camera-photo')fail(at+': imageKind camera-photo değil.');
  if(p.modified!==false)fail(at+': değiştirilmiş dosya kamu paketine giremez (modified=false olmalı).');
  if(typeof p.file!=='string'||!/^\.\/media\/room-photos\/[a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp)$/.test(p.file)||p.file.includes('..')||/private-data/i.test(p.file)){fail(at+': dosya yolu media/room-photos altında değil.');continue;}
  if(!(typeof p.creator==='string'&&p.creator.trim()))fail(at+': creator eksik.');
  if(!httpsHost(p.sourcePage,['commons.wikimedia.org']))fail(at+': sourcePage commons.wikimedia.org değil.');
  if(!httpsHost(p.originalUrl,['upload.wikimedia.org']))fail(at+': originalUrl upload.wikimedia.org değil.');
  const lic=p.licence??{};if(!OPEN_LICENCE.test(String(lic.name)))fail(at+`: lisans izin listesinde değil (${lic.name}).`);
  if(!httpsHost(lic.url,['creativecommons.org','commons.wikimedia.org']))fail(at+': lisans adresi geçersiz.');
  if(typeof lic.shareAlike!=='boolean'||lic.shareAlike!==String(lic.name).includes('-SA'))fail(at+': shareAlike lisans adıyla uyuşmuyor.');
  if(String(lic.name).startsWith('CC BY')&&lic.attributionRequired!==true)fail(at+': CC BY atıf gerektirir.');
  if(!(typeof p.captionExact==='string'&&p.captionExact))fail(at+': captionExact eksik.');
  if(p.captureDate!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(String(p.captureDate)))fail(at+': captureDate null ya da YYYY-AA-GG olmalı.');
  const roomIds=Array.isArray(p.roomIds)?p.roomIds:[],featureIds=Array.isArray(p.featureIds)?p.featureIds:[];
  if(!roomIds.length&&!featureIds.length)fail(at+': salon bağlantısı yok.');
  for(const r of roomIds)if(!rooms.has(r))fail(at+`: roomId '${r}' rooms.json içinde yok.`);
  const file=path.join(base,p.file.slice(2));catalogued.add(path.resolve(file));
  if(!existsSync(file)){fail(at+': dosya yok: '+p.file);continue;}
  const b=await readFile(file);
  if(b.length!==p.bytes)fail(at+`: bayt ${b.length} ≠ ${p.bytes}.`);
  if(sha(b)!==p.sha256)fail(at+': SHA-256 eşleşmiyor.');
  if(p.sha1&&createHash('sha1').update(b).digest('hex')!==p.sha1)fail(at+': Commons SHA-1 eşleşmiyor.');
  const size=imageSize(b);if(!size)fail(at+': görsel başlığı okunamadı.');else if(size.width!==p.width||size.height!==p.height)fail(at+`: boyut ${size.width}x${size.height} ≠ ${p.width}x${p.height}.`);
  if(String(lic.name).startsWith('CC BY')&&!(notices.includes(p.creator)&&notices.includes(lic.name)&&notices.includes(p.sourcePage)))fail(at+': THIRD-PARTY-NOTICES atıfı (yazar, lisans, kaynak) eksik.');
  verified.push({id:p.id,file:p.file,bytes:b.length,sha256:p.sha256,licence:lic.name});
 }
 if(catalog.photos.length&&!sources.some(s=>s.id==='commons-room-photos'&&catalog.photos.every(p=>String(s.rights??'').includes(p.creator))))fail('sources.json içinde commons-room-photos kaydı ve yazar adı eksik.');
 // Every file in media/room-photos must be catalogued: nothing can be dropped in beside the verified photos.
 for(const f of await files(path.join(base,'media/room-photos')))if(!catalogued.has(path.resolve(f)))fail('Kataloglanmamış fotoğraf dosyası: '+path.relative(base,f));
 if(dist){const m=JSON.parse(await readFile(path.join(base,'core-manifest.json'),'utf8'));for(const v of verified){const a=m.assets.find(a=>a.url===v.file);if(!a||a.sha256!==v.sha256||a.bytes!==v.bytes)fail(`${v.id}: çevrimdışı çekirdek listesinde değil veya hash farklı.`);}if(!m.assets.some(a=>a.url==='./data/room-photos.json'))fail('room-photos.json çevrimdışı çekirdekte değil.');}
 // Personal-only photos: when the private catalogue exists on this machine, none of its bytes may be in the public package.
 const privateHashes=new Set();const checkedPrivate=[];
 for(const rel of privateCatalogs){const p=path.isAbsolute(rel)?rel:path.join(root,rel);if(!existsSync(p))continue;const c=JSON.parse(await readFile(p,'utf8'));for(const item of c.items??c.photos??[])if(item.sha256)privateHashes.add(item.sha256);checkedPrivate.push(path.relative(root,p));}
 if(privateHashes.size)for(const f of await files(base)){const s=await stat(f);if(s.size>32*1024*1024)continue;if(privateHashes.has(sha(await readFile(f))))fail('Kişisel fotoğraf kamu paketinde: '+path.relative(base,f));}
 if(errors.length)throw Object.assign(Error('Salon fotoğrafı kapısı başarısız:\n - '+errors.join('\n - ')),{errors});
 return {ok:true,checked:dist?'dist':publicDir,photos:verified,privateCatalogsChecked:checkedPrivate,privateHashes:privateHashes.size};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await verifyRoomPhotos({dist:process.argv.includes('--dist')})));}catch(e){console.error(e.message);process.exit(1);}
}
