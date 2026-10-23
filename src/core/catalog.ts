// ureten: codex
import type * as GeoJSON from 'geojson';
export type AtlasKind = 'underground' | 'water' | 'sights' | 'food';
export interface AtlasDefinition { id:string; city:string; kind:AtlasKind; title:string; enabled:boolean; }
// Future themes are a data contract only; no new city data or product screens.
export const CURRENT_ATLAS:AtlasDefinition={id:'paris-catacombs',city:'Paris',kind:'underground',title:'Paris Katakomb Atlası',enabled:true};
export const normalizeSearch=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').toLocaleLowerCase('en');
// ureten: opus: normalised text is built once per feature (WeakMap) from the id and primitive values only,
// so typing in an ~8000-record private archive does not re-normalise pixel arrays on every key press.
const searchIndex=new WeakMap<object,string>();
function searchText(f:GeoJSON.Feature){let text=searchIndex.get(f);if(text===undefined){const parts:unknown[]=[f.id];for(const v of Object.values(f.properties??{}))if(v!==null&&typeof v!=='object')parts.push(v);text=normalizeSearch(parts.join(' '));searchIndex.set(f,text);}return text;}
export function searchFeatures(collection:GeoJSON.FeatureCollection,query:string) {
  const q=normalizeSearch(query.trim());
  if(!q)return collection.features;
  return collection.features.filter(f=>searchText(f).includes(q));
}
export function safeExternalUrl(value:unknown) {
  try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
