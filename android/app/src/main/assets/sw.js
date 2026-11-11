importScripts('./offline-assets.js');
const CACHE='storyweave-v1-9-19';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE)
  .then(c=>c.addAll(self.STORYWEAVE_OFFLINE_ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys()
  .then(keys=>Promise.all(keys.filter(k=>k.startsWith('storyweave-')&&k!==CACHE).map(k=>caches.delete(k))))
  .then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET'||url.origin!==self.location.origin)return;
  // Seed parameters change engine settings, not its HTML bytes.
  const engine=url.pathname.includes('/vendor/azgaar/');
  if(engine)url.search='';
  const key=engine?url.href:e.request;
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(engine){const hit=await cache.match(key);if(hit)return hit;}
    try{
      const response=await fetch(e.request);
      if(response.ok){await cache.put(key,response.clone());return response;}
      return await cache.match(key)||response;
    }catch(error){const hit=await cache.match(key);if(hit)return hit;throw error;}
  })());
});
