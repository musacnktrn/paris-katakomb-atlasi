// ureten: codex. Original source images and vector drawings remain separately controllable.
import type {rasterSourceOptions} from '../core/raster-sources';
type Option=ReturnType<typeof rasterSourceOptions>[number];
export default function RasterFilters({options,selected,onChange}:{options:Option[];selected:string[]|null;onChange:(ids:string[])=>void}){
 const active=selected??options.filter(o=>o.defaultVisible).map(o=>o.id);
 return <section className="source-filters raster-source-filters" aria-label="Kaynak görüntü katmanları"><header><strong>Harita görüntülerinin kaynakları</strong><button className="text-button" onClick={()=>onChange(options.map(o=>o.id))}>Tüm görüntü kaynakları</button></header>
  {options.map(o=><div key={o.id}><label><input type="checkbox" aria-label={o.label+' görüntüleri'} checked={active.includes(o.id)} onChange={()=>onChange(active.includes(o.id)?active.filter(id=>id!==o.id):[...active,o.id])}/><span>{o.label}</span><small>{o.count}</small></label><p>{o.note}</p></div>)}
 </section>;
}
