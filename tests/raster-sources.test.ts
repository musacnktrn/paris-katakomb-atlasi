// ureten: codex. Raster placement and defaults must not conflate an unlocated image with a map layer.
import {describe,it,expect} from 'vitest';
import type {LocalAsset} from '../src/core/storage';
import {rasterSourceId,rasterSourceOptions,rasterSourceSelected} from '../src/core/raster-sources';
import {collectionSchema} from '../src/core/collections';
describe('Installed raster sources',()=>{
 const asset=(value:Partial<LocalAsset>)=>({id:'synthetic',kind:'image',name:'Synthetic',blob:new Blob(),sha256:'0'.repeat(64),createdAt:'2026-10-23T00:00:00Z',...value} as LocalAsset);
 it('groups legacy IGC assets and retains the explicit default of an additional source',()=>{
  const igc=asset({category:'igc-raster-detail'}),source=asset({mapSource:{id:'synthetic-map',title:'Synthetic source',placement:'approximate',positionNote:'Test fit only',defaultVisible:false}});
  expect(rasterSourceId(igc)).toBe('igc-official');expect(rasterSourceOptions([igc,igc,source]).map(x=>x.count)).toEqual([2,1]);
  expect(rasterSourceSelected(igc,null)).toBe(true);expect(rasterSourceSelected(source,null)).toBe(false);expect(rasterSourceSelected(source,['synthetic-map'])).toBe(true);expect(rasterSourceSelected(igc,[])).toBe(false);
 });
 it('refuses geographic bounds on a source explicitly marked unlocated',()=>{
  const entry={path:'image.png',kind:'raster',name:'Synthetic',sha256:'0'.repeat(64),bytes:100,mapBounds:[2.3,48.8,2.4,48.9],category:'source-map-georeferenced',mapSource:{id:'synthetic-map',title:'Synthetic source',placement:'approximate',positionNote:'Test fit only'}};
  const meta={schema:1,atlasId:'paris-catacombs',id:'synthetic',title:'Synthetic',rights:'personal-copy',assets:[entry]};expect(collectionSchema.safeParse(meta).success).toBe(true);
  expect(collectionSchema.safeParse({...meta,assets:[{...entry,mapSource:{...entry.mapSource,placement:'unlocated'}}]}).success).toBe(false);
 });
});
