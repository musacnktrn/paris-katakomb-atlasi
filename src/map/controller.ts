// ureten: codex — map instance survives UI filter/detail changes.
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
// MapLibre 6 requires an explicit bundled worker URL with Vite.
maplibregl.setWorkerUrl(workerUrl);
import type { Map as GLMap, GeoJSONSource } from 'maplibre-gl';
import type * as GeoJSON from 'geojson';
import { FileSource, PMTiles, Protocol } from 'pmtiles';
import type { LocalAsset } from '../core/storage';
const protocol=new Protocol();let protocolAdded=false;
export class AtlasMap {
  readonly map:GLMap;
  private basemap:'light'|'dark'|'satellite'='light';
  private visibility={surface:true,sheets:true,rooms:true,access:true,galleries:false,personal:true};
  private galleryOpacity=.8;
  private exploration:GeoJSON.FeatureCollection={type:'FeatureCollection',features:[]};
  private sheetFeatures:GeoJSON.Feature[]=[];
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
    this.map.addControl(new maplibregl.NavigationControl(),'top-right');
    this.map.on('click','igc-sheets',e=>{const p=e.features?.[0]?.properties;if(p)onSelect(p);});
    this.map.on('moveend',()=>this.syncImages());
    this.map.on('idle',()=>this.syncImages());
    this.map.on('click',e=>{const layers=['explore-rooms','explore-access'].filter(id=>this.map.getLayer(id));if(!layers.length)return;const f=this.map.queryRenderedFeatures([[e.point.x-5,e.point.y-5],[e.point.x+5,e.point.y+5]],{layers})[0];if(f?.properties)onSelect({...f.properties,id:f.properties.id??f.id});});
  }
  async ready(){if(!this.map.isStyleLoaded())await new Promise<void>(r=>this.map.once('idle',()=>r()));}
  async loadBuiltins(sheets:GeoJSON.FeatureCollection,surface:GeoJSON.FeatureCollection){
    await this.ready();this.sheetFeatures=sheets.features;const m=this.map;
    m.addSource('surface',{type:'geojson',data:surface,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL 1.0</a>'});
    m.addLayer({id:'surface-areas',type:'fill',source:'surface',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':['match',['get','kind'],'water','#b9ced0','#cdd8c7'],'fill-opacity':0.75}});
    m.addLayer({id:'surface-roads',type:'line',source:'surface',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':'#aca99d','line-width':1.4}});
    m.addSource('igc',{type:'geojson',data:sheets,attribution:'Ville de Paris / IGC · Pafta dizini; galeri geometrisi değildir'});
    m.addLayer({id:'igc-sheets',type:'fill',source:'igc',paint:{'fill-color':'#425c81','fill-opacity':0.06}});
    m.addLayer({id:'igc-outline',type:'line',source:'igc',paint:{'line-color':'#52796a','line-width':1,'line-opacity':0.65}});
    m.addSource('personal',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    m.addLayer({id:'personal-points',type:'circle',source:'personal',paint:{'circle-radius':6,'circle-color':'#9b5436'}});
    // Offline street labels use actual OSM way vertices/names and DOM text,
    // without a font/glyph server or invented neighbourhood coordinates.
    const candidates=surface.features.filter(f=>f.geometry.type==='LineString'&&f.properties?.name)
      .sort((a,b)=>(b.geometry as GeoJSON.LineString).coordinates.length-(a.geometry as GeoJSON.LineString).coordinates.length);
    let labels:maplibregl.Marker[]=[];
    const updateLabels=()=>{
      labels.forEach(l=>l.remove());labels=[];this.surfaceLabels=labels;const used=new Set<string>();const bounds=m.getBounds();
      for(const f of candidates){
        const name=String(f.properties!.name);if(used.has(name))continue;
        const line=(f.geometry as GeoJSON.LineString).coordinates,p=line[Math.floor(line.length/2)];
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
  focusFeature(feature:GeoJSON.Feature){
    const points:number[][]=[];
    const visit=(x:unknown)=>{if(!Array.isArray(x))return;if(typeof x[0]==='number'&&typeof x[1]==='number')points.push(x as number[]);else x.forEach(visit);};
    if(feature.geometry.type==='GeometryCollection')return;
    visit(feature.geometry.coordinates);if(!points.length)return;
    const box=new maplibregl.LngLatBounds();points.forEach(p=>box.extend([p[0],p[1]]));
    this.map.fitBounds(box,{padding:60,maxZoom:17,duration:450});
  }
  addGeoJSON(id:string,data:GeoJSON.FeatureCollection){
    if(this.map.getSource(id))return;
    this.map.addSource(id,{type:'geojson',data});
    this.map.addLayer({id:id+'-line',type:'line',source:id,paint:{'line-color':'#9b5436','line-width':2}});
    this.map.addLayer({id:id+'-point',type:'circle',source:id,filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':5,'circle-color':'#9b5436'}});
  }
  async pmtilesMetadata(asset:LocalAsset) {
    const archive=new PMTiles(new FileSource(new File([asset.blob],asset.sha256+'.pmtiles')));
    await archive.getHeader();const metadata=await archive.getMetadata();protocol.add(archive);
    return {url:`pmtiles://${archive.source.getKey()}`,metadata};
  }
  async loadExploration(data:GeoJSON.FeatureCollection){
    await this.ready();this.exploration=data;
    if(this.map.getSource('exploration'))(this.map.getSource('exploration') as GeoJSONSource).setData(data);
    else{
      this.map.addSource('exploration',{type:'geojson',data});
      this.map.addLayer({id:'explore-rooms',type:'circle',source:'exploration',filter:['==',['get','kind'],'room'],paint:{'circle-radius':['interpolate',['linear'],['zoom'],11,4,16,8],'circle-color':'#b2693f','circle-stroke-width':2,'circle-stroke-color':'#ffffff'}});
      this.map.addLayer({id:'explore-access',type:'circle',source:'exploration',filter:['==',['get','kind'],'access'],paint:{'circle-radius':8,'circle-color':'#3d719b','circle-stroke-width':2,'circle-stroke-color':'#ffffff'}});
    }
    this.setVisibility(this.visibility);
  }
  setVisibility(value:Partial<typeof this.visibility>){
    this.visibility={...this.visibility,...value};
    const v=this.visibility;
    for(const [id,visible] of [['surface-areas',v.surface&&this.basemap!=='satellite'],['surface-roads',v.surface&&this.basemap!=='satellite'],['igc-sheets',v.sheets],['igc-outline',v.sheets],['explore-rooms',v.rooms],['explore-access',v.access],['personal-points',v.personal]] as [string,boolean][])this.showLayer(id,visible);
    this.surfaceLabels.forEach(l=>l.getElement().style.display=v.surface?'':'none');this.syncImages();
  }
  async setBasemap(value:'light'|'dark'|'satellite'){
    this.basemap=value;const dark=value==='dark';const m=this.map;
    if(m.getLayer('background'))m.setPaintProperty('background','background-color',dark?'#171c23':'#ececf0');
    if(m.getLayer('surface-roads'))m.setPaintProperty('surface-roads','line-color',dark?'#768591':'#a9abb0');
    if(m.getLayer('surface-areas'))m.setPaintProperty('surface-areas','fill-color',['match',['get','kind'],'water',dark?'#284b60':'#c7dbe9',dark?'#2b493b':'#d7dfd5']);
    this.surfaceLabels.forEach(l=>{Object.assign(l.getElement().style,{color:dark?'#cad4d9':'#5c6862',textShadow:dark?'0 1px 3px #10151b':'0 1px 3px #fff'});});
    this.setVisibility(this.visibility);
    if(value==='satellite'&&!this.ortho){const response=await fetch('./data/orthophoto.json');if(!response.ok)throw new Error('Yerel hava fotoğrafı kataloğu açılamadı.');this.ortho=await response.json();}
    if(!this.destroyed)this.syncImages();
  }
  setGalleryOpacity(value:number){this.galleryOpacity=Math.max(0,Math.min(1,value));for(const [key,entry] of this.imageSources)if(key.startsWith('gallery-'))this.map.setPaintProperty(entry.layer,'raster-opacity',this.galleryOpacity);}
  async loadRasterAssets(assets:LocalAsset[]){
    const signature=assets.map(a=>a.id+':'+JSON.stringify(a.mapBounds)).sort().join('|');if(signature===this.rasterSignature)return;
    this.rasterSignature=signature;this.rasterAssets=assets;
    const ids=new Set(assets.map(a=>a.id));for(const [id,url] of this.rasterUrls)if(!ids.has(id)){URL.revokeObjectURL(url);this.rasterUrls.delete(id);}
    if(!this.destroyed)this.syncImages();
  }
  private syncImages(){
    if(this.destroyed||!this.map.isStyleLoaded())return;
    const bounds=this.map.getBounds(),zoom=this.map.getZoom();const wanted=new Map<string,{url:string;bounds:[number,number,number,number];gallery:boolean}>();
    const intersects=(b:[number,number,number,number])=>b[0]<bounds.getEast()&&b[2]>bounds.getWest()&&b[1]<bounds.getNorth()&&b[3]>bounds.getSouth();
    if(this.basemap==='satellite'&&this.ortho)for(const a of this.ortho.assets){if(a.overview!==(zoom<12.5)||!intersects(a.bounds))continue;wanted.set('sat-'+a.id,{url:a.url,bounds:a.bounds,gallery:false});}
    if(this.visibility.galleries)for(const a of [...this.rasterAssets].sort((a,b)=>(a.category?.includes('detail')?2:a.category?.includes('overview')?0:1)-(b.category?.includes('detail')?2:b.category?.includes('overview')?0:1))){if(!a.mapBounds||!intersects(a.mapBounds))continue;if(zoom<12.5&&!a.category?.includes('overview'))continue;if(zoom>=12.5&&a.category?.includes('overview'))continue;if(zoom<15&&a.category?.includes('detail'))continue;let url=this.rasterUrls.get(a.id);if(!url){url=URL.createObjectURL(a.blob);this.rasterUrls.set(a.id,url);}wanted.set('gallery-'+a.id,{url,bounds:a.mapBounds,gallery:true});}
    for(const [key,e] of this.imageSources)if(!wanted.has(key)){if(this.map.getLayer(e.layer))this.map.removeLayer(e.layer);if(this.map.getSource(e.source))this.map.removeSource(e.source);this.imageSources.delete(key);}
    for(const [key,a] of wanted){if(this.imageSources.has(key))continue;const id='image-'+key,[w,s,e,n]=a.bounds;this.map.addSource(id,{type:'image',url:a.url,coordinates:[[w,n],[e,n],[e,s],[w,s]]});
      const before=a.gallery?this.map.getLayer('igc-sheets')?'igc-sheets':undefined:this.map.getLayer('surface-areas')?'surface-areas':undefined;
      this.map.addLayer({id:id+'-layer',type:'raster',source:id,paint:{'raster-opacity':a.gallery?this.galleryOpacity:1,'raster-fade-duration':0}},before);this.imageSources.set(key,{source:id,layer:id+'-layer'});
    }
    const node=this.map.getContainer();node.dataset.mapBasemap=this.basemap;node.dataset.satelliteLayers=String([...this.imageSources.keys()].filter(k=>k.startsWith('sat-')).length);node.dataset.galleryLayers=String([...this.imageSources.keys()].filter(k=>k.startsWith('gallery-')).length);
  }
  fitExploration(){
    const features=this.exploration.features.filter(f=>f.properties?.kind==='room'?this.visibility.rooms:this.visibility.access);
    const all=[...features,...(this.visibility.sheets?this.sheetFeatures:[])];
    const points:number[][]=[];const visit=(x:unknown)=>{if(!Array.isArray(x))return;if(typeof x[0]==='number'&&typeof x[1]==='number')points.push(x as number[]);else x.forEach(visit);};for(const f of all)if(f.geometry.type!=='GeometryCollection')visit(f.geometry.coordinates);
    if(this.visibility.galleries)for(const a of this.rasterAssets)if(a.mapBounds){const [w,s,e,n]=a.mapBounds;points.push([w,s],[e,n]);}
    if(!points.length)return;const bounds=new maplibregl.LngLatBounds();points.forEach(p=>bounds.extend([p[0],p[1]]));this.map.fitBounds(bounds,{padding:65,maxZoom:16,duration:450});
  }
  destroy(){this.destroyed=true;for(const url of this.rasterUrls.values())URL.revokeObjectURL(url);this.rasterUrls.clear();this.map.remove();}
}
