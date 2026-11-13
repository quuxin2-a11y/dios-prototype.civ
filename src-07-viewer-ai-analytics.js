// ---------- viewer & multi-view wall ----------
var EMBED_OK=true; // outside feeds are reachable; kept as one switch for any restricted embed
function ls(k,v){try{if(v===undefined)return JSON.parse(localStorage.getItem(k)||"null");localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}}
var wall=ls("godeye-wall")||[],embeds=ls("godeye-embeds")||{},layout=ls("godeye-layout")||4,focusU=null,snapTimer=null;
function camByU(u){for(var i=0;i<cams.length;i++)if(cams[i].u===u)return cams[i];for(var j=0;j<LIVE.length;j++)if(LIVE[j].u===u)return LIVE[j];return null}
function ytEmbed(u){var m=u.match(/(?:youtube\.com\/(?:watch\?v=|live\/|embed\/)|youtu\.be\/)([\w-]{11})/);return m?"https://www.youtube.com/embed/"+m[1]+"?autoplay=1&mute=1&playsinline=1":null}
function srcFor(c){var e=embeds[c.u]||c.e||"";if(e){var y=ytEmbed(e);if(y)return{k:"frame",s:y};if(/\.(jpe?g|png|gif|webp)(\?|$)/i.test(e)||/snapshot|\/image|cam\.jpg/i.test(e))return{k:"img",s:e};return{k:"frame",s:e}}var y2=ytEmbed(c.u);return{k:"frame",s:y2||c.u}}
function addWall(c,open){if(wall.indexOf(c.u)<0)wall.push(c.u);if(wall.length>12)wall.shift();ls("godeye-wall",wall);updWallBtn();if(open)openWall(c.u)}
function updWallBtn(){$("bWall").textContent="▦ Multi-View ("+wall.length+")"}
function openWall(f){focusU=f||null;$("wall").style.display="flex";document.body.style.overflow="hidden";drawWall()}
function closeWall(){webView=false;$("wall").style.display="none";document.body.style.overflow="";$("wgrid").innerHTML="";clearInterval(snapTimer)}
function drawWall(){
  var list=wall.map(camByU).filter(Boolean);
  if(focusU){var fc=camByU(focusU);list=fc?[fc]:list}
  var n=focusU?1:layout,cols=n<=1?1:n<=2?2:n<=4?2:n<=6?3:3;
  if(window.innerWidth<700)cols=1;
  $("wgrid").style.gridTemplateColumns="repeat("+cols+",1fr)";
  $("wlayout").value=String(layout);$("wcount").textContent=list.length+" CAMERA"+(list.length===1?"":"S")+(focusU?" · FOCUS":"");
  var shown=list.slice(0,focusU?1:n);
  if(!shown.length){$("wgrid").innerHTML='<div class="wempty">No cameras on the wall yet.<br>Tap a camera, then <b>▶ Watch</b> or <b>+ Wall</b>.</div>';return}
  var mapHtml=(webView&&!focusU&&WEB.length)?'<div class="tile webmap"><div class="th"><b>⬡ CAMERA WEB</b><span>'+WEB.length+' NODES LINKED</span></div><div class="tb2"><canvas id="webmap"></canvas></div></div>':"";if(mapHtml)shown=shown.slice(0,Math.max(1,n-1));
  $("wgrid").innerHTML=mapHtml+shown.map(function(c,ci){var s=srcFor(c),body;
    if(!EMBED_OK)body='<div class="noise"></div><div class="blocked"><b>FEED LOCKED IN HOSTED VIEW</b><span>This hosted preview can\'t display video from other sites. Open the downloaded file version of OJOS DE DIOS in your browser to watch here, or open this feed directly.</span></div>';
    else if(c.live&&!embeds[c.u])body=media(c,"wimg")+'<div class="live">● LIVE · AUTO-REFRESH</div>';
    else if(s.k==="img")body='<img class="snap" data-src="'+esc(s.s)+'" src="'+esc(s.s)+'" alt=""><div class="live">● SNAPSHOT · AUTO-REFRESH 15s</div>';
    else body='<iframe src="'+esc(s.s)+'" allow="autoplay; fullscreen; encrypted-media" referrerpolicy="no-referrer" loading="lazy"></iframe><div class="live">● LIVE</div>';
    return'<div class="tile" data-u="'+esc(c.u)+'"><div class="th"><i style="background:'+col(c.t)+'"></i><b>'+esc(c.n)+'</b><span>'+esc(c.r)+'</span>'+
      '<button data-a="focus" title="Focus">'+(focusU?"▦":"⤢")+'</button><button data-a="rm" title="Remove">✕</button></div>'+
      '<div class="tb2">'+body+'<div class="tovl mono"><span>CAM-'+(ci<9?"0":"")+(ci+1)+' · '+c.lat.toFixed(3)+', '+c.lon.toFixed(3)+'</span><span class="tclock"></span></div><i class="tscan"></i></div>'+
      (EMBED_OK?'<form class="ef"><input placeholder="Blank or blocked? Paste a snapshot .jpg or YouTube live link" value="'+esc(embeds[c.u]||"")+'"><button>Set</button></form>':'')+'</div>'}).join("");
  wireMedia($("wgrid"));setTimeout(scanAll,50);
  clearInterval(snapTimer);snapTimer=setInterval(function(){Array.prototype.forEach.call(document.querySelectorAll("img.snap"),function(im){snapRefresh(im)})},20000);
}
$("wgrid").addEventListener("click",function(e){var b=e.target.closest("button[data-a]");if(!b)return;var u=b.closest(".tile").getAttribute("data-u");
  if(b.dataset.a==="rm"){wall=wall.filter(function(x){return x!==u});ls("godeye-wall",wall);updWallBtn();if(focusU===u)focusU=null;drawWall()}
  else{focusU=focusU?null:u;drawWall()}});
$("wgrid").addEventListener("submit",function(e){e.preventDefault();var u=e.target.closest(".tile").getAttribute("data-u"),v=e.target.querySelector("input").value.trim();
  if(v&&!/^https?:\/\//i.test(v))return;if(v)embeds[u]=v;else delete embeds[u];ls("godeye-embeds",embeds);drawWall()});
$("wlayout").onchange=function(){layout=+this.value;ls("godeye-layout",layout);focusU=null;drawWall()};
$("wclose").onclick=closeWall;$("wclear").onclick=function(){wall=[];focusU=null;ls("godeye-wall",wall);updWallBtn();drawWall()};
$("wadd").onclick=function(){var cx0=pin?pin.lon:rot.lon,cy0=pin?pin.lat:rot.lat;visLive.map(function(c){return{c:c,d:hav(cy0,cx0,c.lat,c.lon)}}).sort(function(a,b){return a.d-b.d}).slice(0,layout).map(function(x){return x.c}).forEach(function(c){if(wall.indexOf(c.u)<0)wall.push(c.u)});wall=wall.slice(-12);ls("godeye-wall",wall);updWallBtn();focusU=null;drawWall()};
$("bWall").onclick=function(){openWall()};
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&$("wall").style.display==="flex")closeWall()});
$("detail").addEventListener("click",function(e){var b=e.target.closest("[data-w]");if(!b||!selected)return;
  if(b.dataset.w==="fav"){var fi=FAV.indexOf(selected.u);if(fi>=0)FAV.splice(fi,1);else FAV.unshift(selected.u);FAV=FAV.slice(0,40);ls("ojos-fav",FAV);b.textContent=fi>=0?"☆ Save":"★ Saved";render();return}
  if(b.dataset.w==="scene"){var se=selected;showArea({name:se.n,lat:se.lat,lon:se.lon,src:"live "+se.kind+" position"});return}
  if(b.dataset.w==="near"){var sc=selected;showArea({name:sc.r+(sc.c&&sc.c!==sc.r?", "+sc.c:""),lat:sc.lat,lon:sc.lon,src:sc.n+" network area"});return}if(b.dataset.w==="watch")addWall(selected,true);else{addWall(selected,false);b.textContent="On wall ✓"}});
updWallBtn();

// ---------- AI object detection (anonymous: object classes only) ----------
var AI_ON=!!ls("godeye-ai"),aiModel=null,aiLoading=null;
var AI_KEEP={person:"PERSON",car:"CAR",truck:"TRUCK",bus:"BUS",motorcycle:"MOTORCYCLE",bicycle:"BICYCLE","traffic light":"SIGNAL","stop sign":"SIGN",boat:"BOAT",airplane:"PLANE",train:"TRAIN",dog:"DOG"};
var AI_COL={PERSON:"#e0245e",CAR:"#39ff6a",TRUCK:"#ffb547",BUS:"#ff8a3d",MOTORCYCLE:"#4cc3ff",BICYCLE:"#4cc3ff",SIGNAL:"#f2c200",SIGN:"#f2c200",BOAT:"#2ad4e6",PLANE:"#c58bff",TRAIN:"#c58bff",DOG:"#ffffff",BACKPACK:"#35d07f",HANDBAG:"#ff3b6b",SUITCASE:"#2ee6c9",UMBRELLA:"#8fa8ff"};
function clsCol(lab){if(AI_COL[lab])return AI_COL[lab];var h=0;for(var i=0;i<lab.length;i++)h=(h*31+lab.charCodeAt(i))%360;return"hsl("+h+",85%,60%)"}
function clsLab(c){return AI_KEEP[c]||c.toUpperCase()}
var SRI={};/*SRI*/ // filled in at build time: SHA-384 of every pinned library, so a tampered CDN file is refused
function loadScript(u){return new Promise(function(res,rej){var sc=document.createElement("script");sc.src=u;if(SRI[u]){sc.integrity=SRI[u];sc.crossOrigin="anonymous"}sc.onload=res;sc.onerror=function(){rej(new Error("load "+u))};document.head.appendChild(sc)})}
function getModel(){
  if(aiModel)return Promise.resolve(aiModel);if(aiLoading)return aiLoading;
  aiLoading=(window.cocoSsd?Promise.resolve():loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js").then(function(){return loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js")}))
   .then(function(){return cocoSsd.load({base:"mobilenet_v2"}).catch(function(){return cocoSsd.load({base:"lite_mobilenet_v2"})})}).then(function(m){aiModel=m;return m}).catch(function(e){aiLoading=null;throw e});
  return aiLoading;
}
function aiSet(on){AI_ON=on;busiest();ls("godeye-ai",on);Array.prototype.forEach.call(document.querySelectorAll(".aibtn"),function(b){b.classList.toggle("on",on);b.textContent=on?"◉ AI DETECT: ON":"◎ AI DETECT: OFF"});
  Array.prototype.forEach.call(document.querySelectorAll(".aiov,.aibar"),function(x){x.remove()});Array.prototype.forEach.call(document.querySelectorAll("img.snap"),function(i){i._aiSrc=null});if(on)scanAll()}
function scanAll(){if(!AI_ON||!EMBED_OK)return;Array.prototype.forEach.call(document.querySelectorAll(".camview img.snap,.tb2 img.snap"),function(im){aiFor(im)})}
function aiBar(box,txt,warn){var b=box.querySelector(".aibar");if(!b){b=document.createElement("div");b.className="aibar mono";box.appendChild(b)}b.textContent=txt;b.classList.toggle("warn",!!warn)}
// --- AI engine: enhance old / dark / low-res images, scan the whole frame plus zoomed tiles, then merge
var aiQ=Promise.resolve();
function loadPix(url){if(isJ(url))return jimg(url).then(function(d){return new Promise(function(res,rej){var i=new Image();i.onload=function(){res(i)};i.onerror=function(){rej(new Error("blocked"))};i.src=d})});
  return new Promise(function(res,rej){var im=new Image();im.crossOrigin="anonymous";im.onload=function(){res(im)};
  im.onerror=function(){var n=nativeHttp();if(!n){rej(new Error("blocked"));return}
    n.get({url:url,responseType:"blob"}).then(function(r){if(!r||r.status>=400||typeof r.data!=="string")throw new Error("x");var i2=new Image();i2.onload=function(){res(i2)};i2.onerror=function(){rej(new Error("blocked"))};i2.src="data:image/jpeg;base64,"+r.data.replace(/\s/g,"")}).catch(function(){rej(new Error("blocked"))})};
  im.src=url})}
function enh(src,sx,sy,sw,sh,dw,dh){var c=document.createElement("canvas");c.width=dw;c.height=dh;var g=c.getContext("2d",{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality="high";g.drawImage(src,sx,sy,sw,sh,0,0,dw,dh);
  var id=g.getImageData(0,0,dw,dh),d=id.data,hist=new Uint32Array(256),n=dw*dh,i,sum=0;
  for(i=0;i<d.length;i+=4){var l=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8;hist[l]++;sum+=l}
  var lo=0,hi=255,acc=0,cut=n*0.01;for(i=0;i<256;i++){acc+=hist[i];if(acc>cut){lo=i;break}}acc=0;for(i=255;i>=0;i--){acc+=hist[i];if(acc>cut){hi=i;break}}
  var mean=sum/n,gam=mean<60?0.6:mean<95?0.8:1;
  if(hi-lo<215||gam!==1){var lut=new Uint8ClampedArray(256),rg=Math.max(1,hi-lo);for(i=0;i<256;i++){var v=Math.min(1,Math.max(0,(i-lo)/rg));lut[i]=Math.pow(v,gam)*255}
    for(i=0;i<d.length;i+=4){d[i]=lut[d[i]];d[i+1]=lut[d[i+1]];d[i+2]=lut[d[i+2]]}g.putImageData(id,0,0)}
  return c}
var VEH={car:1,truck:1,bus:1};
function iou(a,b){var x1=Math.max(a[0],b[0]),y1=Math.max(a[1],b[1]),x2=Math.min(a[0]+a[2],b[0]+b[2]),y2=Math.min(a[1]+a[3],b[1]+b[3]),w=Math.max(0,x2-x1),h=Math.max(0,y2-y1),it=w*h;return{u:it/(a[2]*a[3]+b[2]*b[3]-it+1e-6),m:it/(Math.min(a[2]*a[3],b[2]*b[3])+1e-6)}}
// Boxes from several passes are fused: the same object seen by two passes is kept with more confidence, one-off weak hits are dropped.
function nms(list){list.sort(function(a,b){return b.score-a.score});var keep=[];for(var i=0;i<list.length;i++){var p=list[i],dup=null;for(var j=0;j<keep.length;j++){var k=keep[j];if(k.class!==p.class&&!(VEH[k.class]&&VEH[p.class]))continue;var o=iou(k.bbox,p.bbox);if(o.u>0.45||o.m>0.8){dup=k;break}}
    if(dup){dup.hits=(dup.hits||1)+1;dup.score=Math.min(0.99,dup.score+0.06)}else{p.hits=1;keep.push(p)}}
  return keep.filter(function(p){return p.hits>=2||p.score>=(VEH[p.class]?0.34:0.42)})}
function flipCanvas(c){var f=document.createElement("canvas");f.width=c.width;f.height=c.height;var g=f.getContext("2d");g.translate(c.width,0);g.scale(-1,1);g.drawImage(c,0,0);return f}
function detectSmart(m,src,W0,H0,quick){
  var passes=[[0,0,W0,H0,0],[0,0,W0,H0,1]],out=[];if(quick)passes.pop();
  if(!quick&&W0>=200&&H0>=150){var tw=W0*0.46,th=H0*0.46,ix2,iy2;for(iy2=0;iy2<3;iy2++)for(ix2=0;ix2<3;ix2++)passes.push([(W0-tw)*ix2/2,(H0-th)*iy2/2,tw,th,0])}
  return passes.reduce(function(pr,ps,ix){return pr.then(function(){
    var tile=ix>1||(quick&&ix>0),sc=Math.min(4,(quick?512:tile?576:704)/Math.max(ps[2],ps[3])),dw=Math.max(8,Math.round(ps[2]*sc)),dh=Math.max(8,Math.round(ps[3]*sc)),c=enh(src,ps[0],ps[1],ps[2],ps[3],dw,dh);if(ps[4])c=flipCanvas(c);
    return m.detect(c,80,tile?0.3:0.24).then(function(pp){pp.forEach(function(p){var b=p.bbox;if(ps[4])b=[dw-b[0]-b[2],b[1],b[2],b[3]];var bx=[ps[0]+b[0]/sc,ps[1]+b[1]/sc,b[2]/sc,b[3]/sc];
      if(bx[2]*bx[3]>W0*H0*0.85)return;
      if(tile){if(b[2]*b[3]>dw*dh*0.55)return;
        if((ps[0]>1&&b[0]<=3)||(ps[1]>1&&b[1]<=3)||(ps[0]+ps[2]<W0-1&&b[0]+b[2]>=dw-3)||(ps[1]+ps[3]<H0-1&&b[1]+b[3]>=dh-3))return}
      out.push({class:p.class,score:p.score,bbox:bx})})})})},Promise.resolve()).then(function(){return quick?nmsQuick(out):nms(out)})}
function nmsQuick(list){list.sort(function(a,b){return b.score-a.score});var keep=[];for(var i=0;i<list.length;i++){var p=list[i],dup=false;for(var j=0;j<keep.length;j++){var k=keep[j];if(k.class!==p.class&&!(VEH[k.class]&&VEH[p.class]))continue;var o=iou(k.bbox,p.bbox);if(o.u>0.45||o.m>0.8){dup=true;break}}if(!dup)keep.push(p)}return keep}
// Video: follow each object from frame to frame so counts are steady and a one-frame flicker is ignored.
// The numbers are anonymous counters for this viewing only. Nothing is read from the vehicle and nothing is stored.
var TRK={};
function trackUpd(key,preds,fw,fh){var T=TRK[key]||(TRK[key]={seq:1000+Math.floor(Math.random()*8000),tr:[],t:0}),now=Date.now();if(now-T.t>6000)T.tr=[];T.t=now;var diag=Math.sqrt(fw*fw+fh*fh),used={};
  T.tr.forEach(function(t){var best=-1,bs=0;for(var i=0;i<preds.length;i++){if(used[i])continue;var p=preds[i];if(p.class!==t.cls&&!(VEH[p.class]&&VEH[t.cls]))continue;var o=iou(t.bbox,p.bbox),cx=p.bbox[0]+p.bbox[2]/2-(t.bbox[0]+t.bbox[2]/2),cy=p.bbox[1]+p.bbox[3]/2-(t.bbox[1]+t.bbox[3]/2),dd=Math.sqrt(cx*cx+cy*cy),md=Math.max(t.bbox[2],t.bbox[3])*2.4,sc2=o.u+Math.max(0,1-dd/md)*0.5;if(sc2>bs&&(o.u>0.12||dd<md)){bs=sc2;best=i}}
    if(best>=0){var q=preds[best];used[best]=1;t.bbox=q.bbox;t.score=q.score;t.cls=q.score>t.score?q.class:t.cls;t.hits++;t.miss=0;var mx=q.bbox[0]+q.bbox[2]/2-t.x0,my=q.bbox[1]+q.bbox[3]/2-t.y0;if(Math.sqrt(mx*mx+my*my)>diag*0.035)t.moved=true}else t.miss++});
  preds.forEach(function(p,i){if(!used[i])T.tr.push({id:++T.seq,cls:p.class,bbox:p.bbox,score:p.score,hits:1,miss:0,moved:false,x0:p.bbox[0]+p.bbox[2]/2,y0:p.bbox[1]+p.bbox[3]/2})});
  T.tr=T.tr.filter(function(t){return t.miss<=2});if(T.tr.length>120)T.tr=T.tr.slice(-120);
  return T.tr.filter(function(t){return t.hits>=2&&t.miss<=1}).map(function(t){return{class:t.cls,score:t.score,bbox:t.bbox,id:t.id,moved:t.moved,tracked:true}})}
function aiFor(im){
  if(!AI_ON||!EMBED_OK||!im||!im.isConnected)return;var box=im.parentNode;if(!im.naturalWidth){im.addEventListener("load",function(){aiFor(im)},{once:true});return}
  var src=im.currentSrc||im.src;if(im._aiSrc===src)return;im._aiSrc=src;
  aiBar(box,aiModel?"AI · ENHANCING + ANALYZING…":"AI · LOADING HIGH-ACCURACY MODEL (FIRST TIME ONLY)…");
  aiQ=aiQ.then(function(){if(!im.isConnected||!AI_ON)return;
    return getModel().then(function(m){return loadPix(src).then(function(px){return detectSmart(m,px,px.naturalWidth,px.naturalHeight,false).then(function(preds){drawBoxes(im,px,preds)})})})
     .catch(function(e){aiBar(box,e&&e.message==="blocked"?"AI · THIS CAMERA'S SERVER BLOCKS ANALYSIS":"AI · COULDN'T ANALYZE THIS FRAME",true)})}).catch(function(){});
}
// live video: analyze frames continuously while a stream plays
var vidBusy=false;
setInterval(function(){if(!AI_ON||!EMBED_OK||vidBusy||!aiModel&&!document.querySelector(".camview video,.tb2 video"))return;
  var vs=Array.prototype.filter.call(document.querySelectorAll(".camview video,.tb2 video"),function(v){return!v.paused&&v.readyState>=2&&v.videoWidth});if(!vs.length)return;
  var v=vs[Math.floor(Math.random()*vs.length)];vidBusy=true;
  getModel().then(function(m){return detectSmart(m,v,v.videoWidth,v.videoHeight,true)}).then(function(preds){preds=trackUpd((v.closest("#detail")&&selected&&selected.u)||v.currentSrc||"v",preds,v.videoWidth,v.videoHeight);drawBoxes(v,{naturalWidth:v.videoWidth,naturalHeight:v.videoHeight},preds)}).catch(function(){if(v.isConnected)aiBar(v.parentNode,"AI · THIS STREAM BLOCKS ANALYSIS — USE THE STILL IMAGE",true)}).then(function(){vidBusy=false})},900);
function drawBoxes(im,probe,preds){twinFeed(im,probe,preds);
  var box=im.parentNode;if(!box||!im.isConnected)return;var ov=box.querySelector("canvas.aiov");if(!ov){ov=document.createElement("canvas");ov.className="aiov";box.appendChild(ov)}
  var bw=box.clientWidth,bh=box.clientHeight,dpr=Math.min(window.devicePixelRatio||1,2);ov.width=bw*dpr;ov.height=bh*dpr;ov.style.width=bw+"px";ov.style.height=bh+"px";
  var g=ov.getContext("2d");g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,bw,bh);
  var nw=probe.naturalWidth,nh=probe.naturalHeight,sc=Math.min(bw/nw,bh/nh),ox=(bw-nw*sc)/2,oy=(bh-nh*sc)/2,counts={};
  preds.forEach(function(p){var lab=clsLab(p.class);counts[lab]=(counts[lab]||0)+1;var c=clsCol(lab);
    var x=ox+p.bbox[0]*sc,y=oy+p.bbox[1]*sc,w=p.bbox[2]*sc,h=p.bbox[3]*sc;g.strokeStyle=c;g.lineWidth=1.6;g.strokeRect(x,y,w,h);
    var t=(p.id?(VEH[p.class]||/motor|bicycle/.test(p.class)?"VEH-":p.class==="person"?"PED-":"OBJ-")+p.id+" · ":"")+p.class+" "+Math.round(p.score*100)+"%";g.font="600 10px Inter,sans-serif";var tw=g.measureText(t).width;g.fillStyle=c;g.fillRect(x-0.8,Math.max(0,y-13),tw+6,13);g.fillStyle="#fff";g.fillText(t,x+2.5,Math.max(10,y-3))});
  var cu=im.getAttribute("data-u");if(cu)record(cu,counts);
  var fu=cu||(im.closest&&im.closest("#detail")&&selected&&selected.u);if(fu)FPD[fu]={preds:preds,nw:nw,nh:nh,t:Date.now()};
  var keys=Object.keys(counts).sort(function(a,b){return counts[b]-counts[a]}).slice(0,6);var trk=preds.filter(function(p){return p.tracked&&(VEH[p.class]||/motor/.test(p.class))}),mv=trk.filter(function(p){return p.moved}).length;
  aiBar(box,keys.length?"AI · "+keys.map(function(k){var n=counts[k];return n+" "+k+(n>1&&!/S$/.test(k)?"S":"")}).join(" · ")+(trk.length?" · "+mv+" MOVING · "+(trk.length-mv)+" STOPPED":""):"AI · NOTHING DETECTED");
}
document.addEventListener("click",function(e){var b=e.target.closest(".aibtn");if(b)aiSet(!AI_ON)});
// re-run detection whenever a snapshot refreshes
document.addEventListener("load",function(e){var t=e.target;if(t&&t.tagName==="IMG"&&t.classList.contains("snap")&&AI_ON)aiFor(t)},true);
window.addEventListener("resize",function(){if(AI_ON)scanAll()});

// ---------- anonymous traffic analytics ----------
var STATS={};try{STATS=JSON.parse(localStorage.getItem("godeye-stats")||"{}")||{}}catch(e){STATS={}}
var saveT=null;function saveStats(){clearTimeout(saveT);saveT=setTimeout(function(){try{var ks=Object.keys(STATS);if(ks.length>250){ks.sort(function(a,b){return last(STATS[a]).t-last(STATS[b]).t});ks.slice(0,ks.length-250).forEach(function(k){delete STATS[k]})}localStorage.setItem("godeye-stats",JSON.stringify(STATS))}catch(e){}},1500)}
function last(a){return a&&a.length?a[a.length-1]:{t:0,v:0,p:0}}
function vehOf(c){return(c.CAR||0)+(c.TRUCK||0)+(c.BUS||0)+(c.MOTORCYCLE||0)}
function level(v){return v>=15?"HEAVY":v>=6?"MODERATE":"LIGHT"}
var LVCOL={LIGHT:"#39ff6a",MODERATE:"#ffb547",HEAVY:"#ff3b3b"};
function record(u,counts){
  var arr=STATS[u]||(STATS[u]=[]),now=Date.now(),v=vehOf(counts),p=counts.PERSON||0;
  if(arr.length&&now-last(arr).t<12000){arr[arr.length-1]={t:now,v:v,p:p}}else arr.push({t:now,v:v,p:p});
  if(arr.length>40)arr.splice(0,arr.length-40);
  if(arr.length>=4){var prev=arr.slice(0,-1),av=prev.reduce(function(a,x){return a+x.v},0)/prev.length,ap=prev.reduce(function(a,x){return a+x.p},0)/prev.length,c=camByU(u),nm=c?c.n:"camera";
    if(v>=8&&v>=av*2)toast("Traffic spike","<b>"+esc(nm)+"</b>: "+v+" vehicles (usual ~"+Math.round(av)+")",u);
    if(p>=5&&p>=ap*2)toast("Crowd spike","<b>"+esc(nm)+"</b>: "+p+" people (usual ~"+Math.round(ap)+")",u)}
  saveStats();busiest();if(selected&&selected.u===u)statsPanel(selected);
}
function toast(title,html,u){var t=document.createElement("div");t.className="toast";t.innerHTML='<b class="mono">⚠ '+esc(title.toUpperCase())+'</b><span>'+html+'</span>';t.onclick=function(){var c=camByU(u);if(c)select(c);t.remove()};
  $("toasts").appendChild(t);setTimeout(function(){t.classList.add("out");setTimeout(function(){t.remove()},400)},7000);while($("toasts").children.length>1)$("toasts").firstChild.remove()}
function busiest(){var el=$("busiest");if(!el)return;var now=Date.now();
  var rows=Object.keys(STATS).map(function(u){return{u:u,l:last(STATS[u]),c:camByU(u)}}).filter(function(r){return r.c&&now-r.l.t<15*60000}).sort(function(a,b){return(b.l.v+b.l.p)-(a.l.v+a.l.p)}).slice(0,6);
  el.innerHTML=rows.length?rows.map(function(r){var lv=level(r.l.v);return'<div class="region" data-bu="'+esc(r.u)+'"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px"><i class="lvd" style="background:'+LVCOL[lv]+'"></i>'+esc(r.c.n)+'</span><span class="mono">'+r.l.v+'🚗 '+r.l.p+'🚶</span></div>'}).join(""):'<div class="ls"><span>'+(AI_ON?"Analyzing nearby cameras…":"Turn on AI Detect to rank live cameras.")+'</span></div>'}
function statsPanel(c){var el=$("camstats");if(!el)return;var a=STATS[c.u];
  if(!a||!a.length){el.innerHTML=AI_ON?'<div class="ls"><span>Collecting traffic data…</span></div>':'';return}
  var l=last(a),vs=a.map(function(x){return x.v}),ps=a.map(function(x){return x.p}),avg=Math.round(vs.reduce(function(x,y){return x+y},0)/vs.length),pk=Math.max.apply(null,vs),lv=level(l.v);
  var W=300,H=56,mx=Math.max(4,pk,Math.max.apply(null,ps));function line(arr,col){if(arr.length<2)return"";return'<polyline fill="none" stroke="'+col+'" stroke-width="2" points="'+arr.map(function(v,i){return(i/(arr.length-1)*W).toFixed(1)+","+(H-3-v/mx*(H-8)).toFixed(1)}).join(" ")+'"/>'}
  el.innerHTML='<h4 style="margin-top:12px">TRAFFIC ANALYTICS · ANONYMOUS</h4><div class="stg"><div><b style="color:'+LVCOL[lv]+'">'+lv+'</b><span>congestion</span></div><div><b>'+l.v+'</b><span>vehicles now</span></div><div><b>'+avg+'</b><span>avg</span></div><div><b>'+pk+'</b><span>peak</span></div><div><b>'+l.p+'</b><span>people now</span></div></div>'+
   '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" class="spark"><rect width="'+W+'" height="'+H+'" fill="#05101a"/>'+line(vs,"#39ff6a")+line(ps,"#ff5d8f")+'</svg><div class="leg mono"><span style="color:#39ff6a">━ vehicles</span><span style="color:#ff5d8f">━ people</span><span>'+a.length+' samples</span></div>'}
document.addEventListener("click",function(e){var r=e.target.closest("[data-bu]");if(r){var c=camByU(r.getAttribute("data-bu"));if(c)select(c)}});
// background patrol: analyze nearby / on-wall live cameras in rotation
var patrolI=0;
setInterval(function(){
  if(!AI_ON||!EMBED_OK||!LIVE.length||document.hidden)return;
  var cx=pin?pin.lon:rot.lon,cy=pin?pin.lat:rot.lat;
  var pool=wall.map(camByU).filter(function(c){return c&&c.live});
  pool=pool.concat(LIVE.map(function(c){return{c:c,d:hav(cy,cx,c.lat,c.lon)}}).sort(function(a,b){return a.d-b.d}).slice(0,24).map(function(x){return x.c}));
  if(!pool.length)return;var c=pool[patrolI++%pool.length];
  aiQ=aiQ.then(function(){if(!AI_ON)return;return getModel().then(function(m){return loadPix(c.e+(c.e.indexOf("?")<0?"?":"&")+"_p="+Date.now()).then(function(px){return detectSmart(m,px,px.naturalWidth,px.naturalHeight,true)})}).then(function(preds){var counts={};preds.forEach(function(p){var lab=clsLab(p.class);counts[lab]=(counts[lab]||0)+1});record(c.u,counts)}).catch(function(){})}).catch(function(){});
},4000);

