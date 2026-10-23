// ureten: opus: F4 read a GeoJSON package's top-level "name" and "createdAt" without parsing its feature array.
// The scanner walks only the top-level keys that come before "features" (values are skipped, strings respected).
// complete=false means the answer is not certain (a key may follow "features", or the head was cut off); the caller then parses fully.
export type PackageHeader={name:string;createdAt:string;complete:boolean};
export function packageHeader(text:string):PackageHeader{
 let i=0,name='',createdAt='',sawName=false,sawCreated=false;const n=text.length;
 const ws=()=>{while(i<n&&(text[i]===' '||text[i]==='\n'||text[i]==='\r'||text[i]==='\t'||text[i]==='﻿'))i++;};
 const incomplete={name,createdAt,complete:false};
 // Returns the decoded string, or null when the text ends inside it.
 const readString=():string|null=>{if(text[i]!=='"')return null;const start=i;i++;while(i<n){const c=text[i];if(c==='\\'){i+=2;continue;}if(c==='"'){i++;try{return JSON.parse(text.slice(start,i)) as string;}catch{return null;}}i++;}return null;};
 const skipValue=():boolean=>{ws();if(i>=n)return false;const c=text[i];
  if(c==='"')return readString()!==null;
  if(c==='{'||c==='['){let depth=0;while(i<n){const d=text[i];if(d==='"'){if(readString()===null)return false;continue;}if(d==='{'||d==='[')depth++;else if(d==='}'||d===']'){depth--;if(depth===0){i++;return true;}}i++;}return false;}
  while(i<n&&!/[,}\]\s]/.test(text[i]))i++;return i<n;};
 ws();if(text[i]!=='{')return incomplete;i++;
 for(;;){ws();if(i>=n)return {name,createdAt,complete:false};if(text[i]==='}')return {name,createdAt,complete:true};
  const key=readString();if(key===null)return {name,createdAt,complete:false};ws();if(text[i]!==':')return {name,createdAt,complete:false};i++;ws();
  if(key==='features')return {name,createdAt,complete:sawName&&sawCreated};
  if((key==='name'||key==='createdAt')&&text[i]==='"'){const v=readString();if(v===null)return {name,createdAt,complete:false};if(key==='name'){name=v;sawName=true;}else{createdAt=v;sawCreated=true;}}
  else if(!skipValue())return {name,createdAt,complete:false};
  ws();if(text[i]===',')i++;
 }
}
