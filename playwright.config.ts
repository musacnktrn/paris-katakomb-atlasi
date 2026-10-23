import {defineConfig} from '@playwright/test';
// ureten: codex: the same targeted regressions can run on native WebKit; never launch concurrent workers.
const webkit=process.env.ATLAS_QA_BROWSER==='webkit';
export default defineConfig({testDir:'tests/browser',workers:1,timeout:60000,retries:0,use:{baseURL:'http://127.0.0.1:5184/paris-atlas/',browserName:webkit?'webkit':'chromium',...(webkit?{}:{channel:'chrome'}),headless:true,launchOptions:{args:webkit?[]:['--enable-unsafe-swiftshader']},viewport:{width:1440,height:950}},reporter:[['list'],['json',{outputFile:'test-results/browser-results.json'}]],webServer:{command:'node tests/serve.mjs',url:'http://127.0.0.1:5184/paris-atlas/',reuseExistingServer:process.env.ATLAS_QA_REUSE_SERVER==='1',timeout:30000}});
