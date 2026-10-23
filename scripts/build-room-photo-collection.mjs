// ureten: opus. Build a hash-verified personal room-photo ZIP for "Arşiv paketi ekle".
// Usage: node scripts/build-room-photo-collection.mjs --catalog private-data/.../catalog.json --out private-data/.../photos.zip
// The catalogue, the source photos and the ZIP must all live under private-data/ (gitignored); nothing is published.
import {readFile,writeFile,rename} from 'node:fs/promises';import {createHash} from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {zipSync,unzipSync,strToU8} from 'fflate';
import {imageSize} from './verify-room-photos.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),PRIVATE=path.join(ROOT,'private-data')+path.sep;
const arg=n=>{const i=process.argv.indexOf(n);return i>0?process.argv[i+1]:undefined;};
const sha=b=>createHash('sha256').update(b).digest('hex');
const inside=p=>path.resolve(ROOT,p).startsWith(PRIVATE);
const catalogPath=arg('--catalog'),outPath=arg('--out');
if(!catalogPath||!outPath)throw Error('Kullanım: --catalog <private-data/...json> --out <private-data/...zip>');
if(!inside(catalogPath)||!inside(outPath))throw Error('Katalog ve ZIP yalnız private-data/ altında olabilir.');
const raw=await readFile(path.resolve(ROOT,catalogPath)),c=JSON.parse(raw.toString('utf8'));
if(c.schema!==1||!/^[a-z0-9-]{1,80}$/.test(c.id)||!Array.isArray(c.items)||!c.items.length)throw Error('Özel fotoğraf kataloğu şeması geçersiz.');
const https=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const files={},assets=[];
for(const it of c.items){
 if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(it.id))throw Error('Geçersiz kimlik: '+it.id);
 if(!inside(it.localPath))throw Error(it.id+': kaynak dosya private-data dışında.');
 if(it.licenceStatus==='personal-cache-only'&&c.rights!=='personal-copy')throw Error(it.id+': kişisel fotoğraf personal-copy arşivi gerektirir.');
 if(!it.creator?.trim()||!https(it.sourcePage)||!it.licenceName?.trim()||(it.licenceUrl!==null&&!https(it.licenceUrl)))throw Error(it.id+': yazar, kaynak sayfası veya lisans bilgisi eksik.');
 if(!Array.isArray(it.roomIds)||!(it.roomIds.length||it.featureIds?.length))throw Error(it.id+': salon bağlantısı yok.');
 const body=await readFile(path.resolve(ROOT,it.localPath));
 if(body.length!==it.bytes||sha(body)!==it.sha256)throw Error(it.id+': bayt veya SHA-256 katalogla eşleşmiyor.');
 const size=imageSize(body);if(!size||size.width!==it.width||size.height!==it.height)throw Error(it.id+': görsel boyutu katalogla eşleşmiyor.');
 const ext=size.type==='jpeg'?'jpg':size.type,zipPath=`photos/${it.id}.${ext}`;files[zipPath]=new Uint8Array(body);
 assets.push({path:zipPath,kind:'image',name:`${it.id} · ${it.creator}`.slice(0,200),sha256:it.sha256,bytes:it.bytes,roomId:it.roomIds[0],roomIds:it.roomIds,...(it.featureIds?.length?{featureIds:it.featureIds}:{}),category:'room-photo',
  photo:{creator:it.creator,sourcePage:it.sourcePage,captionExact:it.captionExact??'',captureDate:it.captureDate??null,licenceName:it.licenceName,licenceUrl:it.licenceUrl??null,licenceStatus:it.licenceStatus,primary:!!it.primary,width:it.width,height:it.height}});
}
const manifest={ureten:'opus',schema:1,atlasId:'paris-catacombs',id:c.id,title:c.title,rights:c.rights,note:'Kaynak yazarlarının hakları saklıdır. Yalnız bu cihaz için kişisel kopya; herkese açık yayın izni yoktur.',assets};
const zip=zipSync({'collection.json':strToU8(JSON.stringify(manifest,null,1)),...files},{level:0});
const target=path.resolve(ROOT,outPath),temporary=target+'.tmp';await writeFile(temporary,zip);await rename(temporary,target);
// Re-read the written ZIP and every payload rather than trusting the in-memory copy.
const back=unzipSync(new Uint8Array(await readFile(target)));const parsed=JSON.parse(new TextDecoder().decode(back['collection.json']));
for(const a of parsed.assets){const b=back[a.path];if(!b||b.length!==a.bytes||sha(b)!==a.sha256)throw Error('ZIP yeniden okuma doğrulaması başarısız: '+a.path);}
const zipBytes=await readFile(target);
const proof={ureten:'opus',createdAt:new Date().toISOString(),catalog:path.relative(ROOT,path.resolve(ROOT,catalogPath)),catalogSha256:sha(raw),zip:path.relative(ROOT,target),zipBytes:zipBytes.length,zipSha256:sha(zipBytes),collectionId:c.id,rights:c.rights,assets:parsed.assets.map(a=>({path:a.path,roomIds:a.roomIds,bytes:a.bytes,sha256:a.sha256,licenceStatus:a.photo.licenceStatus})),allPayloadsRereadAndSha256Verified:true,publicRedistributionApproved:false};
await writeFile(target.replace(/\.zip$/,'')+'.proof.json',JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify({zip:proof.zip,zipBytes:proof.zipBytes,zipSha256:proof.zipSha256,assets:proof.assets.length}));
