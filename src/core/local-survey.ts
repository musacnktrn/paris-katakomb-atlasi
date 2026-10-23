// ureten: codex. Reuse exact verified installed GLB bytes; metadata equality alone is insufficient.
import type {LocalAsset} from './storage';
import {digest,validateGlb} from './validation';
export async function findVerifiedSurveyAsset(candidates:readonly LocalAsset[],expected:{bytes:number;sha256:string}){
 for(const asset of candidates){
  if(asset.kind!=='glb'||asset.sha256!==expected.sha256||asset.blob.size!==expected.bytes)continue;
  try{const bytes=await asset.blob.arrayBuffer();if(await digest(bytes)!==expected.sha256)continue;validateGlb(bytes);return asset;}catch{/* An invalid source copy does not mutate the user's collection. */}
 }
 return null;
}
