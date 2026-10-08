var C='sleepcycle-v8',F=['./','index.html','app.js','manifest.webmanifest','favicon.svg','icons/icon-192.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(C).then(function(c){return c.addAll(F)}));self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(x){return x.indexOf('sleepcycle-')==0&&x!==C}).map(function(x){return caches.delete(x)}))}))});
self.addEventListener('fetch',function(e){e.respondWith(fetch(e.request).then(function(r){if(r.ok&&e.request.method==='GET'){var c=r.clone();caches.open(C).then(function(x){x.put(e.request,c)})}return r}).catch(function(){return caches.match(e.request,{ignoreSearch:true})}))});
