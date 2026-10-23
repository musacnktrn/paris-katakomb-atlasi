// ureten: codex. Shared browser fixture for real persistent Blob/IndexedDB behaviour.
import {test as base} from '@playwright/test';
import {mkdtemp,mkdir} from 'node:fs/promises';
export {expect} from '@playwright/test';
export const test=base.extend({context:async({playwright,browserName,viewport,hasTouch,isMobile},use)=>{
 await mkdir('private-data',{recursive:true});const profile=await mkdtemp('private-data/qa-persistent-'+browserName+'-');
 const context=await playwright[browserName].launchPersistentContext(profile,{viewport,hasTouch,isMobile,headless:true,...(browserName==='chromium'?{channel:'chrome',args:['--enable-unsafe-swiftshader']}:{})});
 try{await use(context);}finally{await context.close();}
}});
