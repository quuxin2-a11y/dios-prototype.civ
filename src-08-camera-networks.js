// ---------- live camera networks (individual cameras) ----------
var PORTAL={"Caltrans QuickMap":"Caltrans (California)","Fintraffic":"Fintraffic (Finland)","OneMotoring (LTA)":"LTA (Singapore)"};
// In the standalone Android app, requests go through the phone's native networking (no browser cross-site blocking)
function nativeHttp(){try{var c=window.Capacitor;return c&&c.isNativePlatform&&c.isNativePlatform()&&c.Plugins&&c.Plugins.CapacitorHttp||null}catch(e){return null}}
function webGet(url,ms,headers,text){var ac=window.AbortController?new AbortController():null;var tm=setTimeout(function(){ac&&ac.abort()},ms||20000);
  return fetch(url,{signal:ac&&ac.signal,mode:"cors",credentials:"omit",headers:headers||undefined}).then(function(r){clearTimeout(tm);if(!r.ok)throw new Error("HTTP "+r.status);return text?r.text():r.json()})}
function netGet(url,ms,headers,text){var n=nativeHttp();if(!n)return webGet(url,ms,headers,text);
  return n.get({url:url,headers:headers||{},responseType:"text",connectTimeout:ms||20000,readTimeout:ms||20000}).then(function(r){if(!r||r.status>=400)throw new Error("HTTP "+(r&&r.status));var d=r.data;
    if(text)return typeof d==="string"?d:JSON.stringify(d);return typeof d==="string"?JSON.parse(d):d}).catch(function(){return webGet(url,ms,headers,text)})}
function getJSON(url,ms,headers){return netGet(url,ms,headers,false)}
function num(v){v=parseFloat(v);return isFinite(v)?v:null}
function addLive(src,arr){var n=0;arr.forEach(function(c){if(c&&c.lat!=null&&c.lon!=null&&c.e&&/^https:/i.test(c.e)&&Math.abs(c.lat)<=90&&Math.abs(c.lon)<=180){c.live=true;c.src=src;c.u=c.u||c.e;LIVE.push(c);n++}});LIVESTAT[src]={n:(LIVESTAT[src]&&LIVESTAT[src].n||0)+n,s:"ok"};render();if($("wall").style.display==="flex"&&!$("wgrid").querySelector(".tile"))drawWall()}
function fail(src,e){if(!LIVESTAT[src]||!LIVESTAT[src].n)LIVESTAT[src]={n:0,s:"unavailable",err:String(e&&e.message||e||"no response").slice(0,70)};liveStatus()}
var KEYS=ls("godeye-keys")||{};
function pick(o,re){for(var k in o){if(re.test(k)&&o[k]!=null&&o[k]!=="")return o[k]}return null}
// generic: find camera-like records anywhere in a JSON tree
function generic(j,def){var out=[],seen=0;
  (function walk(o,depth){if(!o||depth>6||seen>20000)return;seen++;
    if(Array.isArray(o)){o.forEach(function(x){walk(x,depth+1)});return}
    if(typeof o!=="object")return;
    var props=o.properties||o.attributes||o,geo=o.geometry;
    var lat=num(pick(props,/^(lat|latitude|y_lat|camera_lat)$/i)),lon=num(pick(props,/^(lon|lng|long|longitude|x_lon|camera_lon)$/i));
    if((lat==null||lon==null)&&geo){if(Array.isArray(geo.coordinates)){lon=num(geo.coordinates[0]);lat=num(geo.coordinates[1])}else if(geo.x!=null){lon=num(geo.x);lat=num(geo.y)}}
    if((lat==null||lon==null)&&props.location&&typeof props.location==="object"){lat=num(pick(props.location,/^lat/i));lon=num(pick(props.location,/^(lon|lng)/i))}
    var img=null,vid=null;
    (function urls(x,d){if(!x||d>3)return;for(var k in x){var v=x[k];if(typeof v==="string"&&/^https:\/\//i.test(v)){if(!vid&&/\.(m3u8|mp4)(\?|$)/i.test(v))vid=v;else if(!img&&(/\.(jpe?g|png|gif|webp)(\?|$)/i.test(v)||/(image|snapshot|cctv|camera|cam|webcam).*$/i.test(k)&&!/\.(html?|aspx?|php)(\?|$)/i.test(v)))img=v}else if(v&&typeof v==="object")urls(v,d+1)}})(props,0);
    if(lat!=null&&lon!=null&&img){var nm=pick(props,/^(name|title|commonname|description|locationname|location|site|roadwayname|label)$/i);
      out.push({n:(typeof nm==="string"?nm:def.n||"Camera").replace(/\s+/g," ").trim().slice(0,90),c:def.c,r:def.r||def.c,t:"traffic",lat:lat,lon:lon,e:img,v:vid});return}
    for(var k in o){var v=o[k];if(v&&typeof v==="object")walk(v,depth+1)}
  })(j,0);return out}
function cars(base,country,region,key){return{name:region+" 511",optKey:key,load:function(){var self=this.name,k=key&&KEYS[key];
  var parse=function(arr){var out=[];if(!Array.isArray(arr))return out;arr.forEach(function(x){var lat=num(x.Latitude),lon=num(x.Longitude);
    var views=(x.Views&&x.Views.length?x.Views:[x]);views.forEach(function(v){if(v.Status&&!/enabled/i.test(v.Status))return;var u=v.Url||x.Url;if(!u)return;u=u.replace(/^http:/,"https:");
      var vu=v.VideoUrl||x.VideoUrl;out.push({n:(x.Name||x.Location||x.RoadwayName||x.Roadway||"Camera")+(views.length>1&&v.Description&&v.Description!=="N/A"?" — "+v.Description:""),c:country,r:(x.CityName||x.RoadwayName||x.Roadway||region),t:"traffic",lat:lat,lon:lon,e:u,v:vu&&/^https:.*m3u8/i.test(vu)?vu:null})})});return out};
  // the site's own map feed, used when the developer API wants a key we don't have
  var icons=function(){return getJSON(base+"/map/mapIcons/Cameras",30000).then(function(j){var a=j&&(j.item2||j.Item2)||[],out=[];a.forEach(function(x){var loc=x.location||x.Location,id=x.itemId!=null?x.itemId:x.ItemId;if(!loc||id==null)return;out.push({n:(x.title||x.Title||region+" camera "+id),c:country,r:region,t:"traffic",lat:num(loc[0]),lon:num(loc[1]),e:base+"/map/Cctv/"+encodeURIComponent(id)})});if(!out.length)throw new Error("no cameras in reply");return out})};
  getJSON(base+"/api/v2/get/cameras?format=json"+(k?"&key="+encodeURIComponent(k):""),30000).then(function(arr){var o=parse(arr);if(!o.length)throw new Error("empty");return o}).catch(function(){return icons()}).then(function(o){addLive(self,o)}).catch(function(e){fail(self,e)})}}}
// Castle Rock "CARS" state systems share one camera feed format
function crk(code,region){return{name:region+" DOT",load:function(){var self=this.name;getJSON("https://"+code+"tg.carsprogram.org/cameras_v1/api/cameras",30000).then(function(a){var out=[];(Array.isArray(a)?a:[]).forEach(function(x){if(x.public===false)return;var L=x.location||{},la=num(L.latitude),lo=num(L.longitude),vs=x.views||[];
  vs.forEach(function(v,i){var url=v.url||"",u=v.videoPreviewUrl||(/\.(jpe?g|png|gif)(\?|$)/i.test(url)||/STILL/i.test(v.type||"")?url:null),vid=/\.m3u8/i.test(url)?url:null;if(!u||!/^https:/i.test(u))return;out.push({n:(x.name||region+" camera")+(vs.length>1?" — view "+(i+1):""),c:"United States",r:String(L.cityReference||L.routeId||region),t:"traffic",lat:la,lon:lo,e:u,v:vid})})});
  if(!out.length)throw new Error("no cameras in reply");addLive(self,out)}).catch(function(e){fail(self,e)})}}}
function keyed(name,key,urlFn,headFn,parser){return{name:name,keyName:key,load:function(){var self=this.name;if(!KEYS[key])return;getJSON(urlFn(KEYS[key]),30000,headFn?headFn(KEYS[key]):null).then(function(j){var o=parser(j);if(!o.length)throw new Error("no cameras in reply");addLive(self,o)}).catch(function(e){fail(self,e)})}}}
function simple(name,url,def,parser){return{name:name,load:function(){var self=this.name;getJSON(url).then(function(j){addLive(self,parser?parser(j):generic(j,def))}).catch(function(e){fail(self,e)})}}}
function xmlSource(name,url,def,map){return{name:name,load:function(){var self=this.name;getText(url).then(function(t){var doc=new DOMParser().parseFromString(t,"text/xml");addLive(self,map(doc))}).catch(function(e){fail(self,e)})}}}
function tx(el,tag){var n=el.getElementsByTagName(tag)[0];return n?n.textContent.trim():""}
var SOURCES=[
 {name:"Caltrans (California)",load:function(){var self=this.name,done=0,got=0;
   for(var d=1;d<=12;d++)(function(d){var dd=d<10?"0"+d:""+d;
     getJSON("https://cwwp2.dot.ca.gov/data/d"+d+"/cctv/cctvStatusD"+dd+".json").then(function(j){var out=[];(j.data||[]).forEach(function(x){var c=x.cctv||x;if(!c||String(c.inService)==="false")return;var L=c.location||{},im=c.imageData||{},st=im.static||{};
       var img=st.currentImageURL;if(!img||/not reported/i.test(img))return;var v=im.streamingVideoURL;if(!v||/not reported/i.test(v)||!/^https:.*m3u8/i.test(v))v=null;
       out.push({n:(L.locationName||"Caltrans camera").replace(/\s+/g," ").trim(),c:"United States",r:(L.nearbyPlace||L.county||"California")+", CA",t:"traffic",lat:num(L.latitude),lon:num(L.longitude),e:img,v:v})});got+=out.length;addLive(self,out)}).catch(function(){}).then(function(){if(++done===12&&!got)fail(self)})})(d)}},
 {name:"NYC DOT",load:function(){var self=this.name;getJSON("https://webcams.nyctmc.org/api/cameras").then(function(j){var arr=Array.isArray(j)?j:(j.cameras||j.data||[]);
   addLive(self,arr.filter(function(x){return x&&x.isOnline!==false&&String(x.isOnline)!=="false"}).map(function(x){var id=x.id||x.Id;return{n:x.name||x.Name||"NYC DOT camera",c:"United States",r:(x.area||x.borough||"New York City"),t:"traffic",lat:num(x.latitude||x.Latitude),lon:num(x.longitude||x.Longitude),e:x.imageUrl||x.ImageUrl||(id?"https://webcams.nyctmc.org/api/cameras/"+id+"/image":null)}}))}).catch(function(e){fail(self,e)})}},
 crk("ia","Iowa"),
 cars("https://511on.ca","Canada","Ontario"),
 cars("https://511.alberta.ca","Canada","Alberta"),
 simple("DriveBC (British Columbia)","https://www.drivebc.ca/api/webcams/",{c:"Canada",r:"British Columbia"},function(j){var arr=Array.isArray(j)?j:(j.webcams||j.results||j.data||[]);var out=[];
   arr.forEach(function(x){var id=x.id||x.cam_id;var g=generic(x,{c:"Canada",r:(x.region_name||"British Columbia")})[0];var lat=g?g.lat:num((x.location&&x.location.coordinates||[])[1]),lon=g?g.lon:num((x.location&&x.location.coordinates||[])[0]);
     if(lat==null||id==null)return;out.push({n:x.name||x.caption||("DriveBC camera "+id),c:"Canada",r:x.region_name||x.highway_display||"British Columbia",t:"traffic",lat:lat,lon:lon,e:(g&&g.e)||("https://images.drivebc.ca/bchighwaycam/pub/cameras/"+id+".jpg")})});return out}),
 {name:"TfL JamCams (London)",load:function(){var self=this.name;getJSON("https://api.tfl.gov.uk/Place/Type/JamCam").then(function(arr){addLive(self,(arr||[]).map(function(x){var ap={};(x.additionalProperties||[]).forEach(function(p){ap[p.key]=p.value});if(ap.available==="false")return null;
   return{n:x.commonName||"London JamCam",c:"United Kingdom",r:"London",t:"traffic",lat:num(x.lat),lon:num(x.lon),e:ap.imageUrl,v:ap.videoUrl&&/^https:/.test(ap.videoUrl)?ap.videoUrl:null}}).filter(Boolean))}).catch(function(e){fail(self,e)})}},
 simple("Lancashire (UK)","https://gis.lancashire.gov.uk/arcgis/rest/services/Hosted/Traffic_Webcams/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json",{c:"United Kingdom",r:"Lancashire"}),
 {name:"Fintraffic (Finland)",load:function(){var self=this.name;getJSON("https://tie.digitraffic.fi/api/weathercam/v1/stations").then(function(j){var out=[];(j.features||[]).forEach(function(f){var p=f.properties||{},g=(f.geometry||{}).coordinates||[];if(p.state&&p.state!=="OK"&&p.state!=="GATHERING")return;if(p.collectionStatus&&p.collectionStatus!=="GATHERING")return;
     var pr=(p.presets||[]).filter(function(x){return x.inCollection!==false})[0];if(!pr)return;out.push({n:(p.name||"Weather camera").replace(/_/g," "),c:"Finland",r:"Finland",t:"traffic",lat:num(g[1]),lon:num(g[0]),e:"https://weathercam.digitraffic.fi/"+pr.id+".jpg"})});addLive(self,out)}).catch(function(e){fail(self,e)})}},
 xmlSource("Hong Kong Transport Dept","https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.xml",{},function(doc){var out=[];Array.prototype.forEach.call(doc.getElementsByTagName("image"),function(el){var key=tx(el,"key"),lat=num(tx(el,"latitude")),lon=num(tx(el,"longitude"));var url=tx(el,"url")||("https://tdcctv.data.one.gov.hk/"+key+".JPG");
   if(lat!=null&&lon!=null&&key)out.push({n:tx(el,"description")||key,c:"Hong Kong",r:tx(el,"district")||tx(el,"region")||"Hong Kong",t:"traffic",lat:lat,lon:lon,e:url.replace(/^http:/,"https:")})});return out}),
 {name:"LTA (Singapore)",load:function(){var self=this.name;getJSON("https://api.data.gov.sg/v1/transport/traffic-images").then(function(j){var it=(j.items||[])[0]||{};
   addLive(self,(it.cameras||[]).map(function(x){var l=x.location||{};return{n:"Singapore camera "+x.camera_id,c:"Singapore",r:"Singapore",t:"traffic",lat:num(l.latitude),lon:num(l.longitude),e:x.image}}))}).catch(function(e){fail(self,e)})}},
 simple("QLDTraffic (Queensland)","https://api.qldtraffic.qld.gov.au/v1/webcams?apikey=3e83add325cbb69ac4d8e5bf433d770b",{c:"Australia",r:"Queensland"}),
 // ---- nature, parks, volcanoes, ocean: direct images that play in the app ----
 {name:"Parks & volcanoes (NPS · USGS)",load:function(){var Y="https://www.nps.gov/webcams-yell/",H="https://volcanoes.usgs.gov/observatories/hvo/cams/";
   addLive(this.name,[
    {n:"Old Faithful Geyser",c:"United States",r:"Yellowstone, WY",t:"nature",lat:44.4605,lon:-110.8281,e:Y+"oldfaithvc.jpg"},
    {n:"Mount Washburn — northeast",c:"United States",r:"Yellowstone, WY",t:"nature",lat:44.7976,lon:-110.4344,e:Y+"mtwashburn.jpg"},
    {n:"Mount Washburn — south",c:"United States",r:"Yellowstone, WY",t:"nature",lat:44.7960,lon:-110.4360,e:Y+"washburn2.jpg"},
    {n:"Mammoth Hot Springs Terraces",c:"United States",r:"Yellowstone, WY",t:"nature",lat:44.9766,lon:-110.7005,e:Y+"terrace.jpg"},
    {n:"Kīlauea summit — west rim (KW)",c:"United States",r:"Hawaiʻi",t:"hazard",lat:19.4200,lon:-155.2920,e:H+"KWcam/images/M.jpg"},
    {n:"Kīlauea summit — Uēkahuna (K2)",c:"United States",r:"Hawaiʻi",t:"hazard",lat:19.4236,lon:-155.2880,e:H+"K2cam/images/M.jpg"},
    {n:"Kīlauea caldera — south rim (B1)",c:"United States",r:"Hawaiʻi",t:"hazard",lat:19.4020,lon:-155.2800,e:H+"B1cam/images/M.jpg"},
    {n:"Kīlauea caldera — south rim (S4)",c:"United States",r:"Hawaiʻi",t:"hazard",lat:19.4005,lon:-155.2830,e:H+"S4cam/images/M.jpg"},
    {n:"Halemaʻumaʻu vents (V2)",c:"United States",r:"Hawaiʻi",t:"hazard",lat:19.4085,lon:-155.2760,e:H+"V2cam/images/M.jpg"},
    {n:"Mauna Loa summit caldera (MO)",c:"United States",r:"Hawaiʻi",t:"hazard",lat:19.4720,lon:-155.5920,e:H+"MOcam/images/M.jpg"}])}},
 {name:"NOAA BuoyCAMs (open ocean)",load:function(){var self=this.name;getJSON("https://www.ndbc.noaa.gov/buoycams.php").then(function(j){var arr=Array.isArray(j)?j:(j.data||j.stations||[]);
   addLive(self,arr.map(function(x){var id=x.id||x.station||x.stn;if(!id||("img" in x&&!x.img))return null;return{n:"Buoy "+id+(x.name?" — "+String(x.name).replace(/\s+/g," ").slice(0,60):""),c:"Global Ocean",r:"NOAA buoy",t:"ocean",lat:num(pick(x,/^lat/i)),lon:num(pick(x,/^(lng|lon)/i)),e:"https://www.ndbc.noaa.gov/buoycam.php?station="+encodeURIComponent(id)}}).filter(Boolean))}).catch(function(e){fail(self,e)})}},
 {name:"ALERTCalifornia wildfire cams",load:function(){var self=this.name,B="https://cameras.alertcalifornia.org/public-camera-data/";getJSON(B+"all_cameras-v3.json",30000).then(function(j){var out=[];(j.features||[]).forEach(function(f){var pr=f.properties||{},g=(f.geometry||{}).coordinates||[];if(!pr.id||g[0]==null)return;
   out.push({n:pr.name||pr.id,c:"United States",r:(pr.county||"California")+", CA",t:"hazard",lat:num(g[1]),lon:num(g[0]),e:B+encodeURIComponent(pr.id)+"/latest-frame.jpg"})});addLive(self,out)}).catch(function(e){fail(self,e)})}},
 // ---- sources that need a free key (paste in ⚙ Sources) ----
 {name:"Transport for NSW",keyName:"nsw",load:function(){var self=this.name;if(!KEYS.nsw)return;getJSON("https://api.transport.nsw.gov.au/v1/live/cameras",20000,{Authorization:"apikey "+KEYS.nsw}).then(function(j){addLive(self,generic(j,{c:"Australia",r:"New South Wales"}))}).catch(function(e){fail(self,e)})}},
 cars("https://511ny.org","United States","New York","ny511"),
 cars("https://511ga.org","United States","Georgia","ga511"),
 cars("https://511la.org","United States","Louisiana","la511"),
 cars("https://511wi.gov","United States","Wisconsin","wi511"),
 cars("https://az511.com","United States","Arizona","az511"),
 cars("https://nvroads.com","United States","Nevada"),cars("https://511.alaska.gov","United States","Alaska"),cars("https://511.idaho.gov","United States","Idaho"),cars("https://www.udottraffic.utah.gov","United States","Utah"),
 cars("https://fl511.com","United States","Florida"),cars("https://ctroads.org","United States","Connecticut"),cars("https://newengland511.org","United States","Maine · New Hampshire · Vermont"),cars("https://www.511sc.org","United States","South Carolina"),cars("https://www.511pa.com","United States","Pennsylvania"),
 cars("https://hotline.gov.sk.ca","Canada","Saskatchewan"),cars("https://www.manitoba511.ca","Canada","Manitoba"),cars("https://511.gnb.ca","Canada","New Brunswick"),cars("https://511.novascotia.ca","Canada","Nova Scotia"),cars("https://511.gov.pe.ca","Canada","Prince Edward Island"),cars("https://511nl.ca","Canada","Newfoundland & Labrador"),
 crk("mn","Minnesota"),crk("ne","Nebraska"),crk("in","Indiana"),crk("ks","Kansas"),crk("co","Colorado"),crk("ma","Massachusetts"),crk("sd","South Dakota"),
 simple("Kentucky DOT","https://services2.arcgis.com/CcI36Pduqd0OR4W9/arcgis/rest/services/trafficCamerasCur_Prd/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson",{c:"United States",r:"Kentucky",n:"Kentucky camera"}),
 simple("Illinois DOT","https://services2.arcgis.com/aIrBD8yn1TDTEXoz/arcgis/rest/services/TrafficCamerasTM_Public/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson",{c:"United States",r:"Illinois",n:"Illinois camera"}),
 simple("Arkansas DOT","https://layers.idrivearkansas.com/cameras.geojson",{c:"United States",r:"Arkansas",n:"Arkansas camera"}),
 simple("Alabama DOT","https://api.algotraffic.com/v3.0/Cameras",{c:"United States",r:"Alabama",n:"Alabama camera"}),
 simple("North Carolina DOT","https://eapps.ncdot.gov/services/traffic-prod/v1/cameras",{c:"United States",r:"North Carolina",n:"North Carolina camera"}),
 {name:"New Zealand (NZTA)",load:function(){var self=this.name;getJSON("https://trafficnz.info/service/traffic/rest/4/cameras/all",30000,{Accept:"application/json"}).then(function(j){var out=[];(function walk(o,d){if(!o||d>5)return;if(Array.isArray(o)){o.forEach(function(x){walk(x,d+1)});return}if(typeof o!=="object")return;var la=num(o.lat),lo=num(o.lon),im=o.imageUrl;if(la!=null&&lo!=null&&im){if(String(o.offline)!=="true")out.push({n:o.name||"NZ camera",c:"New Zealand",r:o.region&&o.region.name||"New Zealand",t:"traffic",lat:la,lon:lo,e:/^https:/.test(im)?im:"https://www.trafficnz.info"+im});return}for(var k in o)walk(o[k],d+1)})(j,0);if(!out.length)throw new Error("no cameras in reply");addLive(self,out)}).catch(function(e){fail(self,e)})}},
 keyed("Washington State DOT","wsdot",function(k){return"https://wsdot.wa.gov/Traffic/api/HighwayCameras/HighwayCamerasREST.svc/GetCamerasAsJson?AccessCode="+encodeURIComponent(k)},null,function(j){return(Array.isArray(j)?j:[]).filter(function(x){return x.IsActive!==false&&x.ImageURL&&x.CameraLocation}).map(function(x){return{n:x.Title||x.CameraLocation.Description||"WSDOT camera",c:"United States",r:(x.CameraLocation.RoadName||"Washington")+", WA",t:"traffic",lat:num(x.CameraLocation.Latitude),lon:num(x.CameraLocation.Longitude),e:String(x.ImageURL).replace(/^http:/,"https:")}})}),
 keyed("Oregon DOT (TripCheck)","ordot",function(){return"https://api.odot.state.or.us/tripcheck/Cctv/Inventory"},function(k){return{"Ocp-Apim-Subscription-Key":k}},function(j){var a=j&&(j.CCTVInventoryRequest||j.cctvInventoryRequest)||[];return a.map(function(x){return{n:x["device-name"]||x["cctv-other"]||"Oregon camera",c:"United States",r:(x["route-id"]||"Oregon")+", OR",t:"traffic",lat:num(x.latitude),lon:num(x.longitude),e:String(x["cctv-url"]||"").replace(/^http:/,"https:")}})}),
 keyed("Ohio DOT (OHGO)","ohgo",function(k){return"https://publicapi.ohgo.com/api/v1/cameras?page-all=true&api-key="+encodeURIComponent(k)},null,function(j){var out=[];(j&&j.results||[]).forEach(function(x){(x.cameraViews||[]).forEach(function(v){var u=v.largeUrl||v.smallUrl;if(u)out.push({n:(x.location||x.description||"Ohio camera")+(v.direction?" — "+v.direction:""),c:"United States",r:"Ohio",t:"traffic",lat:num(x.latitude),lon:num(x.longitude),e:u})})});return out}),
 cars("https://511yukon.ca","Canada","Yukon","yk511"),
 {name:"TxDOT (Texas, incl. toll roads)",load:function(){var self=this.name,okN=0,done=0,lastE=null,DS=Object.keys(TXD);DS.forEach(function(d,i){setTimeout(function(){getJSON("https://its.txdot.gov/its/DistrictIts/GetCctvStatusListByDistrict?districtCode="+d,35000).then(function(j){var a=txParse(j,d);if(a.length){okN++;addLive(self,a);txMerge(false)}else lastE=new Error("no cameras found in reply ("+d+")")}).catch(function(e){lastE=e}).then(function(){if(++done===DS.length){TXV.itsDone=true;txMerge(true);if(!okN)fail(self,lastE||new Error("no reply"))}})},i*200)})}},
 {name:"Spain (DGT)",load:function(){var self=this.name;getText("https://infocar.dgt.es/datex2/dgt/CCTVSiteTablePublication/all/content.xml",60000).then(function(x){var out=[],parts=x.split(/<[^<>\/]*cctvCameraMetadataRecord[\s>]/i),i;
   for(i=1;i<parts.length;i++){var p=parts[i],la=/<[^<>\/]*latitude>\s*(-?[\d.]+)/i.exec(p),lo=/<[^<>\/]*longitude>\s*(-?[\d.]+)/i.exec(p),u=/<[^<>\/]*urlLinkAddress>\s*([^<\s]+)/i.exec(p);if(!la||!lo||!u)continue;var id=(/camaras\/(\d+)\.jpg/i.exec(u[1])||/GUID_CAM_(\d+)/.exec(p)||[])[1]||i,rd=/<[^<>\/]*roadNumber>\s*([^<]+)/i.exec(p)||/<[^<>\/]*cctvCameraIdentification>\s*([^<]+)/i.exec(p);
     out.push({n:(rd?rd[1].trim()+" · ":"")+"DGT cámara "+id,c:"Spain",r:"Spain",t:"traffic",lat:+la[1],lon:+lo[1],e:u[1].replace(/^http:/,"https:"),u:"dgt:"+id})}
   if(!out.length)throw new Error("no cameras in reply");addLive(self,out)}).catch(function(e){fail(self,e)})}},
 {name:"Taiwan Freeway Bureau",load:function(){var self=this.name;getText("https://tisvcloud.freeway.gov.tw/history/motc20/CCTV.xml",60000).then(function(x){var out=[],re=/<CCTV>([\s\S]*?)<\/CCTV>/g,m,g=function(p,t){var q=new RegExp("<"+t+">\\s*([^<]*)").exec(p);return q?q[1].trim():""};
   while((m=re.exec(x))){var p=m[1],u=g(p,"VideoStreamURL").replace(/&amp;/g,"&").replace(/^http:/,"https:"),la=+g(p,"PositionLat"),lo=+g(p,"PositionLon");if(!/^https:\/\/[a-z0-9.-]*freeway\.gov\.tw\//i.test(u)||!la||!lo)continue;var rn=g(p,"RoadName"),mi=g(p,"LocationMile"),a=g(p,"Start"),b=g(p,"End");
     out.push({n:(rn||"Freeway")+(mi?" "+mi:"")+(a&&b?" ("+a+" → "+b+")":""),c:"Taiwan",r:"Taiwan",t:"traffic",lat:la,lon:lo,e:u,mj:true,u:"twfb:"+(g(p,"CCTVID")||out.length)})}
   if(!out.length)throw new Error("no cameras in reply");addLive(self,out)}).catch(function(e){fail(self,e)})}},
 {name:"US DOT cameras (OpenTrafficCamMap list)",load:function(){var self=this.name;setTimeout(function(){getJSON("https://raw.githubusercontent.com/AidanWelch/OpenTrafficCamMap/master/cameras/USA.json",60000).then(function(j){var G={},i,key=function(la,lo){return Math.round(la*1500)+"_"+Math.round(lo*1500)};for(i=0;i<LIVE.length;i++)G[key(LIVE[i].lat,LIVE[i].lon)]=1;var out=[];
   (function walk(o,d,st){if(!o||d>6)return;if(Array.isArray(o)){for(var q=0;q<o.length;q++)walk(o[q],d+1,st);return}if(typeof o!=="object")return;var la=num(o.latitude),lo=num(o.longitude),u=o.url;
     if(la!=null&&lo!=null&&typeof u==="string"){u=u.replace(/^http:/,"https:");if(!/^https:/.test(u))return;var a=Math.round(la*1500),b=Math.round(lo*1500),hit=false;for(var x=-1;x<=1&&!hit;x++)for(var y=-1;y<=1;y++)if(G[(a+x)+"_"+(b+y)]){hit=true;break}if(hit)return;G[a+"_"+b]=1;
       var vid=/M3U8/i.test(o.format||"")||/\.m3u8/i.test(u);out.push({n:String(o.description||o.location||"Traffic camera").replace(/\s+/g," ").trim()+(o.direction?" ("+o.direction+")":""),c:"United States",r:st||"United States",t:"traffic",lat:la,lon:lo,e:u,v:vid?u:null});return}
     for(var k in o)walk(o[k],d+1,d===0?k:st)})(j,0,"");if(!out.length)throw new Error("no new cameras in list");addLive(self,out)}).catch(function(e){fail(self,e)})},22000)}},
 {name:"TxDOT live video (DriveTexas)",load:function(){var self=this.name;mlQuery({sqlselect:["name","description","XY"],start:0,table:"appgeo/cameraPoint",take:10000,where:[]}).then(function(rows){var L=[];rows.forEach(function(r){var m=/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)/.exec(String(r.XY||""));if(!m||!r.name)return;var lo=+m[1],la=+m[2];if(la<25||la>37||lo<-107.5||lo>-93)return;L.push({name:String(r.name),desc:String(r.description||"").replace(/\s+/g," ").trim(),lat:la,lon:lo})});if(!L.length)throw new Error("no cameras in reply");TXV.list=L;txMerge(TXV.itsDone);setTimeout(function(){txMerge(true)},25000)}).catch(function(e){fail(self,e)})}},
 {name:"Windy Webcams (worldwide)",keyName:"windy",nearby:true,load:function(){windyNear();setTimeout(windySweep,8000)}}
];
// ---- Windy: the whole worldwide catalogue (~65,000), swept once in the background by map tiles and kept on the phone for a week
function idb(){return new Promise(function(res,rej){try{var r=indexedDB.open("ojos",1);r.onupgradeneeded=function(){r.result.createObjectStore("kv")};r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)}}catch(e){rej(e)}})}
function idbGet(k){return idb().then(function(db){return new Promise(function(res,rej){var q=db.transaction("kv").objectStore("kv").get(k);q.onsuccess=function(){res(q.result)};q.onerror=function(){rej(q.error)}})})}
function idbSet(k,v){return idb().then(function(db){return new Promise(function(res,rej){var tx=db.transaction("kv","readwrite");tx.objectStore("kv").put(v,k);tx.oncomplete=function(){res()};tx.onerror=function(){rej(tx.error)}})}).catch(function(){})}
var WSW={on:false,q:[],rows:[],seen:{},req:0,done:false,err:""},WN="Windy Webcams (worldwide)";
function windyRow(w){var L=w.location||{},im=w.images&&w.images.current||{},pl=w.player||{},img=(im.preview||im.thumbnail||im.icon||"").replace(/^http:/,"https:");if(!img||L.latitude==null)return null;return[w.webcamId,w.title||"Webcam",num(L.latitude),num(L.longitude),L.country||"",L.city||L.region||"",img,(pl.live||pl.day||"").replace(/^http:/,"https:")]}
function windyAdd(rows){var out=[];rows.forEach(function(r){if(!r||WSW.seen[r[0]])return;WSW.seen[r[0]]=1;WSW.rows.push(r);out.push({n:r[1],c:r[4],r:r[5],t:"landmark",lat:r[2],lon:r[3],e:r[6],u:"windy:"+r[0],wid:r[0],player:r[7]||null})});if(out.length)addLive(WN,out)}
function windySweep(){if(WSW.on||WSW.done||!KEYS.windy||!EMBED_OK)return;WSW.on=true;
  idbGet("windy").then(function(sv){if(sv&&sv.t&&Date.now()-sv.t<7*864e5&&sv.rows&&sv.rows.length>2000){windyAdd(sv.rows);WSW.done=true;WSW.on=false;return}
    for(var la=-90;la<90;la+=45)for(var lo=-180;lo<180;lo+=45)WSW.q.push([la+45,lo+45,la,lo,0]);windyStep()}).catch(function(){for(var la=-90;la<90;la+=45)for(var lo=-180;lo<180;lo+=45)WSW.q.push([la+45,lo+45,la,lo,0]);windyStep()})}
function windyStep(){if(!WSW.on)return;var t=WSW.q.shift();if(!t){WSW.on=false;WSW.done=true;idbSet("windy",{t:Date.now(),rows:WSW.rows});liveStatus();return}if(document.hidden){WSW.q.unshift(t);setTimeout(windyStep,4000);return}
  WSW.req++;getJSON("https://api.windy.com/webcams/api/v3/webcams?limit=50&offset="+t[4]+"&include=location,images,player&bbox="+t[0]+","+t[1]+","+t[2]+","+t[3],25000,{"x-windy-api-key":KEYS.windy}).then(function(j){var tot=j&&j.total||0,ws=j&&j.webcams||[];
      if(t[4]===0&&tot>1000&&t[0]-t[2]>0.05){var ml=(t[0]+t[2])/2,mo=(t[1]+t[3])/2;WSW.q.unshift([t[0],t[1],ml,mo,0],[t[0],mo,ml,t[3],0],[ml,t[1],t[2],mo,0],[ml,mo,t[2],t[3],0])}
      else{windyAdd(ws.map(windyRow));if(ws.length===50&&t[4]+50<Math.min(tot,1000))WSW.q.unshift([t[0],t[1],t[2],t[3],t[4]+50])}
      if(WSW.req%60===0){idbSet("windy",{t:Date.now()-6*864e5,rows:WSW.rows});liveStatus()}setTimeout(windyStep,650)})
    .catch(function(e){WSW.err=String(e&&e.message||e).slice(0,50);if(/401|403/.test(WSW.err)){WSW.on=false;fail(WN,e);return}if(/429/.test(WSW.err)){WSW.q.unshift(t);setTimeout(windyStep,30000);return}setTimeout(windyStep,1500)})}
// free Windy picture links expire after a few minutes: fetch a fresh one when a picture fails
function windyFresh(im,u){var id=u.slice(6);return getJSON("https://api.windy.com/webcams/api/v3/webcams/"+encodeURIComponent(id)+"?include=images,player",15000,{"x-windy-api-key":KEYS.windy}).then(function(w){var r=windyRow({webcamId:id,title:"",location:{latitude:0,longitude:0},images:w.images,player:w.player});if(!r)throw 0;var c=camByU(u);if(c){c.e=r[6];if(r[7])c.player=r[7]}im.setAttribute("data-src",r[6]);im.src=r[6]})}
var windyBusy=false,windyLast="";
function windyNear(){if(!KEYS.windy||windyBusy)return;var self="Windy Webcams (worldwide)",cx=pin?pin.lon:rot.lon,cy=pin?pin.lat:rot.lat,k=cx.toFixed(0)+","+cy.toFixed(0);if(k===windyLast)return;windyLast=k;windyBusy=true;
  getJSON("https://api.windy.com/webcams/api/v3/webcams?limit=50&offset=0&include=location,images,player&nearby="+cy.toFixed(3)+","+cx.toFixed(3)+",250",20000,{"x-windy-api-key":KEYS.windy})
   .then(function(j){var have={};LIVE.forEach(function(c){if(c.src===self)have[c.wid]=c});var out=[];
     (j.webcams||[]).forEach(function(w){var L=w.location||{},im=(w.images||{}).current||{},pl=w.player||{};var img=im.preview||im.thumbnail;if(!img)return;
       if(have[w.webcamId]){have[w.webcamId].e=img;return}
       out.push({n:w.title||"Webcam",c:L.country||"",r:L.city||L.region||"",t:"landmark",lat:num(L.latitude),lon:num(L.longitude),e:img,u:"windy:"+w.webcamId,wid:w.webcamId,player:(pl.live||pl.day||"").replace(/^http:/,"https:")||null})});
     addLive(self,out)}).catch(function(e){fail(self,e)}).then(function(){windyBusy=false})}
setInterval(function(){if(EMBED_OK&&KEYS.windy)windyNear()},15000);
function liveStatus(){var el=$("livenets");if(!el)return;
  if(!EMBED_OK){el.innerHTML='<div class="ls"><span>Live networks load only in the installed app / GitHub link.</span></div>';return}
  var ok=[],bad=0,badL=[],wait=0,locked=0,dn=deadN();SOURCES.forEach(function(s){var st=LIVESTAT[s.name];if(s.keyName&&!KEYS[s.keyName]){locked++;return}if(!st)wait++;else if(st.n)ok.push([s.name,st.n]);else{bad++;badL.push(s.name)}});
  ok.sort(function(a,b){return b[1]-a[1]});
  el.innerHTML=ok.map(function(o){return'<div class="ls"><span>'+esc(o[0])+'</span><span class="mono" style="color:#ffd36b">'+o[1].toLocaleString()+'</span></div>'}).join("")+
   (wait?'<div class="ls"><span>Connecting to '+wait+' more…</span></div>':'')+(bad?'<div class="ls"><span style="color:#ff8a8a">'+bad+' network'+(bad>1?"s":"")+' did not answer</span><span class="mono" style="color:#8b97a4">see report</span></div>':'')+
   (dn?'<div class="ls"><span>'+dn+' offline camera'+(dn>1?"s":"")+' hidden</span><span><button class="mini" data-dead="show">'+(SHOWDEAD?"Hide":"Show")+'</button> <button class="mini" data-dead="clear">Recheck</button></span></div>':'')+
   '<button class="srcbtn" id="repBtn">'+(repBusy?"Working…":"⤓ Download live report (PDF)")+'</button><button class="srcbtn" id="diagBtn">⧉ Copy short status</button>'+
   '<button class="srcbtn" id="srcBtn">⚙ Sources &amp; keys'+(locked?' · '+locked+' more available':'')+'</button>'}
document.addEventListener("click",function(e){if(e.target.closest("#srcBtn"))openKeys()});
function openKeys(){var rows=[["gmaps","Google Maps — Street View inside the app","console.cloud.google.com (Maps Embed API)"],["windy","Windy Webcams — ~65,000 webcams worldwide","https://api.windy.com/keys"],["ais","AISStream — ships worldwide (free key)","aisstream.io"],["wsdot","Washington State DOT","wsdot.wa.gov/traffic/api"],["ordot","Oregon DOT (TripCheck)","apiportal.odot.state.or.us"],["ohgo","Ohio DOT (OHGO)","publicapi.ohgo.com"],["nsw","Transport for NSW (Sydney & NSW)","opendata.transport.nsw.gov.au"],["ny511","511NY (New York State)","511ny.org/developers"],["ga511","511GA (Georgia)","511ga.org/developers"],["la511","511LA (Louisiana)","511la.org/developers"],["wi511","511WI (Wisconsin)","511wi.gov/developers"],["az511","AZ511 (Arizona)","az511.gov/developers"],["yk511","511 Yukon","511yukon.ca/developers"]];
  $("keysBody").innerHTML='<p style="font-size:12px;color:#9fb2c6;margin:6px 0 10px">Paste a key to unlock its source. Keys are hidden once saved, stay on this device only, and are never shown again.</p>'+rows.map(function(r){var st=LIVESTAT[SOURCES.filter(function(s){return(s.keyName||s.optKey)===r[0]}).map(function(s){return s.name})[0]];
   return'<label>'+esc(r[1])+(st&&st.n?' <span style="color:#39ff6a">· '+st.n+' cams</span>':'')+'</label><div class="krow"><input type="password" data-k="'+r[0]+'" value="" placeholder="'+(KEYS[r[0]]?"Saved ••••"+esc(String(KEYS[r[0]]).slice(-4))+" · type a new key to replace":"Key from "+esc(r[2]))+'" autocomplete="new-password" autocapitalize="off" spellcheck="false">'+(KEYS[r[0]]?'<button type="button" data-rm="'+r[0]+'">Remove</button>':'')+'</div>'}).join("");
  $("keysDlg").showModal?$("keysDlg").showModal():$("keysDlg").setAttribute("open","")}
document.addEventListener("click",function(e){
  if(e.target.id==="keysSave"){Array.prototype.forEach.call(document.querySelectorAll("#keysBody input"),function(i){var v=i.value.trim();if(v)KEYS[i.dataset.k]=v});ls("godeye-keys",KEYS);
    var dl=$("keysDlg");dl.close?dl.close():dl.removeAttribute("open");SOURCES.forEach(function(s){var kn=s.keyName||s.optKey;if(kn&&KEYS[kn]&&!(LIVESTAT[s.name]&&LIVESTAT[s.name].n)){delete LIVESTAT[s.name];windyLast="";try{s.load()}catch(e){}}});liveStatus();if(WL.ship){if(AIS.ws){try{AIS.ws.close()}catch(e){}}else aisConnect()}}
  var rm=e.target.closest&&e.target.closest("[data-rm]");if(rm){delete KEYS[rm.getAttribute("data-rm")];ls("godeye-keys",KEYS);openKeys();return}
  if(e.target.id==="keysCancel"){var dl2=$("keysDlg");dl2.close?dl2.close():dl2.removeAttribute("open")}});
if(EMBED_OK)SOURCES.forEach(function(s){if(s.keyName&&!KEYS[s.keyName])return;try{s.load()}catch(e){fail(s.name,e)}});

