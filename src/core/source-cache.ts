// ureten: codex. Source-hosted consultation becomes a personal, device-local copy.
import type * as GeoJSON from 'geojson';
import {db,type LocalAsset} from './storage';
import {digest,validateGlb} from './validation';
import {validateRasterHeader,activeAssets} from './collections';
import {findVerifiedSurveyAsset} from './local-survey';
export type Bounds=[number,number,number,number];
const IGC='https://capgeo2.paris.fr/public/rest/services/IGC/IGC_Atlas_v2/MapServer';
const R=6378137;
export function mercator(lon:number,lat:number):[number,number]{return [R*lon*Math.PI/180,R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];}
export function lonlat(x:number,y:number):[number,number]{return [x/R*180/Math.PI,(2*Math.atan(Math.exp(y/R))-Math.PI/2)*180/Math.PI];}
export function featureBounds(feature:GeoJSON.Feature):Bounds|null{
 const p:number[][]=[];const visit=(v:unknown)=>{if(!Array.isArray(v))return;if(typeof v[0]==='number'&&typeof v[1]==='number')p.push(v as number[]);else v.forEach(visit);};
 if(feature.geometry.type==='GeometryCollection')return null;visit(feature.geometry.coordinates);if(!p.length)return null;
 return [Math.min(...p.map(x=>x[0])),Math.min(...p.map(x=>x[1])),Math.max(...p.map(x=>x[0])),Math.max(...p.map(x=>x[1]))];
}
export function checkedBounds(v:unknown):Bounds{
 if(!Array.isArray(v)||v.length!==4||!v.every(Number.isFinite)||v[0]>=v[2]||v[1]>=v[3]||v[0]<-180||v[2]>180||v[1]<-85||v[3]>85)throw Error('Kaynak görüntüsünün coğrafi sınırları geçersiz.');return v as Bounds;
}
function timeoutSignal(signal?:AbortSignal){const c=new AbortController(),timer=setTimeout(()=>c.abort(new Error('Kaynak 30 saniyede yanıt vermedi.')),30000),abort=()=>c.abort(signal?.reason);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();return {signal:c.signal,done:()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);}};}
export type IgcArea={id:string;name:string;sourceUrl:string;category:string;mapBounds:Bounds;sha256:string;bytes:number};
export async function getIgcSheet(feature:GeoJSON.Feature,signal?:AbortSignal):Promise<LocalAsset>{
 const sheet=String(feature.properties?.sheetId??feature.properties?.id??feature.id??''),id='source:igc-sheet:'+encodeURIComponent(sheet),d=await db(),saved=await d.get('assets',id);if(saved?.mapBounds)return saved;
 const b=featureBounds(feature);if(!b)throw Error('Paftanın coğrafi sınır kaydı yok.');checkedBounds(b);
 if(!navigator.onLine){const c=[(b[0]+b[2])/2,(b[1]+b[3])/2],near=(await d.getAll('assets')).filter(a=>a.category?.startsWith('igc-raster')&&a.mapBounds&&a.mapBounds[0]<=c[0]&&a.mapBounds[2]>=c[0]&&a.mapBounds[1]<=c[1]&&a.mapBounds[3]>=c[1]).sort((a,b)=>{const x=a.mapBounds!,y=b.mapBounds!;return (x[2]-x[0])*(x[3]-x[1])-(y[2]-y[0])*(y[3]-y[1]);});if(near[0])return near[0];throw Error('Bu alan henüz cihazda kayıtlı değil. İnternetle bir kez aç veya çevrimdışı galeri atlasını hazırla.');}
 const x=mercator(b[0],b[1]),y=mercator(b[2],b[3]),url=IGC+'/export?'+new URLSearchParams({bbox:[...x,...y].join(','),bboxSR:'3857',imageSR:'3857',size:'2048,2048',format:'png32',transparent:'true',dpi:'96',f:'json'});
 return downloadIgcRaster(id,'IGC '+sheet+' · haritaya hizalı plan',url,'igc-raster-sheet',signal);
}
export async function getIgcArea(area:IgcArea,signal?:AbortSignal){const url=new URL(area.sourceUrl);if(url.origin!=='https://capgeo2.paris.fr'||url.pathname!==new URL(IGC).pathname+'/export'||url.searchParams.get('bboxSR')!=='3857'||url.searchParams.get('imageSR')!=='3857'||url.searchParams.get('f')!=='json')throw Error('Galeri paketi kaynak adresi doğrulanamadı.');return downloadIgcRaster('source:igc-area:'+area.id,area.name,url.href,area.category,signal);}
async function downloadIgcRaster(id:string,name:string,url:string,category:string,signal?:AbortSignal):Promise<LocalAsset>{
 signal?.throwIfAborted();const d=await db(),saved=await d.get('assets',id);if(saved?.mapBounds)return saved;if(!navigator.onLine)throw Error('Bu galeri alanı henüz çevrimdışı kaydedilmemiş.');const timer=timeoutSignal(signal);
 try{
  const response=await fetch(url,{signal:timer.signal,credentials:'omit',cache:'no-store'});if(!response.ok)throw Error('IGC pafta servisi yanıt vermedi.');const result=await response.json();if(typeof result.href!=='string'||!result.extent)throw Error('IGC kaynağı geçerli koordinatlı görüntü döndürmedi.');const image=new URL(result.href);if(image.protocol!=='https:'||image.hostname!=='capgeo2.paris.fr')throw Error('IGC görüntü kaynağı doğrulanamadı.');
  const e=result.extent;if(![e.xmin,e.ymin,e.xmax,e.ymax].every(Number.isFinite)||e.xmin>=e.xmax||e.ymin>=e.ymax||!([3857,102100].includes(e.spatialReference?.wkid)||e.spatialReference?.latestWkid===3857))throw Error('IGC kaynak koordinat sistemi doğrulanamadı.');
  const raster=await fetch(image.href,{signal:timer.signal,credentials:'omit',cache:'no-store'});if(!raster.ok||Number(raster.headers.get('content-length'))>16*1024*1024)throw Error('IGC görüntüsü alınamadı veya çok büyük.');const body=await raster.arrayBuffer();if(body.byteLength>16*1024*1024||!validateRasterHeader(new Uint8Array(body)))throw Error('IGC görüntü dosyası doğrulanamadı.');const [w,s]=lonlat(e.xmin,e.ymin),[east,n]=lonlat(e.xmax,e.ymax),bounds=checkedBounds([w,s,east,n]);
  const asset:LocalAsset={id,name,kind:'image',blob:new Blob([body],{type:raster.headers.get('content-type')??'image/png'}),sha256:await digest(body),createdAt:new Date().toISOString(),category,mapBounds:bounds,sourceUrl:url};timer.signal.throwIfAborted();await d.put('assets',asset);return asset;
 }finally{timer.done();}
}
export type SurveyAsset={id:string;title:string;url:string;bytes:number;sha256:string;role:'underground'|'surface';position?:number[];rotation?:number[];scale?:number[]};
export type Survey={title:string;sourceUrl:string;coverageNote:string;coordinateNote:string;assets:SurveyAsset[]};
export async function getSurveyAsset(source:SurveyAsset,onProgress:(done:number,total:number)=>void=()=>{}):Promise<LocalAsset>{
 const u=new URL(source.url);if(u.protocol!=='https:'||u.hostname!=='raw.githubusercontent.com'||source.bytes>80*1024*1024||source.bytes<20||!/^[a-f0-9]{64}$/.test(source.sha256))throw Error('Tarama kaynağı doğrulanmış kayıtla eşleşmiyor.');
 const d=await db(),id='source:survey:'+source.id,saved=await d.get('assets',id);
 const checked=saved?await findVerifiedSurveyAsset([saved],source):null;if(checked){onProgress(source.bytes,source.bytes);return checked;}
 if(saved)await d.delete('assets',id);
 const imported=await findVerifiedSurveyAsset(await activeAssets(),source);if(imported){onProgress(source.bytes,source.bytes);return imported;}
 if(!navigator.onLine)throw Error('Bu birleşik tarama henüz cihazında değil. Kişisel tarama arşivini ekle veya internetle bir kez aç.');
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),90000);try{const r=await fetch(u.href,{credentials:'omit',signal:c.signal});if(!r.ok||!r.body)throw Error('3B kaynak dosyası alınamadı.');const reader=r.body.getReader(),chunks:Uint8Array<ArrayBuffer>[]=[];let length=0;for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>source.bytes){await reader.cancel();throw Error('3B kaynak boyutu beklenen sınırı aşıyor.');}chunks.push(value);onProgress(length,source.bytes);}if(length!==source.bytes)throw Error('3B kaynak dosyası eksik.');const body=await new Blob(chunks).arrayBuffer();if(await digest(body)!==source.sha256)throw Error('3B kaynak SHA-256 doğrulaması başarısız.');validateGlb(body);const asset:LocalAsset={id,name:source.title,kind:'glb',blob:new Blob([body],{type:'model/gltf-binary'}),sha256:source.sha256,createdAt:new Date().toISOString(),category:'survey-'+source.role,sourceUrl:source.url};c.signal.throwIfAborted();await d.put('assets',asset);return asset;}finally{clearTimeout(timer);}
}
