// ureten: codex. Original public-domain image, not a georeferenced navigation layer.
import {useEffect,useRef,useState} from 'react';
import './HistoricalPlan.css';
import type {LocalAsset} from '../core/storage';
export default function HistoricalPlan({onClose,localAsset}:{onClose:()=>void;localAsset?:LocalAsset}){
 const [src,setSrc]=useState(localAsset?'':'./media/plan-1857.jpg');
 useEffect(()=>{if(!localAsset){setSrc('./media/plan-1857.jpg');return;}const u=URL.createObjectURL(localAsset.blob);setSrc(u);return()=>URL.revokeObjectURL(u);},[localAsset]);
 const label=localAsset?'Kişisel planı':'Arşiv planını';
 const [zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0});const drag=useRef<{id:number;x:number;y:number;px:number;py:number}|null>(null),box=useRef<HTMLDivElement>(null),close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const before=document.activeElement as HTMLElement|null;close.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();if(e.key==='Tab'){const all=box.current?.querySelectorAll<HTMLElement>('button,a[href]');if(!all?.length)return;const first=all[0],last=all[all.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);before?.focus();};},[onClose]);
 const reset=()=>{setZoom(1);setPan({x:0,y:0});};
 return <div className="historic-backdrop" role="presentation"><div className="historic-dialog" role="dialog" aria-modal="true" aria-labelledby="historic-title" ref={box}>
  <header><div><small>{localAsset?'CİHAZIMDAKİ HARİTA GÖRSELİ':'BIBLIOTHÈQUE NATIONALE DE FRANCE · GALLICA'}</small><h2 id="historic-title">{localAsset?localAsset.name:<>Paris'in altındaki izler <span>1857</span></>}</h2><p>{localAsset?'Kaynak ve revizyon bu dosyadan doğrulanmadı · coğrafi altlığa hizalanmış değildir':'Özgün arşiv planı · güncel geçiş bilgisi içermez · coğrafi altlığa hizalanmış değildir'}</p></div><button ref={close} onClick={onClose} aria-label={`${label} kapat`}>✕</button></header>
  <div className="historic-toolbar"><span>Çizgileri ve el yazılarını incelemek için yakınlaştırıp sürükle.</span><div><button aria-label={`${label} uzaklaştır`} onClick={()=>setZoom(z=>Math.max(1,z/1.4))}>−</button><output>{Math.round(zoom*100)}%</output><button aria-label={`${label} yakınlaştır`} onClick={()=>setZoom(z=>Math.min(6,z*1.4))}>+</button><button onClick={reset}>Sığdır</button></div></div>
  <div className="historic-viewport" onWheel={e=>{setZoom(z=>Math.min(6,Math.max(1,z*(e.deltaY>0?0.9:1.1))));}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};}} onPointerMove={e=>{const d=drag.current;if(d?.id===e.pointerId)setPan({x:d.px+e.clientX-d.x,y:d.py+e.clientY-d.y});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
   {src&&<img src={src} draggable={false} alt={localAsset?localAsset.name:"IGC'nin 1857 Paris Katakompları planı: özgün galeri, yapı ve lejant çizimleri"} data-testid={localAsset?'local-plan-image':'historic-image'} style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`}}/>}
  </div>
  <footer>{localAsset?<span>Kişisel dosya yalnız bu cihazda saklanır. İnternet olmadan açılır; harita/GPS katmanıyla eşleştirilmiş değildir.</span>:<><span>IGC · Imprimerie Lemercier, 1857. BnF / Gallica GED-5513. Kamu malı eser; özgün dosya değiştirilmedi.</span><a href="./data/historical-plan.json" target="_blank" rel="noreferrer">Kaynak ve dosya bilgisi ↗</a></>}</footer>
 </div></div>;
}
