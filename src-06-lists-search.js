// ---------- data UI ----------
function filtered(){var q=$("q").value.trim().toLowerCase();
  return cams.filter(function(c){if(!on[c.t])return false;if(region&&c.c!==region)return false;
    if(q&&(c.n+" "+c.c+" "+c.r+" "+lab(c.t)+" "+(c.d||"")).toLowerCase().indexOf(q)<0)return false;return true})}
function filteredLive(){var q=$("q").value.trim().toLowerCase();return LIVE.filter(function(c){if(!on[c.t])return false;if(DEAD[c.u]&&!SHOWDEAD&&FAV.indexOf(c.u)<0)return false;if(region&&c.c!==region)return false;if(q&&(c.n+" "+c.c+" "+c.r+" "+c.src).toLowerCase().indexOf(q)<0)return false;return true})}
function render(){
  visLive=filteredLive();visible=LIVE.length?[]:filtered();
  var counts={};cams.concat(LIVE).forEach(function(c){counts[c.t]=(counts[c.t]||0)+1});var max=Math.max.apply(null,Object.keys(counts).map(function(k){return counts[k]}).concat([1]));
  $("cats").innerHTML=Object.keys(L).map(function(k){var n=counts[k]||0;return'<button class="cat'+(on[k]?"":" off")+'" data-k="'+k+'"><div class="l"><span><i style="background:'+col(k)+'"></i>'+lab(k)+'</span><span class="mono">'+n+'</span></div><div class="bar"><div style="width:'+(n/max*100)+'%;background:'+col(k)+'"></div></div></button>'}).join("");
  var rc={};cams.forEach(function(c){rc[c.c]=(rc[c.c]||0)+1});
  $("regions").innerHTML='<div class="region'+(region?"":" sel")+'" data-r="">All regions<span class="mono">'+cams.length+'</span></div>'+Object.keys(rc).sort(function(a,b){return rc[b]-rc[a]||a.localeCompare(b)}).map(function(r){return'<div class="region'+(region===r?" sel":"")+'" data-r="'+esc(r)+'">'+esc(r)+'<span class="mono">'+rc[r]+'</span></div>'}).join("");
  var qv=$("q").value.trim(),rowL=function(c,extra){return'<div class="row'+(c===selected?" sel":"")+'" data-l="'+LIVE.indexOf(c)+'"><i style="background:'+(c.v?"#ff5d8f":"#ffd36b")+'"></i><div><b>'+(FAV.indexOf(c.u)>=0?'<em class="fv">★</em> ':'')+esc(c.n)+(c.v?'<span class="badge" style="color:#ff5d8f;border-color:#ff5d8f">VIDEO</span>':'')+'</b><span>'+esc(c.r)+' · '+esc(c.c)+' · '+esc(c.src)+'</span></div>'+(extra?'<span class="mono rd">'+extra+'</span>':'')+'</div>'};
  var html="";
  if(LIVE.length){
    if(qv||region)html='<h4 class="lh">'+visLive.length.toLocaleString()+' MATCHING CAMERAS</h4>'+visLive.slice(0,150).map(function(c){return rowL(c)}).join("");
    else{var favs=FAV.map(camByU).filter(function(c){return c&&c.live});if(favs.length)html+='<h4 class="lh">★ FAVORITES</h4>'+favs.map(function(c){return rowL(c)}).join("");
      var vx=pin?pin.lon:rot.lon,vy=pin?pin.lat:rot.lat;html+='<h4 class="lh">NEAREST TO YOUR VIEW</h4>'+visLive.map(function(c){return{c:c,d:hav(vy,vx,c.lat,c.lon)}}).sort(function(a,b){return a.d-b.d}).slice(0,80).map(function(x){return rowL(x.c,fmtD(x.d))}).join("")}
  }else html='<h4 class="lh">CAMERA NETWORKS</h4>'+visible.slice().sort(function(a,b){return(a.c+a.r+a.n).localeCompare(b.c+b.r+b.n)}).map(function(c){return'<div class="row" data-i="'+cams.indexOf(c)+'"><i style="background:'+col(c.t)+'"></i><div><b>'+esc(c.n)+'</b><span>'+esc(c.r)+' · '+esc(c.c)+'</span></div></div>'}).join("");
  $("list").innerHTML=html||'<div class="row"><span>No cameras match.</span></div>';
  var countries={};cams.forEach(function(c){if(["Global","Orbit","Global Ocean"].indexOf(c.c)<0)countries[c.c]=1});
  $("kCountry").textContent=Object.keys(countries).length;$("kShown").textContent=(visible.length+visLive.length).toLocaleString();$("kLive").textContent=LIVE.length.toLocaleString();liveStatus();if(typeof wstat==="function"&&WL)wstat();
  $("kNote").textContent=(region||$("q").value||Object.keys(on).some(function(k){return!on[k]}))?"filtered":"all layers";
  $("tick").innerHTML=cams.map(function(c){return'<span><b>●</b> '+esc(c.n.toUpperCase())+' — '+esc(c.r)+', '+esc(c.c)+'</span>'}).join("");
}
var dossTimer=null;
function media(c,cls){
  if(!EMBED_OK)return'<div class="lockbox"><b>LIVE IMAGE LOCKED IN HOSTED VIEW</b><span>This hosted preview blocks outside images. Open OJOS DE DIOS from your installed app or GitHub link to see this camera here.</span></div>';
  if(c.player&&cls==="wimg")return'<iframe src="'+esc(c.player)+'" allow="autoplay; fullscreen" referrerpolicy="no-referrer"></iframe>';
  return'<img referrerpolicy="no-referrer" class="'+cls+' snap" data-u="'+esc(c.u)+'" data-src="'+esc(c.e)+'" src="'+esc(c.e)+'" alt="Live camera image">'+(c.v?'<button class="playv" data-v="'+esc(c.v)+'">'+(/\.m3u8(\?|$)/i.test(c.v)||/^txdot-live:/.test(c.v)?"▶ Play live video":"▶ Play latest clip · repeats")+'</button>':'');
}
function playVideo(btn){
  var url=btn.getAttribute("data-v"),txn=/^txdot-live:/.test(url)?url.slice(11):null,isHls=!!txn||/\.m3u8(\?|$)/i.test(url),box=btn.parentNode,im=box.querySelector("img.snap"),v=document.createElement("video");
  var hls=null,ok=false,userPaused=false,sys=false,lastT=-1,lastMove=Date.now(),dead=false;
  v.autoplay=true;v.muted=true;v.playsInline=true;v.controls=true;v.className=(im?im.className.replace("snap","").trim():"dimg");if(im&&im.getAttribute("data-u"))v.setAttribute("data-u",im.getAttribute("data-u"));
  btn.textContent="Connecting…";btn.disabled=true;if(im)im.style.visibility="hidden";box.insertBefore(v,box.firstChild);
  function go(){try{var p=v.play();if(p&&p.catch)p.catch(function(){})}catch(e){}}
  function kill(){if(hls){try{hls.destroy()}catch(e){}hls=null}}
  function native(){kill();sys=true;setTimeout(function(){sys=false},1500);v.src=isHls?url:url+(url.indexOf("?")<0?"?":"&")+"_t="+Date.now();v.load();go()}
  function viaHls(){hls=new Hls({enableWorker:true,liveDurationInfinity:true,capLevelToPlayerSize:false,manifestLoadingMaxRetry:8,levelLoadingMaxRetry:8,fragLoadingMaxRetry:8});hls.loadSource(url);hls.attachMedia(v);
    hls.on(Hls.Events.MANIFEST_PARSED,function(){try{if(hls.levels&&hls.levels.length>1)hls.nextLevel=hls.levels.length-1}catch(e){}go()});
    hls.on(Hls.Events.ERROR,function(ev,d){if(!d||!d.fatal||dead)return;if(!ok){native();return}
      if(d.type===Hls.ErrorTypes.NETWORK_ERROR&&!txn)setTimeout(function(){if(hls)hls.startLoad()},1500);else if(d.type===Hls.ErrorTypes.MEDIA_ERROR)hls.recoverMediaError();else restart()})}
  // keep the stream going until the viewer stops it: restart on end, error or freeze
  function restart(){if(dead||userPaused)return;lastMove=Date.now();sys=true;setTimeout(function(){sys=false},1500);var again=function(){if(hls){kill();viaHls()}else native()};if(txn)txFresh(txn).then(function(u){url=u;if(!dead)again()}).catch(function(){});else again()}
  v.addEventListener("playing",function(){if(!ok){ok=true;btn.remove();if(im)im.remove();var lb=box.querySelector(".lockbox");if(lb)lb.remove();try{navigator.wakeLock&&navigator.wakeLock.request("screen").catch(function(){})}catch(e){}}});
  v.addEventListener("pause",function(){if(!v.ended&&!v.seeking&&!sys)userPaused=true});
  v.addEventListener("play",function(){userPaused=false});
  v.addEventListener("ended",function(){userPaused=false;restart()});
  v.addEventListener("error",function(){if(ok)setTimeout(restart,2000)});
  var wd=setInterval(function(){if(!v.isConnected){dead=true;clearInterval(wd);kill();return}
    if(!ok||userPaused||document.hidden){lastMove=Date.now();return}
    if(v.currentTime!==lastT){lastT=v.currentTime;lastMove=Date.now()}else if(Date.now()-lastMove>9000)restart()},3000);
  setTimeout(function(){if(ok||dead)return;dead=true;clearInterval(wd);kill();v.remove();if(im)im.style.visibility="";btn.disabled=false;btn.textContent="Video unavailable — showing live image";setTimeout(function(){btn.remove()},3500)},25000);
  var begin=function(){if(isHls)(window.Hls?Promise.resolve():loadScript("https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js")).then(function(){if(window.Hls&&Hls.isSupported())viaHls();else native()}).catch(function(){native()});else native()};
  if(txn)txFresh(txn).then(function(u){url=u;begin()}).catch(function(){btn.textContent="Live video didn't answer — showing pictures"});else begin();
}
document.addEventListener("click",function(e){var b=e.target.closest(".playv");if(b&&!b.disabled)playVideo(b)});
function liveDossier(c){
  $("detail").innerHTML='<h4>LIVE CAMERA</h4><span class="tag mono" style="color:#ffd36b;border-color:#ffd36b">● '+(c.v||c.mj?"LIVE VIDEO":c.still?"LIVE PICTURES · NEW FRAME EVERY FEW SECONDS":"LIVE IMAGE")+' · '+esc(c.src.toUpperCase())+'</span><span class="tag mono dn">'+dayTag(c)+'</span><h3>'+esc(c.n)+'</h3><div class="wx mono" id="wx"></div>'+
   '<div class="camview">'+media(c,"dimg")+'<div class="camts mono" id="camts">UPDATED '+new Date().toLocaleTimeString()+'</div></div>'+
   '<div id="rewind"></div><div id="camstats"></div><div class="kv"><span>AREA</span><b>'+esc(c.r)+'</b><span>COUNTRY</span><b>'+esc(c.c)+'</b><span>COORDS</span><b>'+c.lat.toFixed(4)+', '+c.lon.toFixed(4)+'</b><span>NETWORK</span><b>'+esc(c.src)+'</b></div>'+
   '<div class="acts"><button class="aibtn'+(AI_ON?" on":"")+'">'+(AI_ON?"◉ AI DETECT: ON":"◎ AI DETECT: OFF")+'</button></div><div class="acts"><button class="open" data-w="watch">▶ FULL SCREEN</button><button class="ghost" data-w="add">+ Wall</button><button class="ghost" data-w="fav">'+(FAV.indexOf(c.u)>=0?"★ Saved":"☆ Save")+'</button><button class="ghost" data-sv="'+c.lat+','+c.lon+'">◉ Street View</button></div>';
  wireMedia($("detail"));scanAll();statsPanel(c);rewindUI();wx(c.lat,c.lon);
  if(c.v&&EMBED_OK){var pb=document.querySelector("#detail .playv");if(pb&&!pb.disabled)playVideo(pb)}
  var cvw=document.querySelector("#detail .camview");if(cvw)cvw.insertAdjacentHTML("afterend",'<div class="fprow"><button class="open" data-fp="go">◉ Lay this view on the map</button><span>Aim</span><button class="ghost" data-fp="l" aria-label="Turn left">⟲</button><b id="fphdg">'+Math.round(camHdg(c))+'°</b><button class="ghost" data-fp="r" aria-label="Turn right">⟳</button><button class="ghost" data-fp="off">'+(FPON?"Hide on map":"Show on map")+'</button></div>');
  clearInterval(dossTimer);dossTimer=setInterval(function(){var im=document.querySelector("#detail img.snap");if(im&&!document.hidden){snapRefresh(im);var ts=$("camts");if(ts)ts.textContent="UPDATED "+new Date().toLocaleTimeString()}},isJ(c.e)?2500:6000);
}
function wireMedia(root){
  Array.prototype.forEach.call(root.querySelectorAll("video"),function(v){v.addEventListener("error",function(){var im=v.getAttribute("data-img");if(im){var i=document.createElement("img");i.className=v.className+" snap";i.src=im;i.setAttribute("data-src",im);v.replaceWith(i)}})});
  Array.prototype.forEach.call(root.querySelectorAll("img.snap"),function(im){im.addEventListener("error",function(){if(im.dataset.failed)return;im.dataset.failed=1;markDead(im.getAttribute("data-u"));var d=document.createElement("div");d.className="lockbox";d.innerHTML="<b>CAMERA OFFLINE</b><span>This camera isn't sending an image right now. Try again later.</span>";im.replaceWith(d)})});
}
function select(c){
  if(c&&c.cluster){spin=false;setButtons();if(mode==="3d")target={lon:c.lon,lat:Math.max(-70,Math.min(70,c.lat)),z:Math.min(90000,Math.max(zoom*2.6,2.2))};else zoom=clampZ(zoom*2);return}
  if(webMode&&c&&c.live){toggleWeb(c);return}
  setTab("info");selected=c;spin=false;setButtons();clearInterval(dossTimer);
  if(c.kind){if(mode==="3d")target={lon:c.lon,lat:Math.max(-70,Math.min(70,c.lat)),z:Math.max(zoom,1.6)};$("coords").innerHTML="TARGET: "+esc(c.n.toUpperCase().slice(0,38))+"<br>LAT "+c.lat.toFixed(3)+"  LON "+c.lon.toFixed(3);if(c.kind==="plane")loadRoute(c);entDossier(c);render();return}
  if(c.live){if(mode==="3d")target={lon:c.lon,lat:Math.max(-70,Math.min(70,c.lat)),z:satOK()?Math.max(3.2,Math.min(9000,0.6*6371/camRange(c)[0])):3.2};$("coords").innerHTML="TARGET: "+esc(c.n.toUpperCase().slice(0,38))+"<br>LAT "+c.lat.toFixed(3)+"  LON "+c.lon.toFixed(3);liveDossier(c);render();return}
  if(mode==="3d")target={lon:c.lon,lat:Math.max(-70,Math.min(70,c.lat)),z:c.t==="directory"||c.t==="space"?1.1:1.7};
  $("detail").innerHTML='<h4>TARGET DOSSIER</h4><span class="tag mono" style="color:'+col(c.t)+';border-color:'+col(c.t)+'">'+esc(lab(c.t)).toUpperCase()+'</span><h3>'+esc(c.n)+'</h3><p>'+esc(c.d||"")+'</p><div class="kv"><span>REGION</span><b>'+esc(c.r)+'</b><span>COUNTRY</span><b>'+esc(c.c)+'</b><span>COORDS</span><b>'+c.lat.toFixed(3)+', '+c.lon.toFixed(3)+'</b><span>SOURCE</span><b>'+esc(c.u.replace(/^https?:\/\//,"").split("/")[0])+'</b></div><div class="acts">'+((c.t==="traffic"||c.t==="directory")?'<button class="open" data-w="near">◉ LIVE CAMERAS HERE</button>':'<button class="open" data-w="watch">▶ WATCH</button><button class="ghost" data-w="add">+ Wall</button>')+'</div>';
  $("coords").innerHTML="TARGET: "+esc(c.n.toUpperCase().slice(0,38))+"<br>LAT "+c.lat.toFixed(3)+"  LON "+c.lon.toFixed(3);
  render();
  
}
function setButtons(){$("b3d").classList.toggle("on",mode==="3d");$("b2d").classList.toggle("on",mode==="2d");$("bSpin").classList.toggle("on",spin);$("bSpin").style.display=mode==="3d"?"":"none"}
$("list").addEventListener("click",function(e){var r=e.target.closest(".row");if(!r)return;if(r.dataset.i)select(cams[+r.dataset.i]);else if(r.dataset.l)select(LIVE[+r.dataset.l])});
$("cats").addEventListener("click",function(e){var b=e.target.closest(".cat");if(b){on[b.dataset.k]=!on[b.dataset.k];render()}});
$("regions").addEventListener("click",function(e){var r=e.target.closest(".region");if(r){region=r.dataset.r;render();var v=filtered();if(region&&v.length&&mode==="3d"){var a=0,b=0;v.forEach(function(c){a+=c.lon;b+=c.lat});target={lon:a/v.length,lat:b/v.length,z:1.8};spin=false;setButtons()}}});
$("q").addEventListener("input",render);
$("b3d").onclick=function(){mode="3d";zoom=1;setButtons()};
$("b2d").onclick=function(){mode="2d";zoom=1;panX=0;panY=0;setButtons()};
$("bSpin").onclick=function(){spin=!spin;setButtons()};
$("bReset").onclick=function(){selected=null;pin=null;SV.link=null;spin=true;region="";$("q").value="";Object.keys(on).forEach(function(k){on[k]=true});zoom=1;panX=0;panY=0;target={lon:-40,lat:18,z:1};setButtons();render();$("coords").innerHTML="TARGET: —<br>LAT —  LON —";$("detail").innerHTML='<h4>TARGET DOSSIER</h4><p>Select a point on the globe or a feed below. Tap any camera to watch it right here.</p>'};
$("csv").onclick=function(){
  var rows=[["name","country","region","layer","lat","lon","url"]].concat(filtered().map(function(c){return[c.n,c.c,c.r,lab(c.t),c.lat,c.lon,c.u]}));
  var txt=rows.map(function(r){return r.map(function(v){v=String(v);return/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(",")}).join("\n");
  var b=$("csv");function done(m){b.textContent=m;setTimeout(function(){b.textContent="Copy CSV"},1800)}
  try{navigator.clipboard.writeText(txt).then(function(){done("Copied ✓")},function(){done("Blocked")})}catch(e){done("Blocked")}
};

// add feed
$("typeSel").innerHTML=Object.keys(L).map(function(k){return'<option value="'+k+'">'+lab(k)+'</option>'}).join("");
var dlg=$("dlg"),form=$("form");
function closeD(){dlg.close?dlg.close():dlg.removeAttribute("open")}
$("addBtn").onclick=function(){$("msg").style.color="";$("msg").textContent=api?"Saved feeds become part of this page for everyone who opens it.":"Saving isn't available in this view — the feed will show until you leave.";dlg.showModal?dlg.showModal():dlg.setAttribute("open","")};
$("cancel").onclick=closeD;
form.addEventListener("submit",function(e){
  e.preventDefault();var f=new FormData(form),url=String(f.get("url")).trim();
  if(!/^https?:\/\//i.test(url)){$("msg").style.color="#ff5d8f";$("msg").textContent="URL must start with http(s)://";return}
  var country=String(f.get("country")).trim();
  var cam={n:String(f.get("name")).trim(),c:country,r:String(f.get("region")||"").trim()||country,t:String(f.get("type")),lat:+f.get("lat"),lon:+f.get("lon"),u:url,d:String(f.get("note")||"").trim(),user:true};
  $("msg").textContent=api?"Saving…":"";
  saveCam(cam,function(err){if(err){$("msg").style.color="#ff5d8f";$("msg").textContent=err}else{closeD();form.reset()}});
});
function saveCam(cam,cb){
  cams.push(cam);render();
  if(!api){select(cam);cb(null);return}
  var head='<script id="cam-data" type="application/json">',s=SRC.indexOf(head),en=SRC.indexOf("<\/script>",s);
  var out=SRC.slice(0,s)+head+JSON.stringify(cams).replace(/</g,"\\u003c")+SRC.slice(en);
  api.publish(out).then(function(){cb(null)}).catch(function(err){var m=(err&&(err.code||err.message))||"error";cams.splice(cams.indexOf(cam),1);render();
    cb(m==="conflict"?"Another save landed first — please try again.":(m==="not_granted"||m==="not_writer")?"View-only copy: browsing works, saving doesn't.":"Couldn't save ("+m+").")});
}


// ---------- address scan ----------
var sampler=null;
function hav(a,b,c,d){var R=6371,x=(c-a)*D,y=(d-b)*D,h=Math.sin(x/2)*Math.sin(x/2)+Math.cos(a*D)*Math.cos(c*D)*Math.sin(y/2)*Math.sin(y/2);return 2*R*Math.asin(Math.sqrt(h))}
function fmtD(km){var mi=km*0.621371;return mi<10?mi.toFixed(1)+" mi":Math.round(mi).toLocaleString()+" mi"}
function norm(s){return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim()}
function localGeo(q){
  var m=q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if(m){var la=+m[1],lo=+m[2];if(Math.abs(la)<=90&&Math.abs(lo)<=180)return{name:la.toFixed(3)+", "+lo.toFixed(3),lat:la,lon:lo,src:"coordinates"}}
  var n=norm(q);if(!n)return null;
  for(var i=0;i<GAZ.length;i++)if(norm(GAZ[i][0])===n)return{name:GAZ[i][0],lat:GAZ[i][1],lon:GAZ[i][2],src:"built-in city list"};
  return null;
}
function scan(q){
  q=q.trim();if(!q)return;
  var loc=localGeo(q);
  if(loc&&(loc.src==="coordinates"||!EMBED_OK)){showArea(loc,q);return}
  setTab("info");$("detail").innerHTML='<h4>AREA SCAN</h4><p class="mono" style="color:#36f1b5">LOCATING “'+esc(q)+'”…</p>';
  function fallback(){
    if(loc){showArea(loc,q);return}
    if(!sampler){var lc=null,nq=norm(q);GAZ.forEach(function(g){if(!lc&&nq.indexOf(norm(g[0]))>=0)lc=g});
      if(lc){showArea({name:lc[0],lat:lc[1],lon:lc[2],src:"nearest major city in your text"},q);return}
      $("detail").innerHTML='<h4>AREA SCAN</h4><p>Couldn\'t find “'+esc(q)+'”. Check the spelling, add a city or state, or enter coordinates like <span class="mono">41.88, -87.63</span>.</p>';return}
  var prompt="You are a geocoder. Give the approximate latitude and longitude of this address or place: \""+q.replace(/"/g,"'")+"\". Reply with ONLY a JSON object: {\"found\":true,\"name\":\"short display name (city, region, country)\",\"lat\":number,\"lon\":number}. If you cannot place it, reply {\"found\":false}.";
  sampler.json(prompt,{modelTier:"quick"}).then(function(r){
    if(r&&r.found&&isFinite(r.lat)&&isFinite(r.lon))showArea({name:r.name||q,lat:+r.lat,lon:+r.lon,src:"AI lookup (approximate)"},q);
    else $("detail").innerHTML='<h4>AREA SCAN</h4><p>Couldn\'t place “'+esc(q)+'”. Try adding city and country, or enter coordinates.</p>';
  }).catch(function(e){$("detail").innerHTML='<h4>AREA SCAN</h4><p>Lookup unavailable ('+esc((e&&e.code)||"error")+'). Try a major city name or coordinates.</p>'});
  }
  if(!EMBED_OK){fallback();return}
  // real address / city / state / country lookup (OpenStreetMap)
  getJSON("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q="+encodeURIComponent(q),15000,nativeHttp()?{"User-Agent":"OjosDeDios/1.0 (github.com/quuxin2-a11y/dios-prototype.civ)"}:null).then(function(arr){var r=arr&&arr[0];if(!r||!isFinite(+r.lat)){fallback();return}
    var bb=(r.boundingbox||[]).map(Number),area=bb.length===4&&bb[2]<bb[3]&&((bb[1]-bb[0])>0.03||(bb[3]-bb[2])>0.03);
    showArea({name:String(r.display_name||q).split(", ").slice(0,3).join(", "),lat:+r.lat,lon:+r.lon,src:"OpenStreetMap",bbox:area?{s:bb[0],n:bb[1],w:bb[2],e:bb[3]}:null},q)}).catch(fallback);
}
var areaCams=[];
document.addEventListener("click",function(e){if(!e.target.closest("[data-area]"))return;areaCams.slice(0,9).forEach(function(c){addWall(c,false)});openWall()});
var suggestions=[];
function showArea(loc,q){
  setTab("info");pin=loc;selected=null;spin=false;setButtons();
  var B=loc.bbox,span=B?Math.max(B.n-B.s,(B.e-B.w)*Math.cos(loc.lat*D)):0;
  if(mode==="3d")target={lon:B?(B.w+B.e)/2:loc.lon,lat:Math.max(-70,Math.min(70,B?(B.s+B.n)/2:loc.lat)),z:B?Math.max(1.3,Math.min(40000,1.5/(span*D))):(satOK()?9000:14)};
  $("coords").innerHTML="SCAN: "+esc(loc.name.toUpperCase().slice(0,38))+"<br>LAT "+loc.lat.toFixed(3)+"  LON "+loc.lon.toFixed(3);
  var dist=function(c){return{c:c,d:hav(loc.lat,loc.lon,c.lat,c.lon)}},byD=function(x,y){return x.d-y.d};
  var inArea=B?LIVE.filter(function(c){return c.lat>=B.s&&c.lat<=B.n&&c.lon>=B.w&&c.lon<=B.e}):null;
  var all=(inArea||LIVE).map(dist).sort(byD),liveNear=all.slice(0,B?60:20),close=B?all.length:all.filter(function(x){return x.d<=40.3}).length;areaCams=liveNear.map(function(x){return x.c});
  var near=cams.filter(function(c){return c.c!=="Global"&&c.c!=="Orbit"&&!(Math.abs(c.lat-loc.lat)<1e-6&&Math.abs(c.lon-loc.lon)<1e-6)}).map(dist).sort(byD).slice(0,5);
  var within=cams.filter(function(c){return c.c!=="Global"&&c.c!=="Orbit"&&hav(loc.lat,loc.lon,c.lat,c.lon)<=500}).length;
  var dirs=cams.filter(function(c){return c.t==="directory"});
  var h='<h4>AREA SCAN</h4><span class="tag mono" style="color:#ff5d8f;border-color:#ff5d8f">PIN DROPPED</span><h3>'+esc(loc.name)+'</h3>'+
   '<div class="kv"><span>COORDS</span><b>'+loc.lat.toFixed(4)+', '+loc.lon.toFixed(4)+'</b><span>LOCATED BY</span><b>'+esc(loc.src)+'</b><span>'+(B?"IN THIS AREA":"WITHIN 25 MI")+'</span><b>'+close.toLocaleString()+' live camera'+(close===1?"":"s")+'</b></div>'+'<div class="acts">'+(liveNear.length?'<button class="open" data-area="1">▦ WATCH THESE ON MULTI-VIEW</button>':'')+'<button class="ghost" data-sv="'+loc.lat+','+loc.lon+'">◉ Street View</button></div>'+
   '<h4 style="margin-top:12px">'+(B?(all.length>60?"FIRST 60 OF "+all.length.toLocaleString()+" CAMERAS IN THIS AREA":"CAMERAS IN THIS AREA")+" — TAP TO WATCH":"NEAREST LIVE CAMERAS — TAP TO WATCH")+'</h4>'+(liveNear.length?liveNear.map(function(n){return'<div class="nr" '+(n.c.live?'data-l="'+LIVE.indexOf(n.c)+'"':'data-i="'+cams.indexOf(n.c)+'"')+'><i style="background:'+(n.c.live?(n.c.v?"#ff3b6b":"#ffd36b"):col(n.c.t))+'"></i><span class="nn">'+(n.c.live?(n.c.v?'<b style="color:#ff3b6b">▶ VIDEO</b> ':'<b style="color:#ffd36b">● LIVE</b> '):'')+esc(n.c.n)+'</span><span class="mono nd">'+fmtD(n.d)+'</span></div>'}).join(""):'<p class="note2">'+(EMBED_OK?(B?'No loaded camera network covers this area yet. More networks are added with each update.':'No live camera networks loaded yet. Check Live networks under Layers.'):'Live cameras load only in the installed app / GitHub link.')+'</p>')+
   (sampler?'<h4 style="margin-top:12px">MORE PUBLIC SOURCES FOR THIS AREA <span style="color:#ff5d8f">· AI-SUGGESTED, UNVERIFIED</span></h4><div id="sugg" class="mono" style="font-size:12px;color:#36f1b5">SCANNING…</div>':'');
  $("detail").innerHTML=h.replace('</h3>','</h3><div class="wx mono" id="wx"></div>');$("detail").scrollTop=0;wx(loc.lat,loc.lon);rememberScan(q||loc.name);
  
  if(sampler)suggest(loc);
}
function suggest(loc){
  var have=cams.map(function(c){return c.u}).join(" ");
  var prompt="List up to 6 publicly published live camera sources that cover the area around "+loc.name+" (lat "+loc.lat.toFixed(3)+", lon "+loc.lon.toFixed(3)+"). Only include cameras their owners publish on purpose for the public: government/DOT/511 traffic camera pages, city or tourism webcams, airport/aviation weather cams, park, volcano, wildfire or beach cams, university or broadcaster webcams. Never include unsecured private cameras, home or business security cams, or sites that aggregate them. Only give DIRECT media URLs that play without a web page: a still image (.jpg/.png) that refreshes, an HLS .m3u8 stream, or a YouTube live video URL. Never give web page URLs. Only give URLs you are highly confident exist. Skip any already in this list: "+have.slice(0,1500)+". Reply with ONLY a JSON array of objects: {\"name\":string,\"url\":string,\"type\":one of traffic|hazard|aviation|landmark|nature|ocean,\"lat\":number,\"lon\":number,\"why\":string under 15 words}.";
  sampler.json(prompt,{modelTier:"default"}).then(function(arr){
    var el=$("sugg");if(!el)return;
    suggestions=(Array.isArray(arr)?arr:[]).filter(function(x){return x&&/^https:\/\//i.test(x.url)&&/(\.(jpe?g|png|m3u8)(\?|$)|youtube\.com|youtu\.be)/i.test(x.url)&&isFinite(x.lat)&&isFinite(x.lon)}).slice(0,6);
    if(!suggestions.length){el.textContent="No further sources suggested.";return}
    el.innerHTML=suggestions.map(function(x,i){return'<div class="sg"><b>'+esc(x.name)+'</b><span>'+esc(x.why||"")+'</span><div><button data-s="'+i+'">+ Add to index</button></div></div>'}).join("")+'<div style="color:#6a7f95;margin-top:6px;font-family:Inter,sans-serif">Check each link opens before adding.</div>';
  }).catch(function(e){var el=$("sugg");if(el)el.textContent=(e&&e.code)==="not_granted"?"Access not granted.":"Suggestions unavailable right now."});
}
$("detail").addEventListener("click",function(e){
  var r=e.target.closest(".nr");if(r){select(r.dataset.l?LIVE[+r.dataset.l]:cams[+r.dataset.i]);return}
  var b=e.target.closest("button[data-s]");if(b){var x=suggestions[+b.dataset.s];if(!x)return;b.disabled=true;b.textContent="Saving…";
    var cam={n:String(x.name).slice(0,80),c:(pin&&pin.name.split(",").pop().trim())||"",r:(pin&&pin.name.split(",")[0])||"",t:L[x.type]?x.type:"landmark",lat:+x.lat,lon:+x.lon,u:x.url,d:String(x.why||"").slice(0,160),user:true};
    saveCam(cam,function(err){b.textContent=err?"Failed":"Added ✓";if(err)b.title=err})}
});
$("addrForm").addEventListener("submit",function(e){e.preventDefault();$("addr").blur();scan($("addr").value)});
$("addrClear").onclick=function(){pin=null;$("addr").value="";$("bReset").onclick()};

