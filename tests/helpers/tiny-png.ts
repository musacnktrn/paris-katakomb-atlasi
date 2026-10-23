// ureten: opus. Deterministic tiny PNG generated in code: synthetic test image, not a real photo.
import {deflateSync,crc32} from 'node:zlib';
function chunk(type:string,data:Buffer){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const body=Buffer.concat([Buffer.from(type,'latin1'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body)>>>0);return Buffer.concat([len,body,crc]);}
export function tinyPng(width=4,height=3,rgb:[number,number,number]=[176,96,48]){
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
 const rows=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++){const o=y*(width*3+1);rows[o]=0;for(let x=0;x<width;x++)rows.set(rgb,o+1+x*3);}
 return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
