// ureten: opus. Room camera photos: public open-licence catalogue + personal (device-only) collection photos.
// A 3B scan poster is never called a photo; a personal photo is never published.
import {z} from 'zod';
import type {CollectionRecord,LocalAsset} from './storage';

const https=(value:string,hosts?:string[])=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!hosts||hosts.includes(u.hostname));}catch{return false;}};
// Only licences that allow public redistribution of an unmodified copy with attribution.
export const OPEN_LICENCE=/^(?:CC0 1\.0|Public domain|CC BY(?:-SA)? [1-4]\.[0-9])$/;
const sha256=z.string().regex(/^[a-f0-9]{64}$/);
export const publicPhotoSchema=z.object({
 id:z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
 imageKind:z.literal('camera-photo'),
 roomIds:z.array(z.string().min(1).max(100)).max(20),
 featureIds:z.array(z.string().min(1).max(120)).max(20).default([]),
 primary:z.boolean().optional(),
 file:z.string().regex(/^\.\/media\/room-photos\/[a-z0-9][a-z0-9-]*\.(?:jpe?g|png|webp)$/,'Fotoğraf dosyası media/room-photos altında olmalı.'),
 bytes:z.number().int().positive().max(10*1024*1024),
 width:z.number().int().positive().max(20000),
 height:z.number().int().positive().max(20000),
 sha256,
 sourcePage:z.string().refine(v=>https(v,['commons.wikimedia.org']),'Kaynak sayfası Wikimedia Commons olmalı.'),
 originalUrl:z.string().refine(v=>https(v,['upload.wikimedia.org']),'Özgün dosya adresi upload.wikimedia.org olmalı.'),
 creator:z.string().trim().min(1).max(200),
 licence:z.object({name:z.string().regex(OPEN_LICENCE,'Lisans izin listesinde değil.'),url:z.string().refine(v=>https(v,['creativecommons.org','commons.wikimedia.org']),'Lisans adresi geçersiz.'),attributionRequired:z.boolean(),shareAlike:z.boolean()}),
 captionExact:z.string().min(1).max(1000),
 captureDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
 modified:z.literal(false),
}).refine(p=>p.roomIds.length+p.featureIds.length>0,'Fotoğraf bir salona veya kayda bağlı olmalı.')
 .refine(p=>p.licence.shareAlike===p.licence.name.includes('-SA'),'ShareAlike bilgisi lisans adıyla uyuşmuyor.')
 .refine(p=>!p.licence.name.startsWith('CC BY')||p.licence.attributionRequired,'CC BY atıf gerektirir.');
export const publicPhotoCatalogSchema=z.object({schema:z.literal(1),photos:z.array(publicPhotoSchema).max(200)})
 .refine(c=>new Set(c.photos.map(p=>p.id)).size===c.photos.length,'Yinelenen fotoğraf kimliği.')
 .refine(c=>new Set(c.photos.map(p=>p.file)).size===c.photos.length,'Yinelenen fotoğraf dosyası.');
export type PublicPhoto=z.infer<typeof publicPhotoSchema>;

export type PhotoView={id:string;url:string;sha256:string;roomIds:string[];featureIds:string[];creator:string;licenceName:string;licenceUrl:string|null;sourcePage:string;captionExact:string;captureDate:string|null;personal:boolean;primary:boolean;width:number|null;height:number|null};
export type RoomImage={src:string;kind:'photo'|'scan';caption:string;personal:boolean};

export function publicPhotoViews(value:unknown):PhotoView[]{
 const catalog=publicPhotoCatalogSchema.parse(value);
 return catalog.photos.map(p=>({id:p.id,url:p.file,sha256:p.sha256,roomIds:p.roomIds,featureIds:p.featureIds,creator:p.creator,licenceName:p.licence.name,licenceUrl:p.licence.url,sourcePage:p.sourcePage,captionExact:p.captionExact,captureDate:p.captureDate,personal:false,primary:!!p.primary,width:p.width,height:p.height}));
}
// A collection asset counts only while its collection record still lists it (atomic replacement / removal).
export function isActiveCollectionAsset(asset:LocalAsset,collections:CollectionRecord[]){
 if(!asset.collectionId)return true;const record=collections.find(c=>c.id===asset.collectionId);return !!record&&(!record.assetIds||record.assetIds.includes(asset.id));
}
export function isRoomPhotoAsset(asset:LocalAsset){return asset.kind==='image'&&asset.category==='room-photo'&&!!asset.photo;}
export function personalPhotoView(asset:LocalAsset,url:string):PhotoView|null{
 const p=asset.photo;if(!isRoomPhotoAsset(asset)||!p)return null;
 const roomIds=[...new Set([...(asset.roomIds??[]),...(asset.roomId?[asset.roomId]:[])])];
 return {id:asset.id,url,sha256:asset.sha256,roomIds,featureIds:asset.featureIds??[],creator:p.creator,licenceName:p.licenceName,licenceUrl:p.licenceUrl,sourcePage:p.sourcePage,captionExact:p.captionExact,captureDate:p.captureDate,personal:true,primary:!!p.primary,width:p.width??null,height:p.height??null};
}
// Order inside a room: personal photos first (always offline), then public; primary first; stable by id.
// The same bytes (sha256) are shown once, preferring the personal copy.
export function groupPhotos(views:PhotoView[]):Record<string,PhotoView[]>{
 const out:Record<string,PhotoView[]>={};
 for(const view of views)for(const key of new Set([...view.roomIds,...view.featureIds]))(out[key]??=[]).push(view);
 for(const key of Object.keys(out)){
  const sorted=out[key]!.sort((a,b)=>Number(b.personal)-Number(a.personal)||Number(b.primary)-Number(a.primary)||a.id.localeCompare(b.id));
  const seen=new Set<string>();out[key]=sorted.filter(v=>!seen.has(v.sha256)&&!!seen.add(v.sha256));
 }
 return out;
}
export const SCAN_CAPTION='3B tarama görüntüsü · Catacombes.xyz';
export function photoCaption(photo:PhotoView){return `Fotoğraf · ${photo.creator} · ${photo.personal?'yalnız bu cihazda':photo.licenceName}`;}
// Marker/hover image preference: personal camera photo, public camera photo, installed scan poster, remote scan poster.
export function roomImage(roomId:string,photos:Record<string,PhotoView[]>,localPosters:Record<string,string>,remotePoster?:string):RoomImage|null{
 const photo=photos[roomId]?.[0];if(photo)return {src:photo.url,kind:'photo',caption:photoCaption(photo),personal:photo.personal};
 const poster=localPosters[roomId]||remotePoster;return poster?{src:poster,kind:'scan',caption:SCAN_CAPTION,personal:false}:null;
}
