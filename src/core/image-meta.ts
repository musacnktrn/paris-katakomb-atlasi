// ureten: opus: F4 orientation-aware photo size check. A phone JPEG stores its pixels in sensor order and an EXIF Orientation tag;
// values 5-8 mean the picture is shown rotated by 90 degrees. The ZIP builder records the stored (header) size, while browsers
// decode with the rotation applied, so for 5-8 the decoded width and height are swapped relative to the manifest.
export function jpegOrientation(bytes:Uint8Array):number{
 if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return 1;
 let i=2;
 while(i+4<=bytes.length){
  if(bytes[i]!==0xff)return 1;const marker=bytes[i+1]!;
  if(marker===0xd8||marker===0x01||(marker>=0xd0&&marker<=0xd7)){i+=2;continue;}
  if(marker===0xda||marker===0xd9)return 1;
  const length=(bytes[i+2]!<<8)|bytes[i+3]!;if(length<2||i+2+length>bytes.length)return 1;
  if(marker===0xe1&&length>=16&&bytes[i+4]===0x45&&bytes[i+5]===0x78&&bytes[i+6]===0x69&&bytes[i+7]===0x66&&bytes[i+8]===0&&bytes[i+9]===0)return tiffOrientation(bytes.subarray(i+10,i+2+length));
  i+=2+length;
 }
 return 1;
}
function tiffOrientation(t:Uint8Array):number{
 if(t.length<8)return 1;const little=t[0]===0x49&&t[1]===0x49,big=t[0]===0x4d&&t[1]===0x4d;if(!little&&!big)return 1;
 const u16=(o:number)=>little?t[o]!|(t[o+1]!<<8):(t[o]!<<8)|t[o+1]!;
 const u32=(o:number)=>little?(t[o]!|(t[o+1]!<<8)|(t[o+2]!<<16)|(t[o+3]!<<24))>>>0:((t[o]!<<24)|(t[o+1]!<<16)|(t[o+2]!<<8)|t[o+3]!)>>>0;
 if(u16(2)!==42)return 1;const ifd=u32(4);if(ifd+2>t.length)return 1;const count=u16(ifd);
 for(let k=0;k<count;k++){const e=ifd+2+k*12;if(e+12>t.length)return 1;if(u16(e)===0x0112){const v=u16(e+8);return v>=1&&v<=8?v:1;}}
 return 1;
}
// The decoded size matches the manifest as stored, or (Orientation 5-8) with width and height swapped.
export function photoSizeMatches(decoded:{width:number;height:number},manifest:{width:number;height:number},orientation:number){
 if(decoded.width===manifest.width&&decoded.height===manifest.height)return true;
 return orientation>=5&&orientation<=8&&decoded.width===manifest.height&&decoded.height===manifest.width;
}
