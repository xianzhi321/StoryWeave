const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const web=path.join(__dirname,'web'),handlers={},cache=new Map();let network=0;const deleted=[];
const oldCaches=['storyweave-v1-9-8','storyweave-v1-9-7','storyweave-v1-9-6','storyweave-v1-9-5-shelf','storyweave-v1-9-5','storyweave-v1-9-4','storyweave-v1-9-3','storyweave-v1-9-2','storyweave-v1-9-1','storyweave-v1-9-0',...Array.from({length:14},(_,index)=>'storyweave-v1-7-'+index),...Array.from({length:10},(_,index)=>'storyweave-v1-8-'+index)];
const self={location:{origin:'https://storyweave.test'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:()=>{},clients:{claim:()=>{}}};
const context=vm.createContext({self,URL,fetch:async()=>{network++;throw Error('offline')},
 importScripts:name=>vm.runInContext(fs.readFileSync(path.join(web,name),'utf8'),context),
 caches:{open:async()=>({match:async key=>cache.get(key),put:async(k,v)=>cache.set(k,v)}),
 keys:async()=>['other-app',...oldCaches],delete:async key=>deleted.push(key)}});
vm.runInContext(fs.readFileSync(path.join(web,'sw.js'),'utf8'),context);
for(const asset of self.STORYWEAVE_OFFLINE_ASSETS){assert(fs.existsSync(path.join(web,asset)),'Missing precache asset '+asset);}
const engine=fs.readFileSync(path.join(web,'vendor/azgaar/index.html'),'utf8');
for(const match of engine.matchAll(/<script[^>]*src="([^"]+)"/g)){
 assert(!/^https?:/.test(match[1]),'Remote script in offline engine');
 assert(self.STORYWEAVE_OFFLINE_ASSETS.includes('./vendor/azgaar/'+match[1]),'Script not precached: '+match[1]);
}
async function test(){
 const response={ok:true};cache.set('https://storyweave.test/vendor/azgaar/index.html',response);
 let pending;handlers.fetch({request:{method:'GET',url:'https://storyweave.test/vendor/azgaar/index.html?seed=42&request=abc'},respondWith:p=>pending=p});
 assert.equal(await pending,response);assert.equal(network,0);
 handlers.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(deleted,oldCaches);
 console.log('PASS offline assets: complete engine script inventory, seed-query cache resolution, unrelated cache preserved');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
