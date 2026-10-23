// ureten: codex
import { openDB, type DBSchema } from 'idb';
import {CURRENT_ATLAS} from './catalog';
export const STORAGE_SCOPE=encodeURIComponent(typeof document==='undefined'?'/test/':new URL('./',document.baseURI).pathname);
export const CACHE_PREFIX=`atlas-${CURRENT_ATLAS.id}-${STORAGE_SCOPE}-`;
export const DATABASE_NAME=`archify-atlas-${CURRENT_ATLAS.id}-${STORAGE_SCOPE}-v1`;
export interface Note { id: string; title: string; text: string; coordinates: [number, number] | null; createdAt: string; updatedAt: string; }
// ureten: opus: camera-photo metadata kept with a collection image (category 'room-photo').
export interface RoomPhotoMeta { creator:string; sourcePage:string; captionExact:string; captureDate:string|null; licenceName:string; licenceUrl:string|null; licenceStatus:'personal-cache-only'|'open'; primary?:boolean; width?:number; height?:number; }
// ureten: codex: a map image carries its own source and placement status; image bounds alone are not survey proof.
export interface MapSourceMeta {id:string;title:string;placement:'native'|'approximate'|'unlocated';positionNote:string;sourceUrl?:string;defaultVisible?:boolean;}
export interface LocalAsset { id: string; name: string; kind: 'geojson' | 'glb' | 'pmtiles' | 'image'; blob: Blob; sha256: string; createdAt: string; roomId?:string; roomIds?:string[]; featureIds?:string[]; photo?:RoomPhotoMeta; category?:string; mapBounds?:[number,number,number,number]; collectionId?:string; sourceUrl?:string;
  // ureten: opus: F4 top-level GeoJSON package name/createdAt, stored at import so startup can pick the active package without parsing.
  packageName?:string; packageCreatedAt?:string; mapSource?:MapSourceMeta; }
export interface InstalledPack { id: string; version: string; cache: string; bytes: number; installedAt: string; assets: {url: string; sha256: string; bytes: number}[]; }
export interface CollectionRecord {id:string;title:string;assetCount:number;bytes:number;installedAt:string;assetIds?:string[];rights?:string;}
interface AtlasDB extends DBSchema {
  collections: {key:string;value:CollectionRecord};
  notes: { key: string; value: Note };
  assets: { key: string; value: LocalAsset };
  packs: { key: string; value: InstalledPack };
}
export const db = () => openDB<AtlasDB>(DATABASE_NAME, 2, { upgrade(d) { for(const name of ['notes','assets','packs','collections'] as const)if(!d.objectStoreNames.contains(name))d.createObjectStore(name,{keyPath:'id'}); } });
export async function saveNote(title: string, text: string, coordinates: [number,number] | null = null) {
  if (!title.trim() || title.length > 200 || text.length > 20000) throw new Error('Not başlığı veya uzunluğu geçersiz.');
  if (coordinates && (!coordinates.every(Number.isFinite) || Math.abs(coordinates[0])>180 || Math.abs(coordinates[1])>90)) throw new Error('Koordinat geçersiz.');
  const now = new Date().toISOString(); const note: Note = {id:crypto.randomUUID(),title:title.trim(),text,coordinates,createdAt:now,updatedAt:now};
  await (await db()).put('notes',note); return note;
}
export async function exportNotes() { return {schema:1,atlasId:'paris-catacombs',exportedAt:new Date().toISOString(),notes:await (await db()).getAll('notes')}; }
export async function requestPersistentStorage() { return {persistent: await navigator.storage?.persist?.() ?? false, estimate: await navigator.storage?.estimate?.() ?? {}}; }
