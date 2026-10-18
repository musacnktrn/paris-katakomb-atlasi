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
  constructor(container:HTMLElement,onSelect:(properties:Record<string,unknown>)=>void) {
    if(!protocolAdded){maplibregl.addProtocol('pmtiles',protocol.tile);protocolAdded=true;}
    this.map=new maplibregl.Map({container,center:[2.326,48.833],zoom:13,attributionControl:{compact:false},style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#f2f1eb'}}]}});
    this.map.addControl(new maplibregl.NavigationControl(),'top-right');
    this.map.on('click','igc-sheets',e=>{const p=e.features?.[0]?.properties;if(p)onSelect(p);});
  }
  async ready(){if(!this.map.isStyleLoaded())await new Promise<void>(r=>this.map.once('load',()=>r()));}
  async loadBuiltins(sheets:GeoJSON.FeatureCollection,surface:GeoJSON.FeatureCollection){
    await this.ready();const m=this.map;
    m.addSource('surface',{type:'geojson',data:surface,attribution:'© OpenStreetMap contributors · ODbL 1.0'});
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
      labels.forEach(l=>l.remove());labels=[];const used=new Set<string>();const bounds=m.getBounds();
      for(const f of candidates){
        const name=String(f.properties!.name);if(used.has(name))continue;
        const line=(f.geometry as GeoJSON.LineString).coordinates,p=line[Math.floor(line.length/2)];
        if(!bounds.contains([p[0],p[1]]))continue;used.add(name);
        const el=document.createElement('span');el.textContent=name;el.className='atlas-street-label';
        Object.assign(el.style,{font:'11px system-ui',color:'#5c6862',textShadow:'0 1px 3px #fff,0 -1px 3px #fff',pointerEvents:'none'});
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
  filterSheets(features:GeoJSON.Feature[]){(this.map.getSource('igc') as GeoJSONSource|undefined)?.setData({type:'FeatureCollection',features});}
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
  destroy(){this.map.remove();}
}
