// ureten: codex — a local, unlocated model is never presented as a geospatial twin.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {validateGlb} from '../core/validation';
export async function mountLocalModel(container:HTMLElement,bytes:ArrayBuffer) {
  validateGlb(bytes);
  const scene=new THREE.Scene();const renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));container.append(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(50,1,0.01,10000);const controls=new OrbitControls(camera,renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff,0x777777,3));
  let model;
  try{model=await new GLTFLoader().parseAsync(bytes,'');}
  catch(error){controls.dispose();renderer.dispose();renderer.domElement.remove();throw error;}
  scene.add(model.scene);
  const box=new THREE.Box3().setFromObject(model.scene),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()).length()||1;
  controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(size,size,size));controls.update();
  const resize=()=>{const w=container.clientWidth||400,h=container.clientHeight||300;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h);};resize();
  const observer=new ResizeObserver(resize);observer.observe(container);let disposed=false,frame=0;
  const draw=()=>{if(disposed)return;controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(draw);};draw();
  return ()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();model.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const material of Array.isArray(o.material)?o.material:[o.material]){for(const v of Object.values(material))if(v instanceof THREE.Texture)v.dispose();material.dispose();}}});renderer.dispose();renderer.domElement.remove();};
}
