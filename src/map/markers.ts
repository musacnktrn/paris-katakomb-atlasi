// ureten: codex — photographic rooms, distinct access symbols, text-safe hover.
import * as gl from 'maplibre-gl';
import type * as GeoJSON from 'geojson';
import {posterCandidates} from '../core/room-media';
import {kindLabel,accessGroupOf,accessGlyph,accessStyleOf,accessColor,accessStatusLabel,positionErrorLabel,type AccessStyle} from '../core/underground';
// ureten: opus: P11 marker image = personal photo > public photo > installed scan poster > remote scan poster.
import {roomImage,type PhotoView,type RoomImage} from '../core/room-photos';
import {safeMarkerColor} from '../core/source-layers';
export type RoomMedia={id:string;title:string;posterUrl?:string};
// ureten: opus: a cluster shows its best member image: personal photo, public photo, then 3B scan.
const imageRank=(m:RoomImage)=>m.kind==='photo'?(m.personal?0:1):2;
const centroid=(group:GeoJSON.Feature[]):[number,number]=>{let x=0,y=0,n=0;for(const f of group)if(f.geometry.type==='Point'){x+=f.geometry.coordinates[0]!;y+=f.geometry.coordinates[1]!;n++;}return [x/n,y/n];};
export class MapInteractions{
 private markers=new Map<string,{marker:gl.Marker;kind:string}>();
 private media=new Map<string,RoomImage>();
 private features:GeoJSON.Feature[]=[];
 private popup:gl.Popup|null=null;
 // ureten: opus: the cluster chooser lives in its own field so hover/blur/mouseleave (hide) can never close it before a choice is made.
 // It closes only from its close button, a choice, a map move or a map click.
 private menu:gl.Popup|null=null;
 private hoverId='';
 // ureten: opus: touch screens have no hover; emulated mouseenter after a tap must not leave a card over the map or detail.
 private canHover=typeof matchMedia!=='function'||matchMedia('(hover:hover)').matches;
 private visibility={rooms:true,access:true};
 constructor(private map:gl.Map,private select:(p:Record<string,unknown>)=>void){map.on('moveend',()=>this.rebuild());map.on('movestart',()=>{this.hide();this.closeMenu();});}
 setFeatures(data:GeoJSON.FeatureCollection){this.features=data.features;this.rebuild();}
 setMedia(rooms:RoomMedia[],local:Record<string,string>,photos:Record<string,PhotoView[]>={}){this.media=new Map();for(const r of rooms){const image=roomImage(r.id,photos,local,r.posterUrl);if(image)this.media.set(r.id,image);}this.rebuild();}
 setVisibility(v:{rooms:boolean;access:boolean}){this.visibility=v;for(const {marker,kind}of this.markers.values())marker.getElement().hidden=kind==='room'?!v.rooms:!v.access;this.hide();if(!v.rooms)this.closeMenu();}
 // ureten: opus: marker diameter per zoom; rooms closer than 0.9 x diameter are grouped so one picture never covers another.
 private size(){const z=this.map.getZoom();return z<13?30:z<15?42:56;}
 private image(src:string,alt:string){const img=document.createElement('img');img.alt=alt;img.referrerPolicy='no-referrer';img.loading='lazy';img.decoding='async';let variant=0;const urls=posterCandidates(src);img.onerror=()=>{if(++variant<urls.length)img.src=urls[variant];else{img.hidden=true;img.parentElement?.classList.add('without-photo');}};img.src=urls[0];return img;}
 private rebuild(){
  for(const {marker}of this.markers.values())marker.remove();this.markers.clear();
  const groups:GeoJSON.Feature[][]=[];
  for(const f of this.features){if(f.geometry.type!=='Point')continue;if(f.properties?.kind!=='room'){groups.push([f]);continue;}const point=this.map.project(f.geometry.coordinates as [number,number]),threshold=Math.max(40,this.size()*.9);
   const group=groups.find(g=>g[0].properties?.kind==='room'&&g[0].geometry.type==='Point'&&this.map.project(g[0].geometry.coordinates as [number,number]).dist(point)<threshold);if(group)group.push(f);else groups.push([f]);}
  for(const group of groups){const feature=group[0];if(feature.geometry.type!=='Point')continue;const original=feature.properties??{},kind=String(original.kind);if(!['room','access'].includes(kind))continue;
   const clustered=group.length>1,choose=this.map.getZoom()>=17,p=clustered?{...original,title:group.map(f=>f.properties?.title).join(' · '),clusterCount:group.length,clusterChoose:choose}:original;
   const id=clustered?'cluster-'+group.map(f=>String(f.properties?.id??f.id)).sort().join('-'):String(p.id??feature.id),best=group.map(f=>({f,m:this.media.get(String(f.properties?.id??f.id))})).filter((x):x is {f:GeoJSON.Feature;m:RoomImage}=>!!x.m).sort((a,b)=>imageRank(a.m)-imageRank(b.m))[0],media:RoomImage|undefined=best&&clustered?{...best.m,caption:`${best.m.caption} · ${String(best.f.properties?.title??'')}`}:best?.m,button=document.createElement('button');button.type='button';button.className='atlas-place-marker '+(kind==='room'?'is-room':id==='museum-entry'?'is-entry':'is-exit');button.setAttribute('aria-label',clustered?(choose?`${group.length} salondan birini seç: ${p.title}`:`${group.length} salonu yakınlaştır: ${p.title}`):`${p.title} · ${kind==='room'?(media?.kind==='photo'?'salon fotoğrafı':'salon · 3B tarama görüntüsü'):id==='museum-entry'?'giriş':'çıkış'}`);button.dataset.markerId=id;button.dataset.markerKind=kind;if(kind==='room'){button.dataset.imageKind=media?.kind??'none';if(media?.personal)button.dataset.imagePersonal='true';}
   const face=document.createElement('span');face.className='atlas-marker-face';if(kind==='room'&&media)face.append(this.image(media.src,String(original.title)));const glyph=document.createElement('span');glyph.className='atlas-marker-glyph';glyph.textContent=kind==='room'?'▣':id==='museum-entry'?'↧':'↥';face.append(glyph);button.append(face);if(kind==='room'&&media?.kind==='scan'){const tag=document.createElement('span');tag.className='atlas-marker-scan-tag';tag.textContent='3B';tag.title='3B tarama görüntüsü, fotoğraf değil';button.append(tag);}
   if(clustered){const badge=document.createElement('span');badge.className='atlas-marker-count';badge.textContent=String(group.length);button.append(badge);}
   const coordinates:[number,number]=clustered?centroid(group):feature.geometry.coordinates as [number,number];
   const marker=new gl.Marker({element:button,anchor:'center'}).setLngLat(coordinates).addTo(this.map);this.markers.set(id,{marker,kind});button.addEventListener('mouseenter',()=>{if(this.canHover)this.show(p,coordinates,media);});button.addEventListener('mouseleave',()=>this.hide());button.addEventListener('focus',()=>this.show(p,coordinates,media));button.addEventListener('blur',()=>this.hide());button.addEventListener('click',e=>{e.stopPropagation();this.hide();if(!clustered){this.select(p);return;}if(this.map.getZoom()<17){const bounds=new gl.LngLatBounds();for(const f of group)if(f.geometry.type==='Point')bounds.extend(f.geometry.coordinates as [number,number]);this.map.fitBounds(bounds,{padding:100,maxZoom:18,duration:450});return;}
    this.openMenu(group,coordinates);
   });
  }this.resize();this.setVisibility(this.visibility);
 }
 private openMenu(group:GeoJSON.Feature[],coordinates:[number,number]){
  this.closeMenu();const menu=document.createElement('div');menu.className='atlas-hover-card atlas-cluster-choices';menu.setAttribute('role','menu');menu.dataset.testid='cluster-menu';
  const heading=document.createElement('small');heading.textContent='Yakındaki salonlar · birini seç';menu.append(heading);
  for(const f of group){const item=document.createElement('button');item.type='button';item.className='cluster-room-choice';item.setAttribute('role','menuitem');item.textContent=String(f.properties?.title);item.addEventListener('click',e=>{e.stopPropagation();this.closeMenu();this.hide();this.select(f.properties??{});});menu.append(item);}
   // ureten: codex: mobile map padding places points near the top; open the chooser below the point, clear of the command bar.
   const popup=new gl.Popup({closeButton:true,closeOnClick:true,offset:25,...(!this.canHover?{anchor:'top' as const}:{}),className:'atlas-cluster-menu',maxWidth:'260px'}).setLngLat(coordinates).setDOMContent(menu);
  popup.on('close',()=>{if(this.menu===popup)this.menu=null;});this.menu=popup;popup.addTo(this.map);
 }
 closeMenu(){const m=this.menu;this.menu=null;m?.remove();}
 private resize(){const size=this.size();for(const {marker,kind}of this.markers.values())marker.getElement().style.setProperty('--marker-size',`${kind==='room'?size:32}px`);}
 show(p:Record<string,unknown>,coordinates:[number,number],media?:RoomImage){
  const id=String(p.id??p.title??'');if(this.hoverId===id&&this.popup)return;this.hide();this.hoverId=id;
  const card=document.createElement('div');card.className='atlas-hover-card';card.setAttribute('role','tooltip');card.dataset.testid='map-hover';
  // ureten: opus: F4 one status line first: official museum record versus historical access record, with the access glyph and colour.
  // A historical shaft, stair, well or former entrance is never presented as an open exit.
  const kind=String(p.kind??'feature'),group=p.clusterCount?null:(typeof p.accessGroup==='string'&&p.accessGroup?p.accessGroup:accessGroupOf(p)) as ReturnType<typeof accessGroupOf>,style=group?((typeof p.accessStyle==='string'&&p.accessStyle?p.accessStyle:accessStyleOf(p)) as AccessStyle):null;
  if(group&&style){card.dataset.accessGroup=group;card.classList.add('hover-access','hover-access-'+group);const status=document.createElement('span');status.className='hover-status status-'+group;status.dataset.testid='hover-status';
   const glyph=document.createElement('b');glyph.className='hover-glyph';glyph.textContent=style==='official'&&String(p.id??'').includes('exit')?'↥':accessGlyph[style];glyph.style.background=style==='user'?safeMarkerColor(p):accessColor[style];glyph.setAttribute('aria-hidden','true');
   status.append(glyph,document.createTextNode(accessStatusLabel(group,p.id)));card.append(status);}
  const titleText=String(p.title??'Tarihî plan kaydı'),title=document.createElement('strong');title.textContent=titleText;card.append(title);
  const badgeText=kind==='access'?(p.id==='museum-entry'?'Resmî müze girişi':'Resmî müze çıkışı'):String(p.sourceCategoryLabel??kindLabel[kind]??'Yeraltı salonu');
  // No repeated title: the category badge is left out when the title or the status line already says it.
  const seen=[titleText,group?accessStatusLabel(group,p.id):''].map(t=>t.toLocaleLowerCase('tr-TR'));
  if(!seen.some(t=>t.includes(badgeText.toLocaleLowerCase('tr-TR')))){const badge=document.createElement('span');badge.className='hover-kind kind-'+(group==='former'?'former':kind);badge.textContent=badgeText;card.append(badge);}
  const info=document.createElement('small');info.textContent=p.clusterCount?(p.clusterChoose?'Yakındaki salonlar · tıklayıp birini seç':'Yakındaki salonlar · tıklayarak yakınlaş'):kind==='access'?'Ziyaretçi erişimi · açıklık canlı izlenmez':group?'Kaynak kaydı · güncel erişim bilinmiyor · açık giriş anlamına gelmez':p.personalSource?'Tarihî kaynak · güncel erişim bilinmiyor':typeof p.depthMetres==='number'?`Yüzey altında ${p.depthMetres} m · salon kaydı`:'Kaynak koordinatı · erişim garantisi değildir';card.append(info);
  // ureten: opus: F4 position honesty: the held-out alignment error of the record, when the package carries one.
  const position=positionErrorLabel(p.positionErrorM);if(position){const line=document.createElement('small');line.className='hover-position';line.dataset.testid='hover-position';line.textContent=position;card.append(line);}
  // ureten: codex: water is a dated source annotation; camera heading is not an underground passage direction.
  if(p.waterLabel){const line=document.createElement('small');line.className='hover-water';line.textContent=String(p.waterLabel)+' · güncel durum değişebilir';card.append(line);}
  if(group==='user'&&typeof p.cameraHeadingDeg==='number'){const line=document.createElement('small');line.textContent=`Kaynak görüntüsünün bakışı · ${Math.round(p.cameraHeadingDeg)}°`;card.append(line);}
  // ureten: opus: the hover says what the picture is: a camera photo with its credit, or a 3B scan image.
  if(media){const credit=document.createElement('small');credit.className='hover-image-credit';credit.dataset.imageKind=media.kind;credit.textContent=media.caption;card.append(credit);card.prepend(this.image(media.src,''));}this.popup=new gl.Popup({closeButton:false,closeOnClick:false,offset:30,className:'atlas-feature-popup',maxWidth:'260px'}).setLngLat(coordinates).setDOMContent(card).addTo(this.map);
 }
 hide(){this.popup?.remove();this.popup=null;this.hoverId='';}
 destroy(){this.hide();this.closeMenu();for(const {marker}of this.markers.values())marker.remove();this.markers.clear();}
}
