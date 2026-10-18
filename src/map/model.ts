// ureten: codex — a local, unlocated model is never presented as a geospatial twin.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {validateGlb} from '../core/validation';
export async function mountLocalModel(container:HTMLElement,bytes:ArrayBuffer) {
  validateGlb(bytes);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#182322');const renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));container.append(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(50,1,0.01,10000);const controls=new OrbitControls(camera,renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff,0x777777,3));
  const draco=new DRACOLoader().setDecoderPath(new URL('./decoders/draco/',document.baseURI).href);draco.setWorkerLimit(1);
  let model;
  try{model=await new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,'');}
  catch(error){draco.dispose();controls.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();throw error;}
  scene.add(model.scene);container.dataset.modelReady='true';container.dataset.modelBytes=String(bytes.byteLength);
  const box=new THREE.Box3().setFromObject(model.scene),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()).length()||1;
  const fit=()=>{controls.target.copy(center);const radius=size/2,distance=radius/Math.sin(camera.fov*Math.PI/360)*1.08;camera.position.copy(center).add(new THREE.Vector3(1,.8,1).normalize().multiplyScalar(distance));controls.update();};fit();
  renderer.localClippingEnabled=true;
  const tools=document.createElement('div');tools.className='model-section-tools';Object.assign(tools.style,{position:'absolute',left:'12px',right:'12px',bottom:'12px',zIndex:'2',display:'flex',alignItems:'center',flexWrap:'wrap',gap:'8px',padding:'10px',borderRadius:'10px',background:'#f3efe5ed',color:'#243a38',font:'12px system-ui'});
  const makeButton=(label:string,action:()=>void)=>{const button=document.createElement('button');button.textContent=label;button.type='button';button.onclick=action;Object.assign(button.style,{border:'1px solid #243a3830',borderRadius:'6px',padding:'8px',background:'#fff8',color:'inherit',cursor:'pointer'});tools.append(button);};
  makeButton('Sığdır',fit);makeButton('Üstten',()=>{controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(0,size*1.5,.001));controls.update();});makeButton('Yandan',()=>{controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(size*1.5,0,0));controls.update();});
  const label=document.createElement('label'),enabled=document.createElement('input');enabled.type='checkbox';enabled.setAttribute('aria-label','3B modeli kes');label.append(enabled,' Kesit');tools.append(label);
  const axis=document.createElement('select');axis.setAttribute('aria-label','3B kesit ekseni');for(const value of ['x','y','z']){const option=document.createElement('option');option.value=value;option.textContent=value.toUpperCase()+' ekseni';axis.append(option);}tools.append(axis);
  const position=document.createElement('input');position.type='range';position.min='0';position.max='100';position.value='50';position.setAttribute('aria-label','3B kesit konumu');Object.assign(position.style,{width:'min(160px,35vw)',accentColor:'#416558'});tools.append(position);
  const output=document.createElement('output');tools.append(output);const plane=new THREE.Plane();
  const cut=()=>{const key=axis.value as 'x'|'y'|'z',fraction=+position.value/100,coordinate=THREE.MathUtils.lerp(box.min[key],box.max[key],fraction);plane.normal.set(key==='x'?1:0,key==='y'?1:0,key==='z'?1:0);plane.constant=-coordinate;model.scene.traverse(o=>{if(o instanceof THREE.Mesh)for(const material of Array.isArray(o.material)?o.material:[o.material]){material.clippingPlanes=enabled.checked?[plane]:[];material.side=THREE.DoubleSide;material.needsUpdate=true;}});output.value=Math.round(fraction*100)+'%';container.dataset.sectionEnabled=String(enabled.checked);container.dataset.sectionAxis=key;};enabled.onchange=cut;axis.onchange=cut;position.oninput=cut;cut();container.append(tools);
  const resize=()=>{const w=container.clientWidth||400,h=container.clientHeight||300;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);};resize();
  const observer=new ResizeObserver(resize);observer.observe(container);let disposed=false,frame=0;
  const draw=()=>{if(disposed)return;controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(draw);};draw();
  return ()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();draco.dispose();controls.dispose();delete container.dataset.modelReady;delete container.dataset.modelBytes;delete container.dataset.sectionEnabled;delete container.dataset.sectionAxis;tools.remove();model.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const material of Array.isArray(o.material)?o.material:[o.material]){for(const v of Object.values(material))if(v instanceof THREE.Texture)v.dispose();material.dispose();}}});renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
}
