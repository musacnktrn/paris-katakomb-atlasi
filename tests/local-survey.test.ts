// ureten: codex. Entirely synthetic GLB records; no private models or identifiers.
import {describe,it,expect} from 'vitest';
import {findVerifiedSurveyAsset} from '../src/core/local-survey';
import {digest} from '../src/core/validation';
import type {LocalAsset} from '../src/core/storage';
function glb(doc:object={asset:{version:'2.0'}}){
 const text=new TextEncoder().encode(JSON.stringify(doc)),length=Math.ceil(text.length/4)*4,bytes=new Uint8Array(20+length),view=new DataView(bytes.buffer);view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,bytes.length,true);view.setUint32(12,length,true);view.setUint32(16,0x4e4f534a,true);bytes.fill(32,20);bytes.set(text,20);return bytes.buffer;
}
async function entry(body=glb()){const sha256=await digest(body),asset:LocalAsset={id:'synthetic-installed-survey',name:'Synthetic survey',kind:'glb',blob:new Blob([body]),sha256,createdAt:'2026-10-23T00:00:00Z'};return {asset,expected:{bytes:body.byteLength,sha256}};}
describe('Installed survey reuse',()=>{
 it('returns the exact verified asset without copying or changing its collection metadata',async()=>{
  const {asset,expected}=await entry();asset.collectionId='synthetic-source-collection';expect(await findVerifiedSurveyAsset([asset],expected)).toBe(asset);expect(asset.collectionId).toBe('synthetic-source-collection');
 });
 it('does not trust a matching SHA field when the stored bytes are corrupt',async()=>{
  const {asset,expected}=await entry(),corrupt=new Uint8Array(await asset.blob.arrayBuffer());corrupt[corrupt.length-1]^=1;asset.blob=new Blob([corrupt]);expect(await findVerifiedSurveyAsset([asset],expected)).toBe(null);expect(asset.sha256).toBe(expected.sha256);
 });
 it('refuses a GLB that still needs a file outside the device archive',async()=>{
  const {asset,expected}=await entry(glb({asset:{version:'2.0'},images:[{uri:'https://synthetic.invalid/texture.jpg'}]}));expect(await findVerifiedSurveyAsset([asset],expected)).toBe(null);
 });
});
