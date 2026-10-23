// ureten: codex. Actual source polylines on explicitly schematic plates; never join endpoints or fabricate walls.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type * as GeoJSON from 'geojson';
import {planPaths,planProject,diagramY,knownBuildingHeight} from '../core/plan-geometry';
import {sourceLevelOf,isAccessRecord,type SourceLevel} from '../core/underground';
import {safeMarkerColor} from '../core/source-layers';
import {regionalBuildings} from './regional-geometry';
export type LayerSettings={gap:number;surface:boolean;buildings:boolean;guides:boolean;levels:Record<SourceLevel,boolean>;cut:boolean;axis:'x'|'z';position:number;band:number};
type Callbacks={onSelect:(feature:GeoJSON.Feature)=>void;onBuildingStatus:(text:string)=>void};
export function mountLayeredPlan(node:HTMLElement,features:GeoJSON.FeatureCollection,surface:GeoJSON.FeatureCollection,initial:LayerSettings,callbacks:Callbacks){
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.localClippingEnabled=true;node.append(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#162421');
 const camera=new THREE.PerspectiveCamera(45,1,1,100000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=20;controls.maxDistance=70000;
 const paths=planPaths(features),pointFeatures=features.features.filter(f=>f.geometry.type==='Point');
 const box={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
 function extend(position:GeoJSON.Position){const [x,z]=planProject(position);box.minX=Math.min(box.minX,x);box.maxX=Math.max(box.maxX,x);box.minZ=Math.min(box.minZ,z);box.maxZ=Math.max(box.maxZ,z);}
 for(const path of paths)for(const point of path.points)extend(point);
 const networkBox=Number.isFinite(box.minX)?{...box}:null;
 for(const f of pointFeatures)extend((f.geometry as GeoJSON.Point).coordinates);
 if(!Number.isFinite(box.minX))Object.assign(box,{minX:-1200,maxX:1200,minZ:-1200,maxZ:1200});
 box.minX-=150;box.maxX+=150;box.minZ-=150;box.maxZ+=150;
 const width=box.maxX-box.minX,depth=box.maxZ-box.minZ,cx=(box.minX+box.maxX)/2,cz=(box.minZ+box.maxZ)/2;
 const groups=new Map<SourceLevel,THREE.Group>(),pickables:THREE.Object3D[]=[];
 const clip1=new THREE.Plane(),clip2=new THREE.Plane();let settings=initial,disposed=false,frame=0;
 const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
 function segments(values:number[],color:string,opacity=1,dashed=false){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(values,3));geometries.push(geometry);
  const material=dashed?new THREE.LineDashedMaterial({color,transparent:true,opacity,dashSize:15,gapSize:12}):new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity});materials.push(material);
  const lines=new THREE.LineSegments(geometry,material);if(dashed)lines.computeLineDistances();return lines;
 }
 function inExtent(a:[number,number],b:[number,number]){return Math.max(a[0],b[0])>=box.minX&&Math.min(a[0],b[0])<=box.maxX&&Math.max(a[1],b[1])>=box.minZ&&Math.min(a[1],b[1])<=box.maxZ;}
 for(const level of ['superieur','inferieur','unknown'] as SourceLevel[]){
  const group=new THREE.Group();groups.set(level,group);scene.add(group);
  const batches=new Map<string,{values:number[];records:GeoJSON.Feature[]}>();
  for(const path of paths.filter(p=>p.level===level)){
   const batch=batches.get(path.color)??{values:[],records:[]};
   for(let i=1;i<path.points.length;i++){const a=planProject(path.points[i-1]),b=planProject(path.points[i]);batch.values.push(a[0],0,a[1],b[0],0,b[1]);batch.records.push(path.feature);}
   batches.set(path.color,batch);
  }
  for(const [color,batch] of batches){const lines=segments(batch.values,color);lines.userData.segmentFeatures=batch.records;group.add(lines);pickables.push(lines);}
  for(const category of ['user','access','other']){
   const points=pointFeatures.filter(f=>sourceLevelOf(f.properties)===level&&(f.properties?.kind==='user-entrance'?'user':isAccessRecord(f)?'access':'other')===category),positions:number[]=[],colors:number[]=[];
   for(const f of points){const [x,z]=planProject((f.geometry as GeoJSON.Point).coordinates);positions.push(x,1,z);const c=new THREE.Color(f.properties?.kind==='user-entrance'?safeMarkerColor(f.properties):isAccessRecord(f)?'#a7def2':'#e9b993');colors.push(c.r,c.g,c.b);}
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometries.push(geometry);
   const material=new THREE.PointsMaterial({vertexColors:true,size:category==='user'?6:category==='access'?3:1.5,sizeAttenuation:false});materials.push(material);const marks=new THREE.Points(geometry,material);marks.userData.pointFeatures=points;group.add(marks);pickables.push(marks);
  }
  const border=segments([box.minX,0,box.minZ,box.maxX,0,box.minZ,box.maxX,0,box.minZ,box.maxX,0,box.maxZ,box.maxX,0,box.maxZ,box.minX,0,box.maxZ,box.minX,0,box.maxZ,box.minX,0,box.minZ],level==='inferieur'?'#7898c6':'#71867b',.22);group.add(border);
 }
 const surfaceGroup=new THREE.Group();scene.add(surfaceGroup);const roadValues:number[]=[];
 for(const f of surface.features){if(f.properties?.kind!=='road')continue;const g=f.geometry,lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
  for(const line of lines)for(let i=1;i<line.length;i++){const a=planProject(line[i-1]),b=planProject(line[i]);if(inExtent(a,b))roadValues.push(a[0],0,a[1],b[0],0,b[1]);}
 }
 surfaceGroup.add(segments(roadValues,'#668477',.45));const buildingGroup=new THREE.Group();surfaceGroup.add(buildingGroup);
 const guideValues:number[]=[];const guides=segments(guideValues,'#809d96',.3,true);scene.add(guides);
 const selectedGeometry=new THREE.SphereGeometry(10,10,8),selectedMaterial=new THREE.MeshBasicMaterial({color:'#fff1cc'});geometries.push(selectedGeometry);materials.push(selectedMaterial);const highlight=new THREE.Mesh(selectedGeometry,selectedMaterial);highlight.visible=false;scene.add(highlight);
 const fit=(view:'perspective'|'top'|'side'='perspective',all=false)=>{const b=!all&&networkBox?networkBox:box,radius=Math.hypot(b.maxX-b.minX+300,b.maxZ-b.minZ+300,settings.gap*3)/2,dist=radius/Math.sin(camera.fov*Math.PI/360)*1.1;controls.target.set((b.minX+b.maxX)/2,-settings.gap*1.5,(b.minZ+b.maxZ)/2);camera.position.copy(controls.target).add((view==='top'?new THREE.Vector3(0,1,.001):view==='side'?new THREE.Vector3(1,.08,.001):new THREE.Vector3(.8,.8,1)).normalize().multiplyScalar(dist));controls.update();};
 const update=(s:LayerSettings)=>{
  settings=s;surfaceGroup.visible=s.surface;buildingGroup.visible=s.buildings;
  for(const [level,group] of groups){group.position.y=diagramY(level,s.gap);group.visible=s.levels[level];}
  const array:number[]=[];
  if(s.guides)for(const f of pointFeatures.filter(isAccessRecord)){
   const level=sourceLevelOf(f.properties);if(!s.levels[level])continue;const [x,z]=planProject((f.geometry as GeoJSON.Point).coordinates);array.push(x,0,z,x,diagramY(level,s.gap),z);
  }
  guides.geometry.setAttribute('position',new THREE.Float32BufferAttribute(array,3));guides.geometry.computeBoundingSphere();guides.computeLineDistances();guides.visible=s.guides;
  const lo=s.axis==='x'?box.minX:box.minZ,hi=s.axis==='x'?box.maxX:box.maxZ,coordinate=THREE.MathUtils.lerp(lo,hi,s.position/100);
  clip1.normal.set(s.axis==='x'?1:0,0,s.axis==='z'?1:0);clip1.constant=-coordinate+s.band/2;clip2.normal.copy(clip1.normal).negate();clip2.constant=coordinate+s.band/2;
  for(const material of materials){material.clippingPlanes=s.cut?[clip1,clip2]:[];material.needsUpdate=true;}
  highlight.visible=false;node.dataset.sectionEnabled=String(s.cut);node.dataset.sectionAxis=s.axis;node.dataset.clipPlanes=String(s.cut?2:0);node.dataset.levels=Object.entries(s.levels).filter(([,on])=>on).map(([level])=>level).join(',');node.dataset.diagramGap=String(s.gap);
 };
 const ray=new THREE.Raycaster();ray.params.Line={threshold:9};ray.params.Points={threshold:18};let down:{x:number;y:number}|null=null;
 const start=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};};
 const pick=(e:PointerEvent)=>{
  if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)return;const rect=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
  for(const hit of ray.intersectObjects(pickables,false)){
   if(!hit.object.parent?.visible||settings.cut&&(clip1.distanceToPoint(hit.point)<0||clip2.distanceToPoint(hit.point)<0))continue;
   const f=hit.object.userData.pointFeatures?.[hit.index??-1]??hit.object.userData.segmentFeatures?.[Math.floor((hit.index??-2)/2)];
   if(f){highlight.position.copy(hit.point);highlight.visible=true;callbacks.onSelect(f);break;}
  }
 };
 renderer.domElement.addEventListener('pointerdown',start);renderer.domElement.addEventListener('pointerup',pick);
 const resize=()=>{const w=node.clientWidth,h=node.clientHeight;renderer.setSize(w,h);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(node);resize();update(initial);fit();
 const controller=new AbortController();let buildingStarted=false;
 const loadBuildings=()=>{
  if(buildingStarted)return;buildingStarted=true;callbacks.onBuildingStatus('Cihazdaki IGN binaları hazırlanıyor…');
  const r=6378137,cos=Math.cos(48.835*Math.PI/180),bounds:[number,number,number,number]=[2.33+box.minX/(r*cos)*180/Math.PI,48.835-box.maxZ/r*180/Math.PI,2.33+box.maxX/(r*cos)*180/Math.PI,48.835-box.minZ/r*180/Math.PI];
  void regionalBuildings(bounds,controller.signal,(done,total)=>{if(!disposed)callbacks.onBuildingStatus('IGN bina karoları · '+done+' / '+total);}).then(result=>{
   if(disposed)return;const values:number[]=[],drawnIds=new Set<string>();
   for(const f of result.features){const height=knownBuildingHeight(f.properties);if(height===null)continue;const g=f.geometry,rings=g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?g.coordinates.flat():[];
    for(const ring of rings)for(let i=1;i<ring.length;i++){const a=planProject(ring[i-1]),b=planProject(ring[i]);if(inExtent(a,b)){values.push(a[0],height,a[1],b[0],height,b[1],a[0],0,a[1],a[0],height,a[1]);drawnIds.add(String(f.properties?.sourceid??f.id));}}
   }
   buildingGroup.add(segments(values,'#668c87',.14));update(settings);node.dataset.buildingsReady='true';node.dataset.buildingSources=String(drawnIds.size);node.dataset.buildingSourcesDecoded=String(result.sourceIds);node.dataset.buildingSegments=String(values.length/6);node.dataset.unknownBuildingHeights=String(result.unknownHeights);
   callbacks.onBuildingStatus(drawnIds.size.toLocaleString('tr-TR')+' kaynak bina · okunan karolarda '+result.unknownHeights.toLocaleString('tr-TR')+' bilinmeyen yükseklik çizilmedi');
  }).catch(error=>{if(!disposed){buildingStarted=false;callbacks.onBuildingStatus(error instanceof Error?error.message:'IGN bina katmanı açılamadı.');}});
 };
 const animate=()=>{if(disposed)return;frame=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);};animate();
 node.dataset.planPaths=String(paths.length);node.dataset.planSegments=String(paths.reduce((sum,p)=>sum+p.points.length-1,0));node.dataset.planPoints=String(pointFeatures.length);node.dataset.worldDepth='schematic-plates';node.dataset.ready='true';
 if(initial.buildings)loadBuildings();
 return {fit,update:(s:LayerSettings)=>{update(s);if(s.buildings)loadBuildings();},dispose:()=>{disposed=true;controller.abort();cancelAnimationFrame(frame);observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',start);renderer.domElement.removeEventListener('pointerup',pick);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
}
