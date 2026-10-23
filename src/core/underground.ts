// ureten: codex — preserve source categories; descriptive names are UI labels.
import type * as GeoJSON from 'geojson';
import {waterMarkOf,waterLabel,legendAccessOf,safeMarkerColor,sourceAnnotation,sourcePaint} from './source-layers';
export const kindLabel:Record<string,string>={shaft:'Tarihî şaft',stair:'Merdiven',well:'Kuyu',room:'Salon kaydı',surface:'Yüzey işareti',linework:'Tarihî plan çizgisi',feature:'Plan işareti','user-entrance':'Kişisel giriş işareti',puits_skull:'Tarihî kaynak kuyu / şaft işareti'};
const formerEntrances=new Set(['historic-poi-getGeneralInformationMarkers-6','historic-poi-getGeneralInformationMarkers-100','historic-poi-getFeatureMarkers-332']);
// ureten: opus: access groups are a UI grouping only; the source category is never rewritten.
// Shafts, stairs, wells and former entrances are HISTORICAL records: current access is unknown.
export type AccessGroup='official'|'shaft'|'stair'|'well'|'former'|'user'|'grs';
export type AccessStyle='official'|'shaft-rungs'|'shaft-plain'|'shaft-interlevel'|'stair'|'well'|'former'|'user'|'grs';
export const accessGroups:AccessGroup[]=['official','shaft','stair','well','former','user','grs'];
export const accessLabel:Record<AccessGroup,string>={official:'Resmî müze girişi / çıkışı',shaft:'Tarihî şaft',stair:'Döner merdiven',well:'Kuyu',former:'Kaynakta eski giriş',user:'Kişisel giriş işaretleri',grs:'Kaynak kuyu / şaft işaretleri'};
export const accessShortLabel:Record<AccessGroup,string>={official:'Resmî',shaft:'Şaft',stair:'Döner merdiven',well:'Kuyu',former:'Eski giriş',user:'Kişisel',grs:'Kaynak kuyuları'};
export const accessStyleLabel:Record<AccessStyle,string>={official:'Resmî müze erişimi','shaft-rungs':'Basamaklı şaft','shaft-plain':'Basamaksız şaft','shaft-interlevel':'Katlar arası şaft',stair:'Döner merdiven',well:'Kuyu',former:'Kaynakta eski giriş',user:'Kişisel giriş işareti',grs:'Kaynak kuyu / şaft işareti'};
// ureten: opus: ONE source of truth for access glyphs: the map symbol layer, legend, directory and detail all read this table.
export const accessGlyph:Record<AccessStyle,string>={official:'↧','shaft-rungs':'↓','shaft-plain':'⇣','shaft-interlevel':'↕',stair:'↗',well:'○',former:'E',user:'★',grs:'◉'};
// Map colours (light basemap ink); legend and directory use the same tokens via CSS classes.
export const accessColor:Record<AccessStyle,string>={official:'#3d719b','shaft-rungs':'#1f5fa8','shaft-plain':'#6584a8','shaft-interlevel':'#3c4fa0',stair:'#8a45a8',well:'#0f93a6',former:'#c47a12',user:'#dc2626',grs:'#727748'};
type Props=Record<string,unknown>|null|undefined;
export function accessGroupOf(p:Props,fallbackId?:unknown):AccessGroup|null{
 const kind=String(p?.kind??''),id=String(p?.id??fallbackId??'');
 if(kind==='access')return 'official';
 if(kind==='user-entrance')return 'user';
 if(kind==='puits_skull'||kind==='shaft'&&p?.recordType==='grs-symbol'&&p?.legendLabel==='PUITS')return 'grs';
 if(formerEntrances.has(id))return 'former';
 return kind==='shaft'||kind==='stair'||kind==='well'?kind:null;
}
export function accessStyleOf(p:Props,fallbackId?:unknown):AccessStyle|null{
 const group=accessGroupOf(p,fallbackId);if(group!=='shaft')return group;
 const category=String(p?.sourceCategory??'');
 return category==='getMaintenanceWellWithRungsMarkers'?'shaft-rungs':category==='getCommunicationWellMarkers'?'shaft-interlevel':'shaft-plain';
}
export function accessGlyphOf(p:Props,fallbackId?:unknown){const style=accessStyleOf(p,fallbackId);if(!style)return '';return style==='official'&&String(p?.id??fallbackId??'').includes('exit')?'↥':accessGlyph[style];}
// ureten: opus: depth label never invents a depth: −N m only when the source gives N>0.
export function depthLabel(p:Props,fallbackId?:unknown){
 const d=p?.depthMetres;if(typeof d==='number'&&d>0)return `−${d} m`;
 if(d===0||accessGroupOf(p,fallbackId)==='official')return 'Yerüstü';
 return 'Derinlik bilinmiyor';
}
export function isAccessRecord(f:GeoJSON.Feature){return accessGroupOf(f.properties,f.id)!==null;}
// ureten: opus: F4 position honesty. A historical point carries a held-out alignment error from its package:
// fitHeldOutMedianM (per-map fit) and/or calibrationLeaveOneOutRmsMetres (leave-one-out RMS of the control fit).
// When both exist the larger one is used, so the stated uncertainty is never the smaller of two estimates. null = no figure.
export function positionErrorOf(p:Props):number|null{
 const values=[p?.fitHeldOutMedianM,p?.calibrationLeaveOneOutRmsMetres,p?.pos_uncertainty_m,p?.georef_p90_m,p?.posUncertaintyM,p?.fitP90M,p?.fitIndependentNamedJunctionP90M].filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0&&v<5000);
 return values.length?Math.max(...values):null;
}
export function positionErrorLabel(metres:unknown){return typeof metres==='number'&&Number.isFinite(metres)&&metres>0?`Konum yaklaşık · ±${Math.round(metres)} m`:'';}
// ureten: opus: MapLibre world is 512 px per tile; metres per pixel at a latitude and zoom (spherical Web Mercator).
export function metresPerPixel(latitude:number,zoom:number){return 40075016.686*Math.cos(latitude*Math.PI/180)/(512*2**zoom);}
// ureten: opus: F4 hover status line: official museum record versus historical access record (never "open exit").
export function accessStatusLabel(group:AccessGroup,id?:unknown){return group==='official'?(String(id??'').includes('exit')?'Resmî müze çıkışı':'Resmî müze girişi'):group==='user'?'Kişisel işaret · erişim doğrulanmadı':group==='former'?'Kaynakta eski giriş · tarihî kayıt':group==='grs'?'Tarihî kaynak kuyu işareti':'Tarihî erişim kaydı';}
// ureten: opus: F4 Girişler rows: an approximate location hint, either a nearby named road or rounded coordinates.
export function roundedPlace(coordinates:[number,number]){const f=(v:number)=>v.toLocaleString('tr-TR',{minimumFractionDigits:4,maximumFractionDigits:4});return `≈ ${f(coordinates[1])} K · ${f(coordinates[0])} D`;}
// ureten: opus: UI-only display title. Packages derive titles for unnamed shafts/stairs/wells as
// "<Turkish label> · <sourceCategory>:<n>". The app shows "<Turkish label> · kayıt <n>"; the raw string stays in sourceTitle
// and the source id stays in id, so nothing in the stored file is rewritten and search still finds both.
const derivedTitle=/^(.+?) · ([A-Za-z][A-Za-z0-9]*):(\d+)$/;
export function displayTitle(p:Props,fallbackId?:unknown){
 const raw=String(p?.title??'').trim(),original=String(p?.originalTitle??'').trim();
 const m=derivedTitle.exec(raw);if(m&&(p?.titleDerived===true||!original))return `${m[1]} · kayıt ${m[3]}`;
 if(raw)return raw;const kind=String(p?.kind??'');return `${kindLabel[kind]??'Plan kaydı'} · ${String(p?.id??fallbackId??'')}`;
}
// ureten: opus: source level of a plan line, read only from the package's own sourceLevel (legend colour based, not a survey).
// Older packages have no such property: their lines are "unknown" level and keep the original green style.
export type SourceLevel='superieur'|'inferieur'|'unknown';
export const sourceLevels:SourceLevel[]=['superieur','inferieur','unknown'];
export const sourceLevelLabel:Record<SourceLevel,string>={superieur:'Üst kat',inferieur:'Alt kat',unknown:'Belirsiz'};
export function sourceLevelOf(p:Props):SourceLevel{const v=String(p?.sourceLevel??'');return v==='superieur'||v==='inferieur'?v:'unknown';}
export type InkClass='grey'|'blue-grey'|'dark';
export const inkLegend:Record<InkClass,string>={grey:'Tarihî plan çizgisi (gri kaynak mürekkebi)','blue-grey':'Alt kat (kaynak renk efsanesine göre)',dark:'Koyu duvar çizimi (kaynakta, anlamı kesin değil)'};
// ureten: opus: a named historical place is a source point with its own source name (originalTitle), shown a little larger with a label.
// It stays a "Tarihî kaynak işareti"; it is never promoted to a room and never gets a picture without a verified match.
export function isNamedPlace(p:Props){const kind=String(p?.kind??'');return (kind==='feature'||kind==='room')&&String(p?.originalTitle??'').trim().length>0;}
// Label priority by the source's own marker category: 1 = place names (general information, curiosities, rooms) from z16,
// 2 = plan notes ("low", "sump") from z17, 3 = codes and inscriptions (quarry marks, sheet marks, numbers) from z18.
const placeCategories=new Set(['getGeneralInformationMarkers','getCuriosityMarkers']),codeCategories=new Set(['getQuarryMarkers','getCartographicStatementsMarkers','getArcueilAqueductSpyholesMarkers','getIdcMarkers']);
export function placeTier(p:Props):1|2|3{const c=String(p?.sourceCategory??'');return String(p?.kind??'')==='room'||placeCategories.has(c)?1:codeCategories.has(c)?3:2;}
export function personalFeature(feature:GeoJSON.Feature,source?:{id:string;label:string}|number):GeoJSON.Feature{
 const p=feature.properties??{},id=String(p.id??feature.id??''),kind=String(p.kind??(feature.geometry.type.includes('LineString')?'linework':'feature'));
 const base={...p,id,kind},title=displayTitle(base,feature.id),rawTitle=String(p.title??'').trim();
 const water=waterMarkOf(base),legend=legendAccessOf(base);
 return {...feature,properties:{...base,...sourceAnnotation(base,typeof source==='object'?source:undefined),...sourcePaint(base),personalSource:true,title,...(rawTitle&&rawTitle!==title?{sourceTitle:rawTitle}:{}),accessCategory:formerEntrances.has(id)?'historical-former-entrance':p.accessCategory,sourceCategoryLabel:formerEntrances.has(id)?'Kaynakta eski giriş':p.sourceCategoryLabel??kindLabel[kind]??'Kaynak işareti',
  ...(kind==='user-entrance'?{displayColor:safeMarkerColor(p),firstPrimary:p.displayStyle==='first-primary',...(typeof p.cameraHeadingDeg==='number'&&Number.isFinite(p.cameraHeadingDeg)?{cameraHeadingDeg:((p.cameraHeadingDeg%360)+360)%360}:{})}:{}),
  ...(water?{waterMark:water,waterLabel:waterLabel[water]}:{}),...(legend!=='unknown'?{legendAccess:legend}:{}),
  // ureten: opus: derived UI-only grouping for map styling; '' when not an access record.
  accessGroup:accessGroupOf(base,feature.id)??'',accessStyle:accessStyleOf(base,feature.id)??'',
  // ureten: opus: F4 held-out position error for points only (lines keep their own calibration fields).
  ...(feature.geometry?.type==='Point'&&positionErrorOf(p)!==null?{positionErrorM:positionErrorOf(p)}:{}),
  ...(isNamedPlace(base)?{namedPlace:true,placeLabel:String(p.originalTitle).trim(),placeTier:placeTier(base)}:{})}};
}
// ureten: opus: slim copy for the MapLibre source: hover/click need only these; full record stays in the app.
// inkClass/sourceLevel are copied only when the package has them, so older packages render exactly as before.
const mapKeys=['id','kind','title','sourceCategoryLabel','personalSource','accessGroup','accessStyle','publisherRoomId','inkClass','sourceLevel','namedPlace','placeLabel','placeTier','positionErrorM','sourceId','sourceLabel','legendAccess','waterMark','waterLabel','displayColor','firstPrimary','cameraHeadingDeg','sourceFillColor','sourceStrokeColor','sourceFillOpacity'] as const;
export function mapFeature(feature:GeoJSON.Feature):GeoJSON.Feature{
 const p=feature.properties??{},properties:Record<string,unknown>={};for(const k of mapKeys)if(p[k]!==undefined&&p[k]!==null)properties[k]=p[k];
 return {type:'Feature',id:feature.id,geometry:feature.geometry,properties};
}
