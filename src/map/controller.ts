// ureten: codex — map instance survives UI filter/detail changes.
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
// MapLibre 6 requires an explicit bundled worker URL with Vite.
maplibregl.setWorkerUrl(workerUrl);
import type { Map as GLMap, GeoJSONSource } from 'maplibre-gl';
import type * as GeoJSON from 'geojson';
import { FileSource, PMTiles, Protocol } from 'pmtiles';
import {MapInteractions,type RoomMedia} from './markers';
import type {PhotoView} from '../core/room-photos';
import {personalFeature,mapFeature,accessColor,accessGlyph,sourceLevels,metresPerPixel,type SourceLevel} from '../core/underground';
import {packageHeader} from '../core/package-meta';
import {digest} from '../core/validation';
import type { LocalAsset } from '../core/storage';
const protocol=new Protocol();let protocolAdded=false;
// ureten: opus: expensive render counters and the map handle exist only for automated QA (Playwright sets navigator.webdriver) or ?qa.
const QA=typeof navigator!=='undefined'&&(navigator.webdriver===true||(typeof location!=='undefined'&&new URLSearchParams(location.search).has('qa')));
const ex=(value:unknown)=>value as never;
type PrivatePackage={name:string;createdAt:string;features:GeoJSON.Feature[];mapData:GeoJSON.FeatureCollection};
// ureten: opus: F4 features is null for an inactive package: it is not parsed at startup.
export type PrivatePackageState={assetId:string;name:string;createdAt:string;features:number|null;active:boolean};
export type PrivateLoad={collection:GeoJSON.FeatureCollection;packages:PrivatePackageState[]};
const PRIVATE_SUFFIXES=['-area','-band','-casing','-line','-water-line','-water','-point','-symbol','-label','-user-star','-user-label','-user-direction','-hit'] as const;
// ureten: opus: vector sub-filters; level filters read the package's own sourceLevel (missing = unknown).
export type VectorFilters={lines:boolean;places:boolean;surface:boolean;band:boolean;levels:Record<SourceLevel,boolean>;water?:boolean;sourceIds?:string[]|null};
export type MapPadding=number|{top:number;bottom:number;left:number;right:number};
// ureten: opus: F4 focusPrivate result: true = moved to it, 'inactive' = a newer package of the same name is drawn, 'empty' = no position to show.
export type FocusResult=true|'inactive'|'empty';
const noPad={top:0,bottom:0,left:0,right:0};
export class AtlasMap {
  readonly map:GLMap;
  private interactions:MapInteractions;
  private basemap:'light'|'dark'|'satellite'='light';
  private visibility={surface:true,sheets:true,rooms:true,access:true,galleries:false,personal:true,buildings:true,underground:true,greens:true,surfaceWater:true};
  private vectorFilters:VectorFilters={lines:true,places:true,surface:false,band:true,levels:{superieur:true,inferieur:true,unknown:true}};
  // ureten: opus: generation counter: an older, slower loadPrivateData call never touches the map after a newer one started.
  private loadGen=0;
  private parsing=new Map<string,Promise<PrivatePackage>>();
  private selectedId='';
  private regional=false;
  private spatial=false;
  private buildingOpacity=.55;
  private privateIds:string[]=[];
  private privateFeatures:GeoJSON.Feature[]=[];
  // ureten: opus: sha256 -> parsed package, so refresh() never re-parses 10-15 MB; id -> full feature for highlight.
  private parsed=new Map<string,PrivatePackage>();
  // ureten: opus: F4 sha256 -> top-level name/createdAt, read without parsing the feature array.
  private headers=new Map<string,{name:string;createdAt:string}>();
  // ureten: codex: a stale parse cannot repopulate the cache after its package was removed or superseded.
  private parseTargets=new Set<string>();
  private activePrivate=new Map<string,{assetId:string;data:PrivatePackage}>();
  private privateIndex=new Map<string,GeoJSON.Feature>();
  private privateSignature='';
  private privateCollection:GeoJSON.FeatureCollection={type:'FeatureCollection',features:[]};
  private hoverId='';
  private pendingMove:maplibregl.MapMouseEvent|null=null;
  private moveFrame=0;
  private pickRadius=5;
  private privateParses=0;
  private regionBounds:[number,number,number,number]=[2.1524979167,48.7429653492,2.5985902401,48.9713824538];
  private galleryOpacity=.8;
  private exploration:GeoJSON.FeatureCollection={type:'FeatureCollection',features:[]};
  private sheetFeatures:GeoJSON.Feature[]=[];
  private surfaceFeatureCount=0;
  private surfaceLabels:maplibregl.Marker[]=[];
  private rasterAssets:LocalAsset[]=[];
  private rasterSignature='';
  private ortho:{assets:{id:string;url:string;bounds:[number,number,number,number];overview:boolean}[]}|null=null;
  private imageSources=new Map<string,{source:string;layer:string;objectUrl?:string}>();
  private rasterUrls=new Map<string,string>();
  private destroyed=false;
  constructor(container:HTMLElement,onSelect:(properties:Record<string,unknown>)=>void) {
    if(!protocolAdded){maplibregl.addProtocol('pmtiles',protocol.tile);protocolAdded=true;}
    this.map=new maplibregl.Map({container,center:[2.326,48.833],zoom:13,attributionControl:{compact:false,customAttribution:'Hava fotoğrafı © IGN · <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noreferrer">Licence Ouverte 2.0</a>'},style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#f2f1eb'}}]}});
    this.interactions=new MapInteractions(this.map,onSelect);
    this.map.addControl(new maplibregl.NavigationControl(),'top-right');
    // ureten: opus: rAF-throttled hover with full-geometry highlight; larger pick box on coarse (touch) pointers.
    this.pickRadius=typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches?14:5;
    if(QA)(window as unknown as {__atlasMap?:GLMap}).__atlasMap=this.map;
    // ureten: opus: a touch tap also fires emulated mouse events; on devices without real hover they must not open hover cards.
    const canHover=typeof matchMedia!=='function'||matchMedia('(hover:hover)').matches;
    this.map.on('mousemove',e=>{if(!canHover)return;if((e.originalEvent.target as HTMLElement)?.closest('.atlas-place-marker'))return;this.pendingMove=e;if(!this.moveFrame)this.moveFrame=requestAnimationFrame(()=>{this.moveFrame=0;const ev=this.pendingMove;this.pendingMove=null;if(ev&&!this.destroyed)this.hoverAt(ev);});});
    this.map.getCanvas().addEventListener('mouseleave',()=>{this.interactions.hide();this.setHover('');});
    this.map.on('click','igc-sheets',e=>{const p=e.features?.[0]?.properties;if(p)onSelect(p);});
    this.map.on('moveend',()=>this.syncImages());
    this.map.on('idle',()=>this.syncImages());
    this.map.on('click',e=>{const f=this.pick(e.point,this.pickRadius+1,true);if(f?.properties){if(f.properties.personalSource){this.setHover(String(f.properties.id??''));this.setSelected(String(f.properties.id??''));}onSelect({...f.properties,id:f.properties.id??f.id});}else this.setHover('');});
  }
  // ureten: opus: topmost first: access hit circles, points, then lines (and public/area layers for clicks).
  private pick(point:{x:number;y:number},r:number,includePublic=false){
    const layers=[...(includePublic?['explore-rooms','explore-access']:[]),...this.privateIds.flatMap(id=>[id+'-hit',id+'-point',id+'-line',...(includePublic?[id+'-area']:[])])].filter(id=>this.map.getLayer(id));
    if(!layers.length)return undefined;
    return this.map.queryRenderedFeatures([[point.x-r,point.y-r],[point.x+r,point.y+r]],{layers})[0];
  }
  private hoverAt(e:maplibregl.MapMouseEvent){
    const f=this.privateIds.length?this.pick(e.point,this.pickRadius):undefined;
    this.map.getCanvas().style.cursor=f?'pointer':'';
    if(f?.properties){const c=f.geometry.type==='Point'?f.geometry.coordinates as [number,number]:[e.lngLat.lng,e.lngLat.lat] as [number,number];this.setHover(String(f.properties.id??''));this.interactions.show(f.properties,c);}
    else if(this.hoverId){this.setHover('');this.interactions.hide();}
  }
  private setHover(id:string){
    if(id===this.hoverId)return;this.hoverId=id;const full=id?this.privateIndex.get(id):undefined;
    (this.map.getSource('private-hover') as GeoJSONSource|undefined)?.setData({type:'FeatureCollection',features:full?[{type:'Feature',geometry:full.geometry,properties:{}}]:[]});
    this.map.getContainer().dataset.hoverFeature=full?id:'';this.syncUncertainty();
  }
  // ureten: opus: the record chosen from a list or the map keeps its own ring until the detail closes (independent of hover).
  setSelected(id:string){
    this.selectedId=id;const full=id?this.privateIndex.get(id):undefined;
    (this.map.getSource('private-selected') as GeoJSONSource|undefined)?.setData({type:'FeatureCollection',features:full?[{type:'Feature',geometry:full.geometry,properties:{}}]:[]});
    this.map.getContainer().dataset.selectedFeature=full?id:'';this.syncUncertainty();
  }
  // ureten: opus: F4 position honesty: a faint ring around the hovered or selected historical point from z16, radius = its held-out
  // position error in metres (metres to pixels by latitude: the radius at z16 is stored, the layer doubles it per zoom level).
  private syncUncertainty(){
    const features:GeoJSON.Feature[]=[];let shown=0;
    for(const [id,role] of [[this.selectedId,'selected'],[this.hoverId,'hover']] as const){
     const f=id&&id!=='\u0000'?this.privateIndex.get(id):undefined,metres=f?.properties?.positionErrorM;
     if(!f||f.geometry.type!=='Point'||typeof metres!=='number'||features.some(x=>x.properties?.id===id))continue;
     const [lng,lat]=f.geometry.coordinates as [number,number];features.push({type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties:{id,role,metres,r16:metres/metresPerPixel(lat,16)}});if(!shown)shown=metres;
    }
    (this.map.getSource('private-uncertainty') as GeoJSONSource|undefined)?.setData({type:'FeatureCollection',features});
    this.map.getContainer().dataset.uncertaintyMetres=shown?String(Math.round(shown)):'';
  }
  clearSelection(){this.setSelected('');this.setHover('');this.interactions.hide();}
  // ureten: opus: F4 closing a detail hides only the hover card; the selection ring stays until another record is chosen.
  clearHover(){this.setHover('');this.interactions.hide();}
  private ensureHoverLayers(){
    const m=this.map,before=m.getLayer('region-road-labels')?'region-road-labels':undefined;
    // ureten: opus: F4 uncertainty ring sits under the private point dots so the record itself stays readable.
    const firstPoint=m.getStyle().layers.find(l=>/^private-(?!selected|hover|uncertainty).*-point$/.test(l.id))?.id;
    if(!m.getSource('private-uncertainty')){
      m.addSource('private-uncertainty',{type:'geojson',data:{type:'FeatureCollection',features:[]},buffer:0});
      m.addLayer({id:'private-uncertainty',type:'circle',source:'private-uncertainty',minzoom:16,paint:{'circle-radius':ex(['interpolate',['exponential',2],['zoom'],16,['get','r16'],24,['*',['get','r16'],256]]),'circle-color':'#c0612b','circle-opacity':.07,'circle-stroke-color':'#c0612b','circle-stroke-opacity':.55,'circle-stroke-width':1.2,'circle-pitch-alignment':'map','circle-pitch-scale':'map'}},firstPoint);
    }else m.moveLayer('private-uncertainty',firstPoint);
    if(!m.getSource('private-hover')){
      m.addSource('private-selected',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      m.addLayer({id:'private-selected-line',type:'line',source:'private-selected',filter:['==',['geometry-type'],'LineString'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#c0612b','line-opacity':.85,'line-width':['interpolate',['linear'],['zoom'],12,4,16,7,18,10]}},before);
      m.addLayer({id:'private-selected-point',type:'circle',source:'private-selected',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':['interpolate',['linear'],['zoom'],10,9,15,15,17,19],'circle-color':'#c0612b','circle-opacity':.12,'circle-stroke-color':'#c0612b','circle-stroke-width':3.5}});
      m.addSource('private-hover',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      m.addLayer({id:'private-hover-line',type:'line',source:'private-hover',filter:['==',['geometry-type'],'LineString'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#f0a92a','line-opacity':.75,'line-width':['interpolate',['linear'],['zoom'],12,5,16,9,18,12]}},before);
      m.addLayer({id:'private-hover-point',type:'circle',source:'private-hover',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':['interpolate',['linear'],['zoom'],10,8,15,13,17,17],'circle-color':'#f0a92a','circle-opacity':.22,'circle-stroke-color':'#f0a92a','circle-stroke-width':3}});
    }else{m.moveLayer('private-selected-line',before);m.moveLayer('private-hover-line',before);m.moveLayer('private-selected-point');m.moveLayer('private-hover-point');}
  }
  async ready(){if(!this.map.isStyleLoaded())await new Promise<void>(r=>this.map.once('idle',()=>r()));}
  async loadBuiltins(sheets:GeoJSON.FeatureCollection,surface:GeoJSON.FeatureCollection){
    await this.ready();this.sheetFeatures=sheets.features;this.surfaceFeatureCount=surface.features.length;const m=this.map;
    m.addSource('surface',{type:'geojson',data:surface,attribution:'© <a href="https://opendata.paris.fr/" target="_blank" rel="noreferrer">Ville de Paris</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL 1.0</a>'});
    m.addLayer({id:'surface-areas',type:'fill',source:'surface',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':['match',['get','kind'],'water','#b9ced0','#cdd8c7'],'fill-opacity':0.75}});
    m.addLayer({id:'surface-roads',type:'line',source:'surface',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':'#aca99d','line-width':1.4}});
    m.addSource('igc',{type:'geojson',data:sheets,attribution:'Ville de Paris / IGC · Pafta dizini; galeri geometrisi değildir'});
    m.addLayer({id:'igc-sheets',type:'fill',source:'igc',paint:{'fill-color':'#425c81','fill-opacity':0.06}});
    m.addLayer({id:'igc-outline',type:'line',source:'igc',paint:{'line-color':'#52796a','line-width':1,'line-opacity':0.65}});
    m.addSource('personal',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    m.addLayer({id:'personal-points',type:'circle',source:'personal',paint:{'circle-radius':6,'circle-color':'#9b5436'}});
    // Offline street labels use actual OSM way vertices/names and DOM text,
    // without a font/glyph server or invented neighbourhood coordinates.
    const candidates=surface.features.filter(f=>f.properties?.name&&(f.geometry.type==='LineString'||f.geometry.type==='MultiLineString')).map(f=>{const g=f.geometry,parts=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[],line=[...parts].sort((a,b)=>b.length-a.length)[0]??[];return {name:String(f.properties!.name),line};}).filter(f=>f.line.length>1).sort((a,b)=>b.line.length-a.line.length);
    let labels:maplibregl.Marker[]=[];
    const updateLabels=()=>{
      labels.forEach(l=>l.remove());labels=[];this.surfaceLabels=labels;if(this.regional)return;const used=new Set<string>();const bounds=m.getBounds();
      for(const f of candidates){
        const name=f.name;if(used.has(name))continue;
        const line=f.line,p=line[Math.floor(line.length/2)];
        if(!bounds.contains([p[0],p[1]]))continue;used.add(name);
        const el=document.createElement('span');el.textContent=name;el.className='atlas-street-label';
        Object.assign(el.style,{font:'11px system-ui',color:this.basemap==='dark'?'#cad4d9':'#5c6862',textShadow:this.basemap==='dark'?'0 1px 3px #10151b':'0 1px 3px #fff,0 -1px 3px #fff',pointerEvents:'none',display:this.visibility.surface?'':'none'});
        labels.push(new maplibregl.Marker({element:el}).setLngLat([p[0],p[1]]).addTo(m));
        if(labels.length>=(m.getZoom()<14?9:20))break;
      }
    };
    m.on('moveend',updateLabels);updateLabels();
    // Ready means source geometry has actually rendered, not only UI data loaded.
    await new Promise<void>((resolve,reject)=>{
      const cleanup=()=>{clearTimeout(timer);m.off('idle',complete);m.off('error',failed);};
      const complete=()=>{cleanup();resolve();};
      const failed=(event:maplibregl.Event)=>{cleanup();reject((event as maplibregl.Event&{error?:Error}).error??new Error('Harita geometrisi işlenemedi.'));};
      const timer=setTimeout(()=>{cleanup();reject(new Error('Harita çizimi tamamlanamadı. Sayfayı yeniden açın.'));},20000);
      m.once('idle',complete);m.on('error',failed);
    });
  }
  // ureten: opus: F4 the 64 MB regional tile file is optional: the atlas is usable before it arrives, a failed or cut-off download
  // throws a Turkish error (never a raw "Failed to fetch"), and a retry attaches the layers later. Calling it again after success is a no-op.
  async loadRegion(signal:AbortSignal){
    const network=(e:unknown)=>{if(e instanceof DOMException&&e.name==='AbortError')throw e;throw new Error('Bölgesel yol ve bina paketi alınamadı.');};
    let meta:{url:string;bytes:number;sha256:string;igcBbox:[number,number,number,number];attribution:string;licenseUrl?:string;verification:{expectedUniqueSourceids:{roads:number;buildings:number}}};
    try{const r=await fetch('./data/region-tiles-meta.json',{signal});if(!r.ok)throw Error('meta');meta=await r.json();}catch(e){return network(e);}
    if(this.map.getSource('region'))return meta;
    let blob:Blob;try{const response=await fetch('./'+meta.url,{signal});if(!response.ok)throw Error('tiles');blob=await response.blob();}catch(e){return network(e);}
    if(blob.size!==meta.bytes)throw Error('Bölgesel yol ve bina paketi eksik indi.');
    if(await digest(await blob.arrayBuffer())!==meta.sha256)throw Error('Bölgesel yol ve bina paketi bütünlük kontrolünden geçemedi.');
    if(this.destroyed||this.map.getSource('region'))return meta;
    const archive=new PMTiles(new FileSource(new File([blob],'ign-region-'+meta.sha256+'.pmtiles')));await archive.getHeader();if(this.destroyed||this.map.getSource('region'))return meta;protocol.add(archive);
    const m=this.map;this.regionBounds=meta.igcBbox;this.regional=true;this.surfaceLabels.forEach(l=>l.remove());this.surfaceLabels=[];
    // ureten: opus: F4 the BD TOPO credit links to its licence (text parts are escaped; only an https licence URL becomes a link).
    const esc=(t:string)=>t.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!),licence='Licence Ouverte Etalab 2.0',safeLicence=typeof meta.licenseUrl==='string'&&/^https:\/\/[^\s"'<>]+$/.test(meta.licenseUrl)?meta.licenseUrl:'';
    const attribution=safeLicence&&meta.attribution.endsWith(licence)?esc(meta.attribution.slice(0,-licence.length))+`<a href="${esc(safeLicence)}" target="_blank" rel="noreferrer">${licence}</a>`:esc(meta.attribution);
    m.addSource('region',{type:'vector',url:`pmtiles://${archive.source.getKey()}`,attribution});
    m.addLayer({id:'region-buildings',type:'fill',source:'region','source-layer':'buildings',minzoom:12,paint:{'fill-color':'#c2b9a7','fill-opacity':.55}},'igc-sheets');
    m.addLayer({id:'region-city',type:'fill-extrusion',source:'region','source-layer':'buildings',minzoom:12,filter:['>', ['coalesce',['get','heightM'],0],0],paint:{'fill-extrusion-color':'#b0bbaa','fill-extrusion-height':['get','heightM'],'fill-extrusion-base':0,'fill-extrusion-opacity':this.buildingOpacity}},'igc-sheets');
    m.addLayer({id:'region-road-casing',type:'line',source:'region','source-layer':'roads',paint:{'line-color':'#c6c3ba','line-width':['interpolate',['linear'],['zoom'],9,.6,13,2,17,7]}},'igc-sheets');
    m.addLayer({id:'region-roads',type:'line',source:'region','source-layer':'roads',paint:{'line-color':'#fffdf8','line-width':['interpolate',['linear'],['zoom'],9,.4,13,1.2,17,4.5]}},'igc-sheets');
    // MapLibre 6 uses local font rendering when no remote glyphs URL is declared.
    m.addLayer({id:'region-road-labels',type:'symbol',source:'region','source-layer':'roads',minzoom:13,filter:['has','name'],layout:{'symbol-placement':'line','text-field':['get','name'],'text-font':['Arial'],'text-size':11,'text-max-angle':35,'text-padding':8},paint:{'text-color':'#5c6862','text-halo-color':'#fffdf8','text-halo-width':1.4}});
    // ureten: opus: F4 when the region arrives after private data or plans: street names stay above tunnels, plans above the building fill.
    for(const id of this.privateIds)for(const suffix of PRIVATE_SUFFIXES)if(m.getLayer(id+suffix))m.moveLayer(id+suffix,'region-road-labels');
    if(this.privateIds.length)this.ensureHoverLayers();
    for(const [key,e] of this.imageSources)if(key.startsWith('gallery-')&&m.getLayer(e.layer))m.moveLayer(e.layer,'region-road-casing');
    await this.setBasemap(this.basemap);this.setVisibility(this.visibility);return meta;
  }
  // ureten: codex: verified open-data surface polygons. This optional archive never prevents startup.
  async loadLandcover(signal:AbortSignal){
    const response=await fetch('./data/landcover-meta.json',{signal});if(!response.ok)throw Error('Arazi katmanı kataloğu alınamadı.');
    const meta=await response.json() as {url:string;bytes:number;sha256:string;selectedCount:number;layerCounts:Record<string,number>};
    if(meta.url!=='data/landcover.pmtiles'||!Number.isSafeInteger(meta.bytes)||meta.bytes<127||meta.bytes>64*1024*1024||!/^[a-f0-9]{64}$/.test(meta.sha256))throw Error('Arazi katmanı kataloğu geçersiz.');
    if(this.map.getSource('landcover'))return meta;
    const file=await fetch('./'+meta.url,{signal});if(!file.ok)throw Error('Arazi örtüsü paketi alınamadı.');const blob=await file.blob();
    if(blob.size!==meta.bytes||await digest(await blob.arrayBuffer())!==meta.sha256)throw Error('Arazi örtüsü paketi bütünlük kontrolünden geçemedi.');
    if(signal.aborted||this.destroyed)return meta;
    const archive=new PMTiles(new FileSource(new File([blob],'ign-landcover-'+meta.sha256+'.pmtiles')));await archive.getHeader();if(signal.aborted||this.destroyed||this.map.getSource('landcover'))return meta;protocol.add(archive);
    const m=this.map,before=['region-buildings','surface-roads','igc-sheets'].find(id=>m.getLayer(id));
    m.addSource('landcover',{type:'vector',url:`pmtiles://${archive.source.getKey()}`,attribution:'IGN BD TOPO V3 · extrait 2026-10-18 · <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence/" target="_blank" rel="noreferrer">Licence Ouverte 2.0</a>'});
    const definitions=[['vegetation','zone_de_vegetation','#bed3b4',.85],['park','zone_d_activite_ou_d_interet','#d6d7b7',.6],['cemetery','cimetiere','#c9d0bd',.7],['sports','terrain_de_sport','#d9cfb6',.55],['water','surface_hydrographique','#a9cddd',.85],['water-body','plan_d_eau','#a9cddd',.4]] as const;
    for(const [id,layer,color,opacity] of definitions)m.addLayer({id:'landcover-'+id,type:'fill',source:'landcover','source-layer':layer,minzoom:9,...(id==='water'?{filter:ex(['!=',['coalesce',['get','groundPosition'],'0'],'-1'])}:{}),paint:{'fill-color':color,'fill-opacity':opacity}},before);
    m.addLayer({id:'landcover-protected',type:'line',source:'landcover','source-layer':'parc_ou_reserve',paint:{'line-color':'#71835c','line-width':1.2,'line-opacity':.5,'line-dasharray':[3,2]}},before);
    const node=m.getContainer();node.dataset.landcoverReady='true';node.dataset.landcoverFeatures=String(meta.selectedCount);await this.setBasemap(this.basemap);this.setVisibility(this.visibility);return meta;
  }
  setSpatial(enabled:boolean){this.spatial=enabled;this.map.easeTo({pitch:enabled?60:0,bearing:enabled?-22:0,duration:500});this.setVisibility(this.visibility);this.syncImages();}
  setBuildingOpacity(value:number){this.buildingOpacity=value;if(this.map.getLayer('region-city'))this.map.setPaintProperty('region-city','fill-extrusion-opacity',value);}
  filterSheets(features:GeoJSON.Feature[]){this.sheetFeatures=features;(this.map.getSource('igc') as GeoJSONSource|undefined)?.setData({type:'FeatureCollection',features});}
  showLayer(layerId:string,show:boolean){if(this.map.getLayer(layerId))this.map.setLayoutProperty(layerId,'visibility',show?'visible':'none');}
  setPersonal(collection:GeoJSON.FeatureCollection){(this.map.getSource('personal') as GeoJSONSource|undefined)?.setData(collection);}
  getCenter():[number,number]{const c=this.map.getCenter();return [c.lng,c.lat];}
  locate():Promise<{coordinates:[number,number];accuracy:number;timestamp:number}>{
    return new Promise((resolve,reject)=>{
      if(!navigator.geolocation){reject(new Error('Bu tarayıcı konumu desteklemiyor.'));return;}
      navigator.geolocation.getCurrentPosition(p=>{
        const coordinates:[number,number]=[p.coords.longitude,p.coords.latitude];
        // A single measured fix, never an inferred underground trail.
        new maplibregl.Marker({color:'#315c83'}).setLngLat(coordinates).addTo(this.map);
        this.map.flyTo({center:coordinates,zoom:15});resolve({coordinates,accuracy:p.coords.accuracy,timestamp:p.timestamp});
      },e=>reject(new Error(e.code===1?'Konum izni verilmedi.':e.code===3?'Konum zamanında alınamadı.':'Konum sinyali alınamadı.')),{enableHighAccuracy:true,timeout:10000,maximumAge:0});
    });
  }
  focusFeature(feature:GeoJSON.Feature,padding:MapPadding=60){
    const points:number[][]=[];
    const visit=(x:unknown)=>{if(!Array.isArray(x))return;if(typeof x[0]==='number'&&typeof x[1]==='number')points.push(x as number[]);else x.forEach(visit);};
    if(feature.geometry.type==='GeometryCollection')return;
    visit(feature.geometry.coordinates);if(!points.length)return;
    const box=new maplibregl.LngLatBounds();points.forEach(p=>box.extend([p[0],p[1]]));
    this.map.fitBounds(box,{padding:this.safePadding(padding),maxZoom:17,duration:450});
  }
  // ureten: opus: never ask MapLibre for a padding larger than the canvas (it would refuse to move).
  // ureten: opus: F4 the map's own padding (phones) is added by MapLibre to a fit padding, so both are counted here.
  private safePadding(padding:MapPadding):MapPadding{
    const c=this.map.getCanvas(),mp={...noPad,...this.map.getPadding()},h=c.clientHeight-(mp.top??0)-(mp.bottom??0),w=c.clientWidth-(mp.left??0)-(mp.right??0);
    if(typeof padding==='number')return padding*2>h-40||padding*2>w-40?Math.max(0,Math.min(20,(Math.min(h,w)-40)/2)):padding;
    return padding.top+padding.bottom>h-40||padding.left+padding.right>w-40?Math.max(0,Math.min(20,(Math.min(h,w)-40)/2)):padding;
  }
  // ureten: opus: F4 phones: the map's centre, zoom buttons, locate and every fit use only the band that the command bar, legend,
  // bottom sheet and detail sheet leave visible. Unchanged padding is not re-applied (a jump would stop a running animation).
  setViewPadding(padding:{top:number;bottom:number;left:number;right:number}){
    const now={...noPad,...this.map.getPadding()},next={top:Math.max(0,Math.round(padding.top)),bottom:Math.max(0,Math.round(padding.bottom)),left:Math.max(0,Math.round(padding.left)),right:Math.max(0,Math.round(padding.right))};
    if(now.top===next.top&&now.bottom===next.bottom&&now.left===next.left&&now.right===next.right)return;
    this.map.setPadding(next);const node=this.map.getContainer();node.dataset.viewPadding=JSON.stringify(next);
  }
  // ureten: opus: F4 Girişler rows: nearest named IGN road from the region tiles already loaded on this map (no extra download).
  // Only points inside the current view are checked (z14+). Result per id: a road name, or null when no named road lies within maxMetres.
  nearestRoadNames(points:{id:string;coordinates:[number,number]}[],maxMetres=120):Record<string,string|null>{
    const out:Record<string,string|null>={},m=this.map;
    if(!this.regional||!m.getSource('region')||!m.getLayer('region-roads')||m.getZoom()<14||!points.length)return out;
    const b=m.getBounds(),inside=points.filter(p=>b.contains(p.coordinates));if(!inside.length)return out;
    const lat0=b.getCenter().lat,kx=111320*Math.cos(lat0*Math.PI/180),ky=110574,cell=150;
    type Segment={name:string;ax:number;ay:number;bx:number;by:number};const grid=new Map<string,Segment[]>();
    for(const f of m.querySourceFeatures('region',{sourceLayer:'roads',filter:['has','name']})){
      const name=String(f.properties?.name??'').trim(),g=f.geometry;if(!name||!g)continue;
      const parts=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
      for(const line of parts)for(let i=1;i<line.length;i++){
        const seg={name,ax:line[i-1][0]!*kx,ay:line[i-1][1]!*ky,bx:line[i][0]!*kx,by:line[i][1]!*ky};
        const x0=Math.floor(Math.min(seg.ax,seg.bx)/cell),x1=Math.floor(Math.max(seg.ax,seg.bx)/cell),y0=Math.floor(Math.min(seg.ay,seg.by)/cell),y1=Math.floor(Math.max(seg.ay,seg.by)/cell);
        if((x1-x0+1)*(y1-y0+1)>400)continue;
        for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const k=x+':'+y;let list=grid.get(k);if(!list)grid.set(k,list=[]);list.push(seg);}
      }
    }
    const reach=Math.ceil(maxMetres/cell);
    for(const p of inside){
      const px=p.coordinates[0]*kx,py=p.coordinates[1]*ky,cx=Math.floor(px/cell),cy=Math.floor(py/cell);let best=Infinity,bestName:string|null=null;
      for(let x=cx-reach;x<=cx+reach;x++)for(let y=cy-reach;y<=cy+reach;y++)for(const seg of grid.get(x+':'+y)??[]){
        const dx=seg.bx-seg.ax,dy=seg.by-seg.ay,len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((px-seg.ax)*dx+(py-seg.ay)*dy)/len)):0,d=Math.hypot(seg.ax+t*dx-px,seg.ay+t*dy-py);
        if(d<best){best=d;bestName=seg.name;}
      }
      out[p.id]=best<=maxMetres?bestName:null;
    }
    return out;
  }
  // ureten: opus: P7 tunnels (band + casing + core, round caps/joins, under street names) and P4 access symbols.
  // Ink classes come only from the package (v4d+): grey = current green tunnel style, blue-grey = the source legend's lower level,
  // dark = darker wall ink of uncertain meaning. Missing inkClass (older packages) = grey, so they render as before.
  private lineColors(){const light=this.basemap==='light';return {band:light?'#0f6b50':'#3fcf9a',bandLower:light?'#3d6690':'#8db4dc',bandDark:light?'#1d2622':'#e6dfcf',bandOpacity:light?[.3,.32,.4]:[.32,.34,.42],casing:light?'#fffdf8':'#0d1418',line:light?'#0b5a43':'#72e3b6',lineLower:light?'#2f5179':'#a8c8ea',lineDark:light?'#1c2420':'#efe8d8',label:light?'#3e3a2f':'#e9e4d6',halo:light?'#fffdf8':'#141a20'};}
  private paintTunnels(id:string){
    const m=this.map,c=this.lineColors(),ink=['coalesce',['get','inkClass'],'grey'];if(!m.getLayer(id+'-line'))return;
    const access=['get','legendAccess'];
    m.setPaintProperty(id+'-band','line-color',ex(['match',access,'inaccessible','#c35b56','accessible','#36a567',['match',ink,'blue-grey',c.bandLower,'dark',c.bandDark,c.band]]));
    m.setPaintProperty(id+'-band','line-opacity',ex(['case',['any',['has','sourceStrokeColor'],['has','sourceFillColor']],0,['interpolate',['linear'],['zoom'],12,['match',ink,'dark',.06,c.bandOpacity[0]],14,['match',ink,'dark',.08,c.bandOpacity[1]],17,['match',ink,'dark',.14,c.bandOpacity[2]]]]));
    m.setPaintProperty(id+'-casing','line-color',c.casing);
    m.setPaintProperty(id+'-line','line-color',ex(['match',access,'inaccessible','#b33835','accessible','#137746',['coalesce',['get','sourceStrokeColor'],['get','sourceFillColor'],['match',ink,'blue-grey',c.lineLower,'dark',c.lineDark,c.line]]]));
    if(m.getLayer(id+'-label')){m.setPaintProperty(id+'-label','text-color',c.label);m.setPaintProperty(id+'-label','text-halo-color',c.halo);}
  }
  private addPrivateSource(id:string,data:GeoJSON.FeatureCollection){
    if(this.map.getSource(id))return;const m=this.map;this.privateIds.push(id);
    m.addSource(id,{type:'geojson',data});
    const before=m.getLayer('region-road-labels')?'region-road-labels':undefined;
    const isLine:maplibregl.FilterSpecification=['==',['geometry-type'],'LineString'];
    const ink=['coalesce',['get','inkClass'],'grey'];
    // Lower-level lines draw under upper-level ones; dark wall ink on top.
    const round={'line-cap':'round','line-join':'round','line-sort-key':ex(['match',ink,'blue-grey',0,'dark',2,1])} as const;
    m.addLayer({id:id+'-area',type:'fill',source:id,filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':['coalesce',['get','sourceFillColor'],'#25a27e'],'fill-opacity':['coalesce',['get','sourceFillOpacity'],.35]}},before);
    // Visual widening only: reads double wall ink as one corridor; NOT a measured width or a verified connection.
    // z12-14 is wider and more opaque so the network reads as connected corridors at overview zooms.
    m.addLayer({id:id+'-band',type:'line',source:id,filter:isLine,layout:round,paint:{'line-width':['interpolate',['exponential',2],['zoom'],12,2.5,14,4,16,5,18,18,20,72]}},before);
    m.addLayer({id:id+'-casing',type:'line',source:id,filter:isLine,layout:round,paint:{'line-opacity':['interpolate',['linear'],['zoom'],12,.22,14,.45,16,.7],'line-width':['interpolate',['linear'],['zoom'],10,1.6,12,2,14,2.8,16,3.6,18,4.6]}},before);
    m.addLayer({id:id+'-line',type:'line',source:id,filter:isLine,layout:round,paint:{'line-width':['interpolate',['linear'],['zoom'],10,1.2,12,1.6,14,1.9,16,2.2,18,2.6]}},before);
    const style=['coalesce',['get','accessStyle'],''],kind=['coalesce',['get','kind'],'feature'],isAccess=['!=',style,''],named=['all',['==',['get','namedPlace'],true],['==',['get','placeTier'],1]];
    // Historical access points are demoted below z14 (small, no glyph) so they do not swamp the tunnels; glyphs appear from z14.5.
    // The two official museum records are DOM markers and stay prominent at every zoom.
    const byKind=(former:number,acc:number,place:number,room:number,other:number)=>['case',['==',style,'user'],['case',['==',['get','firstPrimary'],true],room+11,room+7],['==',style,'former'],former,isAccess,acc,['==',kind,'room'],room,named,place,other];
    m.addLayer({id:id+'-point',type:'circle',source:id,filter:['==',['geometry-type'],'Point'],layout:{'circle-sort-key':ex(['case',isAccess,3,['==',kind,'room'],2,named,1,0])},paint:{
      'circle-radius':ex(['interpolate',['linear'],['zoom'],10,byKind(2.4,1.4,1.4,2.2,.7),13,byKind(3.2,2,2,2.8,.9),14,byKind(4.6,3.2,2.8,3.8,1.3),15,byKind(8,7,4.2,5.5,2.6),17,byKind(12,11,6,7.5,4)]),
      'circle-color':ex(['match',style,'user',['coalesce',['get','displayColor'],accessColor.user],'grs',accessColor.grs,'shaft-rungs',accessColor['shaft-rungs'],'shaft-plain',accessColor['shaft-plain'],'shaft-interlevel',accessColor['shaft-interlevel'],'stair',accessColor.stair,'well',accessColor.well,'former',accessColor.former,['match',kind,'room','#a85a32','surface','#9a9d93',['case',named,'#6f6a55','#8b8f84']]]),
      'circle-opacity':ex(['interpolate',['linear'],['zoom'],12,['case',isAccess,.72,['==',kind,'room'],.9,.7],15,['case',isAccess,1,['==',kind,'room'],.95,named,.95,.8]]),
      'circle-stroke-width':ex(['interpolate',['linear'],['zoom'],12,['case',['==',style,'former'],1,isAccess,.5,.3],15,byKind(2.5,1.5,1,1.2,.5)]),
      'circle-stroke-color':'#ffffff'}});
    const glyphs=Object.entries(accessGlyph).flatMap(([k,g])=>[k,g]);
    m.addLayer({id:id+'-symbol',type:'symbol',source:id,minzoom:14.5,filter:['==',['geometry-type'],'Point'],layout:{'text-field':ex(['match',style,...glyphs,'']),'text-font':['Arial'],'text-size':['interpolate',['linear'],['zoom'],14.5,9,15,11,17,15],'text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':'#ffffff'}});
    // ureten: codex: personal stars stay recognisable at overview zoom; first/other colours come from the private file.
    m.addLayer({id:id+'-user-star',type:'symbol',source:id,filter:ex(['==',style,'user']),layout:{'text-field':'★','text-font':['Arial'],'text-size':ex(['case',['==',['get','firstPrimary'],true],27,21]),'text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':'#ffffff','text-halo-color':'#ffffff','text-halo-width':.3}});
    m.addLayer({id:id+'-user-label',type:'symbol',source:id,minzoom:12,filter:ex(['==',style,'user']),layout:{'text-field':ex(['case',['==',['get','firstPrimary'],true],'İLK İŞARET',['get','title']]),'text-font':['Arial'],'text-size':11,'text-offset':[0,2.1],'text-anchor':'top','text-max-width':12},paint:{'text-color':ex(['coalesce',['get','displayColor'],accessColor.user]),'text-halo-color':'#ffffff','text-halo-width':2}});
    m.addLayer({id:id+'-user-direction',type:'symbol',source:id,minzoom:16,filter:ex(['all',['==',style,'user'],['has','cameraHeadingDeg']]),layout:{'text-field':'↑','text-font':['Arial'],'text-size':22,'text-rotate':ex(['get','cameraHeadingDeg']),'text-rotation-alignment':'map','text-offset':[0,-1.5],'text-allow-overlap':true},paint:{'text-color':ex(['coalesce',['get','displayColor'],accessColor.user]),'text-halo-color':'#ffffff','text-halo-width':1}});
    m.addLayer({id:id+'-water',type:'circle',source:id,filter:['all',['==',['geometry-type'],'Point'],['has','waterMark']],paint:{'circle-radius':['interpolate',['linear'],['zoom'],10,5,16,15],'circle-color':'#73c9db','circle-opacity':.14,'circle-stroke-width':2,'circle-stroke-color':'#187f9d'}},id+'-point');
    m.addLayer({id:id+'-water-line',type:'line',source:id,filter:['all',['==',['geometry-type'],'LineString'],['has','waterMark']],paint:{'line-color':'#329abb','line-width':6,'line-opacity':.6}},id+'-point');
    // Named historical places: source name as a text label from z16 (labels yield to each other; general information wins).
    // Tier 1 (place names) from z16, tier 2 (plan notes) from z17, tier 3 (codes, inscriptions, numbers) from z18.
    const tier=['coalesce',['get','placeTier'],2],label=['get','placeLabel'];
    m.addLayer({id:id+'-label',type:'symbol',source:id,minzoom:16,filter:ex(['all',['==',['geometry-type'],'Point'],['==',['get','namedPlace'],true]]),layout:{'text-field':ex(['step',['zoom'],['case',['==',tier,1],label,''],17,['case',['<=',tier,2],label,''],18,label]),'text-font':['Arial'],'text-size':['interpolate',['linear'],['zoom'],16,10.5,18,12],'text-anchor':'top','text-offset':[0,.75],'text-max-width':9,'text-padding':3,'symbol-sort-key':ex(tier)},paint:{'text-halo-width':1.5}});
    // Invisible, larger touch target; queryRenderedFeatures does not look at opacity.
    m.addLayer({id:id+'-hit',type:'circle',source:id,filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':this.pickRadius>5?16:7,'circle-opacity':0}});
    this.paintTunnels(id);
  }
  private removePrivateSource(id:string){for(const suffix of PRIVATE_SUFFIXES)if(this.map.getLayer(id+suffix))this.map.removeLayer(id+suffix);if(this.map.getSource(id))this.map.removeSource(id);}
  // ureten: opus: P9: only the newest createdAt per top-level GeoJSON "name" family is drawn; older packages stay stored (never deleted) and are reported inactive.
  // ureten: opus: one in-flight parse per sha256, shared by concurrent calls; the parse result is immutable and cached.
  private parsePackage(asset:LocalAsset):Promise<PrivatePackage>{
    const done=this.parsed.get(asset.sha256);if(done)return Promise.resolve(done);
    let pending=this.parsing.get(asset.sha256);
    if(!pending){
      pending=asset.blob.text().then(text=>{const raw=JSON.parse(text) as GeoJSON.FeatureCollection&{name?:unknown;createdAt?:unknown};const name=typeof raw.name==='string'?raw.name:'',features=raw.features.map(f=>personalFeature(f,{id:name||asset.id,label:name||asset.name}));this.privateParses++;if(!this.destroyed)this.map.getContainer().dataset.privateParses=String(this.privateParses);const data:PrivatePackage={name,createdAt:typeof raw.createdAt==='string'?raw.createdAt:'',features,mapData:{type:'FeatureCollection',features:features.map(mapFeature)}};if(!this.destroyed&&this.parseTargets.has(asset.sha256))this.parsed.set(asset.sha256,data);return data;}).finally(()=>this.parsing.delete(asset.sha256));
      this.parsing.set(asset.sha256,pending);
    }
    return pending;
  }
  // ureten: opus: F4 family choice reads only package headers (stored at import, or the first 256 KB of the file); a package is
  // parsed only when it is the active one of its name family. An inactive older package is never parsed at startup.
  private async headerOf(asset:LocalAsset):Promise<{name:string;createdAt:string}>{
    if(typeof asset.packageName==='string')return {name:asset.packageName,createdAt:asset.packageCreatedAt??''};
    const known=this.headers.get(asset.sha256)??this.parsed.get(asset.sha256);if(known)return {name:known.name,createdAt:known.createdAt};
    const head=packageHeader(await asset.blob.slice(0,262144).text());let result={name:head.name,createdAt:head.createdAt};
    if(!head.complete){const data=await this.parsePackage(asset);result={name:data.name,createdAt:data.createdAt};}
    this.headers.set(asset.sha256,result);return result;
  }
  // Returns null when a newer call started meanwhile: the stale call changes nothing on the map or in the app.
  async loadPrivateData(assets:LocalAsset[]):Promise<PrivateLoad|null>{
    const gen=++this.loadGen;
    const geo=assets.filter(a=>a.kind==='geojson');const heads:{asset:LocalAsset;head:{name:string;createdAt:string}}[]=[];
    this.parseTargets=new Set(geo.map(a=>a.sha256));
    for(const asset of geo){const head=await this.headerOf(asset);if(gen!==this.loadGen||this.destroyed)return null;heads.push({asset,head});}
    const time=(e:typeof heads[number])=>{const t=Date.parse(e.head.createdAt);return Number.isFinite(t)?t:Date.parse(e.asset.createdAt)||0;};
    const newest=new Map<string,typeof heads[number]>();
    for(const e of heads){const key=e.head.name?'name:'+e.head.name:'asset:'+e.asset.id,current=newest.get(key);if(!current||time(e)>time(current)||(time(e)===time(current)&&e.asset.createdAt>current.asset.createdAt))newest.set(key,e);}
    const chosen=new Set(newest.values()),entries:{asset:LocalAsset;data:PrivatePackage}[]=[];
    this.parseTargets=new Set([...chosen].map(e=>e.asset.sha256));
    for(const e of heads)if(chosen.has(e)){const data=await this.parsePackage(e.asset);if(gen!==this.loadGen||this.destroyed)return null;entries.push({asset:e.asset,data});}
    if(gen!==this.loadGen)return null;
    if(this.destroyed)return {collection:{type:'FeatureCollection',features:[]},packages:[]};
    // Only drawn packages stay parsed in memory; removed and inactive ones are dropped (headers are tiny and kept).
    const activeShas=new Set(entries.map(e=>e.asset.sha256)),shas=new Set(geo.map(a=>a.sha256));for(const key of this.parsed.keys())if(!activeShas.has(key))this.parsed.delete(key);for(const key of this.headers.keys())if(!shas.has(key))this.headers.delete(key);
    const active=entries;
    const packages=heads.map(e=>{const data=chosen.has(e)?entries.find(x=>x.asset===e.asset)?.data:undefined;return {assetId:e.asset.id,name:e.head.name,createdAt:e.head.createdAt||e.asset.createdAt,features:data?data.features.length:null,active:!!data};});
    const signature=active.map(e=>e.asset.id+':'+e.asset.sha256).sort().join('|');
    if(signature!==this.privateSignature){
      this.privateSignature=signature;const ids=new Set(active.map(e=>'private-'+e.asset.id));
      for(const id of this.privateIds)if(!ids.has(id))this.removePrivateSource(id);
      this.privateIds=this.privateIds.filter(id=>ids.has(id));this.activePrivate.clear();
      for(const e of active){const id='private-'+e.asset.id;this.activePrivate.set(id,{assetId:e.asset.id,data:e.data});this.addPrivateSource(id,e.data.mapData);}
      if(this.privateIds.length)this.ensureHoverLayers();
      this.privateFeatures=active.flatMap(e=>e.data.features);this.privateIndex=new Map(this.privateFeatures.map(f=>[String(f.properties?.id??f.id),f]));
      this.privateCollection={type:'FeatureCollection',features:this.privateFeatures};this.hoverId='\u0000';this.setHover('');this.setSelected(this.privateIndex.has(this.selectedId)?this.selectedId:'');
      this.applyPrivateLayers();this.map.getContainer().dataset.privatePackages=String(active.length);this.syncImages();
    }
    return {collection:this.privateCollection,packages};
  }
  isPrivateActive(assetId:string){return [...this.activePrivate.values()].some(e=>e.assetId===assetId);}
  // ureten: opus: prefer = a public point (the official museum entry) to open at a readable zoom on small screens,
  // used only when it lies inside the package; otherwise the whole package is fitted.
  // ureten: opus: F4 every geometry type counts (Point, LineString, Polygon, Multi*, GeometryCollection), and the result says why it did not move.
  focusPrivate(assetId:string,padding:MapPadding=60,prefer?:{center:[number,number];zoom:number}):FocusResult{const entry=[...this.activePrivate.values()].find(e=>e.assetId===assetId);if(!entry)return 'inactive';const box=new maplibregl.LngLatBounds();
    const visit=(x:unknown)=>{if(!Array.isArray(x))return;if(typeof x[0]==='number'&&typeof x[1]==='number'){if(Number.isFinite(x[0])&&Number.isFinite(x[1]))box.extend([x[0],x[1]]);}else x.forEach(visit);};
    const geometry=(g:GeoJSON.Geometry|null|undefined):void=>{if(!g)return;if(g.type==='GeometryCollection')g.geometries.forEach(geometry);else visit(g.coordinates);};
    for(const f of entry.data.features)geometry(f.geometry);if(box.isEmpty())return 'empty';
    // easeTo({padding}) would change the map's padding for good; an offset moves the point into the padded window once.
    if(prefer&&box.contains(prefer.center)){const p=this.safePadding(padding),e=typeof p==='number'?{top:p,bottom:p,left:p,right:p}:p;this.map.easeTo({center:prefer.center,zoom:prefer.zoom,offset:[(e.left-e.right)/2,(e.top-e.bottom)/2],duration:450});return true;}
    this.map.fitBounds(box,{padding:this.safePadding(padding),maxZoom:16,duration:450});return true;}
  // ureten: opus: P5: one "Girişler" switch drives official + historical access; other points follow the underground switch and its filters.
  private applyPrivateLayers(){
    const v=this.visibility,f=this.vectorFilters,kinds:string[]=[];if(f.places)kinds.push('room','feature');if(f.surface)kinds.push('surface');
    const group=['coalesce',['get','accessGroup'],''],isPoint=['==',['geometry-type'],'Point'];
    const source=f.sourceIds==null?true:['in',['coalesce',['get','sourceId'],'unattributed'],['literal',f.sourceIds]];
    const point=ex(['all',source,isPoint,['case',['!=',group,''],v.access,v.underground?['in',['coalesce',['get','kind'],'feature'],['literal',kinds]]:false]]);
    const access=ex(['all',source,isPoint,['!=',group,''],['!=',group,'user'],v.access]);
    // Touch target: access records and publisher-matched/historical room points (not the 800+ small plan notes).
    const hit=ex(['all',source,isPoint,['case',['!=',group,''],v.access,['==',['get','kind'],'room'],v.underground&&f.places,false]]);
    const lines=v.underground&&f.lines;
    // ureten: opus: level filter on lines only; a line without sourceLevel counts as "unknown" (Belirsiz).
    const level=['match',['get','sourceLevel'],'superieur','superieur','inferieur','inferieur','unknown'];
    const lineFilter=ex(['all',source,['==',['geometry-type'],'LineString'],['in',level,['literal',sourceLevels.filter(l=>f.levels[l])]]]);
    const label=ex(['all',source,isPoint,['==',['get','namedPlace'],true],v.underground&&f.places]);
    for(const id of this.privateIds){
      if(!this.map.getLayer(id+'-point'))continue;
      this.map.setFilter(id+'-point',point);this.map.setFilter(id+'-symbol',access);this.map.setFilter(id+'-hit',hit);this.map.setFilter(id+'-label',label);
      const user=ex(['all',source,isPoint,['==',group,'user'],v.access]);for(const s of ['-user-star','-user-label']){this.map.setFilter(id+s,user);this.showLayer(id+s,v.access);}
      this.map.setFilter(id+'-user-direction',ex(['all',user,['has','cameraHeadingDeg']]));this.showLayer(id+'-user-direction',v.access);
      this.map.setFilter(id+'-area',ex(['all',source,['==',['geometry-type'],'Polygon']]));
      this.map.setFilter(id+'-water',ex(['all',point,['has','waterMark']]));this.map.setFilter(id+'-water-line',ex(['all',lineFilter,['has','waterMark']]));
      this.showLayer(id+'-water',f.water!==false);this.showLayer(id+'-water-line',lines&&f.water!==false);
      for(const s of ['-band','-casing','-line'])this.map.setFilter(id+s,lineFilter);
      for(const s of ['-point','-symbol','-hit'])this.showLayer(id+s,v.access||v.underground);this.showLayer(id+'-label',v.underground&&f.places);
      for(const s of ['-area','-casing','-line'])this.showLayer(id+s,lines);this.showLayer(id+'-band',lines&&f.band);
    }
    const node=this.map.getContainer();node.dataset.bandVisible=String(lines&&f.band&&this.privateIds.length>0);node.dataset.lineLevels=sourceLevels.filter(l=>f.levels[l]).join(',');
  }
  setVectorFilters(filters:VectorFilters){
    this.vectorFilters=filters;this.applyPrivateLayers();this.syncImages();
  }
  async pmtilesMetadata(asset:LocalAsset) {
    const archive=new PMTiles(new FileSource(new File([asset.blob],asset.sha256+'.pmtiles')));
    await archive.getHeader();const metadata=await archive.getMetadata();protocol.add(archive);
    return {url:`pmtiles://${archive.source.getKey()}`,metadata};
  }
  async loadExploration(data:GeoJSON.FeatureCollection){
    await this.ready();this.exploration=data;this.interactions.setFeatures(data);
    if(this.map.getSource('exploration'))(this.map.getSource('exploration') as GeoJSONSource).setData(data);
    else{
      this.map.addSource('exploration',{type:'geojson',data});
      this.map.addLayer({id:'explore-rooms',type:'circle',source:'exploration',filter:['==',['get','kind'],'room'],paint:{'circle-radius':['interpolate',['linear'],['zoom'],11,4,16,8],'circle-color':'#b2693f','circle-stroke-width':2,'circle-stroke-color':'#ffffff'}});
      this.map.addLayer({id:'explore-access',type:'circle',source:'exploration',filter:['==',['get','kind'],'access'],paint:{'circle-radius':8,'circle-color':'#3d719b','circle-stroke-width':2,'circle-stroke-color':'#ffffff'}});
    }
    this.setVisibility(this.visibility);
  }
  // ureten: opus: photos (personal first, then public) take precedence over 3B scan posters on room markers.
  setRoomMedia(rooms:RoomMedia[],local:Record<string,string>,photos:Record<string,PhotoView[]>={}){this.interactions.setMedia(rooms,local,photos);}
  setVisibility(value:Partial<typeof this.visibility>){
    this.visibility={...this.visibility,...value};
    const v=this.visibility;this.interactions.setVisibility(v);
    for(const [id,visible] of [['surface-areas',(v.greens||v.surfaceWater)&&this.basemap!=='satellite'],['surface-roads',v.surface&&!this.regional&&this.basemap!=='satellite'],['region-road-casing',v.surface&&this.basemap!=='satellite'],['region-roads',v.surface],['region-road-labels',v.surface],['region-buildings',v.buildings&&!this.spatial&&this.basemap!=='satellite'],['region-city',v.buildings&&this.spatial],['igc-sheets',v.sheets],['igc-outline',v.sheets],['explore-rooms',v.rooms],['explore-access',v.access],['personal-points',v.personal]] as [string,boolean][])this.showLayer(id,visible);
    // The old municipal polygons are controlled too, so switching off a class does not leave a duplicate underneath.
    if(this.map.getLayer('surface-areas'))this.map.setFilter('surface-areas',ex(['in',['get','kind'],['literal',[...(v.greens?['park']:[]),...(v.surfaceWater?['water']:[])]]]));
    for(const suffix of ['vegetation','park','cemetery','sports','protected'])this.showLayer('landcover-'+suffix,v.greens&&this.basemap!=='satellite');
    for(const suffix of ['water','water-body'])this.showLayer('landcover-'+suffix,v.surfaceWater&&this.basemap!=='satellite');
    this.applyPrivateLayers();
    this.surfaceLabels.forEach(l=>l.getElement().style.display=v.surface?'':'none');this.syncImages();
  }
  async setBasemap(value:'light'|'dark'|'satellite'){
    this.basemap=value;const dark=value==='dark';const m=this.map;
    if(m.getLayer('background'))m.setPaintProperty('background','background-color',dark?'#171c23':'#ececf0');
    if(m.getLayer('surface-roads'))m.setPaintProperty('surface-roads','line-color',dark?'#768591':'#a9abb0');
    if(m.getLayer('surface-areas'))m.setPaintProperty('surface-areas','fill-color',['match',['get','kind'],'water',dark?'#284b60':'#c7dbe9',dark?'#2b493b':'#d7dfd5']);
    for(const [suffix,light,night] of [['vegetation','#bed3b4','#294d3b'],['park','#d6d7b7','#3d4d36'],['cemetery','#c9d0bd','#424d3e'],['sports','#d9cfb6','#4e4937'],['water','#a9cddd','#27566d'],['water-body','#a9cddd','#27566d']])if(m.getLayer('landcover-'+suffix))m.setPaintProperty('landcover-'+suffix,'fill-color',dark?night:light);
    if(m.getLayer('region-roads')){m.setPaintProperty('region-roads','line-color',dark?'#6b7a81':'#fffdf8');m.setPaintProperty('region-road-casing','line-color',dark?'#293b45':'#c6c3ba');m.setPaintProperty('region-road-labels','text-color',dark?'#d9e4e7':'#5c6862');m.setPaintProperty('region-road-labels','text-halo-color',dark?'#172127':'#fffdf8');m.setPaintProperty('region-buildings','fill-color',dark?'#3e4b50':'#c2b9a7');
      // ureten: opus: F4 satellite: the aerial photo stays readable. The 2D building fill and the white road casing are hidden (setVisibility);
      // roads remain only as thin translucent lines and the names get a dark halo. The 3D extrusion still follows the user's Binalar choice.
      const sat=value==='satellite';m.setPaintProperty('region-roads','line-opacity',sat?.38:1);m.setPaintProperty('region-roads','line-width',ex(sat?['interpolate',['linear'],['zoom'],9,.3,13,.6,17,1.6]:['interpolate',['linear'],['zoom'],9,.4,13,1.2,17,4.5]));
      if(sat){m.setPaintProperty('region-road-labels','text-color','#f6f3ea');m.setPaintProperty('region-road-labels','text-halo-color','#1d2427');}}
    this.surfaceLabels.forEach(l=>{Object.assign(l.getElement().style,{color:dark?'#cad4d9':'#5c6862',textShadow:dark?'0 1px 3px #10151b':'0 1px 3px #fff'});});
    // ureten: opus: tunnel ink re-tinted per basemap (dark/satellite: bright core on dark casing).
    for(const id of this.privateIds)this.paintTunnels(id);
    this.setVisibility(this.visibility);
    if(value==='satellite'&&!this.ortho){const response=await fetch('./data/orthophoto.json');if(!response.ok)throw new Error('Yerel hava fotoğrafı kataloğu açılamadı.');this.ortho=await response.json();}
    if(!this.destroyed)this.syncImages();
  }
  setGalleryOpacity(value:number){this.galleryOpacity=Math.max(0,Math.min(1,value));for(const [key,entry] of this.imageSources)if(key.startsWith('gallery-'))this.map.setPaintProperty(entry.layer,'raster-opacity',this.galleryOpacity);}
  async loadRasterAssets(assets:LocalAsset[]){
    const signature=assets.map(a=>a.id+':'+JSON.stringify(a.mapBounds)).sort().join('|');if(signature===this.rasterSignature)return;
    // ureten: codex: reinstalling unchanged image bytes with corrected bounds must update the existing source too.
    const previous=new Map(this.rasterAssets.map(a=>[a.id,JSON.stringify(a.mapBounds)]));
    for(const asset of assets){if(!asset.mapBounds||!previous.has(asset.id)||previous.get(asset.id)===JSON.stringify(asset.mapBounds))continue;
      const entry=this.imageSources.get('gallery-'+asset.id),[w,s,e,n]=asset.mapBounds;
      if(entry)(this.map.getSource(entry.source) as maplibregl.ImageSource|undefined)?.setCoordinates([[w,n],[e,n],[e,s],[w,s]]);
    }
    this.rasterSignature=signature;this.rasterAssets=assets;
    const ids=new Set(assets.map(a=>a.id));for(const [id,url] of this.rasterUrls)if(!ids.has(id)){URL.revokeObjectURL(url);this.rasterUrls.delete(id);}
    if(!this.destroyed)this.syncImages();
  }
  private syncImages(){
    if(this.destroyed||!this.map.isStyleLoaded())return;
    const bounds=this.map.getBounds(),zoom=this.map.getZoom();const wanted=new Map<string,{url:string;bounds:[number,number,number,number];gallery:boolean}>();
    const intersects=(b:[number,number,number,number])=>b[0]<bounds.getEast()&&b[2]>bounds.getWest()&&b[1]<bounds.getNorth()&&b[3]>bounds.getSouth();
    if(this.basemap==='satellite'&&this.ortho)for(const a of this.ortho.assets){if(a.overview!==(zoom<12.5)||!intersects(a.bounds))continue;wanted.set('sat-'+a.id,{url:a.url,bounds:a.bounds,gallery:false});}
    if(this.visibility.galleries)for(const a of [...this.rasterAssets].sort((a,b)=>(a.category?.includes('detail')?2:a.category?.includes('overview')?0:1)-(b.category?.includes('detail')?2:b.category?.includes('overview')?0:1))){if(!a.mapBounds||!intersects(a.mapBounds))continue;if(zoom<12.5&&a.category?.startsWith('igc-raster')&&!a.category?.includes('overview'))continue;if(zoom>=12.5&&a.category?.includes('overview'))continue;if(zoom<15&&a.category?.includes('detail'))continue;let url=this.rasterUrls.get(a.id);if(!url){url=URL.createObjectURL(a.blob);this.rasterUrls.set(a.id,url);}wanted.set('gallery-'+a.id,{url,bounds:a.mapBounds,gallery:true});}
    for(const [key,e] of this.imageSources)if(!wanted.has(key)){if(this.map.getLayer(e.layer))this.map.removeLayer(e.layer);if(this.map.getSource(e.source))this.map.removeSource(e.source);this.imageSources.delete(key);}
    for(const [key,a] of wanted){if(this.imageSources.has(key))continue;const id='image-'+key,[w,s,e,n]=a.bounds;this.map.addSource(id,{type:'image',url:a.url,coordinates:[[w,n],[e,n],[e,s],[w,s]]});
      // ureten: opus: P12: aligned plans sit above the building fill but under the road casing.
      const before=a.gallery?this.map.getLayer('region-road-casing')?'region-road-casing':this.map.getLayer('surface-roads')?'surface-roads':undefined:this.map.getLayer('surface-areas')?'surface-areas':undefined;
      this.map.addLayer({id:id+'-layer',type:'raster',source:id,paint:{'raster-opacity':a.gallery?this.galleryOpacity:1,'raster-fade-duration':0}},before);this.imageSources.set(key,{source:id,layer:id+'-layer'});
    }
    const node=this.map.getContainer(),center=this.map.getCenter();node.dataset.mapBasemap=this.basemap;node.dataset.mapPitch=String(this.map.getPitch());node.dataset.regionReady=String(this.regional);node.dataset.personalFeatures=String(this.privateFeatures.length);node.dataset.mapCenter=JSON.stringify([center.lng,center.lat]);node.dataset.mapZoom=String(zoom);node.dataset.surfaceFeatures=String((this.map.getSource('surface') as GeoJSONSource|undefined)?this.surfaceFeatureCount:0);node.dataset.satelliteLayers=String([...this.imageSources.keys()].filter(k=>k.startsWith('sat-')).length);node.dataset.galleryLayers=String([...this.imageSources.keys()].filter(k=>k.startsWith('gallery-')).length);
    // ureten: opus: P13: whole-screen queryRenderedFeatures counters only under automated QA (navigator.webdriver) or ?qa; ordinary phones skip them on every idle/moveend.
    if(!QA)return;
    const count=(layers:string[],filter?:maplibregl.FilterSpecification)=>{const present=layers.filter(id=>this.map.getLayer(id));return present.length?this.map.queryRenderedFeatures(undefined,{layers:present,...(filter?{filter}:{})}).length:0;};
    node.dataset.regionRoadsRendered=String(count(['region-roads']));node.dataset.buildingsRendered=String(this.map.getLayer('region-city')?count(['region-city','region-buildings']):0);node.dataset.vectorPointsRendered=String(count(this.privateIds.map(id=>id+'-point')));node.dataset.vectorLinesRendered=String(count(this.privateIds.map(id=>id+'-line')));const accessLayers=this.privateIds.map(id=>id+'-point').filter(id=>this.map.getLayer(id));node.dataset.accessPointsRendered=String(accessLayers.length?new Set(this.map.queryRenderedFeatures(undefined,{layers:accessLayers,filter:['!=',['coalesce',['get','accessGroup'],''],'']}).map(f=>String(f.properties?.id))).size:0);
    // ureten: opus: QA only: unique rendered plan lines per source level and ink class, and rendered place labels.
    const lineLayers=this.privateIds.map(id=>id+'-line').filter(id=>this.map.getLayer(id)),byLevel:Record<string,Set<string>>={},byInk:Record<string,Set<string>>={};
    if(lineLayers.length)for(const f of this.map.queryRenderedFeatures(undefined,{layers:lineLayers})){const p=f.properties??{},key=String(p.id);(byLevel[String(p.sourceLevel??'unknown')]??=new Set()).add(key);(byInk[String(p.inkClass??'grey')]??=new Set()).add(key);}
    node.dataset.linesByLevel=JSON.stringify(Object.fromEntries(Object.entries(byLevel).map(([k,s])=>[k,s.size])));node.dataset.linesByInk=JSON.stringify(Object.fromEntries(Object.entries(byInk).map(([k,s])=>[k,s.size])));
    const labelLayers=this.privateIds.map(id=>id+'-label').filter(id=>this.map.getLayer(id));node.dataset.placeLabelsRendered=String(labelLayers.length?new Set(this.map.queryRenderedFeatures(undefined,{layers:labelLayers}).map(f=>String(f.properties?.id))).size:0);node.dataset.surfaceRendered=String(this.map.getLayer('surface-roads')?count(['surface-roads','surface-areas']):0);
  }
  fitExploration(undergroundOnly=false){
    const features=this.exploration.features.filter(f=>f.properties?.kind==='room'?this.visibility.rooms:this.visibility.access);
    const all=undergroundOnly?this.privateFeatures:[...features,...this.sheetFeatures,...(this.visibility.underground?this.privateFeatures:[])];
    const points:number[][]=[];const visit=(x:unknown)=>{if(!Array.isArray(x))return;if(typeof x[0]==='number'&&typeof x[1]==='number')points.push(x as number[]);else x.forEach(visit);};for(const f of all)if(f.geometry.type!=='GeometryCollection')visit(f.geometry.coordinates);
    if(!undergroundOnly&&this.visibility.galleries)for(const a of this.rasterAssets)if(a.mapBounds){const [w,s,e,n]=a.mapBounds;points.push([w,s],[e,n]);}
    if(!points.length)return;const bounds=new maplibregl.LngLatBounds();points.forEach(p=>bounds.extend([p[0],p[1]]));this.map.fitBounds(bounds,{padding:65,maxZoom:16,duration:450});
  }
  destroy(){this.destroyed=true;if(this.moveFrame)cancelAnimationFrame(this.moveFrame);this.parsed.clear();this.interactions.destroy();for(const url of this.rasterUrls.values())URL.revokeObjectURL(url);this.rasterUrls.clear();this.map.remove();}
}
