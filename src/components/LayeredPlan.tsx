// ureten: codex. Schematic separation of georeferenced source records, with source height buildings.
import {useEffect,useMemo,useRef,useState} from 'react';
import type * as GeoJSON from 'geojson';
import {mountLayeredPlan,type LayerSettings} from '../map/layered-plan';
import {sourceLevels,sourceLevelOf,sourceLevelLabel,displayTitle,positionErrorOf,positionErrorLabel} from '../core/underground';
import {sourceProximityLabel} from '../core/source-layers';
import {planPaths} from '../core/plan-geometry';
type Props={features:GeoJSON.FeatureCollection;surface:GeoJSON.FeatureCollection;onClose:()=>void;onDepth:()=>void;onSurvey:()=>void};
type Engine=ReturnType<typeof mountLayeredPlan>;
const initial:LayerSettings={gap:900,surface:true,buildings:true,guides:false,levels:{superieur:true,inferieur:true,unknown:true},cut:false,axis:'x',position:50,band:500};
export default function LayeredPlan({features,surface,onClose,onDepth,onSurvey}:Props){
 const mount=useRef<HTMLDivElement>(null),dialog=useRef<HTMLElement>(null),engine=useRef<Engine|null>(null);
 const [settings,setSettings]=useState(initial),[selected,setSelected]=useState<GeoJSON.Feature|null>(null),[error,setError]=useState(''),[buildingStatus,setBuildingStatus]=useState('IGN bina katmanı hazırlanıyor…');
 const paths=useMemo(()=>planPaths(features),[features]),counts=useMemo(()=>Object.fromEntries(sourceLevels.map(level=>[level,paths.filter(p=>p.level===level).length])),[paths]);
 useEffect(()=>{
  const before=document.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();if(event.key!=='Tab')return;const all=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,a[href]')??[]),first=all[0],last=all.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}};
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(before?.isConnected)before.focus();};
 },[]);
 useEffect(()=>{
  if(!mount.current)return;setError('');
  try{const e=mountLayeredPlan(mount.current,features,surface,settings,{onSelect:setSelected,onBuildingStatus:setBuildingStatus});engine.current=e;return()=>{e.dispose();engine.current=null;};}
  catch(error){setError(error instanceof Error?error.message:String(error));}
 },[features,surface]);
 useEffect(()=>{engine.current?.update(settings);},[settings]);
 return <section className="spatial-backdrop layered-plan" role="dialog" aria-modal="true" aria-label="Katmanlı 3B kaynak haritası" ref={dialog}>
  <header><div><small>TEK SAHNE · KAYNAK ÇİZGİLERİ</small><h2>Şehrin altını birlikte oku.</h2><p>Haritaya konumlanmış plan çizgileri ve kayıtlar. Katman aralığı temsilîdir; ölçülmüş derinlik değildir.</p></div><button onClick={onClose} aria-label="3B derinlik görünümünü kapat">×</button></header>
  <nav className="spatial-mode-tabs" aria-label="3B inceleme türü"><button aria-pressed="true">Katmanlı kaynak haritası</button><button onClick={onSurvey}>Birleşik gerçek tarama</button><button onClick={onDepth}>Şehir, planlar ve salonlar</button></nav>
  <div className="spatial-layout"><div className="spatial-stage" ref={mount} data-testid="layered-plan-view">{error&&<p role="alert">{error}</p>}<div className="layered-stage-key"><span>Yerüstü</span>{sourceLevels.map(level=><span key={level} data-source-level={level}>{sourceLevelLabel[level]}</span>)}</div><span className="spatial-caption">Sürükle: döndür · İki parmak / tekerlek: yaklaş · Çizgiye dokun: kaynak kaydı</span></div>
   <aside><div className="survey-view-buttons"><button onClick={()=>engine.current?.fit()}>Plan çizgilerine sığdır</button><button onClick={()=>engine.current?.fit('perspective',true)}>Tüm kaynaklara sığdır</button><button onClick={()=>engine.current?.fit('top')}>Üstten</button><button onClick={()=>engine.current?.fit('side')}>Yandan</button></div>
    <p className="spatial-count" data-testid="layered-path-count">{paths.length.toLocaleString('tr-TR')} kaynak yolu</p>
    {paths.length===0&&<p className="spatial-note">Yeraltı çizgileri için kendi GeoJSON kaynak paketini haritaya ekle. Konum noktaları galeri ağı olarak birleştirilmez.</p>}
    <label className="spatial-switch"><input type="checkbox" aria-label="Katmanlı yerüstü yolları" checked={settings.surface} onChange={e=>setSettings({...settings,surface:e.target.checked})}/>Yerüstü yolları</label>
    <label className="spatial-switch"><input type="checkbox" aria-label="Katmanlı IGN binaları" checked={settings.buildings} onChange={e=>setSettings({...settings,buildings:e.target.checked})}/>IGN binaları · kaynak yükseklikleri</label>
    <p className="spatial-note" data-testid="layered-building-status">{buildingStatus}. Düz yüzey üzerinde 2,5B tel kafes; arazi kotu ve çatı modeli değildir.</p>
    {sourceLevels.map(level=><label key={level} className="spatial-switch"><input type="checkbox" aria-label={'Katmanlı '+sourceLevelLabel[level]} checked={settings.levels[level]} onChange={e=>setSettings({...settings,levels:{...settings.levels,[level]:e.target.checked}})}/>{sourceLevelLabel[level]} · {counts[level].toLocaleString('tr-TR')} yol</label>)}
    <label>Görsel katman açıklığı <input aria-label="Temsilî katman açıklığı" type="range" min="60" max="900" step="30" value={settings.gap} onChange={e=>setSettings({...settings,gap:+e.target.value})}/></label>
    <p className="spatial-note">Üst / alt ayrımı yalnız kaynak lejantından gelir. Seviyesi bilinmeyen kayıtlar ayrı gösterim düzlemindedir; üçüncü bir gerçek kat anlamına gelmez.</p>
    <label className="spatial-switch"><input aria-label="İzdüşüm kılavuzları" type="checkbox" checked={settings.guides} onChange={e=>setSettings({...settings,guides:e.target.checked})}/>İzdüşüm kılavuzları</label>
    {settings.guides&&<p className="spatial-note">Kesikli düşeyler aynı yatay konumu gösterir; ölçülmüş şaft veya katlar arası bağlantı değildir.</p>}
    <label className="spatial-switch"><input aria-label="Kaynak geometrisini kes" type="checkbox" checked={settings.cut} onChange={e=>setSettings({...settings,cut:e.target.checked})}/>Kesit bandı</label>
    <label>Kesit doğrultusu<select aria-label="Katmanlı kesit doğrultusu" value={settings.axis} onChange={e=>setSettings({...settings,axis:e.target.value as 'x'|'z'})}><option value="x">Kuzey–güney</option><option value="z">Doğu–batı</option></select></label>
    <label>Kesit konumu <output>{settings.position}%</output><input aria-label="Katmanlı kesit konumu" type="range" min="0" max="100" value={settings.position} onChange={e=>setSettings({...settings,position:+e.target.value})}/></label>
    <label>Yatay bant genişliği <output>{settings.band} m</output><input aria-label="Katmanlı kesit genişliği" type="range" min="50" max="4000" step="50" value={settings.band} onChange={e=>setSettings({...settings,band:+e.target.value})}/></label>
    {selected&&<div className="spatial-selected" data-testid="layered-selected"><strong>{displayTitle(selected.properties,selected.id)}</strong><p>{sourceLevelLabel[sourceLevelOf(selected.properties)]} · {String(selected.properties?.sourceLabel??'Kaynak kaydı')}</p><p>{positionErrorLabel(positionErrorOf(selected.properties))||'Konum hatası kaynakta belirtilmemiş'}</p>{sourceProximityLabel(selected.properties?.sourceProximity)&&<p>{sourceProximityLabel(selected.properties?.sourceProximity)}</p>}<p>Derinlik: kaynakta ayrıca belgelenmedikçe bilinmiyor.</p></div>}
    <p className="spatial-note">Gösterilenler kaynak plan çizgileridir; çizgiler ölçülmüş tünel duvarına dönüştürülmez ve aralarındaki boşluklar tamamlanmaz. Gerçek duvar geometrisi için ayrı LiDAR görünümünü aç.</p>
   </aside></div>
 </section>;
}
