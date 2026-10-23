// ureten: codex. UI annotations read source words/legend only; they never infer present access or physical depth.
type Props=Record<string,unknown>|null|undefined;
export type WaterMark='inundated'|'sump'|'muddy'|'well'|'structure'|'note';
export const waterLabel:Record<WaterMark,string>={inundated:'Kaynakta su basması / su altında',sump:'Kaynakta su birikimi / sump',muddy:'Kaynakta çamur işareti',well:'Kaynakta su kuyusu',structure:'Su yapısı / su kemeri',note:'Kaynakta su notu'};
const normal=(text:unknown)=>String(text??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function waterMarkOf(p:Props):WaterMark|null{
 const t=normal([p?.originalTitle,p?.sourceTitle,p?.title].filter(Boolean).join(' '));
 if(/\b(aqueduc|aqueduct|reservoir)\b/.test(t))return 'structure';
 if(/\b(water well|puits d.eau)\b/.test(t))return 'well';
 if(/\b(inundated|inonde\w*|submerge\w*|flooded|flooding)\b/.test(t)||/depth is variable.*(dry|boot)/.test(t))return 'inundated';
 if(/\b(sumps?|puisards?)\b/.test(t))return 'sump';
 if(/\b(muddy|mud|boue\w*)\b/.test(t))return 'muddy';
 if(/\b(water|eau|drain)\b/.test(t))return 'note';
 return null;
}
export function legendAccessOf(p:Props):'accessible'|'inaccessible'|'unknown'{
 const value=normal(p?.legendAccess??p?.legend_label).replace(/[_-]+/g,' ').trim();
 if(value==='non accessible'||value==='inaccessible')return 'inaccessible';
 return value==='accessible'?'accessible':'unknown';
}
export function safeMarkerColor(p:Props,fallback='#dc2626'){
 return typeof p?.displayColor==='string'&&/^#[0-9a-f]{6}$/i.test(p.displayColor)?p.displayColor:fallback;
}
export function isUserPoint(p:Props){return p?.kind==='user-entrance';}
export function sourcePaint(p:Props){
 const s=p?.style&&typeof p.style==='object'?p.style as Record<string,unknown>:{};
 const rgb=(value:unknown)=>Array.isArray(value)&&value.length===3&&value.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=255)?'#'+value.map(v=>Math.round(v).toString(16).padStart(2,'0')).join(''):undefined;
 const opacity=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1?v:undefined;
 const fill=rgb(s.fill),stroke=rgb(s.stroke),alpha=opacity(s.fillOpacity);
 return {...(fill?{sourceFillColor:fill}:{}),...(stroke?{sourceStrokeColor:stroke}:{}),...(alpha!==undefined?{sourceFillOpacity:alpha}:{})};
}
export function matchesSource(p:Props,selected:readonly string[]|null|undefined){return selected==null||selected.includes(String(p?.sourceId??'unattributed'));}
export function sourceAnnotation(p:Props,context?:{id:string;label:string}){
 const id=typeof p?.sourceId==='string'&&p.sourceId?p.sourceId:context?.id;
 if(!id)return {};
 return {sourceId:id,sourceLabel:typeof p?.sourceLabel==='string'&&p.sourceLabel?p.sourceLabel:context?.label??id};
}
// Positional proximity is deliberately distinct from the identity/independence of the actual gallery.
export function sourceProximityLabel(value:unknown){
 if(!value||typeof value!=='object')return '';
 const p=value as Record<string,unknown>;
 const valid=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 if(!valid(p.sampleCount)||p.sampleCount<1||!valid(p.withinRadiusFraction)||p.withinRadiusFraction>1||!valid(p.radiusM)||p.radiusM===0)return '';
 const metric=(v:unknown)=>valid(v)?v.toLocaleString('tr-TR',{maximumFractionDigits:1})+' m':'hesaplanamadı';
 return 'Paralel çizgi örneklerinin %'+Math.round(p.withinRadiusFraction*100)+' kadarı '+p.radiusM+' m çevrede · medyan '+metric(p.medianM)+' · P90 '+metric(p.p90M)+'. Aynı galeri veya bağımsız ölçüm doğrulaması değildir.';
}
