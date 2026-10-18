// ureten: codex
import { openDB, type DBSchema } from 'idb';
import {CURRENT_ATLAS} from './catalog';
export const STORAGE_SCOPE=encodeURIComponent(typeof document==='undefined'?'/test/':new URL('./',document.baseURI).pathname);
export const CACHE_PREFIX=`atlas-${CURRENT_ATLAS.id}-${STORAGE_SCOPE}-`;
export const DATABASE_NAME=`archify-atlas-${CURRENT_ATLAS.id}-${STORAGE_SCOPE}-v1`;
export interface Note { id: string; title: string; text: string; coordinates: [number, number] | null; createdAt: string; updatedAt: string; }
export interface LocalAsset { id: string; name: string; kind: 'geojson' | 'glb' | 'pmtiles'; blob: Blob; sha256: string; createdAt: string; }
export interface InstalledPack { id: string; version: string; cache: string; bytes: number; installedAt: string; assets: {url: string; sha256: string; bytes: number}[]; }
interface AtlasDB extends DBSchema {
  notes: { key: string; value: Note };
  assets: { key: string; value: LocalAsset };
  packs: { key: string; value: InstalledPack };
}
export const db = () => openDB<AtlasDB>(DATABASE_NAME, 1, { upgrade(d) { d.createObjectStore('notes', {keyPath:'id'}); d.createObjectStore('assets', {keyPath:'id'}); d.createObjectStore('packs', {keyPath:'id'}); } });
export async function saveNote(title: string, text: string, coordinates: [number,number] | null = null) {
  if (!title.trim() || title.length > 200 || text.length > 20000) throw new Error('Not başlığı veya uzunluğu geçersiz.');
  if (coordinates && (!coordinates.every(Number.isFinite) || Math.abs(coordinates[0])>180 || Math.abs(coordinates[1])>90)) throw new Error('Koordinat geçersiz.');
  const now = new Date().toISOString(); const note: Note = {id:crypto.randomUUID(),title:title.trim(),text,coordinates,createdAt:now,updatedAt:now};
  await (await db()).put('notes',note); return note;
}
export async function exportNotes() { return {schema:1,atlasId:'paris-catacombs',exportedAt:new Date().toISOString(),notes:await (await db()).getAll('notes')}; }
export async function requestPersistentStorage() { return {persistent: await navigator.storage?.persist?.() ?? false, estimate: await navigator.storage?.estimate?.() ?? {}}; }
