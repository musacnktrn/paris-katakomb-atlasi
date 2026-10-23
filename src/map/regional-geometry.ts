// ureten: codex. Decode the already installed, hash-verified open IGN archive; no new provider or height defaults.
import {PMTiles,FileSource} from 'pmtiles';
import {VectorTile} from '@mapbox/vector-tile';
import {PbfReader} from 'pbf';
import type * as GeoJSON from 'geojson';
import {digest} from '../core/validation';
import {knownBuildingHeight} from '../core/plan-geometry';
type Bounds=[number,number,number,number];
const tileX=(lon:number,z:number)=>Math.floor((lon+180)/360*2**z);
const tileY=(lat:number,z:number)=>Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z);
export async function regionalBuildings(bounds:Bounds,signal:AbortSignal,onProgress:(done:number,total:number)=>void){
 const response=await fetch('./data/region-tiles-meta.json',{signal});if(!response.ok)throw Error('IGN bina kaynak kaydı açılamadı.');
 const meta=await response.json();
 if(meta.license!=='etalab-2.0'||meta.sourceUrl!=='https://geoservices.ign.fr/bdtopo'||meta.maxzoom<15)throw Error('IGN kaynak kaydı doğrulanamadı.');
 const archiveResponse=await fetch('./data/region.pmtiles',{signal});if(!archiveResponse.ok)throw Error('Cihazdaki IGN bina arşivi açılamadı.');
 const blob=await archiveResponse.blob();if(blob.size!==meta.bytes||await digest(await blob.arrayBuffer())!==meta.sha256)throw Error('IGN bina arşivinin SHA256 doğrulaması başarısız.');
 const archive=new PMTiles(new FileSource(new File([blob],'region.pmtiles'))),z=15;
 const west=Math.max(bounds[0],meta.igcBbox[0]),east=Math.min(bounds[2],meta.igcBbox[2]),south=Math.max(bounds[1],meta.igcBbox[1]),north=Math.min(bounds[3],meta.igcBbox[3]);
 if(west>east||south>north)return {features:[],sourceIds:0,unknownHeights:0,tiles:0};
 const x0=tileX(west,z),x1=tileX(east,z),y0=tileY(north,z),y1=tileY(south,z),total=(x1-x0+1)*(y1-y0+1);
 const features:GeoJSON.Feature[]=[],ids=new Set<string>(),unknown=new Set<string>();let done=0;
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
  signal.throwIfAborted();const data=await archive.getZxy(z,x,y,signal);
  if(data){const layer=new VectorTile(new PbfReader(data.data)).layers.buildings;
   if(layer)for(let i=0;i<layer.length;i++){
    const vector=layer.feature(i),p=vector.properties,id=String(p.sourceid??vector.id??(x+':'+y+':'+i));
    if(knownBuildingHeight(p)===null){unknown.add(id);continue;}
    features.push(vector.toGeoJSON(x,y,z));ids.add(id);
   }
  }
  onProgress(++done,total);if(done%4===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 return {features,sourceIds:ids.size,unknownHeights:unknown.size,tiles:total};
}
