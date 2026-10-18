// ureten: codex
import { z } from 'zod';
import type * as GeoJSON from 'geojson';
export const packSchema = z.object({
  schema: z.literal(1), id: z.string().regex(/^[a-z0-9-]{1,64}$/), atlasId: z.string(),
  version: z.string().regex(/^[a-zA-Z0-9._-]{1,64}$/), title: z.string(),
  redistribution: z.literal('allowed'), attribution: z.string().min(1),
  assets:z.array(z.object({url:z.string().min(1),bytes:z.number().int().positive().max(128*1024*1024),sha256:z.string().regex(/^[a-f0-9]{64}$/)})).min(1).max(500)
});
export type PackManifest = z.infer<typeof packSchema>;
export async function digest(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const data = bytes instanceof Uint8Array ? new Uint8Array(bytes).buffer : bytes;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function localAssetUrl(value: string, base: string): string {
  const root = new URL(base); const url = new URL(value,root);
  // Raw paths with traversal/encoded delimiters are rejected before normalization.
  if (/%2e|%2f|%5c/i.test(value) || value.split('/').includes('..') || value.includes('\\') || url.origin!==root.origin || !url.pathname.startsWith(root.pathname) || url.search || url.hash || url.username || url.password) throw new Error('Paket dosyası bu uygulamanın alanında olmalı.');
  return url.href;
}
export function validateGeoJSON(value: unknown) {
  if (!value || typeof value!=='object' || (value as {type?:string}).type!=='FeatureCollection' || !Array.isArray((value as {features?:unknown}).features)) throw new Error('GeoJSON FeatureCollection gerekiyor.');
  const collection = value as GeoJSON.FeatureCollection;
  const crs=(value as {crs?:{properties?:{name?:string}}}).crs;
  if(crs && !['urn:ogc:def:crs:OGC:1.3:CRS84','EPSG:4326'].includes(crs.properties?.name??''))throw new Error('İçe aktarımdan önce WGS84/EPSG:4326 dönüşümü gerekiyor.');
  if(collection.features.length>100000) throw new Error('Bu içe aktarım en fazla 100.000 öğe destekliyor.');
  const ids = new Set<string>();
  function positions(v:unknown):void { if(!Array.isArray(v))throw new Error('Geometri geçersiz.'); if(typeof v[0]==='number') {if(v.length<2 || !v.every(x=>typeof x==='number'&&Number.isFinite(x)) || Math.abs(v[0])>180 || Math.abs(v[1])>90)throw new Error('WGS84 koordinat gerekiyor.');}else{if(!v.length)throw new Error('Geometri boş.');v.forEach(positions);} }
  for(const f of collection.features) {
    if(!f || f.type!=='Feature' || !f.geometry || !['Point','MultiPoint','LineString','MultiLineString','Polygon','MultiPolygon'].includes(f.geometry.type))throw new Error('Desteklenmeyen geometri.');
    const coordinates=(f.geometry as GeoJSON.Point).coordinates;positions(coordinates);
    const line=(p:unknown)=>{if(!Array.isArray(p)||p.length<2||!p.every(x=>Array.isArray(x)&&typeof x[0]==='number'))throw new Error('Çizgi en az iki konum içermeli.');};
    const polygon=(p:unknown)=>{if(!Array.isArray(p)||!p.length)throw new Error('Polygon boş.');for(const r of p){if(!Array.isArray(r)||r.length<4||JSON.stringify(r[0])!==JSON.stringify(r[r.length-1]))throw new Error('Polygon halkası kapalı olmalı.');line(r);}};
    if(f.geometry.type==='Point' && (!Array.isArray(coordinates)||typeof coordinates[0]!=='number'))throw new Error('Nokta geometrisi geçersiz.');
    if(f.geometry.type==='MultiPoint' && !(coordinates as unknown[]).every(p=>Array.isArray(p)&&typeof p[0]==='number'))throw new Error('Çoklu nokta bir konum dizisi içermeli.');
    if(f.geometry.type==='LineString')line(coordinates);
    if(f.geometry.type==='MultiLineString')coordinates.forEach(line);
    if(f.geometry.type==='Polygon')polygon(coordinates);
    if(f.geometry.type==='MultiPolygon')coordinates.forEach(polygon);
    if(f.id!==undefined){const id=String(f.id);if(ids.has(id))throw new Error('Yinelenen öğe kimliği.');ids.add(id);}
  }
  return collection;
}
export function validateGlb(bytes: ArrayBuffer) {
  const view=new DataView(bytes);
  if(bytes.byteLength<20 || view.getUint32(0,true)!==0x46546c67 || view.getUint32(4,true)!==2 || view.getUint32(8,true)!==bytes.byteLength)throw new Error('Geçerli GLB 2.0 dosyası gerekiyor.');
  const length=view.getUint32(12,true);
  if(view.getUint32(16,true)!==0x4e4f534a || length%4 || 20+length>bytes.byteLength)throw new Error('GLB JSON bölümü geçersiz.');
  const doc=JSON.parse(new TextDecoder().decode(bytes.slice(20,20+length)).trim());
  if(doc.asset?.version!=='2.0')throw new Error('glTF asset sürümü2.0 olmalı.');
  let offset=20+length,binaryLength:number|null=null;
  while(offset<bytes.byteLength){
    if(offset+8>bytes.byteLength)throw new Error('GLB chunk başlığı kesilmiş.');
    const size=view.getUint32(offset,true),kind=view.getUint32(offset+4,true);
    if(size%4 || offset+8+size>bytes.byteLength)throw new Error('GLB chunk gövdesi kesilmiş.');
    if(kind===0x004e4942){if(binaryLength!==null)throw new Error('Birden fazla BIN chunk desteklenmiyor.');binaryLength=size;}
    offset+=8+size;
  }
  for(const row of [...(doc.buffers??[]),...(doc.images??[])])if(row.uri && !String(row.uri).startsWith('data:'))throw new Error('Çevrimdışı model dış dosyaya bağımlı; tek dosyalık GLB kullanın.');
  for(const [i,b] of (doc.buffers??[]).entries()){
    if(!Number.isInteger(b.byteLength)||b.byteLength<0)throw new Error('GLB buffer boyutu geçersiz.');
    if(!b.uri && (i!==0 || binaryLength===null || b.byteLength>binaryLength || binaryLength-b.byteLength>3))throw new Error('GLB BIN gövdesi eksik veya buffer boyutuyla uyumsuz.');
  }
  for(const v of doc.bufferViews??[]){const b=doc.buffers?.[v.buffer],start=v.byteOffset??0;if(!b||!Number.isInteger(v.buffer)||!Number.isInteger(start)||start<0||!Number.isInteger(v.byteLength)||v.byteLength<0||start+v.byteLength>b.byteLength)throw new Error('GLB bufferView sınırı geçersiz.');}
  if((doc.extensionsRequired??[]).some((x:string)=>['KHR_texture_basisu'].includes(x)))throw new Error('Bu sürümde harici decoder gerektirmeyen GLB kullanın.');
  return doc;
}
