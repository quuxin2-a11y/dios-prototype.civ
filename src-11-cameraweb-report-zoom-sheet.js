// ---------- Camera Web: link several cameras into one live view ----------
var WEB=[],webMode=false,webView=false;
function updWeb(){var el=$("webbar");if(!el)return;ls("ojos-web",WEB.map(function(c){return c.u}));$("bWeb").classList.toggle("on",webMode);
  if(!webMode&&!WEB.length){el.style.display="none";return}el.style.display="flex";
  el.innerHTML='<b>⬡ WEB</b><span>'+WEB.length+'/8 '+(webMode?"· tap cameras to link":"linked")+'</span>'+(WEB.length?'<button data-web="launch" class="go">LAUNCH</button><button data-web="clear">Clear</button>':'')+(webMode?'<button data-web="done">Done</button>':'')}
function toggleWeb(c){var i=WEB.indexOf(c);if(i>=0)WEB.splice(i,1);else if(WEB.length<8)WEB.push(c);else{note("Camera Web","A web holds up to 8 cameras.");return}updWeb()}
function launchWeb(){if(!WEB.length)return;webMode=false;wall=WEB.map(function(c){return c.u});ls("godeye-wall",wall);updWallBtn();var need=WEB.length+1;layout=need<=2?2:need<=4?4:need<=6?6:9;webView=true;updWeb();openWall()}
$("bWeb").onclick=function(){webMode=!webMode;if(webMode)note("Camera Web","Tap cameras on the globe or in a list to link them, then tap LAUNCH.");updWeb()};
document.addEventListener("click",function(e){var b=e.target.closest("[data-web]");if(!b)return;var k=b.getAttribute("data-web");if(k==="launch")launchWeb();else if(k==="clear"){WEB=[];updWeb()}else{webMode=false;updWeb()}});
// The camera's picture laid on the ground where it looks. Direction is read from the name when it says (NB, eastbound…),
// otherwise it is a guess you can turn with the ⟲ ⟳ buttons. Tags are anonymous counters, not identities.
var FPD={},FPON=ls("ojos-fp")!==false,HDG=ls("ojos-hdg")||{};
function camHdg(c){if(HDG[c.u]!=null)return HDG[c.u];if(c.hdg!=null)return c.hdg;var n=" "+(c.n||"")+" ";if(/\b(NB|N\/B|northbound|looking north|north view)\b/i.test(n))return 0;if(/\b(EB|E\/B|eastbound|looking east|east view)\b/i.test(n))return 90;if(/\b(SB|S\/B|southbound|looking south|south view)\b/i.test(n))return 180;if(/\b(WB|W\/B|westbound|looking west|west view)\b/i.test(n))return 270;return 0}
function fpQuad(c){var h=camHdg(c),rg=camRange(c)[0],far=Math.min(Math.max(rg*0.45,0.12),rg>2?rg*0.5:0.26),near=far*0.07,a=27;return[dest(c.lat,c.lon,h-a,far/Math.cos(a*D)),dest(c.lat,c.lon,h+a,far/Math.cos(a*D)),dest(c.lat,c.lon,h+a,near/Math.cos(a*D)),dest(c.lat,c.lon,h-a,near/Math.cos(a*D))]} // FL, FR, NR, NL as [lon,lat]
function texTri(img,sx0,sy0,sx1,sy1,sx2,sy2,x0,y0,x1,y1,x2,y2){var d=(sx0*(sy1-sy2)+sx1*(sy2-sy0)+sx2*(sy0-sy1));if(!d)return;var a=(x0*(sy1-sy2)+x1*(sy2-sy0)+x2*(sy0-sy1))/d,b=(y0*(sy1-sy2)+y1*(sy2-sy0)+y2*(sy0-sy1))/d,c=(x0*(sx2-sx1)+x1*(sx0-sx2)+x2*(sx1-sx0))/d,e=(y0*(sx2-sx1)+y1*(sx0-sx2)+y2*(sx1-sx0))/d,f=x0-a*sx0-c*sy0,g=y0-b*sx0-e*sy0;
  ctx.save();ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.lineTo(x2,y2);ctx.closePath();ctx.clip();ctx.transform(a,b,c,e,f,g);ctx.drawImage(img,0,0);ctx.restore()}
function drawFootprint(t,P){var c=selected;if(!FPON||!c||!c.live||c.lat==null)return;var q=fpQuad(c).map(function(p){return P(p[0],p[1])});if(q[0][2]<=0||q[1][2]<=0||q[2][2]<=0||q[3][2]<=0)return;
  var FL=q[0],FR=q[1],NR=q[2],NL=q[3],span=Math.hypot(FL[0]-NL[0],FL[1]-NL[1]);if(span<46||span>Math.max(W,H)*3)return;
  var el=document.querySelector("#detail .camview video"),iw,ih;if(el&&el.readyState>=2&&el.videoWidth){iw=el.videoWidth;ih=el.videoHeight}else{el=document.querySelector("#detail .camview img.snap");if(!el||!el.naturalWidth||el.naturalWidth<9)el=null;else{iw=el.naturalWidth;ih=el.naturalHeight}}
  var pt=function(u,v){var ax=FL[0]+(FR[0]-FL[0])*u,ay=FL[1]+(FR[1]-FL[1])*u,bx=NL[0]+(NR[0]-NL[0])*u,by=NL[1]+(NR[1]-NL[1])*u;return[ax+(bx-ax)*v,ay+(by-ay)*v]};
  if(el){var N=5,i,j;ctx.save();ctx.globalAlpha=0.92;try{for(j=0;j<N;j++)for(i=0;i<N;i++){var u0=i/N,u1=(i+1)/N,v0=j/N,v1=(j+1)/N,a=pt(u0,v0),b=pt(u1,v0),d2=pt(u1,v1),e2=pt(u0,v1);
      texTri(el,u0*iw,v0*ih,u1*iw,v0*ih,u0*iw,v1*ih,a[0],a[1],b[0],b[1],e2[0],e2[1]);texTri(el,u1*iw,v0*ih,u1*iw,v1*ih,u0*iw,v1*ih,b[0],b[1],d2[0],d2[1],e2[0],e2[1])}}catch(err){}ctx.restore()}
  ctx.save();ctx.beginPath();ctx.moveTo(FL[0],FL[1]);ctx.lineTo(FR[0],FR[1]);ctx.lineTo(NR[0],NR[1]);ctx.lineTo(NL[0],NL[1]);ctx.closePath();ctx.fillStyle=el?"rgba(255,60,70,0.16)":"rgba(255,60,70,0.28)";ctx.fill();ctx.strokeStyle="rgba(255,255,255,0.95)";ctx.lineWidth=1.6;ctx.setLineDash([7,5]);ctx.lineDashOffset=-t*8;ctx.stroke();ctx.setLineDash([]);
  var o=P(c.lon,c.lat),nm=(NL[0]+NR[0])/2,ny=(NL[1]+NR[1])/2;ctx.strokeStyle="rgba(120,255,150,0.9)";ctx.lineWidth=1.2;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(o[0],o[1]);ctx.lineTo(FL[0],FL[1]);ctx.moveTo(o[0],o[1]);ctx.lineTo(FR[0],FR[1]);ctx.stroke();ctx.setLineDash([]);
  ctx.font="700 11px 'JetBrains Mono','Roboto Mono',monospace";var lab=String(c.n||"CAMERA").toUpperCase().slice(0,44),tw=ctx.measureText(lab).width,lx=Math.max(6,Math.min(W-tw-18,(FL[0]+FR[0])/2-tw/2-6)),ly=Math.max(topInset()+4,Math.min(FL[1],FR[1])-26);
  ctx.fillStyle="rgba(4,10,16,0.92)";ctx.fillRect(lx,ly,tw+12,20);ctx.strokeStyle="rgba(255,255,255,0.9)";ctx.lineWidth=1;ctx.strokeRect(lx+0.5,ly+0.5,tw+11,19);ctx.fillStyle="#fff";ctx.fillText(lab,lx+6,ly+14);
  var fd=FPD[c.u];if(fd&&Date.now()-fd.t<30000&&fd.preds&&fd.preds.length){ctx.font="600 9px 'JetBrains Mono','Roboto Mono',monospace";var seed=0,k;for(k=0;k<c.u.length;k++)seed=(seed*31+c.u.charCodeAt(k))%9000;
    fd.preds.slice(0,40).forEach(function(p,ix){var cl=String(p.class||"");var veh=/car|truck|bus|motor|bicycle|train/i.test(cl),ped=/person/i.test(cl);if(!veh&&!ped)return;var u=(p.bbox[0]+p.bbox[2]/2)/fd.nw,v=(p.bbox[1]+p.bbox[3])/fd.nh;if(u<0||u>1||v<0||v>1)return;var g=pt(u,v),id=(veh?"VEH-":"PED-")+(p.id||(80000+(seed+ix*137+Math.round(u*40)*7)%9999));
      ctx.strokeStyle="rgba(255,255,255,0.9)";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(g[0]-5,g[1]);ctx.lineTo(g[0]+5,g[1]);ctx.moveTo(g[0],g[1]-5);ctx.lineTo(g[0],g[1]+1);ctx.stroke();var w2=ctx.measureText(id).width;ctx.fillStyle="rgba(4,10,16,0.78)";ctx.fillRect(g[0]+6,g[1]-9,w2+6,12);ctx.fillStyle="#eaf6ff";ctx.fillText(id,g[0]+9,g[1])})}
  ctx.restore()}
document.addEventListener("click",function(e){var b=e.target.closest("[data-fp]");if(!b||!selected)return;var k=b.getAttribute("data-fp"),c=selected;
  if(k==="go"&&T4.on&&T4.v){FPON=true;t4Fly(c.lon,c.lat,520,camHdg(c));if(W<1000)sheetSet(40,true);return}
  if(k==="go"&&T3.on&&T3.map){FPON=true;ls("ojos-fp",true);var q3=fpQuad(c);T3.map.flyTo({center:[(c.lon+q3[0][0]+q3[1][0])/3,(c.lat+q3[0][1]+q3[1][1])/3],zoom:17.2,pitch:62,bearing:camHdg(c),duration:1800});if(W<1000)sheetSet(40,true);return}
  if(k==="go"){FPON=true;ls("ojos-fp",true);spin=false;setButtons();var qd=fpQuad(c),km=hav(c.lat,c.lon,qd[0][1],qd[0][0]);target={lon:(c.lon+qd[0][0]+qd[1][0])/3,lat:(c.lat+qd[0][1]+qd[1][1])/3,z:clampZ(zoom*viewKm()/(km*3.2))};if(W<1000){sheetSet(46,true)}}
  else if(k==="off"){FPON=!FPON;ls("ojos-fp",FPON);b.textContent=FPON?"Hide on map":"Show on map"}
  else{c._hc=undefined;HDG[c.u]=(camHdg(c)+(k==="l"?-15:15)+360)%360;var ks=Object.keys(HDG);if(ks.length>400)delete HDG[ks[0]];ls("ojos-hdg",HDG);var hl=$("fphdg");if(hl)hl.textContent=Math.round(HDG[c.u])+"°"}});
function camRange(c){var n=(c.src||"")+" "+(c.n||"");if(/ALERTCalifornia/i.test(n))return[96,"UP TO 60 MI ON A CLEAR DAY"];if(c.t==="hazard")return[15,"EST. VIEW ~10 MI"];if(c.t==="ocean")return[5,"EST. VIEW ~3 MI (HORIZON)"];if(c.t==="nature"||c.t==="landmark")return[3,"EST. VIEW ~2 MI"];return[0.5,"EST. VIEW ~0.3 MI"]}
function drawRange(t,P){var c=selected;if(!c||!c.live)return;var rg=camRange(c),pts=[],k;for(k=0;k<=72;k++)pts.push(dest(c.lat,c.lon,k*5,rg[0]));
  ctx.beginPath();var pen=false,top=null;for(k=0;k<pts.length;k++){var q=P(pts[k][0],pts[k][1]);if(q[2]<=0){pen=false;continue}pen?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);pen=true;if(!top||q[1]<top[1])top=q}
  ctx.fillStyle="rgba(94,230,255,0.10)";ctx.fill();ctx.strokeStyle="rgba(94,230,255,0.95)";ctx.lineWidth=1.6;ctx.setLineDash([6,5]);ctx.lineDashOffset=-t*10;ctx.stroke();ctx.setLineDash([]);ctx.lineDashOffset=0;
  var o=P(c.lon,c.lat);if(o[2]>0&&top){var rp=Math.abs(o[1]-top[1]);if(rp>26){var sw=t*1.2%6.2832;ctx.save();ctx.beginPath();ctx.moveTo(o[0],o[1]);ctx.arc(o[0],o[1],rp,sw,sw+0.5);ctx.closePath();var gr=ctx.createRadialGradient(o[0],o[1],0,o[0],o[1],rp);gr.addColorStop(0,"rgba(94,230,255,0.35)");gr.addColorStop(1,"rgba(94,230,255,0)");ctx.fillStyle=gr;ctx.fill();ctx.restore();
      ctx.font="700 10px 'JetBrains Mono',monospace";var tw=ctx.measureText(rg[1]).width;ctx.fillStyle="rgba(3,16,24,0.85)";ctx.fillRect(top[0]-tw/2-5,top[1]-20,tw+10,15);ctx.fillStyle="#5ee6ff";ctx.fillText(rg[1],top[0]-tw/2,top[1]-9)}}}
function drawWeb(t,P){if(!WEB.length)return;var i,j,n=WEB.length;ctx.lineDashOffset=-t*18;
  for(i=0;i<n;i++)for(j=i+1;j<n;j++){if(n>5&&j!==i+1&&!(i===0&&j===n-1))continue;pline(P,gc([WEB[i].lon,WEB[i].lat],[WEB[j].lon,WEB[j].lat],18),"rgba(94,230,255,0.85)",[5,7],1.4)}
  ctx.lineDashOffset=0;
  for(i=0;i<n;i++){var q=P(WEB[i].lon,WEB[i].lat);if(q[2]<=0)continue;ctx.strokeStyle="#5ee6ff";ctx.lineWidth=2;ctx.shadowColor="#5ee6ff";ctx.shadowBlur=10;ctx.beginPath();for(var k=0;k<=6;k++){var a=k/6*6.2832+t*0.6,x=q[0]+Math.cos(a)*10,y=q[1]+Math.sin(a)*10;k?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();ctx.shadowBlur=0;
    ctx.font="700 10px 'JetBrains Mono',monospace";ctx.fillStyle="#5ee6ff";ctx.fillText((i<9?"0":"")+(i+1),q[0]+13,q[1]-9)}}
setInterval(function(){var c=$("webmap");if(!c||!WEB.length)return;var bw=c.parentNode.clientWidth,bh=c.parentNode.clientHeight;if(c.width!==bw*2||c.height!==bh*2){c.width=bw*2;c.height=bh*2}
  var g=c.getContext("2d"),t=performance.now()/1000,n=WEB.length,i,j;g.setTransform(2,0,0,2,0,0);g.clearRect(0,0,bw,bh);
  var x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;WEB.forEach(function(w){x0=Math.min(x0,w.lon);x1=Math.max(x1,w.lon);y0=Math.min(y0,w.lat);y1=Math.max(y1,w.lat)});var m=34,sx=(x1-x0)||1,sy=(y1-y0)||1;
  var pt=WEB.map(function(w){return[n===1?bw/2:m+(w.lon-x0)/sx*(bw-2*m),n===1?bh/2:bh-m-(w.lat-y0)/sy*(bh-2*m)]});
  g.strokeStyle="rgba(94,230,255,0.08)";g.lineWidth=1;for(i=0;i<bw;i+=24){g.beginPath();g.moveTo(i,0);g.lineTo(i,bh);g.stroke()}for(i=0;i<bh;i+=24){g.beginPath();g.moveTo(0,i);g.lineTo(bw,i);g.stroke()}
  for(i=0;i<n;i++)for(j=i+1;j<n;j++){g.strokeStyle="rgba(94,230,255,0.35)";g.beginPath();g.moveTo(pt[i][0],pt[i][1]);g.lineTo(pt[j][0],pt[j][1]);g.stroke();var f=(t*0.35+(i*7+j)*0.13)%1;g.fillStyle="#ffb040";g.beginPath();g.arc(pt[i][0]+(pt[j][0]-pt[i][0])*f,pt[i][1]+(pt[j][1]-pt[i][1])*f,2,0,7);g.fill()}
  for(i=0;i<n;i++){var r=7+Math.sin(t*3+i)*1.5;g.strokeStyle="#5ee6ff";g.lineWidth=2;g.beginPath();g.arc(pt[i][0],pt[i][1],r,0,7);g.stroke();g.fillStyle="#5ee6ff";g.beginPath();g.arc(pt[i][0],pt[i][1],2.5,0,7);g.fill();
    g.font="700 10px 'JetBrains Mono',monospace";g.fillText("CAM-"+(i<9?"0":"")+(i+1),Math.min(pt[i][0]+11,bw-52),pt[i][1]-9)}},60);
setInterval(function(){var d=new Date().toISOString().substr(11,8)+" UTC";Array.prototype.forEach.call(document.querySelectorAll(".tclock"),function(x){x.textContent=d})},1000);
var webSaved=ls("ojos-web")||[];setTimeout(function rs(){if(!webSaved.length||WEB.length)return;var got=webSaved.map(camByU).filter(function(c){return c&&c.live});if(got.length===webSaved.length||rs.n>8){WEB=got;if(WEB.length)updWeb()}else{rs.n=(rs.n||0)+1;setTimeout(rs,4000)}},4000);
$("webbar").style.display="none";

// --- Chase the Sun: tour live cameras where the sun is rising or setting right now
var sunT=null;
function chase(){var pool=LIVE.filter(function(c){var sc=sunCos(c.lon,c.lat);return sc>-0.1&&sc<0.14});if(!pool.length){note("Chase the Sun",EMBED_OK?"No loaded camera is at sunrise or sunset right now. Trying again shortly.":"Works in the installed app, where live cameras load.");return}
  var c=pool[Math.floor(Math.random()*pool.length)];select(c);var ts=$("camts");if(ts)ts.textContent=(sunCos(c.lon+1,c.lat)>sunCos(c.lon,c.lat)?"SUNSET":"SUNRISE")+" · LIVE"}
$("bSun").onclick=function(){if(sunT){clearInterval(sunT);sunT=null;this.classList.remove("on");return}this.classList.add("on");chase();sunT=setInterval(chase,14000)};
// --- Rewind: keep recent frames of cameras you watch and scrub back through them
var FRAMES={},FORDER=[],rwPlay=null;
function grab(im){var u=im.getAttribute("data-u");if(!u||!im.naturalWidth)return;var a=FRAMES[u]||(FRAMES[u]=[]);if(a.length&&Date.now()-a[a.length-1].t<8000)return;
  var w=Math.min(480,im.naturalWidth),h=Math.round(w*im.naturalHeight/im.naturalWidth),c2=document.createElement("canvas");c2.width=w;c2.height=h;try{c2.getContext("2d").drawImage(im,0,0,w,h)}catch(e){return}
  a.push({t:Date.now(),c:c2});if(a.length>30)a.shift();FORDER=FORDER.filter(function(x){return x!==u});FORDER.push(u);while(FORDER.length>6)delete FRAMES[FORDER.shift()];
  if(selected&&selected.u===u)rewindUI()}
document.addEventListener("load",function(e){var t=e.target;if(t&&t.tagName==="IMG"&&t.classList.contains("snap"))grab(t)},true);
function rewindUI(){var el=$("rewind");if(!el||!selected)return;var a=FRAMES[selected.u]||[];var sl=el.querySelector("input");if(rwPlay||(sl&&+sl.value<+sl.max))return;
  if(a.length<2){el.innerHTML='<div class="ls"><span>⏪ Rewind is recording — frames build while you watch.</span></div>';return}
  el.innerHTML='<h4 style="margin-top:10px">⏪ REWIND · '+a.length+' FRAMES</h4><input type="range" class="rws" min="0" max="'+a.length+'" value="'+a.length+'"><div class="leg mono"><span id="rwt" style="color:#ffd36b">● LIVE</span><button id="rwplay" class="rwb">▶ Time-lapse</button></div>'}
function rwShow(v){var a=selected&&FRAMES[selected.u]||[],box=document.querySelector("#detail .camview");if(!box)return;var ov=box.querySelector("canvas.rw");
  if(v>=a.length||!a[v]){if(ov)ov.remove();var l=$("rwt");if(l)l.textContent="● LIVE";return}
  if(!ov){ov=document.createElement("canvas");ov.className="rw";box.appendChild(ov)}ov.width=a[v].c.width;ov.height=a[v].c.height;ov.getContext("2d").drawImage(a[v].c,0,0);var l2=$("rwt");if(l2)l2.textContent="⏪ "+new Date(a[v].t).toLocaleTimeString()}
document.addEventListener("input",function(e){if(e.target.classList&&e.target.classList.contains("rws"))rwShow(+e.target.value)});
document.addEventListener("click",function(e){if(e.target.id!=="rwplay"||rwPlay)return;var sl=document.querySelector(".rws");if(!sl)return;var i=0,mx=+sl.max;rwPlay=setInterval(function(){sl.value=i;rwShow(i);if(i++>=mx){clearInterval(rwPlay);rwPlay=null;rewindUI()}},260)});
wstat();

function setTab(t,noOpen){var g=document.querySelector(".grid");if(!g)return;g.setAttribute("data-tab",t);if(!noOpen&&!document.body.classList.contains("sheet")){document.body.classList.add("sheet");setTimeout(resize,40)}
  Array.prototype.forEach.call(document.querySelectorAll(".mtabs button"),function(b){b.classList.toggle("on",b.getAttribute("data-tab")===t)});if(t==="cams")render();if(t==="events")feed()}
document.addEventListener("click",function(e){var b=e.target.closest(".mtabs button");if(!b)return;var t=b.getAttribute("data-tab"),g=document.querySelector(".grid");
  if(document.body.classList.contains("sheet")&&g.getAttribute("data-tab")===t){document.body.classList.remove("sheet");setTimeout(resize,40)}else setTab(t)});
setTab("info",window.innerWidth<1000);
// ---------- home page ----------
var sigN=0,sigT=0;document.addEventListener("click",function(e){if(e.target.closest("#sigfx")){$("sigfx").style.display="none";return}if(!e.target.closest(".brand"))return;var n=Date.now();sigN=n-sigT<700?sigN+1:1;sigT=n;if(sigN>=5){sigN=0;$("sigfx").style.display="flex"}});
function goDash(){var h=$("home");if(h.style.display==="none")return;h.classList.add("out");zoom=0.5;target={lon:rot.lon+25,lat:rot.lat,z:1};setTimeout(function(){h.style.display="none";h.classList.remove("out")},520)}
var RECENT=ls("ojos-recent")||[];
function rememberScan(q){q=String(q||"").trim();if(!q||/^-?\d/.test(q))return;RECENT=[q].concat(RECENT.filter(function(x){return x.toLowerCase()!==q.toLowerCase()})).slice(0,5);ls("ojos-recent",RECENT);homeChips()}
function homeChips(){var el=$("hrecent");if(!el)return;el.innerHTML=RECENT.length?'<span>RECENT</span>'+RECENT.map(function(r){return'<button data-rs="'+esc(r)+'">'+esc(r)+'</button>'}).join(""):""}
document.addEventListener("click",function(e){var b=e.target.closest("[data-rs]");if(b){goDash();$("addr").value=b.getAttribute("data-rs");scan(b.getAttribute("data-rs"))}});
homeChips();
$("hEnter").onclick=goDash;
$("hform").addEventListener("submit",function(e){e.preventDefault();var v=$("haddr").value.trim();goDash();if(v){$("addr").value=v;scan(v)}});
document.addEventListener("click",function(e){var b=e.target.closest("[data-h]");if(b){var k=b.getAttribute("data-h");goDash();
    if(k==="sun")$("bSun").click();else if(k==="wall")openWall();else if(k==="fav"){var fv=FAV.map(camByU).filter(function(c){return c&&c.live});if(fv.length){wall=fv.slice(0,9).map(function(c){return c.u});ls("godeye-wall",wall);updWallBtn();layout=fv.length<=1?1:fv.length<=2?2:fv.length<=4?4:fv.length<=6?6:9;openWall()}else note("Favorites","Open any camera and tap ☆ Save. Your saved cameras appear here.")}else if(k==="rand"){if(LIVE.length)select(LIVE[Math.floor(Math.random()*LIVE.length)]);else note("Random camera","Cameras are still loading. Try again in a moment.")}else if(k==="quake"){var q=QUAKES.slice().sort(function(x,y){return y.mag-x.mag})[0];if(q)select(q);else note("Earthquakes","No earthquake data loaded yet.")}}
  void 0});

// ---- live report (PDF): tests the feeds for real and packages the result for whoever maintains the app
var RESP={};
function shape(d){try{if(typeof d==="string")return"text "+d.length+" chars: "+d.slice(0,70).replace(/\s+/g," ");if(Array.isArray(d))return"array["+d.length+"]"+(d[0]&&typeof d[0]==="object"?" of {"+Object.keys(d[0]).slice(0,12).join(",")+"}":"");if(d&&typeof d==="object")return"{"+Object.keys(d).slice(0,12).map(function(k){var v=d[k];return k+(Array.isArray(v)?"["+v.length+"]"+(v[0]&&typeof v[0]==="object"?"{"+Object.keys(v[0]).slice(0,10).join(",")+"}":""):v&&typeof v==="object"?"{"+Object.keys(v).slice(0,6).join(",")+"}":"")}).join(", ")+"}";return String(d).slice(0,40)}catch(e){return"?"}}
(function(){var _ng=netGet;netGet=function(url,ms,h,text){var p=String(url).replace(/^https?:\/\//,"").split("?")[0].split("/"),host=p.slice(0,/osrm|nominatim|open-meteo|googleapis/.test(p[0])?1:4).join("/").slice(0,80);
  return _ng(url,ms,h,text).then(function(d){if(Object.keys(RESP).length<220||RESP[host])RESP[host]="OK   "+shape(d);return d},function(e){RESP[host]="FAIL "+String(e&&e.message||e).slice(0,70);throw e})}})();
function pdfMake(lines){var enc=function(s){return String(s).replace(/[—–]/g,"-").replace(/[·•]/g,"*").replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/→/g,"->").replace(/…/g,"...").replace(/[^\x20-\x7e]/g,"?").replace(/([\\()])/g,"\\$1")};
  var wrap=[];lines.forEach(function(l){l=String(l);if(!l.length){wrap.push("");return}for(var i=0;i<l.length;i+=112)wrap.push((i?"    ":"")+l.slice(i,i+112))});
  var per=74,pages=[];for(var i=0;i<wrap.length;i+=per)pages.push(wrap.slice(i,i+per));if(!pages.length)pages=[[""]];
  var objs=[],kids=[];objs[1]="<< /Type /Catalog /Pages 2 0 R >>";objs[3]="<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";
  pages.forEach(function(pg,pi){var c="BT /F1 8 Tf 10 TL 30 762 Td\n"+pg.map(function(l){return"("+enc(l)+") Tj T*"}).join("\n")+"\nET",cn=4+pi*2,pn=5+pi*2;objs[cn]="<< /Length "+c.length+" >>\nstream\n"+c+"\nendstream";objs[pn]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents "+cn+" 0 R >>";kids.push(pn+" 0 R")});
  objs[2]="<< /Type /Pages /Kids ["+kids.join(" ")+"] /Count "+pages.length+" >>";var out="%PDF-1.4\n",off=[];for(var n=1;n<objs.length;n++){off[n]=out.length;out+=n+" 0 obj\n"+objs[n]+"\nendobj\n"}var x=out.length;out+="xref\n0 "+objs.length+"\n0000000000 65535 f \n";for(n=1;n<objs.length;n++)out+=("0000000000"+off[n]).slice(-10)+" 00000 n \n";
  return out+"trailer\n<< /Size "+objs.length+" /Root 1 0 R >>\nstartxref\n"+x+"\n%%EOF"}
function probeCam(c){var t0=Date.now();return new Promise(function(res){var done=false,fin=function(ok,why){if(done)return;done=true;res({ok:ok,why:why,ms:Date.now()-t0})};setTimeout(function(){fin(false,"timeout 12s")},12000);loadPix(c.e+(isJ(c.e)?"":(c.e.indexOf("?")<0?"?":"&")+"_p="+Date.now())).then(function(im){fin(im&&im.naturalWidth>8,im&&im.naturalWidth>8?"":"empty image")}).catch(function(e){fin(false,String(e&&e.message||"failed"))})})}
var repBusy=false;
function liveReport(){if(repBusy)return;repBusy=true;var btn=$("repBtn"),say=function(t){var b=$("repBtn");if(b)b.textContent=t};
  var by={};LIVE.forEach(function(c){(by[c.src]||(by[c.src]=[])).push(c)});var jobs=[];Object.keys(by).forEach(function(src){var a=by[src],pickN=Math.min(3,a.length);for(var i=0;i<pickN;i++)jobs.push({src:src,c:a[Math.floor((i+0.5)*a.length/pickN)]})});
  var res={},done=0,ix=0;function next(){if(ix>=jobs.length)return Promise.resolve();var j=jobs[ix++];return probeCam(j.c).then(function(r){(res[j.src]||(res[j.src]=[])).push({r:r,c:j.c});done++;say("Testing cameras… "+done+" of "+jobs.length);return next()})}
  say(EMBED_OK&&jobs.length?"Testing cameras… 0 of "+jobs.length:"Building report…");
  (EMBED_OK?Promise.all([0,1,2,3,4,5].map(next)):Promise.resolve()).then(function(){var L=[],hr="------------------------------------------------------------------------------------------------";
    L.push("OJOS DE DIOS  -  LIVE REPORT  (v42)");L.push("Made "+new Date().toString());L.push("Diagnostic report: what worked on this device and what did not.");L.push(hr);
    diagText().split("\n").slice(1).forEach(function(x){L.push(x)});L.push("KEYS SAVED (names only): "+(Object.keys(KEYS).join(", ")||"none")+"   GPS: "+(navigator.geolocation?"available":"none")+"   DRIVE: "+(DRV.R?"route "+Math.round(DRV.R.len)+" m by "+DRV.R.src+", "+DRV.cams.length+" cams":"not used")+"   STREET VIEW JS API: "+(GM_BAD?"refused":window.google&&google.maps?"loaded":"not tried"));L.push(hr);
    L.push("CAMERA NETWORKS  (listed = cameras the network gave us; test = 3 real cameras opened just now)");L.push("");
    SOURCES.forEach(function(s){var st=LIVESTAT[s.name],lock=s.keyName&&!KEYS[s.keyName],t=res[s.name]||[],okN=t.filter(function(x){return x.r.ok}).length;
      L.push((lock?"NEEDS KEY ":!st?"NO REPLY  ":st.n?(t.length&&!okN?"LISTS-ONLY":"WORKING   "):"FAILED    ")+" "+s.name+(st&&st.n?"   listed "+st.n+(t.length?"   test "+okN+"/"+t.length+" images loaded":""):"")+(st&&!st.n?"   reason: "+(st.err||st.s||"?"):""));
      t.forEach(function(x){if(!x.r.ok)L.push("              x "+x.r.why+" ("+x.r.ms+" ms)  "+x.c.e.replace(/^https?:\/\//,"").split("?")[0].slice(0,84))})});
    L.push(hr);L.push("WHAT EACH SERVER SENT BACK  (the shape of the data, so the reader for it can be fixed)");L.push("");Object.keys(RESP).sort().forEach(function(k){L.push(k);L.push("    "+RESP[k])});
    L.push(hr);L.push("END OF REPORT");return L}).then(function(L){var pdf=pdfMake(L),name="ojos-report-"+new Date().toISOString().slice(0,16).replace(/[:T]/g,"-")+".pdf",P=null;try{P=window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform()&&Capacitor.Plugins}catch(e){}
    if(P&&P.Filesystem&&P.Share){return P.Filesystem.writeFile({path:name,data:btoa(pdf),directory:"CACHE"}).then(function(w){return P.Share.share({title:"Ojos de Dios live report",dialogTitle:"Save or send the report",files:[w.uri]})}).catch(function(e){if(!/cancel/i.test(String(e&&e.message)))copyText(L.join("\n"))})}
    try{var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([pdf],{type:"application/pdf"}));a.download=name;document.body.appendChild(a);a.click();a.remove();note("Report","Saved "+name+" to your downloads.")}catch(e){copyText(L.join("\n"))}})
   .catch(function(e){note("Report","Couldn't build the report: "+esc(String(e&&e.message||e)))}).then(function(){repBusy=false;say("⤓ Download live report (PDF)")})}
document.addEventListener("click",function(e){if(e.target.closest("#repBtn"))liveReport()});

// ---- full-screen zoom viewer: pinch to zoom, drag to move, double-tap to zoom, tap ✕ to close
var ZV={s:1,x:0,y:0,p:{},d0:0,s0:1,t:0,timer:0};
function zvApply(){var im=$("zvimg");if(im)im.style.transform="translate("+ZV.x+"px,"+ZV.y+"px) scale("+ZV.s+")"}
function zvOpen(src,name){var z=$("zoomv");if(!z)return;$("zvname").textContent=name||"";var im=$("zvimg");im._nt=null;im.setAttribute("data-src",src);im.src=/^data:/.test(src)?src:src+(isJ(src)?"":(src.indexOf("?")<0?"?":"&")+"_t="+Date.now());ZV.s=1;ZV.x=0;ZV.y=0;zvApply();z.style.display="flex";
  clearInterval(ZV.timer);ZV.timer=setInterval(function(){if(z.style.display!=="flex"){clearInterval(ZV.timer);return}snapRefresh(im)},isJ(src)?2500:6000)}
document.addEventListener("click",function(e){if(e.target.closest("#zvclose")){$("zoomv").style.display="none";clearInterval(ZV.timer);return}var im=e.target.closest("#detail .camview img.snap");if(im&&im.naturalWidth>8){var c=selected;zvOpen(im.getAttribute("data-src")||im.src,c&&c.n||"")}});
(function(){var z=$("zvstage");if(!z)return;z.addEventListener("pointerdown",function(e){z.setPointerCapture(e.pointerId);ZV.p[e.pointerId]=[e.clientX,e.clientY];var k=Object.keys(ZV.p);if(k.length===2){var a=ZV.p[k[0]],b=ZV.p[k[1]];ZV.d0=Math.hypot(a[0]-b[0],a[1]-b[1]);ZV.s0=ZV.s}
    var n=Date.now();if(k.length===1&&n-ZV.t<300){ZV.s=ZV.s>1.2?1:3;if(ZV.s===1){ZV.x=0;ZV.y=0}zvApply()}ZV.t=n});
  z.addEventListener("pointermove",function(e){var pr=ZV.p[e.pointerId];if(!pr)return;var k=Object.keys(ZV.p);ZV.p[e.pointerId]=[e.clientX,e.clientY];if(k.length===2){var a=ZV.p[k[0]],b=ZV.p[k[1]],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(ZV.d0)ZV.s=Math.max(1,Math.min(8,ZV.s0*d/ZV.d0))}else{ZV.x+=e.clientX-pr[0];ZV.y+=e.clientY-pr[1]}zvApply()});
  var up=function(e){delete ZV.p[e.pointerId];if(ZV.s<=1.01){ZV.x=0;ZV.y=0;zvApply()}};z.addEventListener("pointerup",up);z.addEventListener("pointercancel",up)})();
// ---- details sheet you can drag: pull the bar up or down, tap ▾ to tuck it away
var SHH=Math.max(22,Math.min(84,+(ls("ojos-sheet")||50)));
function sheetSet(v,save){SHH=Math.max(22,Math.min(84,v));document.body.style.setProperty("--sh",SHH+"vh");if(save){ls("ojos-sheet",SHH);setTimeout(resize,30)}}
sheetSet(SHH,false);
(function(){var bar=$("sheetbar"),d=null,moved=false;if(!bar)return;bar.addEventListener("pointerdown",function(e){if(e.target.closest("button"))return;d={y:e.clientY,h:SHH};moved=false;bar.setPointerCapture(e.pointerId)});
  bar.addEventListener("pointermove",function(e){if(!d)return;var dv=(d.y-e.clientY)/window.innerHeight*100;if(Math.abs(dv)>1)moved=true;sheetSet(d.h+dv,false)});
  var up=function(e){if(!d)return;var raw=d.h+(d.y-e.clientY)/window.innerHeight*100;d=null;if(moved&&raw<16){document.body.classList.remove("sheet");sheetSet(50,true);return}sheetSet(SHH,true)};bar.addEventListener("pointerup",up);bar.addEventListener("pointercancel",up)})();
document.addEventListener("click",function(e){var b=e.target.closest("[data-sh]");if(!b)return;var k=b.getAttribute("data-sh");if(k==="hide"){document.body.classList.remove("sheet");setTimeout(resize,40)}else if(k==="size"){sheetSet(SHH>66?50:SHH>40?84:50,true)}else if(k==="open"){document.body.classList.add("sheet");setTimeout(resize,40)}});
setInterval(function(){var pk=$("peek");if(!pk)return;var open=document.body.classList.contains("sheet"),nm=selected&&selected.n?selected.n:DRV.R?"Drive: "+DRV.R.b.name:"";pk.style.display=!open&&nm&&W<1000?"flex":"none";if(nm)$("peekt").textContent=nm},600);
if(ls("ojos-clean")===true)document.body.classList.add("clean");
if(ls("ojos-view")==="3d"&&EMBED_OK)setTimeout(t3Open,1200);
if(ls("ojos-view")==="real"&&EMBED_OK&&KEYS.gmaps)setTimeout(t4Open,1200);
if(WL.dots){spin=false;var bd0=$("bDots");if(bd0)bd0.classList.add("on")}
setButtons();render();aiSet(AI_ON);

})();
