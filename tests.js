// Unit tests for the app's pure logic. Run with:  node tests.js
// They pull the real functions out of the src-*.js files, so they test the code that ships.
var fs=require("fs"),path=require("path"),assert=require("assert");
var src=fs.readdirSync(__dirname).filter(function(f){return /^src-\d+.*\.js$/.test(f)}).sort().map(function(f){return fs.readFileSync(path.join(__dirname,f),"utf8")}).join("");
function grab(name){var i=src.indexOf("function "+name+"(");if(i<0)throw new Error("function not found: "+name);var j=src.indexOf("{",i),d=0;for(;j<src.length;j++){var c=src[j];if(c==="{")d++;else if(c==="}"){d--;if(d===0)break}}return src.slice(i,j+1)}
var code="var VEH={car:1,truck:1,bus:1},TRK={};"+["iou","nms","trackUpd","twinH","insEar","insIn","insFmt"].map(grab).join("\n")+"\nreturn{iou:iou,nms:nms,trackUpd:trackUpd,twinH:twinH,insEar:insEar,insIn:insIn,insFmt:insFmt};";
var F=new Function(code)(),n=0;
function test(name,fn){fn();n++;console.log("ok  "+name)}
function near(a,b,e){assert.ok(Math.abs(a-b)<(e||1e-6),a+" vs "+b)}

test("iou: identical boxes overlap fully, distant boxes not at all",function(){near(F.iou([0,0,10,10],[0,0,10,10]).u,1,1e-3);assert.strictEqual(F.iou([0,0,10,10],[50,50,10,10]).u,0)});
test("nms: two passes seeing the same car become one, stronger detection",function(){var r=F.nms([{class:"car",score:0.5,bbox:[10,10,40,20]},{class:"car",score:0.45,bbox:[11,10,40,20]}]);assert.strictEqual(r.length,1);assert.ok(r[0].score>0.5)});
test("nms: a single weak hit is dropped, a single strong hit is kept",function(){assert.strictEqual(F.nms([{class:"car",score:0.2,bbox:[0,0,10,10]}]).length,0);assert.strictEqual(F.nms([{class:"car",score:0.9,bbox:[0,0,10,10]}]).length,1)});
test("tracker: a moving car keeps one id across frames",function(){var a=F.trackUpd("t1",[{class:"car",score:0.8,bbox:[100,100,40,20]}],640,360);var b=F.trackUpd("t1",[{class:"car",score:0.8,bbox:[130,104,40,20]}],640,360);var c=F.trackUpd("t1",[{class:"car",score:0.8,bbox:[165,108,40,20]}],640,360);assert.strictEqual(b.length,1);assert.strictEqual(c.length,1);assert.strictEqual(b[0].id,c[0].id);assert.strictEqual(c[0].moved,true)});
test("tracker: two cars far apart get different ids",function(){F.trackUpd("t2",[{class:"car",score:0.8,bbox:[10,10,40,20]},{class:"car",score:0.8,bbox:[400,200,40,20]}],640,360);var r=F.trackUpd("t2",[{class:"car",score:0.8,bbox:[12,10,40,20]},{class:"car",score:0.8,bbox:[402,200,40,20]}],640,360);assert.strictEqual(r.length,2);assert.notStrictEqual(r[0].id,r[1].id)});
test("ground mapping: picture corners land on the footprint corners",function(){var f=F.twinH([[0,.36],[1,.36],[1,1],[0,1]],[[-50,100],[50,100],[5,7],[-5,7]]),p=f(0,.36),q=f(1,1),m=f(.5,1);near(p[0],-50,1e-6);near(p[1],100,1e-6);near(q[0],5,1e-6);near(q[1],7,1e-6);near(m[0],0,1e-6)});
test("ground mapping: things lower in the picture are nearer the camera",function(){var f=F.twinH([[0,.36],[1,.36],[1,1],[0,1]],[[-50,100],[50,100],[5,7],[-5,7]]);assert.ok(f(.5,.9)[1]<f(.5,.5)[1])});
test("footprint triangulation: an L-shaped building is fully covered",function(){var L=[[0,0],[4,0],[4,2],[2,2],[2,4],[0,4]],t=F.insEar(L),area=0;t.forEach(function(k){area+=Math.abs((k[1][0]-k[0][0])*(k[2][1]-k[0][1])-(k[2][0]-k[0][0])*(k[1][1]-k[0][1]))/2});assert.strictEqual(t.length,4);near(area,12,1e-9)});
test("point in footprint",function(){var L=[[0,0],[4,0],[4,2],[2,2],[2,4],[0,4]];assert.strictEqual(F.insIn(L,1,1),true);assert.strictEqual(F.insIn(L,3,3),false)});
test("scale ruler: metres down to nanometres",function(){assert.strictEqual(F.insFmt(48.2),"≈ 48.2 m");assert.strictEqual(F.insFmt(0.104),"≈ 10.4 cm");assert.strictEqual(F.insFmt(3.49e-6),"≈ 3.49 µm");assert.strictEqual(F.insFmt(1.86e-9),"≈ 1.86 nm")});
console.log("\n"+n+" tests passed");
