// ureten: codex. Preserve the source author's common coordinate frame; never georeference by guesswork.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {LocalAsset} from '../core/storage';
export type SurveySettings={surface:boolean;wireframe:boolean;opacity:number;cut:boolean;axis:'x'|'y'|'z';position:number};
function disposeObject(root:THREE.Object3D){root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const value of Object.values(m))if(value instanceof THREE.Texture)value.dispose();m.dispose();}}});}
export async function mountSurvey(container:HTMLElement,assets:{asset:LocalAsset;role:'surface'|'underground'}[],signal:AbortSignal){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#162421');const roots=new Map<string,THREE.Group>();
 try{for(const entry of assets){const model=await new GLTFLoader().parseAsync(await entry.asset.blob.arrayBuffer(),'');roots.set(entry.role,model.scene);scene.add(model.scene);if(signal.aborted)throw Error('3B sahne kapatıldı.');}}
 catch(error){for(const root of roots.values())disposeObject(root);throw error;}
 const underground=roots.get('underground');if(!underground){for(const root of roots.values())disposeObject(root);throw Error('Birleşik galeri geometrisi eksik.');}
 // This source references a photograph atlas but supplies no TEXCOORD_0.
 // Sampling (0,0) paints the entire scan black. Render the real geometry with
 // neutral stone shading instead of inventing texture coordinates.
 underground.traverse(o=>{if(o instanceof THREE.Mesh&&!o.geometry.attributes.uv)for(const material of Array.isArray(o.material)?o.material:[o.material]){const m=material as THREE.MeshStandardMaterial;m.map?.dispose();m.map=null;m.color.set('#d9c7a6');m.roughness=.9;m.metalness=0;m.needsUpdate=true;}});
 const surface=roots.get('surface');surface?.traverse(o=>{if(o.name.toUpperCase().includes('GOOGLE_SAT'))o.visible=false;});
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.localClippingEnabled=true;container.append(renderer.domElement);
 const camera=new THREE.PerspectiveCamera(48,1,.01,100000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.15;controls.maxDistance=20000;
 scene.add(new THREE.HemisphereLight(0xffffff,0x71887c,3));const light=new THREE.DirectionalLight(0xffffff,2.2);light.position.set(300,500,200);scene.add(light);
 const box=new THREE.Box3().setFromObject(underground),full=box.clone(),cutPlane=new THREE.Plane();surface?.updateMatrixWorld(true);surface?.traverseVisible(o=>{if(o instanceof THREE.Mesh)full.expandByObject(o);});
 const fit=(all=false,view:'perspective'|'top'|'side'='perspective')=>{const b=all?full:box,c=b.getCenter(new THREE.Vector3()),r=b.getSize(new THREE.Vector3()).length()/2||1,dist=r/Math.sin(camera.fov*Math.PI/360)*1.1;controls.target.copy(c);camera.position.copy(c).add((view==='top'?new THREE.Vector3(0,1,.001):view==='side'?new THREE.Vector3(1,.12,.001):new THREE.Vector3(1,.85,1)).normalize().multiplyScalar(dist));controls.update();};fit();
 let triangles=0,meshes=0;underground.traverse(o=>{if(o instanceof THREE.Mesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position?.count??0)/3;}});
 container.dataset.surveyMeshes=String(meshes);container.dataset.surveyTriangles=String(Math.round(triangles));container.dataset.surveyReady='true';container.dataset.commonFrame='source-author-local';
 const update=(s:SurveySettings)=>{if(surface)surface.visible=s.surface;const fraction=s.position/100,coordinate=THREE.MathUtils.lerp(box.min[s.axis],box.max[s.axis],fraction);cutPlane.normal.set(s.axis==='x'?1:0,s.axis==='y'?1:0,s.axis==='z'?1:0);cutPlane.constant=-coordinate;
  for(const [role,root] of roots)root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){m.clippingPlanes=s.cut?[cutPlane]:[];m.side=THREE.DoubleSide;if(role==='surface'){m.transparent=s.opacity<1;m.opacity=s.opacity;m.depthWrite=s.opacity===1;if('wireframe'in m)(m as THREE.MeshStandardMaterial).wireframe=s.wireframe;}m.needsUpdate=true;}});container.dataset.sectionEnabled=String(s.cut);container.dataset.surfaceVisible=String(s.surface);container.dataset.sectionAxis=s.axis;};
 const ray=new THREE.Raycaster();const focus=(event:MouseEvent)=>{const r=renderer.domElement.getBoundingClientRect(),pointer=new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObject(underground,true)[0];if(hit){const offset=camera.position.clone().sub(controls.target);controls.target.copy(hit.point);camera.position.copy(hit.point).add(offset.multiplyScalar(.35));controls.update();}};renderer.domElement.addEventListener('dblclick',focus);
 const resize=()=>{const w=container.clientWidth||600,h=container.clientHeight||400;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(container);resize();let frame=0,disposed=false;const draw=()=>{if(disposed)return;controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(draw);};draw();
 return {update,fit,dispose:()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('dblclick',focus);controls.dispose();for(const root of roots.values())disposeObject(root);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();for(const key of ['surveyReady','surveyMeshes','surveyTriangles','commonFrame','sectionEnabled','surfaceVisible','sectionAxis'])delete container.dataset[key];}};
}
