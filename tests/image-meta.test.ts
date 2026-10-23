// ureten: codex. Synthetic EXIF segments only; no personal images or location data.
import {describe,it,expect} from 'vitest';
import {jpegOrientation,photoSizeMatches} from '../src/core/image-meta';
function jpeg(orientation:number,little=true){
 const bytes=new Uint8Array(40),v=new DataView(bytes.buffer);bytes.set([255,216,255,225,0,34,69,120,105,102,0,0]);
 bytes.set(little?[73,73]:[77,77],12);v.setUint16(14,42,little);v.setUint32(16,8,little);v.setUint16(20,1,little);
 v.setUint16(22,0x112,little);v.setUint16(24,3,little);v.setUint32(26,1,little);v.setUint16(30,orientation,little);bytes.set([255,217],38);return bytes;
}
describe('Phone photo EXIF orientation and archive dimensions',()=>{
 it.each([1,2,3,4,5,6,7,8])('reads orientation %i in either TIFF byte order',orientation=>{
  expect(jpegOrientation(jpeg(orientation,true))).toBe(orientation);expect(jpegOrientation(jpeg(orientation,false))).toBe(orientation);
 });
 it.each([5,6,7,8])('accepts swapped decoded dimensions only for rotated orientation %i',orientation=>{
  expect(photoSizeMatches({width:3,height:4},{width:4,height:3},orientation)).toBe(true);
 });
 it('rejects unrelated or incorrectly swapped image sizes',()=>{
  expect(photoSizeMatches({width:3,height:4},{width:4,height:3},1)).toBe(false);
  expect(photoSizeMatches({width:2,height:4},{width:4,height:3},6)).toBe(false);
 });
 it('handles a truncated/hostile TIFF without reading outside the segment',()=>{
  const truncated=jpeg(6).slice(0,18);expect(jpegOrientation(truncated)).toBe(1);
  const hostile=jpeg(6);new DataView(hostile.buffer).setUint32(16,0xfffffff0,true);expect(jpegOrientation(hostile)).toBe(1);
 });
});
