// ureten: opus. Room detail gallery: verified camera photos and the 3B scan image are two separate, labelled views.
import {useId,useState} from 'react';
import RoomPreview from './RoomPreview';
import {safeExternalUrl} from '../core/catalog';
import type {PhotoView} from '../core/room-photos';
function Link({url,children}:{url:string|null;children:string}){const safe=url?safeExternalUrl(url):null;return safe?<a href={safe} target="_blank" rel="noreferrer">{children}</a>:<>{children}</>;}
// ureten: opus: showScan=false is used for a private historical record with photos bound by featureIds: photos only, no scan tab.
export default function RoomGallery({title,photos,poster,posterCredit,showScan=true}:{title:string;photos:PhotoView[];poster?:string;posterCredit?:string;showScan?:boolean}){
 const base=useId(),[view,setView]=useState<'photos'|'scan'>(photos.length?'photos':'scan'),[index,setIndex]=useState(0),[failed,setFailed]=useState<string[]>([]);
 const at=Math.min(index,Math.max(0,photos.length-1)),current=photos[at];
 const tab=(id:'photos'|'scan',label:string)=><button role="tab" id={`${base}-${id}-tab`} aria-controls={`${base}-${id}`} aria-selected={view===id} className={`room-gallery-tab ${view===id?'is-active':''}`} data-gallery-tab={id} onClick={()=>setView(id)}>{label}</button>;
 return <section className="room-gallery" aria-label={`${title} görselleri`}>
  <div className="room-gallery-tabs" role="tablist" aria-label="Salon görsel türü">{tab('photos',`Fotoğraflar (${photos.length})`)}{showScan&&tab('scan','3B tarama görüntüsü')}</div>
  {view==='photos'||!showScan?<div role="tabpanel" id={`${base}-photos`} aria-labelledby={`${base}-photos-tab`} className="room-gallery-panel">
   {current?<figure className="room-photo" data-photo-id={current.id} data-photo-personal={current.personal?'true':'false'}>
    <div className="room-photo-frame">{failed.includes(current.id)?<div className="preview-unavailable"><strong>{title}</strong><span>Bu fotoğraf açılamadı. Kişisel arşivi yeniden eklemen gerekebilir.</span></div>:<img key={current.url} data-testid="room-photo" src={current.url} referrerPolicy="no-referrer" alt={`${title} · fotoğraf: ${current.creator}`} onError={()=>setFailed(list=>[...list,current.id])}/>}
     {photos.length>1&&<><button className="room-photo-step is-prev" aria-label="Önceki fotoğraf" onClick={()=>setIndex((at+photos.length-1)%photos.length)}>‹</button><button className="room-photo-step is-next" aria-label="Sonraki fotoğraf" onClick={()=>setIndex((at+1)%photos.length)}>›</button><span className="room-photo-count">{at+1} / {photos.length}</span></>}</div>
    <figcaption data-testid="room-photo-credit">Fotoğraf: {current.creator} · <Link url={current.licenceUrl}>{current.licenceName}</Link> · <Link url={current.sourcePage}>kaynak</Link>{current.personal&&<> · <strong className="photo-device-only">yalnız bu cihazda</strong></>}</figcaption>
    <p className="room-photo-note">{current.captionExact&&<span>Kaynaktaki açıklama: <q>{current.captionExact}</q></span>}<span>{current.captureDate?`Çekim tarihi: ${current.captureDate}`:'Çekim tarihi doğrulanmadı'}</span>{current.personal&&<span>Kişisel kopya · herkese açık yayın izni doğrulanmadı</span>}</p>
    {photos.length>1&&<div className="room-photo-strip" aria-label="Fotoğraf seç">{photos.map((p,i)=><button key={p.id} aria-label={`Fotoğraf ${i+1} / ${photos.length} · ${p.creator}`} aria-pressed={i===at} onClick={()=>setIndex(i)}><img src={p.url} alt="" loading="lazy" referrerPolicy="no-referrer"/></button>)}</div>}
   </figure>:<div className="preview-unavailable room-photo-empty"><strong>Bu salon için doğrulanmış fotoğraf yok.</strong><span>Açık lisanslı ya da kişisel arşivden eklenen gerçek fotoğraflar burada görünür. 3B tarama görüntüsü fotoğraf yerine sayılmaz.</span></div>}
  </div>:<div role="tabpanel" id={`${base}-scan`} aria-labelledby={`${base}-scan-tab`} className="room-gallery-panel"><RoomPreview src={poster} title={title} credit={posterCredit}/></div>}
 </section>;
}
