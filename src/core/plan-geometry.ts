// ureten: codex. Preserve individual source paths and holes; diagram levels never become measured depths.
import type * as GeoJSON from 'geojson';
import {sourceLevelOf} from './underground';
import {legendAccessOf,sourcePaint} from './source-layers';
import type {SourceLevel} from './underground';
export type PlanPath={id:string;level:SourceLevel;points:GeoJSON.Position[];closed:boolean;color:string;feature:GeoJSON.Feature};
export function planPaths(features:GeoJSON.FeatureCollection):PlanPath[]{
 const out:PlanPath[]=[];
 for(const feature of features.features){
  const g=feature.geometry,p=feature.properties??{},level=sourceLevelOf(p),access=legendAccessOf(p);
  const native=sourcePaint(p),color=native.sourceStrokeColor??native.sourceFillColor??(access==='inaccessible'?'#f58367':access==='accessible'?'#9ad7a4':level==='inferieur'?'#8fbafa':level==='superieur'?'#e6caa1':'#adb7b5');
  const paths=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?g.coordinates.flat():[];
  paths.forEach((points,index)=>{if(points.length>=2)out.push({id:String(p.id??feature.id??'')+':'+index,level,points,closed:g.type.includes('Polygon'),color,feature});});
 }
 return out;
}
export function diagramY(level:SourceLevel,gap:number){return -(level==='superieur'?1:level==='inferieur'?2:3)*gap;}
export function planProject(position:GeoJSON.Position):[number,number]{
 const r=6378137,latitude=48.835*Math.PI/180;
 return [(position[0]-2.33)*Math.PI/180*r*Math.cos(latitude),-(position[1]-48.835)*Math.PI/180*r];
}
export function knownBuildingHeight(p:Record<string,unknown>|null){const h=p?.heightM;return typeof h==='number'&&Number.isFinite(h)&&h>0?h:null;}
