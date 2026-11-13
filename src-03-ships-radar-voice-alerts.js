// ---- ships
var SHIPS=[],SHIPM={},AIS={ws:null,box:"",state:""};
function shipUp(id,n,lat,lon,sog,cog,src){if(id==null||!isFinite(lat)||!isFinite(lon)||Math.abs(lat)>90||(lat===0&&lon===0))return;var s=SHIPM[id];if(!s){if(SHIPS.length>=7000)return;s=SHIPM[id]={kind:"ship",id:id,n:n||("Vessel "+id)};SHIPS.push(s)}if(n)s.n=n;s.lat=lat;s.lon=lon;s.sog=sog;s.cog=cog;s.at=Date.now();s.src=src}
function loadShips(){getJSON("https://meri.digitraffic.fi/api/ais/v1/locations",40000).then(function(j){var n=Date.now();(j.features||[]).forEach(function(f){var g=f.geometry&&f.geometry.coordinates,p=f.properties||{};if(g&&(!p.timestampExternal||n-p.timestampExternal<36e5))shipUp(f.mmsi||p.mmsi,null,g[1],g[0],p.sog,p.cog,"Fintraffic open AIS")});WSTAT.ship="ok";wstat()}).catch(function(){if(!SHIPS.length)WSTAT.ship="x";wstat()});aisConnect()}
function aisBox(){var b=viewBox(0.5),s=Math.max(-89,Math.floor(Math.max(b.s,rot.lat-35)/5)*5),n=Math.min(89,Math.ceil(Math.min(b.n,rot.lat+35)/5)*5),w=Math.max(-180,Math.floor(Math.max(b.w,rot.lon-50)/5)*5),e=Math.min(180,Math.ceil(Math.min(b.e,rot.lon+50)/5)*5);return[[[s,w],[n,e]]]}
function aisSub(){if(!AIS.ws||AIS.ws.readyState!==1)return;var bx=aisBox(),k=JSON.stringify(bx);if(k===AIS.box)return;AIS.box=k;try{AIS.ws.send(JSON.stringify({APIKey:KEYS.ais,BoundingBoxes:bx,FilterMessageTypes:["PositionReport"]}))}catch(e){}}
function aisMsg(t){try{var m=JSON.parse(t);if(m.error){AIS.state="refused: "+String(m.error).slice(0,40);return}var md=m.MetaData||{},pr=m.Message&&m.Message.PositionReport||{};shipUp(md.MMSI,(md.ShipName||"").trim(),md.latitude!=null?md.latitude:pr.Latitude,md.longitude!=null?md.longitude:pr.Longitude,pr.Sog,pr.Cog,"AISStream");AIS.state="live"}catch(e){}}
function aisConnect(){if(!KEYS.ais||!WL.ship||!EMBED_OK||!window.WebSocket||AIS.ws)return;AIS.state="connecting";AIS.box="";var ws;try{ws=AIS.ws=new WebSocket("wss://stream.aisstream.io/v0/stream")}catch(e){AIS.state="blocked";return}
  ws.onopen=function(){aisSub()};ws.onmessage=function(ev){var d=ev.data;if(typeof d==="string")aisMsg(d);else if(d&&d.text)d.text().then(aisMsg)};
  ws.onerror=function(){if(AIS.state!=="live")AIS.state="connection refused"};ws.onclose=function(){AIS.ws=null;if(AIS.state==="live")AIS.state="reconnecting";setTimeout(function(){if(WL.ship&&KEYS.ais)aisConnect()},15000)}}
setInterval(function(){if(!WL.ship){if(AIS.ws){try{AIS.ws.close()}catch(e){}}return}if(document.hidden)return;aisSub();var n=Date.now(),keep=[];for(var i=0;i<SHIPS.length;i++){var s=SHIPS[i];if(n-s.at<(s.src==="AISStream"?20:70)*60000)keep.push(s);else delete SHIPM[s.id]}if(keep.length!==SHIPS.length)SHIPS=keep;wstat()},20000);
setInterval(function(){if(WL.ship&&EMBED_OK&&!document.hidden)loadShips()},10*60000);
// ---- weather radar (RainViewer, newest frame, max zoom 7, gently rate-limited)
var RAD={path:"",host:"",tiles:{},q:[],busy:0,n:0,bad:0,cv:null,dirty:false,up:0,P:null,time:0};
function loadRadar(){getJSON("https://api.rainviewer.com/public/weather-maps.json",20000).then(function(j){var p=j&&j.radar&&j.radar.past;if(!p||!p.length)throw 0;var f=p[p.length-1];WSTAT.radar="ok";RAD.time=f.time;
  if(f.path!==RAD.path){RAD.path=f.path;RAD.host=j.host||"https://tilecache.rainviewer.com";RAD.tiles={};RAD.q=[];RAD.n=0;RAD.bad=0;RAD.P=null;if(RAD.cv){RAD.cv.getContext("2d").clearRect(0,0,RAD.cv.width,RAD.cv.height);RAD.dirty=true}
    var cx=Math.floor(mX(rot.lon)*8),cy=Math.floor(mY(rot.lat)*8),ord=[];for(var y=0;y<8;y++)for(var x=0;x<8;x++)ord.push([x,y,Math.abs(x-cx)+Math.abs(y-cy)]);ord.sort(function(a,b){return a[2]-b[2]});
    ord.forEach(function(o){radTile(3,o[0],o[1],function(img){if(!RAD.cv)return;var cs=RAD.cv.width/8;try{RAD.cv.getContext("2d").drawImage(img,o[0]*cs,o[1]*cs,cs,cs);RAD.dirty=true}catch(e){}})})}wstat()}).catch(function(){WSTAT.radar="x";wstat()})}
function radTile(z,x,y,cb,front){var k=z+"/"+x+"/"+y,t=RAD.tiles[k];if(t){if(t.img)cb(t.img);else if(!t.bad)t.cbs.push(cb);return}RAD.tiles[k]={cbs:[cb]};var it={k:k,u:RAD.host+RAD.path+"/256/"+z+"/"+x+"/"+y+"/2/1_1.png",path:RAD.path};if(front)RAD.q.unshift(it);else RAD.q.push(it)}
setInterval(function(){if(!WL.radar||!RAD.q.length||RAD.busy>=2||document.hidden)return;var it=RAD.q.shift();if(it.path!==RAD.path)return;RAD.busy++;
  loadPix(it.u).then(function(img){RAD.busy--;if(it.path!==RAD.path)return;var t=RAD.tiles[it.k];t.img=img;RAD.n++;t.cbs.forEach(function(cb){cb(img)});t.cbs=[];if(RAD.n%8===1)wstat()}).catch(function(){RAD.busy--;RAD.bad++;if(RAD.tiles[it.k])RAD.tiles[it.k].bad=1})},650);
setInterval(function(){if(WL.radar&&EMBED_OK&&!document.hidden)loadRadar()},5*60000);
function radPlan(pa){if(!pa)return null;var z=Math.min(pa.z,6),sh=pa.z-z,x0=pa.x0>>sh,x1=(pa.x0+pa.nx-1)>>sh,y0=pa.y0>>sh,y1=(pa.y0+pa.ny-1)>>sh,key=RAD.path+":"+z+":"+x0+":"+y0+":"+x1+":"+y1;if(RAD.P&&RAD.P.key===key)return RAD.P;
  var P={key:key,z:z,x0:x0,y0:y0,nx:x1-x0+1,ny:y1-y0+1,got:0,dirty:false,up:0};P.cv=document.createElement("canvas");P.cv.width=P.nx*256;P.cv.height=P.ny*256;RAD.P=P;
  for(var j=0;j<P.ny;j++)for(var i=0;i<P.nx;i++)(function(i,j){radTile(z,x0+i,y0+j,function(img){if(RAD.P!==P)return;try{P.cv.getContext("2d").drawImage(img,i*256,j*256,256,256);P.got++;P.dirty=true}catch(e){}},true)})(i,j);return P}
// called from satDraw with the GL program bound
function radGL(pa,now){var onG=0;if(WL.radar&&RAD.path&&texRad){if(!RAD.cv){RAD.cv=document.createElement("canvas");RAD.cv.width=RAD.cv.height=Math.min(2048,gl.getParameter(gl.MAX_TEXTURE_SIZE))}
    if(RAD.dirty&&now-RAD.up>900){try{gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,texRad);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,RAD.cv);RAD.dirty=false;RAD.up=now;RAD.shown=true}catch(e){RAD.bad+=100;WL.radar=false}}
    if(RAD.shown)onG=1;var P=pa?radPlan(pa):null;if(P&&P.got){if(P.dirty&&now-P.up>900){try{gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,texRadP);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,P.cv);P.dirty=false;P.up=now;RAD.pKey=P.key}catch(e){}}
      if(RAD.pKey===P.key){onG=2;var n=Math.pow(2,P.z);gl.uniform4f(glU.uRB,P.x0/n,P.y0/n,(P.x0+P.nx)/n,(P.y0+P.ny)/n)}}}
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,texRad);gl.uniform1i(glU.uRad,2);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,texRadP);gl.uniform1i(glU.uRadP,3);gl.uniform1f(glU.uRadOn,onG)}
// ---- voice control
function voiceKind(){try{if(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform()&&Capacitor.Plugins&&Capacitor.Plugins.SpeechRecognition)return"app"}catch(e){}return(window.SpeechRecognition||window.webkitSpeechRecognition)?"web":""}
function speak(t){try{if(window.speechSynthesis){speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(t);u.rate=1.05;speechSynthesis.speak(u)}}catch(e){}}
function vsay(heard,did){note("Voice",'“'+esc(heard)+'”<br>'+esc(did));speak(did)}
function listen(){var k=voiceKind(),mb=$("micBtn");if(!k){note("Voice control","Voice works in the installed app. Install the newest build to use it.");return}mb.classList.add("on");var off=function(){mb.classList.remove("on")};
  if(k==="app"){var sp=Capacitor.Plugins.SpeechRecognition;sp.requestPermissions().then(function(){return sp.start({language:"en-US",maxResults:3,prompt:"Say a place or a command",partialResults:false,popup:true})}).then(function(r){off();var m=r&&r.matches&&r.matches[0];if(m)voiceCmd(m);else note("Voice","I didn't catch that. Tap the mic and try again.")}).catch(function(){off();note("Voice","Couldn't listen. Allow the microphone for Ojos de Dios in your phone settings.")})}
  else{var R=window.SpeechRecognition||window.webkitSpeechRecognition,r=new R();r.lang="en-US";r.maxAlternatives=1;r.onresult=function(ev){var m=ev.results[0][0].transcript;voiceCmd(m)};r.onerror=function(){note("Voice","Couldn't listen. Allow the microphone and try again.")};r.onend=off;try{r.start()}catch(e){off()}}}
var VLAY=[[/\b(plane|planes|aircraft|flight|flights)\b/,"air","aircraft"],[/\b(satellite|satellites)\b/,"sat","satellites"],[/\b(ship|ships|vessel|vessels|boat|boats)\b/,"ship","ships"],[/\b(radar|rain|weather)\b/,"radar","weather radar"],[/\b(earthquake|earthquakes|quake|quakes)\b/,"quake","earthquakes"],[/\b(fire|fires|storm|storms|volcano|volcanoes)\b/,"event","fires and storms"],[/\b(building|buildings)\b/,"bldg","3D buildings"],[/\b(label|labels|names|borders)\b/,"labels","place names"],[/\b(property|parcel|parcels|tax)\b/,"parcel","property records"]];
function setLayer(k,onv){if(!!WL[k]!==onv){var b=document.createElement("button");b.setAttribute("data-wl",k);b.style.display="none";document.body.appendChild(b);b.click();b.remove()}}
function voiceCmd(raw){var t=raw.toLowerCase().replace(/[.?!,]/g,"").trim(),m,i;
  if(/^(help|what can i say|commands)/.test(t)){note("Voice commands","Say a place (“Pflugerville Texas”), “cameras near Dallas”, “show ships”, “drive to Austin”, “hide planes”, “zoom in”, “3D view”, “street view”, “random camera”, “favorites”, “strongest earthquake”, “multi view” or “reset”.");return}
  var offW=/^(hide|remove|turn off|disable|no)\b/.test(t),onW=/^(show|turn on|enable|display)\b/.test(t)&&!/^show me (the )?(way|street)/.test(t);
  if(offW||onW){for(i=0;i<VLAY.length;i++)if(VLAY[i][0].test(t)&&!/\b(near|in|at|around)\b/.test(t)){setLayer(VLAY[i][1],onW);vsay(raw,(onW?"Showing ":"Hiding ")+VLAY[i][2]);return}}
  if(/^zoom in|closer/.test(t)){target={lon:rot.lon,lat:rot.lat,z:clampZ(zoom*3)};vsay(raw,"Zooming in");return}
  if(/^zoom out|further|farther/.test(t)){target={lon:rot.lon,lat:rot.lat,z:clampZ(zoom/3)};vsay(raw,"Zooming out");return}
  if(/\b(3d|three d|tilt)\b/.test(t)){vsay(raw,T3.on?"Back to the globe":"Opening the 3D view");T3.on?t3Close():t3Open();return}
  if(/street view|walk/.test(t)){vsay(raw,"Opening Street View");if(selected&&selected.lat!=null)streetView(selected.lat,selected.lon);else streetView(rot.lat,rot.lon);return}
  if(/random/.test(t)){vsay(raw,"Opening a random camera");document.querySelector('[data-h="rand"]').click();return}
  if(/favou?rite/.test(t)){vsay(raw,"Opening your favorites");document.querySelector('[data-h="fav"]').click();return}
  if(/strongest|biggest/.test(t)&&/quake/.test(t)){vsay(raw,"Flying to the strongest earthquake");document.querySelector('[data-h="quake"]').click();return}
  if(/multi ?view|camera wall|the wall/.test(t)){vsay(raw,"Opening Multi-View");openWall();return}
  if(/chase the sun/.test(t)){vsay(raw,"Chasing the sun");$("bSun").click();return}
  if(/^(reset|go home|start over)/.test(t)){vsay(raw,"Resetting the globe");$("bReset").click();return}
  if(/^(stop|pause)/.test(t)){spin=false;setButtons();vsay(raw,"Stopped rotating");return}
  if(/alerts?/.test(t)&&/(watch|add)/.test(t)){alAdd();return}
  m=/^(?:drive|navigate|directions|route|take me)\s+(?:me\s+)?to\s+(.+)$/.exec(t);if(m){vsay(raw,"Finding your route to "+m[1]);drvGo("",m[1],true);return}
  m=/^(?:cameras?|cams?|feeds?)\s+(?:near|in|at|around|for)\s+(.+)$/.exec(t)||/^(?:go to|fly to|take me to|show me|show|find|search for|search|where is|zoom to|look at)\s+(.+)$/.exec(t);
  var place=(m?m[1]:t).replace(/^(the|cameras? (near|in|at|around))\s+/,"");$("addr").value=place;vsay(raw,"Searching "+place);scan(place)}
document.addEventListener("click",function(e){if(e.target.closest("#micBtn"))listen();if(e.target.closest("#bDots")){setLayer("dots",!WL.dots);if(WL.dots){spin=false;setButtons()}$("bDots").classList.toggle("on",!!WL.dots)}});
// ---- smart alerts (checked while the app is open)
var AL=ls("ojos-alerts")||{};AL.on=AL.on!==false;AL.mag=AL.mag||6;AL.near=AL.near||100;AL.places=AL.places||[];AL.log=AL.log||[];AL.seen=AL.seen||{};
function alSave(){var ks=Object.keys(AL.seen);if(ks.length>500)ks.slice(0,ks.length-500).forEach(function(k){delete AL.seen[k]});ls("ojos-alerts",AL)}
function alFire(key,title,body,lat,lon,ent){if(AL.seen[key])return;AL.seen[key]=Date.now();AL.log.unshift({t:Date.now(),title:title,body:body,lat:lat,lon:lon});AL.log=AL.log.slice(0,30);alSave();
  note(title,esc(body)+"<br>tap to look",function(){if(ent)select(ent);else{spin=false;setButtons();target={lon:lon,lat:lat,z:Math.max(zoom,6)}}});try{navigator.vibrate&&navigator.vibrate([180,90,180])}catch(e){}if(document.querySelector('.grid[data-tab=events]'))feed()}
function alNear(lat,lon){var best=null;AL.places.forEach(function(p){var d=hav(lat,lon,p.lat,p.lon)*0.621;if(d<=AL.near&&(!best||d<best.d))best={p:p,d:d}});return best}
function alCheck(){if(!AL.on||!EMBED_OK)return;var first=!alCheck.ran,now=Date.now();alCheck.ran=true;
  QUAKES.forEach(function(q){var k="q"+q.id;if(AL.seen[k])return;var fresh=now-q.time<(first?3:24)*36e5,nb=alNear(q.lat,q.lon);
    if(fresh&&q.mag>=AL.mag)alFire(k,"Major earthquake",q.n,q.lat,q.lon,q);else if(fresh&&nb&&q.mag>=3.5)alFire(k,"Earthquake near "+nb.p.name,q.n+" · "+Math.round(nb.d)+" mi away",q.lat,q.lon,q);else if(!fresh){AL.seen[k]=now}});
  EVENTS.forEach(function(ev){var k="e"+ev.cat+ev.n;if(AL.seen[k])return;var nb=alNear(ev.lat,ev.lon);if(nb)alFire(k,(ev.catName||"Event")+" near "+nb.p.name,ev.n+" · "+Math.round(nb.d)+" mi away",ev.lat,ev.lon,ev);else if(first)AL.seen[k]=0});alSave()}
var WXBAD={95:"Thunderstorm",96:"Thunderstorm with hail",99:"Severe thunderstorm with hail",65:"Heavy rain",82:"Violent rain showers",75:"Heavy snow",86:"Heavy snow showers",67:"Heavy freezing rain"};
function alWx(){if(!AL.on||!EMBED_OK||!AL.places.length||document.hidden)return;AL.places.forEach(function(p,i){setTimeout(function(){getJSON("https://api.open-meteo.com/v1/forecast?latitude="+p.lat.toFixed(3)+"&longitude="+p.lon.toFixed(3)+"&current=weather_code,wind_gusts_10m&wind_speed_unit=mph",15000).then(function(j){var c=j&&j.current;if(!c)return;var slot=Math.floor(Date.now()/(6*36e5)),w=WXBAD[c.weather_code];
    if(w)alFire("w"+p.name+slot+c.weather_code,w+" at "+p.name,"Reported by the weather model right now",p.lat,p.lon);else if(c.wind_gusts_10m>=50)alFire("g"+p.name+slot,"Strong wind at "+p.name,"Gusts of "+Math.round(c.wind_gusts_10m)+" mph",p.lat,p.lon)}).catch(function(){})},i*800)})}
setInterval(alWx,20*60000);setTimeout(alWx,25000);
function alAdd(){var nm,la,lo;if(pin&&pin.lat!=null){nm=pin.name||pin.n;la=pin.lat;lo=pin.lon}else if(selected&&selected.lat!=null){nm=selected.n;la=selected.lat;lo=selected.lon}else{la=rot.lat;lo=rot.lon}
  nm=String(nm||(la.toFixed(2)+", "+lo.toFixed(2))).split(",")[0].slice(0,28);if(AL.places.length>=8){note("Smart alerts","You can watch up to 8 places. Remove one first.");return}AL.places.push({name:nm,lat:la,lon:lo});alSave();note("Smart alerts","Now watching "+esc(nm)+" for earthquakes, fires, storms and severe weather.");feed();alWx()}
function alHTML(){var opt=function(v,cur,lab){return'<option value="'+v+'"'+(v==cur?" selected":"")+'>'+lab+'</option>'};
  return'<div class="alcard"><div class="alh"><b>Smart alerts</b><button data-al="toggle" class="'+(AL.on?"on":"")+'">'+(AL.on?"On":"Off")+'</button></div>'+
   '<div class="alr"><span>Any earthquake of magnitude</span><select data-al="mag">'+[5,5.5,6,6.5,7].map(function(v){return opt(v,AL.mag,v.toFixed(1)+"+")}).join("")+'</select></div>'+
   '<div class="alr"><span>Near my places, within</span><select data-al="near">'+[25,50,100,200,400].map(function(v){return opt(v,AL.near,v+" mi")}).join("")+'</select></div>'+
   '<div class="alp">'+AL.places.map(function(p,i){return'<span>'+esc(p.name)+'<button data-al="rm" data-i="'+i+'">✕</button></span>'}).join("")+'<button data-al="add">+ Watch this area</button></div>'+
   (AL.places.length?'':'<p class="note2">Search a place, then tap “Watch this area”. You get alerts for earthquakes, fires, storms and severe weather near it.</p>')+
   (AL.log.length?AL.log.slice(0,8).map(function(a,i){return'<div class="row" data-alg="'+i+'"><i style="background:#ffb040"></i><div><b>'+esc(a.title)+'</b><span>'+esc(a.body)+' · '+ago(a.t)+'</span></div></div>'}).join(""):'')+
   '<p class="note2">Alerts run while the app is open.</p></div>'}
document.addEventListener("click",function(e){var b=e.target.closest("[data-al]");if(b&&b.tagName==="BUTTON"){var k=b.getAttribute("data-al");if(k==="toggle"){AL.on=!AL.on;alSave();if(AL.on)alCheck()}else if(k==="rm"){AL.places.splice(+b.getAttribute("data-i"),1);alSave()}else if(k==="add"){alAdd();return}feed();return}
  var r=e.target.closest("[data-alg]");if(r){var a=AL.log[+r.getAttribute("data-alg")];if(a){spin=false;setButtons();target={lon:a.lon,lat:a.lat,z:Math.max(zoom,6)}}}});
document.addEventListener("change",function(e){var s=e.target.closest&&e.target.closest("select[data-al]");if(s){AL[s.getAttribute("data-al")]=+s.value;alSave();alCheck()}});
