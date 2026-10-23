// ureten: opus: access grouping, depth labels and private-record shaping (synthetic records only; no private data).
import {describe,it,expect} from 'vitest';
import type * as GeoJSON from 'geojson';
import {accessGroupOf,accessStyleOf,accessGlyphOf,accessGlyph,depthLabel,isAccessRecord,personalFeature,mapFeature,displayTitle,sourceLevelOf,isNamedPlace} from '../src/core/underground';
import {searchFeatures} from '../src/core/catalog';
const point=(id:string,properties:Record<string,unknown>):GeoJSON.Feature=>({type:'Feature',id,properties:{id,...properties},geometry:{type:'Point',coordinates:[2.33,48.83]}});
describe('Access groups are UI groupings of historical records',()=>{
 it('classifies official, shaft subtypes, stair, well and the three source-named former entrances',()=>{
  expect(accessGroupOf({kind:'access',id:'museum-entry'})).toBe('official');
  expect(accessStyleOf({kind:'shaft',sourceCategory:'getMaintenanceWellWithRungsMarkers'})).toBe('shaft-rungs');
  expect(accessStyleOf({kind:'shaft',sourceCategory:'getMaintenanceWellWithoutRungsMarkers'})).toBe('shaft-plain');
  expect(accessStyleOf({kind:'shaft',sourceCategory:'getCommunicationWellMarkers'})).toBe('shaft-interlevel');
  expect(accessGroupOf({kind:'stair'})).toBe('stair');expect(accessGroupOf({kind:'well'})).toBe('well');
  for(const id of ['historic-poi-getGeneralInformationMarkers-6','historic-poi-getGeneralInformationMarkers-100','historic-poi-getFeatureMarkers-332'])expect(accessGroupOf({kind:'feature',id})).toBe('former');
  expect(accessGroupOf({kind:'feature',id:'historic-poi-getGeneralInformationMarkers-7'})).toBe(null);
  expect(accessGroupOf({kind:'linework'})).toBe(null);
  expect(isAccessRecord(point('x',{kind:'room'}))).toBe(false);
 });
 it('uses entry and exit glyphs for the official records',()=>{expect(accessGlyphOf({kind:'access',id:'museum-entry'})).toBe('↧');expect(accessGlyphOf({kind:'access',id:'museum-exit'})).toBe('↥');});
});
describe('Depth labels never invent a depth',()=>{
 it('shows −N m only for a positive source depth',()=>expect(depthLabel({kind:'room',depthMetres:21})).toBe('−21 m'));
 it('shows Yerüstü for official street-level records, never −0 m',()=>{expect(depthLabel({kind:'access',id:'museum-entry',depthMetres:0})).toBe('Yerüstü');expect(depthLabel({kind:'access',id:'museum-exit'})).toBe('Yerüstü');});
 it('says unknown when the source has no depth',()=>{expect(depthLabel({kind:'shaft',depthMetres:null})).toBe('Derinlik bilinmiyor');expect(depthLabel({kind:'linework'})).toBe('Derinlik bilinmiyor');});
});
describe('Private features keep the source and add only UI fields',()=>{
 it('adds accessGroup/accessStyle and a source-honest label for a former entrance',()=>{
  const f=personalFeature(point('historic-poi-getGeneralInformationMarkers-6',{kind:'feature',title:'Sentetik eski giriş',sourceCategory:'getGeneralInformationMarkers',accessStatus:'unknown'}));
  expect(f.properties).toMatchObject({accessGroup:'former',accessStyle:'former',sourceCategoryLabel:'Kaynakta eski giriş',accessStatus:'unknown',kind:'feature',title:'Sentetik eski giriş'});
 });
 it('slims the map copy without changing geometry',()=>{
  const full=personalFeature(point('s1',{kind:'shaft',sourceCategory:'getMaintenanceWellWithRungsMarkers',sourcePixel:[1,2],sourceUrl:'https://example.org'}));
  const slim=mapFeature(full);expect(slim.geometry).toBe(full.geometry);expect(slim.properties).toEqual({id:'s1',kind:'shaft',title:'Tarihî şaft · s1',sourceCategoryLabel:'Tarihî şaft',personalSource:true,accessGroup:'shaft',accessStyle:'shaft-rungs'});
 });
});
describe('Search index',()=>{
 it('matches primitive values and ignores nested pixel arrays',()=>{
  const c:GeoJSON.FeatureCollection={type:'FeatureCollection',features:[point('a',{title:'Carrière Raidos',sourcePixelLine:[[777,888]]})]};
  expect(searchFeatures(c,'raidos').length).toBe(1);expect(searchFeatures(c,'777').length).toBe(0);expect(searchFeatures(c,'carriere').length).toBe(1);
 });
});
// ureten: opus: F3 fixes. Synthetic records only.
describe('Display titles are plain Turkish in the UI; the raw source string is kept',()=>{
 it('turns a derived source code title into "kayıt N" and keeps the raw string in sourceTitle',()=>{
  const f=personalFeature(point('syn-59',{kind:'shaft',title:'Basamaksız servis şaftı · getMaintenanceWellWithoutRungsMarkers:59',originalTitle:'',titleDerived:true,sourceCategory:'getMaintenanceWellWithoutRungsMarkers'}));
  expect(f.properties?.title).toBe('Basamaksız servis şaftı · kayıt 59');expect(f.properties?.sourceTitle).toBe('Basamaksız servis şaftı · getMaintenanceWellWithoutRungsMarkers:59');expect(f.properties?.id).toBe('syn-59');
 });
 it('leaves real source names and synthetic titles alone',()=>{
  expect(displayTitle({kind:'feature',title:'Sentetik salon adı',originalTitle:'Sentetik salon adı'})).toBe('Sentetik salon adı');
  expect(displayTitle({kind:'stair',title:'Döner merdiven · getSpiralStaircaseMarkers:4',titleDerived:true})).toBe('Döner merdiven · kayıt 4');
  expect(personalFeature(point('syn-x',{kind:'shaft',title:'Sentetik şaft A'})).properties?.sourceTitle).toBeUndefined();
 });
});
describe('Source level and ink class come only from the package',()=>{
 it('reads superieur/inferieur and treats anything else, or nothing, as unknown',()=>{
  expect(sourceLevelOf({sourceLevel:'superieur'})).toBe('superieur');expect(sourceLevelOf({sourceLevel:'inferieur'})).toBe('inferieur');
  expect(sourceLevelOf({sourceLevel:'unknown'})).toBe('unknown');expect(sourceLevelOf({})).toBe('unknown');
 });
 it('copies inkClass/sourceLevel to the map only when present, so older packages keep the old style',()=>{
  const line=(id:string,extra:Record<string,unknown>):GeoJSON.Feature=>({type:'Feature',id,properties:{id,kind:'linework',title:'Sentetik çizgi',...extra},geometry:{type:'LineString',coordinates:[[2.33,48.83],[2.331,48.83]]}});
  expect(mapFeature(personalFeature(line('l1',{inkClass:'blue-grey',sourceLevel:'inferieur'}))).properties).toMatchObject({inkClass:'blue-grey',sourceLevel:'inferieur'});
  const old=mapFeature(personalFeature(line('l2',{}))).properties!;expect('inkClass' in old).toBe(false);expect('sourceLevel' in old).toBe(false);
 });
});
describe('Named historical places stay source marks',()=>{
 it('flags feature/room points that carry their own source name, never other kinds',()=>{
  expect(isNamedPlace({kind:'feature',originalTitle:'Sentetik yer'})).toBe(true);expect(isNamedPlace({kind:'room',originalTitle:'Sentetik salon'})).toBe(true);
  expect(isNamedPlace({kind:'feature',originalTitle:'  '})).toBe(false);expect(isNamedPlace({kind:'shaft',originalTitle:'x'})).toBe(false);expect(isNamedPlace({kind:'surface',originalTitle:'x'})).toBe(false);
  const f=personalFeature(point('syn-place',{kind:'feature',title:'Sentetik yer',originalTitle:'Sentetik yer',sourceCategoryLabel:'Tarihî yer bilgisi'}));
  expect(f.properties).toMatchObject({kind:'feature',namedPlace:true,placeLabel:'Sentetik yer',sourceCategoryLabel:'Tarihî yer bilgisi'});
  expect(personalFeature(point('syn-tier1',{kind:'feature',originalTitle:'Sentetik oda',sourceCategory:'getGeneralInformationMarkers'})).properties?.placeTier).toBe(1);
  expect(personalFeature(point('syn-tier2',{kind:'feature',originalTitle:'Sentetik not',sourceCategory:'getFeatureMarkers'})).properties?.placeTier).toBe(2);
  expect(personalFeature(point('syn-tier3',{kind:'feature',originalTitle:'12',sourceCategory:'getIdcMarkers'})).properties?.placeTier).toBe(3);
 });
});
describe('One glyph table for map, legend, directory and detail',()=>{
 it('gives plain shafts their own glyph, distinct from rung shafts',()=>{
  expect(accessGlyph['shaft-plain']).toBe('⇣');expect(accessGlyph['shaft-plain']).not.toBe(accessGlyph['shaft-rungs']);
  expect(accessGlyphOf({kind:'shaft',sourceCategory:'getMaintenanceWellWithoutRungsMarkers'})).toBe(accessGlyph['shaft-plain']);
  expect(new Set(Object.values(accessGlyph)).size).toBe(Object.keys(accessGlyph).length);
 });
});
