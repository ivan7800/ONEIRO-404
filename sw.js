const CACHE='oneiro-404-v1.0.1-final';
const ASSETS=[
  './','./index.html','./manifest.webmanifest',
  './css/core.css','./css/animations.css','./css/themes.css',
  './js/storage.js','./js/audio-engine.js','./js/journal-core.js','./js/journal-db.js','./js/analytics-core.js','./js/privacy.js','./js/backup.js','./js/session-engine.js','./js/accessibility.js','./js/router.js','./js/app.js',
  './assets/icons/icon.svg','./assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/icons/apple-touch-icon.png'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&key.startsWith('oneiro-404-')).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy));}
      return response;
    }).catch(()=>caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(request).then(cached=>{
    const network=fetch(request).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy));}
      return response;
    }).catch(()=>null);
    if(cached){event.waitUntil(network);return cached;}
    return network.then(response=>response||new Response('Offline',{status:503,statusText:'Offline'}));
  }));
});
