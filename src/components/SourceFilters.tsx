// ureten: codex. Source controls operate on local imports; they contain no private source list.
export type SourceOption={id:string;label:string;count:number};
export default function SourceFilters({options,selected,onChange,water,waterCount,onWater}:{options:SourceOption[];selected:string[]|null|undefined;onChange:(ids:string[]|null)=>void;water:boolean;waterCount:number;onWater:(value:boolean)=>void}){
 const toggle=(id:string)=>{const ids=new Set(selected??options.map(o=>o.id));if(ids.has(id))ids.delete(id);else ids.add(id);onChange(ids.size===options.length?null:[...ids]);};
 return <section className="source-filters" aria-label="Yeraltı kaynak katmanları">
  <header><strong>İçe aktarılan kaynaklar</strong><button className="text-button" onClick={()=>onChange(null)}>Tüm kaynakları göster</button></header>
  {options.map(o=><label key={o.id}><input type="checkbox" checked={selected==null||selected.includes(o.id)} onChange={()=>toggle(o.id)}/><span>{o.label}</span><small>{o.count.toLocaleString('tr-TR')}</small></label>)}
  <label><input type="checkbox" checked={water} onChange={e=>onWater(e.target.checked)}/><span>Kaynaklardaki su işaretleri</span><small>{waterCount}</small></label>
  <p>Su, erişilebilirlik ve kat bilgileri kaynak çizimine aittir; güncel durum değişebilir. Su kemeri veya kuyu, su basmış galeri anlamına gelmez. Kaynak boşlukları hayalî tünellerle birleştirilmez.</p>
  <div className="source-access-key"><i className="source-accessible"/>Kaynakta erişilebilir <i className="source-inaccessible"/>Kaynakta erişilemez</div>
  <small>Bu lejant güncel giriş veya geçiş garantisi değildir.</small>
 </section>;
}
