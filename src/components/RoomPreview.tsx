// ureten: codex. Use installed images first; source thumbnails are cached privately by the SW.
import {useEffect,useState} from 'react';
export default function RoomPreview({src,title,credit}:{src?:string;title:string;credit?:string}){
 const [failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false);
 useEffect(()=>{setFailed(false);setLoaded(false);},[src]);
 function didLoad(){setLoaded(true);if(src?.startsWith('https://assets.catacombes.xyz/assets/models/')&&'serviceWorker'in navigator)void navigator.serviceWorker.ready.then(r=>r.active?.postMessage({type:'CACHE_ROOM_PREVIEWS',urls:[src]})).catch(()=>{});}
 return <figure className="room-detail-preview">{src&&!failed?<><img data-testid="room-preview" src={src} alt={`${title} · kaynak önizlemesi`} onLoad={didLoad} onError={()=>setFailed(true)}/>{!loaded&&<span className="preview-loading">Önizleme yükleniyor…</span>}<figcaption>{credit??'Kaynak önizlemesi'} · cihaz önbelleği</figcaption></>:<div className="preview-unavailable"><strong>{title}</strong><span>Bu görsel henüz cihazda kayıtlı değil. İnternetle bir kez aç veya kişisel arşivini ekle.</span></div>}</figure>;
}
