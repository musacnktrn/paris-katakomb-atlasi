// ureten: codex. Decode source images and repair bad opaque entries privately.
export function posterCandidates(src:string):string[]{
 try{const u=new URL(src);if(u.origin==='https://assets.catacombes.xyz'&&u.pathname.startsWith('/assets/models/'))return [src,'https://catacombes.xyz/_next/image?'+new URLSearchParams({url:src,w:'640',q:'75'})];}catch{/* Local images have no remote fallback. */}return [src];
}
export async function forgetPreview(url:string){
 if(!('serviceWorker'in navigator)||!navigator.serviceWorker.controller)return;
 await new Promise<void>(resolve=>{const c=new MessageChannel(),timer=setTimeout(()=>{c.port1.close();resolve();},800);c.port1.onmessage=()=>{clearTimeout(timer);c.port1.close();resolve();};navigator.serviceWorker.controller!.postMessage({type:'FORGET_ROOM_PREVIEW',url},[c.port2]);});
}
export async function cacheDecodedPreview(url:string):Promise<boolean>{
 if(!('serviceWorker'in navigator))return false;
 try{const registration=await new Promise<ServiceWorkerRegistration|null>(resolve=>{const timer=setTimeout(()=>resolve(null),20000);navigator.serviceWorker.ready.then(r=>{clearTimeout(timer);resolve(r);}).catch(()=>{clearTimeout(timer);resolve(null);});});if(!registration?.active)return false;return await new Promise<boolean>(resolve=>{const c=new MessageChannel(),timer=setTimeout(()=>{c.port1.close();resolve(false);},15000);c.port1.onmessage=e=>{if(e.data.type==='done'){clearTimeout(timer);c.port1.close();resolve(e.data.done===1);}};registration.active!.postMessage({type:'CACHE_ROOM_PREVIEWS',urls:[url]},[c.port2]);});}catch{return false;}
}
const pending=new Map<string,Promise<boolean>>();
function preparePicture(src:string){
 const existing=pending.get(src);if(existing)return existing;
 async function load(url:string){return new Promise<boolean>(resolve=>{const img=new Image();let complete=false;const finish=(ok:boolean)=>{if(complete)return;complete=true;clearTimeout(timer);img.onload=null;img.onerror=null;if(!ok)img.src='';resolve(ok);};const timer=setTimeout(()=>finish(false),12000);img.referrerPolicy='no-referrer';img.onload=()=>finish(img.naturalWidth>0);img.onerror=()=>finish(false);img.src=url;});}
 const task=(async()=>{for(const candidate of posterCandidates(src)){if(await load(candidate)&&await cacheDecodedPreview(candidate))return true;await forgetPreview(candidate);}return false;})();pending.set(src,task);void task.finally(()=>pending.delete(src));return task;
}
export async function preloadRoomPictures(urls:string[],onProgress:(done:number,total:number,failed:number)=>void,signal?:AbortSignal){
 const unique=[...new Set(urls)],deadline=Date.now()+120000;let index=0,done=0,failed=0;
 async function job(){while(index<unique.length&&!signal?.aborted&&Date.now()<deadline){const src=unique[index++];const success=await preparePicture(src);if(success)done++;else failed++;if(!signal?.aborted)onProgress(done,unique.length,failed);}}
 await Promise.all([job(),job()]);return {done,total:unique.length,failed:unique.length-done};
}
