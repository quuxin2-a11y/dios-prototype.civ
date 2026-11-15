var C="godeye-v52",TC="ojos-tiles",FILES=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
var TILE=/(^|\.)(arcgisonline\.com|maptiles\.arcgis\.com)$/;
self.addEventListener("install",function(e){e.waitUntil(caches.open(C).then(function(c){return c.addAll(FILES)}).catch(function(){}).then(function(){return self.skipWaiting()}))});
self.addEventListener("activate",function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(x){return x!==C&&x!==TC}).map(function(x){return caches.delete(x)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener("fetch",function(e){var u;try{u=new URL(e.request.url)}catch(x){return}if(e.request.method!=="GET")return;
// map tiles: left alone while online; the saved copy is served when there is no signal
if(TILE.test(u.hostname)&&u.pathname.indexOf("/tile/")>0){if(self.navigator&&self.navigator.onLine!==false)return;e.respondWith(caches.open(TC).then(function(c){return c.match(e.request.url)}).then(function(m){return m||fetch(e.request)}).catch(function(){return Response.error()}));return}
if(u.origin!==location.origin)return;
e.respondWith(fetch(e.request).then(function(r){var cp=r.clone();caches.open(C).then(function(c){c.put(e.request,cp)});return r}).catch(function(){return caches.match(e.request).then(function(m){return m||caches.match("./index.html")})}))});
