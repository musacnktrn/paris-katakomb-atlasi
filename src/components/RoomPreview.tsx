// ureten: codex. Use installed images first; source thumbnails are cached privately by the SW.
// ureten: opus: this is the 3B scan poster, never presented as a camera photo.
import {useEffect,useRef,useState} from 'react';
import {cacheDecodedPreview,forgetPreview,posterCandidates} from '../core/room-media';
export default function RoomPreview({src,title,credit}:{src?:string;title:string;credit?:string}){
 const [failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false),[variant,setVariant]=useState(0),[retry,setRetry]=useState(0),generation=useRef(0);
 const candidates=src?posterCandidates(src):[],candidate=candidates[Math.min(variant,candidates.length-1)];const imageSrc=candidate&&retry&&candidate.startsWith('https:')?candidate+(candidate.includes('?')?'&':'?')+'_atlas_retry='+retry:candidate;
 useEffect(()=>{generation.current++;setFailed(false);setLoaded(false);setVariant(0);setRetry(0);return()=>{generation.current++;};},[src]);
 // An already installed v2 worker does not understand preview caching. Retry
 // the visible photo when the new worker takes control during an upgrade.
 useEffect(()=>{if(!loaded||!candidate?.startsWith('https:')||!('serviceWorker'in navigator))return;const save=()=>cacheDecodedPreview(candidate);navigator.serviceWorker.addEventListener('controllerchange',save);return()=>navigator.serviceWorker.removeEventListener('controllerchange',save);},[loaded,candidate]);
 async function didFail(){const g=generation.current;setLoaded(false);if(candidate)await forgetPreview(candidate);if(g!==generation.current)return;if(variant<candidates.length-1){setVariant(variant+1);return;}setFailed(true);}
 function didLoad(){setLoaded(true);if(candidate?.startsWith('https:'))cacheDecodedPreview(imageSrc!);}
 return <figure className="room-detail-preview">{imageSrc&&!failed?<><img key={imageSrc} data-testid="room-preview" src={imageSrc} referrerPolicy="no-referrer" alt={`${title} · 3B tarama görüntüsü`} onLoad={didLoad} onError={()=>void didFail()}/>{!loaded&&<span className="preview-loading">Önizleme yükleniyor…</span>}<figcaption data-testid="room-scan-credit">3B tarama görüntüsü · {credit??'Catacombes.xyz'} · cihaz önbelleği</figcaption></>:<div className="preview-unavailable"><strong>{title}</strong><span>{navigator.onLine?'Kaynak görsele ulaşılamadı. Yeniden yüklemeyi deneyebilirsin.':'İnternet bağlantısı yok; bu görselin kayıtlı bir kopyası açılamadı.'}</span>{src&&<button className="button button-plain" onClick={()=>{setVariant(0);setRetry(Date.now());setFailed(false);setLoaded(false);}}>Görseli yeniden yükle</button>}</div>}</figure>;
}
