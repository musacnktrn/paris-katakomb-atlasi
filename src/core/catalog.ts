// ureten: codex
import type * as GeoJSON from 'geojson';
export type AtlasKind = 'underground' | 'water' | 'sights' | 'food';
export interface AtlasDefinition { id:string; city:string; kind:AtlasKind; title:string; enabled:boolean; }
// Future themes are a data contract only; no new city data or product screens.
export const CURRENT_ATLAS:AtlasDefinition={id:'paris-catacombs',city:'Paris',kind:'underground',title:'Paris Katakomb Atlası',enabled:true};
export const normalizeSearch=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').toLocaleLowerCase('en');
export function searchFeatures(collection:GeoJSON.FeatureCollection,query:string) {
  const q=normalizeSearch(query.trim());
  if(!q)return collection.features;
  return collection.features.filter(f=>normalizeSearch([f.id,...Object.values(f.properties??{})].join(' ')).includes(q));
}
export function safeExternalUrl(value:unknown) {
  try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
