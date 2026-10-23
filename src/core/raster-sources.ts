// ureten: codex. Group actual installed map images, preserving source-specific visibility defaults.
import type {LocalAsset} from './storage';
export const rasterSourceId=(a:LocalAsset)=>a.mapSource?.id??(a.category?.startsWith('igc-raster')?'igc-official':'unattributed-raster');
export function rasterSourceOptions(assets:LocalAsset[]){
 const groups=new Map<string,{id:string;label:string;count:number;defaultVisible:boolean;note:string}>();
 for(const a of assets){const id=rasterSourceId(a),row=groups.get(id)??{id,label:a.mapSource?.title??(id==='igc-official'?'IGC · resmî koordinatlı paftalar':'Kaynak harita görseli'),count:0,defaultVisible:a.mapSource?.defaultVisible!==false,note:a.mapSource?.positionNote??'Kaynak revizyonu ve güncel geçiş durumu ayrıca değerlendirilir.'};row.count++;groups.set(id,row);}
 return [...groups.values()];
}
export function rasterSourceSelected(asset:LocalAsset,selected:string[]|null){return selected===null?asset.mapSource?.defaultVisible!==false:selected.includes(rasterSourceId(asset));}
