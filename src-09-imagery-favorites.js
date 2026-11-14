// ================= satellite imagery globe (Esri World Imagery) =================
var IMG_SRC=["https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/","https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/"],SRC_I=0,clarFail=0;
var LBL_SRC="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/";
var ROAD_SRC="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/";
var ST=false; // static view: dark muted imagery, bright roads and labels, every camera as its own marker, almost no interface
var TILES={},TN=0,tileDirty=false,gl=null,glP=null,glU={},texBase=null,texPatch=null,texRad=null,texRadP=null,baseCv=null,baseN=0,baseUp=0,patchA=null,patchP=null,lastView="",lastMoveT=0,glTried=false,glShown=false;
function tile(kind,z,x,y){var k=kind+z+"/"+x+"/"+y,t=TILES[k];if(t){t.at=performance.now();return t}
  t=TILES[k]={img:new Image(),ok:false,bad:false,at:performance.now()};TN++;t.img.crossOrigin="anonymous";
  t.img.onload=function(){t.ok=true;tileDirty=true};
  t.img.onerror=function(){if(kind==="i"&&!t.retry){t.retry=1;if(++clarFail>2)SRC_I=1;t.img.src=IMG_SRC[1]+z+"/"+y+"/"+x}else{t.bad=true;tileDirty=true}};
  t.img.src=(kind==="i"?IMG_SRC[SRC_I]:kind==="r"?ROAD_SRC:LBL_SRC)+z+"/"+y+"/"+x;
  if(TN>420){var ks=Object.keys(TILES).filter(function(q){return q.indexOf("i3/")!==0}).sort(function(a,b){return TILES[a].at-TILES[b].at}).slice(0,140);ks.forEach(function(q){TILES[q].img.onload=TILES[q].img.onerror=null;TILES[q].img.src="";delete TILES[q];TN--})}
  return t}
function mX(lon){return(lon+180)/360}
function mY(lat){var r=Math.max(-85.05,Math.min(85.05,lat))*D;return 0.5-Math.log(Math.tan(Math.PI/4+r/2))/(2*Math.PI)}
function iLon(x){return x*360-180}
function iLat(y){return Math.atan(Math.sinh(Math.PI*(1-2*y)))/D}
function glInit(){glTried=true;var c=$("gl");if(!c)return;try{gl=c.getContext("webgl",{alpha:true,antialias:false})||c.getContext("experimental-webgl")}catch(e){gl=null}if(!gl)return;
  var hp=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT);hp=hp&&hp.precision>0?"highp":"mediump";
  var vs="attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}",
  fs="precision "+hp+" float;uniform vec2 uC;uniform float uR;uniform vec2 uRot;uniform sampler2D uBase;uniform sampler2D uPatch;uniform vec4 uPB;uniform float uHasP;uniform vec3 uSun;uniform sampler2D uRad;uniform sampler2D uRadP;uniform vec4 uRB;uniform float uRadOn;uniform float uDim;const float PI=3.14159265;"+
   "void main(){vec2 p=(gl_FragCoord.xy-uC)/uR;float d=dot(p,p);if(d>1.0){discard;}float z=sqrt(1.0-d);float s0=sin(uRot.y),c0=cos(uRot.y);float sphi=clamp(p.y*c0+z*s0,-1.0,1.0);float phi=asin(sphi);float lam=uRot.x+atan(p.x,z*c0-p.y*s0);"+
   "float mx=fract(lam/(2.0*PI)+0.5);float cl=clamp(phi,-1.4835,1.4835);float my=0.5-log(tan(PI/4.0+cl/2.0))/(2.0*PI);vec3 col=texture2D(uBase,vec2(mx,my)).rgb;if(uDim>0.5){float g=dot(col,vec3(0.3,0.59,0.11));col=mix(vec3(g),col,0.3)*vec3(0.5,0.6,0.76)+vec3(0.014,0.024,0.042);}"+
   "if(uHasP>0.5){vec2 uv=(vec2(mx,my)-uPB.xy)/(uPB.zw-uPB.xy);if(uv.x>0.0&&uv.x<1.0&&uv.y>0.0&&uv.y<1.0){col=texture2D(uPatch,uv).rgb;}}"+
   "float sh=1.0;if(uSun.z>0.5){float ca=sphi*sin(uSun.y)+cos(phi)*cos(uSun.y)*cos(lam-uSun.x);sh=mix(0.34,1.0,smoothstep(-0.15,0.12,ca));}"+
   "col*=sh*(0.6+0.4*z);if(uRadOn>0.5){vec4 r=texture2D(uRad,vec2(mx,my));if(uRadOn>1.5){vec2 u2=(vec2(mx,my)-uRB.xy)/(uRB.zw-uRB.xy);if(u2.x>0.0&&u2.x<1.0&&u2.y>0.0&&u2.y<1.0){vec4 r2=texture2D(uRadP,u2);if(r2.a>0.03){r=r2;}}}col=mix(col,r.rgb,clamp(r.a,0.0,1.0)*0.82);}gl_FragColor=vec4(col,1.0);}";
  function sh(ty,src){var o=gl.createShader(ty);gl.shaderSource(o,src);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o}
  try{glP=gl.createProgram();gl.attachShader(glP,sh(gl.VERTEX_SHADER,vs));gl.attachShader(glP,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(glP);if(!gl.getProgramParameter(glP,gl.LINK_STATUS))throw new Error("link");
    gl.useProgram(glP);var bf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,bf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);var al=gl.getAttribLocation(glP,"a");gl.enableVertexAttribArray(al);gl.vertexAttribPointer(al,2,gl.FLOAT,false,0,0);
    ["uC","uR","uRot","uBase","uPatch","uPB","uHasP","uSun","uRad","uRadP","uRB","uRadOn","uDim"].forEach(function(n){glU[n]=gl.getUniformLocation(glP,n)});
    function mk(){var tx=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tx);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([8,24,40,255]));return tx}
    texBase=mk();texPatch=mk();texRad=mk();texRadP=mk();var mxs=Math.min(2048,gl.getParameter(gl.MAX_TEXTURE_SIZE));baseCv=document.createElement("canvas");baseCv.width=baseCv.height=mxs;var bg=baseCv.getContext("2d");bg.fillStyle="#08182a";bg.fillRect(0,0,mxs,mxs);
  }catch(e){gl=null}}
function satOK(){return!!(gl&&WL&&WL.img&&EMBED_OK&&baseN>=40)}
function satClear(){if(gl&&glShown){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);glShown=false}var at=$("attr");if(at)at.style.display="none"}
function baseTick(){if(!gl||!baseCv)return;var g=baseCv.getContext("2d"),cs=baseCv.width/8,ch=false;for(var y=0;y<8;y++)for(var x=0;x<8;x++){var t=tile("i",3,x,y);if(t.ok&&!t.inBase){try{g.drawImage(t.img,x*cs,y*cs,cs,cs);t.inBase=1;baseN++;ch=true}catch(e){t.inBase=1}}}
  if(ch)baseTick.dirty=true;if(baseTick.dirty&&performance.now()-baseUp>350){baseUp=performance.now();baseTick.dirty=false;try{gl.bindTexture(gl.TEXTURE_2D,texBase);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,baseCv)}catch(e){WL.img=false}}}
function tileZ(R){return Math.max(3,Math.min(19,Math.round(Math.log(2*Math.PI*R*Math.min(DPR,2)*Math.max(0.25,Math.cos(rot.lat*D))/256)/Math.LN2)))}
function planPatch(R){var zt=tileZ(R);if(zt<4)return null;var z=Math.min(zt,10),hyp=0.5*Math.sqrt(W*W+H*H),a=Math.asin(Math.min(1,hyp/R))/D;if(a>75)return null;
  var lN=Math.min(85,rot.lat+a),lS=Math.max(-85,rot.lat-a),dl=a/Math.max(0.15,Math.cos(rot.lat*D)),lW=rot.lon-dl,lE=rot.lon+dl;if(lW<-180||lE>180)return null;
  for(;;){var n=Math.pow(2,z),x0=Math.floor(mX(lW)*n),x1=Math.min(n-1,Math.floor(mX(lE)*n)),y0=Math.floor(mY(lN)*n),y1=Math.min(n-1,Math.floor(mY(lS)*n)),nx=x1-x0+1,ny=y1-y0+1;if((nx>8||ny>8)&&z>4){z--;continue}if(nx>8||ny>8)return null;
    return{z:z,x0:x0,y0:y0,nx:nx,ny:ny,key:z+":"+x0+":"+y0+":"+nx+":"+ny,done:{},ready:false,up:0}}}
function stDim(g,x,y,w,h){g.save();g.globalCompositeOperation="saturation";g.fillStyle="#000";g.globalAlpha=0.72;g.fillRect(x,y,w,h);g.globalCompositeOperation="source-over";g.globalAlpha=0.6;g.fillStyle="#040b16";g.fillRect(x,y,w,h);g.restore()}
function patchTick(p){if(!p)return false;if(!p.cv){p.cv=document.createElement("canvas");p.cv.width=p.nx*256;p.cv.height=p.ny*256}var g=p.cv.getContext("2d"),all=true,ch=false;
  for(var j=0;j<p.ny;j++)for(var i=0;i<p.nx;i++){var ti=tile("i",p.z,p.x0+i,p.y0+j),tl=WL.labels||ST?tile("l",p.z,p.x0+i,p.y0+j):null,tr=ST&&p.z>=5?tile("r",p.z,p.x0+i,p.y0+j):null,st=(ti.ok?1:0)+(tl&&tl.ok?2:0)+(tr&&tr.ok?4:0)+(ST?8:0),k=i+"_"+j;if(!ti.ok&&!ti.bad)all=false;
    if(p.done[k]!==st&&ti.ok){try{g.drawImage(ti.img,i*256,j*256,256,256);if(ST)stDim(g,i*256,j*256,256,256);if(tr&&tr.ok)g.drawImage(tr.img,i*256,j*256,256,256);if(tl&&tl.ok)g.drawImage(tl.img,i*256,j*256,256,256)}catch(e){}p.done[k]=st;ch=true}}
  if(all)p.ready=true;if(ch)p.dirty=true;return ch}
function upPatch(p){try{gl.bindTexture(gl.TEXTURE_2D,texPatch);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,p.cv);p.dirty=false;p.up=performance.now()}catch(e){}}
function satDraw(R,cx,cy){
  if(!WL||!WL.img||!EMBED_OK){satClear();return false}
  if(!glTried)glInit();if(!gl){return false}
  baseTick();if(baseN<40){satClear();return false}
  var now=performance.now(),vk=rot.lon.toFixed(4)+","+rot.lat.toFixed(4)+","+R.toFixed(0);if(vk!==lastView){lastView=vk;lastMoveT=now}
  if(now-lastMoveT>260){var pl=planPatch(R);if(!pl){patchP=null}else if((!patchA||patchA.key!==pl.key)&&(!patchP||patchP.key!==pl.key))patchP=pl}
  if(patchP){patchTick(patchP);if(patchP.ready){patchA=patchP;patchP=null;upPatch(patchA)}}
  if(patchA){patchTick(patchA);if(patchA.dirty&&now-patchA.up>600)upPatch(patchA)}
  var zt=tileZ(R),useP=patchA&&patchA.ready&&zt>=4;
  gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(glP);
  gl.uniform2f(glU.uC,cx*DPR,(H-cy)*DPR);gl.uniform1f(glU.uR,R*DPR);gl.uniform2f(glU.uRot,rot.lon*D,rot.lat*D);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texBase);gl.uniform1i(glU.uBase,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,texPatch);gl.uniform1i(glU.uPatch,1);
  if(useP){var n=Math.pow(2,patchA.z);gl.uniform4f(glU.uPB,patchA.x0/n,patchA.y0/n,(patchA.x0+patchA.nx)/n,(patchA.y0+patchA.ny)/n)}
  gl.uniform1f(glU.uHasP,useP?1:0);gl.uniform1f(glU.uDim,ST?1:0);gl.uniform3f(glU.uSun,SUN.lon*D,SUN.lat*D,WL.night&&zt<9&&!ST?1:0);radGL(useP?patchA:null,now);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);glShown=true;
  // close range: draw sharp tiles directly (down to street level)
  if(zt>=11){var z=zt,dLa=(H/2)/R/D,dLo=(W/2)/R/D/Math.max(0.15,Math.cos(rot.lat*D)),cyo=(cy-H/2)/R/D;
    for(;;){var nn=Math.pow(2,z),x0=Math.floor(mX(rot.lon-dLo)*nn),x1=Math.floor(mX(rot.lon+dLo)*nn),y0=Math.floor(mY(rot.lat+dLa+cyo)*nn),y1=Math.floor(mY(rot.lat-dLa+cyo)*nn);if((x1-x0+1)*(y1-y0+1)>48&&z>11){z--;continue}break}
    for(var ty=y0;ty<=y1;ty++)for(var tx=x0;tx<=x1;tx++){if(tx<0||ty<0||tx>=nn||ty>=nn)continue;var ti=tile("i",z,tx,ty);if(!ti.ok)continue;var A=proj(iLon(tx/nn),iLat(ty/nn)),B=proj(iLon((tx+1)/nn),iLat((ty+1)/nn));
      try{ctx.drawImage(ti.img,A[0],A[1],B[0]-A[0]+0.7,B[1]-A[1]+0.7);if(ST){stDim(ctx,A[0],A[1],B[0]-A[0]+0.7,B[1]-A[1]+0.7);var trd=tile("r",z,tx,ty);if(trd.ok)ctx.drawImage(trd.img,A[0],A[1],B[0]-A[0]+0.7,B[1]-A[1]+0.7)}if(WL.labels||ST){var tl=tile("l",z,tx,ty);if(tl.ok)ctx.drawImage(tl.img,A[0],A[1],B[0]-A[0]+0.7,B[1]-A[1]+0.7)}}catch(e){}}}
  var at=$("attr");if(at)at.style.display="block";
  return true}
// ---------- Street View (Google Maps Embed, needs the user's own key) ----------
document.addEventListener("click",function(e){if(e.target.closest("#svclose")){$("svfull").style.display="none";$("svframe").innerHTML="";SV.pano=null;SV.tok++;svHud(null);var L=SV.link;if(L&&L.d>3&&mode==="3d"){spin=false;setButtons();target={lon:(L.a.lon+L.b.lon)/2,lat:(L.a.lat+L.b.lat)/2,z:clampZ(Math.min(60000,0.3*6371/(L.d/1000)))}}}});
document.addEventListener("click",function(e){var b=e.target.closest("[data-sv]");if(!b)return;var v=b.getAttribute("data-sv");if(v==="here")streetView(rot.lat,rot.lon);else{var q=v.split(",");streetView(+q[0],+q[1])}});

// ---------- favorites, weather, day/night, event feed ----------
var FAV=ls("ojos-fav")||[];
function dayTag(c){var sc=sunCos(c.lon,c.lat);return sc>0.14?"☀ DAY":sc<-0.1?"☾ NIGHT":"◐ TWILIGHT"}
var WXC={},WXN={0:"Clear",1:"Mostly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Fog",51:"Drizzle",53:"Drizzle",55:"Drizzle",61:"Rain",63:"Rain",65:"Heavy rain",66:"Freezing rain",67:"Freezing rain",71:"Snow",73:"Snow",75:"Heavy snow",77:"Snow",80:"Showers",81:"Showers",82:"Heavy showers",85:"Snow showers",86:"Snow showers",95:"Thunderstorm",96:"Thunderstorm",99:"Thunderstorm"};
function wxShow(d){var el=$("wx");if(!el||!d)return;var lt=new Date(Date.now()+d.off*1000).toISOString().substr(11,5);el.innerHTML='<span>'+Math.round(d.t)+'°F</span><span>'+esc(WXN[d.code]||"—")+'</span><span>WIND '+Math.round(d.w)+' MPH</span><span>LOCAL '+lt+'</span>'}
function wx(lat,lon){if(!EMBED_OK)return;var k=lat.toFixed(1)+","+lon.toFixed(1),c=WXC[k];if(c&&Date.now()-c.at<15*60000){wxShow(c);return}
  getJSON("https://api.open-meteo.com/v1/forecast?latitude="+lat.toFixed(3)+"&longitude="+lon.toFixed(3)+"&current=temperature_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto",12000).then(function(j){var cu=j&&j.current;if(!cu)return;var d={t:cu.temperature_2m,w:cu.wind_speed_10m,code:cu.weather_code,off:j.utc_offset_seconds||0,at:Date.now()};WXC[k]=d;wxShow(d)}).catch(function(){})}
function ago(ms){var m=Math.max(0,(Date.now()-ms)/60000);return m<60?Math.round(m)+"m ago":m<1440?Math.round(m/60)+"h ago":Math.round(m/1440)+"d ago"}
var FEED=[];
function feed(){var el=$("feed");if(!el)return;FEED=QUAKES.slice().sort(function(a,b){return b.time-a.time}).slice(0,40).concat(EVENTS.slice().sort(function(a,b){return new Date(b.date||0)-new Date(a.date||0)}).slice(0,40));
  var big=QUAKES.slice().sort(function(a,b){return b.mag-a.mag})[0];
  el.innerHTML=alHTML()+'<h4>EVENT FEED</h4>'+(big?'<div class="fbig" data-ev="'+FEED.indexOf(big)+'"><b class="mono">STRONGEST · 24H</b><span>'+esc(big.n)+'</span></div>':'')+(FEED.length?FEED.map(function(e,i){var q=e.kind==="quake",c=q?"#ff5533":(EVCOL[e.cat]||"#4cc3ff");return'<div class="row" data-ev="'+i+'"><i style="background:'+c+'"></i><div><b>'+esc(e.n)+'</b><span>'+(q?"Earthquake · "+ago(e.time)+" · depth "+Math.round(e.depth)+" km":esc(e.catName||"Natural event")+(e.date?" · "+ago(+new Date(e.date)):""))+'</span></div></div>'}).join(""):'<p class="note2">'+(EMBED_OK?"Loading earthquakes, fires and storms…":"The event feed loads in the installed app.")+'</p>')}
document.addEventListener("click",function(e){var r=e.target.closest("[data-ev]");if(r&&FEED[+r.getAttribute("data-ev")])select(FEED[+r.getAttribute("data-ev")])});

