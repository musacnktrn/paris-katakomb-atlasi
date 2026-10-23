// ureten: codex. Source gaps, polygon holes and unknown heights must survive the 3D conversion.
import {describe,it,expect} from 'vitest';
import type * as GeoJSON from 'geojson';
import {planPaths,diagramY,knownBuildingHeight} from '../src/core/plan-geometry';
describe('Source geometry in schematic 3D',()=>{
 it('keeps separated paths and polygon holes, without closing gaps or changing source coordinates',()=>{
  const paths=[[[2.32,48.83],[2.321,48.83]],[[2.33,48.84],[2.331,48.84]]];
  const rings=[[[2.32,48.83],[2.322,48.83],[2.321,48.832],[2.32,48.83]],[[2.3205,48.8305],[2.321,48.8305],[2.3205,48.831],[2.3205,48.8305]]];
  const input:GeoJSON.FeatureCollection={type:'FeatureCollection',features:[{type:'Feature',id:'paths',properties:{sourceLevel:'inferieur'},geometry:{type:'MultiLineString',coordinates:paths}},{type:'Feature',id:'area',properties:{},geometry:{type:'Polygon',coordinates:rings}}]};
  const before=JSON.stringify(input),out=planPaths(input);expect(out).toHaveLength(4);expect(out.map(p=>p.points)).toEqual([...paths,...rings]);expect(JSON.stringify(input)).toBe(before);
  expect(out.filter(p=>p.closed)).toHaveLength(2);expect(out.map(p=>p.level)).toEqual(['inferieur','inferieur','unknown','unknown']);
 });
 it('keeps unknown source levels separate even when an unrelated point has a numerical depth',()=>{
  const input:GeoJSON.FeatureCollection={type:'FeatureCollection',features:[{type:'Feature',properties:{depthMetres:20},geometry:{type:'LineString',coordinates:[[2.32,48.83],[2.33,48.84]]}}]};
  expect(planPaths(input)[0].level).toBe('unknown');expect(diagramY('unknown',100)).toBe(-300);expect(diagramY('unknown',200)).toBe(-600);expect(input.features[0].properties?.depthMetres).toBe(20);
 });
 it('does not invent heights for missing, sentinel or malformed building values',()=>{
  for(const p of [null,{}, {heightM:0},{heightM:-1000},{heightM:NaN},{heightM:Infinity},{heightM:'12'}])expect(knownBuildingHeight(p)).toBe(null);
  expect(knownBuildingHeight({heightM:12.75})).toBe(12.75);
 });
});
