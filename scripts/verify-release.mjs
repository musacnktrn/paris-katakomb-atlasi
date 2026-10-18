// ureten: codex
import {readFile,readdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import path from 'node:path';
const m=JSON.parse(await readFile('dist/core-manifest.json','utf8'));for(const a of m.assets){const b=await readFile(path.join('dist',a.url));if(b.length!==a.bytes||createHash('sha256').update(b).digest('hex')!==a.sha256)throw Error('Integrity: '+a.url);if(/\.(pdf|tiff?|glb)$/i.test(a.url))throw Error('Unapproved document/model in core: '+a.url);}
for(const a of m.assets.filter(a=>/\.(html|css)$/.test(a.url))){const s=await readFile(path.join('dist',a.url),'utf8');if(/(?:src|href)=["']https?:\/\/|@import\s+url\(["']?https?:/i.test(s))throw Error('External shell dependency: '+a.url);}
console.log(JSON.stringify({ok:true,files:m.assets.length,totalBytes:m.totalBytes,version:m.version}));
