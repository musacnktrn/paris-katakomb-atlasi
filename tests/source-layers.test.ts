// ureten: codex. Entirely synthetic data; no private user identifiers/locations.
import {describe,it,expect} from 'vitest';
import {waterMarkOf,legendAccessOf,safeMarkerColor,matchesSource,sourceProximityLabel,sourcePaint} from '../src/core/source-layers';
import {personalFeature,accessGroupOf,accessGlyphOf,positionErrorOf} from '../src/core/underground';
import type * as GeoJSON from 'geojson';
describe('Source-honest layers',()=>{
 it('keeps personal entry marks separate from museum entries and historical shafts',()=>{
  const f:GeoJSON.Feature={type:'Feature',id:'synthetic-user-point',geometry:{type:'Point',coordinates:[2.31,48.83]},properties:{kind:'user-entrance',title:'Synthetic personal mark',accessStatus:'unknown',displayStyle:'first-primary',displayColor:'#7c3aed',cameraHeadingDeg:110}};
  const p=personalFeature(f).properties!;expect(p).toMatchObject({accessGroup:'user',accessStyle:'user',accessStatus:'unknown',firstPrimary:true,displayColor:'#7c3aed',cameraHeadingDeg:110});expect(accessGlyphOf(p)).toBe('★');expect(accessGroupOf({kind:'access'})).toBe('official');
 });
 it('accepts only a literal six-digit colour for an imported marker',()=>{expect(safeMarkerColor({displayColor:'url(https://example.org)'})).toBe('#dc2626');expect(safeMarkerColor({displayColor:'#abcDEF'})).toBe('#abcDEF');});
 it('preserves literal source RGB and zero opacity without accepting CSS or guessing a symbol meaning',()=>{
  expect(sourcePaint({style:{fill:[255,215,80],stroke:[14,51,177],fillOpacity:0}})).toEqual({sourceFillColor:'#ffd750',sourceStrokeColor:'#0e33b1',sourceFillOpacity:0});
  expect(sourcePaint({style:{fill:'url(synthetic)',stroke:[-1,4,5],fillOpacity:2}})).toEqual({});expect(sourcePaint({})).toEqual({});
 });
 it('does not turn a water structure or water well into a flooded gallery',()=>{
  expect(waterMarkOf({title:'Aqueduct'})).toBe('structure');expect(waterMarkOf({title:'Water well'})).toBe('well');expect(waterMarkOf({title:'A room'})).toBe(null);
 });
 it.each([['Inundated galleries','inundated'],['Depth is variable: sometimes dry and sometimes above boot level','inundated'],['Sumps','sump'],['Muddy passage','muddy'],['Drain','note']])('reads the source wording %s', (title,kind)=>expect(waterMarkOf({title})).toBe(kind));
 it('reads only explicit legend access, with current access still unknown',()=>{
  expect(legendAccessOf({legend_label:'NON ACCESSIBLE'})).toBe('inaccessible');expect(legendAccessOf({legend_label:'ACCESSIBLE'})).toBe('accessible');expect(legendAccessOf({colour:'red'})).toBe('unknown');
  expect(accessGroupOf({kind:'puits_skull'})).toBe('grs');
  expect(accessGroupOf({kind:'shaft',recordType:'grs-symbol',legendLabel:'PUITS'})).toBe('grs');
 });
 it('uses source selection consistently and accepts a measured alignment uncertainty',()=>{
  expect(matchesSource({sourceId:'synthetic-a'},null)).toBe(true);expect(matchesSource({sourceId:'synthetic-a'},['synthetic-b'])).toBe(false);expect(matchesSource({sourceId:'synthetic-a'},[])).toBe(false);
  expect(positionErrorOf({pos_uncertainty_m:5,georef_p90_m:8})).toBe(8);expect(positionErrorOf({})).toBe(null);
  expect(positionErrorOf({fitHeldOutMedianM:1,posUncertaintyM:7.4,fitP90M:3})).toBe(7.4);
 });
 it('labels source proximity without upgrading it to gallery identity or independent survey evidence',()=>{
  const value={sampleCount:30,radiusM:30,withinRadiusFraction:.9,medianM:4,p90M:8,physicalIdentityConfirmed:true};
  expect(sourceProximityLabel(value)).toContain('%90');expect(sourceProximityLabel(value)).toContain('bağımsız ölçüm doğrulaması değildir');
  expect(sourceProximityLabel({...value,withinRadiusFraction:2})).toBe('');expect(sourceProximityLabel({...value,sampleCount:0})).toBe('');expect(sourceProximityLabel(null)).toBe('');
 });
});
