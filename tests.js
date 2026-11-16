// Unit tests for the app's pure logic. Run with:  node tests.js
// They pull the real functions out of the src-*.js files, so they test the code that ships.
var fs = require("fs"),
  path = require("path"),
  assert = require("assert");
var src = fs
  .readdirSync(__dirname)
  .filter(function (f) {
    return /^src-\d+.*\.js$/.test(f);
  })
  .sort()
  .map(function (f) {
    return fs.readFileSync(path.join(__dirname, f), "utf8");
  })
  .join("");
function grab(name) {
  var i = src.indexOf("function " + name + "(");
  if (i < 0) throw new Error("function not found: " + name);
  var j = src.indexOf("{", i),
    d = 0;
  for (; j < src.length; j++) {
    var c = src[j];
    if (c === "{") d++;
    else if (c === "}") {
      d--;
      if (d === 0) break;
    }
  }
  return src.slice(i, j + 1);
}
// Constants the functions under test expect from their modules.
var CONSTANTS =
  'var AIRL={AA:"AAL",UA:"UAL"};var D=Math.PI/180;var WL={air:true},PLANES=[1];var VEH={car:1,truck:1,bus:1},TRK={};var EMG_NUM={US:"911",GB:"999"};var CKP_LV=[1000,925,850,700,600,500,400,300,250,200,150];var TR_STATUS=["Arriving at","Stopped at","Heading to"],TR_OCC=["Empty","Many seats available","Few seats available"];var KP_WORDS=[[9,"Extreme storm (G5)"],[8,"Severe storm (G4)"],[7,"Strong storm (G3)"],[6,"Moderate storm (G2)"],[5,"Minor storm (G1)"],[4,"Active"],[0,"Quiet"]];var location={href:"https://localhost/"};var FD_TYPES={DR:"Major disaster",EM:"Emergency",FM:"Fire management"};var IO_SIGNALS={bgp:"Routing (BGP)","ping-slash24":"Active probing"};var GAZ=[["Brussels",50.85,4.352],["Denver",39.739,-104.99]];var SC_OPS=/\\b(dott|voi|lime|bird|tier|spin|bolt|veo|superpedestrian|neuron|beam|link|scooter)/i;';
// Functions taken from the shipped modules.
var NAMES = [
  "iou",
  "nms",
  "trackUpd",
  "twinH",
  "insEar",
  "insIn",
  "insFmt",
  "planeCls",
  "shipCls",
  "newsClean",
  "hav",
  "flightProgress",
  "watchState",
  "craftKey",
  "chatMerge",
  "chatTags",
  "drvPickFrom",
  "routeRisk",
  "compass",
  "emgNum",
  "recNorm",
  "recPickBest",
  "recCap",
  "ctyMoney",
  "ctyAdvFind",
  "maMatch",
  "packTiles",
  "pip",
  "ckpLevel",
  "ckpScene",
  "planeFromAc",
  "pbVarint",
  "pbFields",
  "pbMsg",
  "pbStr",
  "pbF32",
  "pbNum",
  "pbFirst",
  "gtfsRtVehicles",
  "trCompass",
  "trValid",
  "hzCategory",
  "hzCoord",
  "kpWords",
  "topoFeatures",
  "ringsBox",
  "focCircle",
  "pointInRings",
  "num",
  "ilItem",
  "gdCentre",
  "gdInBox",
  "gdNearest",
  "gdCsv",
  "scSystems",
  "scFeedUrl",
  "tfWords",
  "tfColor",
  "bwLane",
  "bwColor",
  "bwItems",
  "safeUrl",
  "ilWhen",
  "osmAddress",
  "ioLevel",
  "ioItems",
  "fdItems",
  "usDst",
  "seaTime",
  "rbItems",
  "nwrParse",
  "liveAtcUrl"
];
var code =
  CONSTANTS +
  NAMES.map(grab).join("\n") +
  "\nreturn{" +
  NAMES.map(function (k) {
    return k + ":" + k;
  }).join(",") +
  "};";
var F = new Function(code)(),
  n = 0;
function test(name, fn) {
  fn();
  n++;
  console.log("ok  " + name);
}
function near(a, b, e) {
  assert.ok(Math.abs(a - b) < (e || 1e-6), a + " vs " + b);
}

test("iou: identical boxes overlap fully, distant boxes not at all", function () {
  near(F.iou([0, 0, 10, 10], [0, 0, 10, 10]).u, 1, 1e-3);
  assert.strictEqual(F.iou([0, 0, 10, 10], [50, 50, 10, 10]).u, 0);
});
test("nms: two passes seeing the same car become one, stronger detection", function () {
  var r = F.nms([
    { class: "car", score: 0.5, bbox: [10, 10, 40, 20] },
    { class: "car", score: 0.45, bbox: [11, 10, 40, 20] }
  ]);
  assert.strictEqual(r.length, 1);
  assert.ok(r[0].score > 0.5);
});
test("nms: a single weak hit is dropped, a single strong hit is kept", function () {
  assert.strictEqual(F.nms([{ class: "car", score: 0.2, bbox: [0, 0, 10, 10] }]).length, 0);
  assert.strictEqual(F.nms([{ class: "car", score: 0.9, bbox: [0, 0, 10, 10] }]).length, 1);
});
test("tracker: a moving car keeps one id across frames", function () {
  var a = F.trackUpd("t1", [{ class: "car", score: 0.8, bbox: [100, 100, 40, 20] }], 640, 360);
  var b = F.trackUpd("t1", [{ class: "car", score: 0.8, bbox: [130, 104, 40, 20] }], 640, 360);
  var c = F.trackUpd("t1", [{ class: "car", score: 0.8, bbox: [165, 108, 40, 20] }], 640, 360);
  assert.strictEqual(b.length, 1);
  assert.strictEqual(c.length, 1);
  assert.strictEqual(b[0].id, c[0].id);
  assert.strictEqual(c[0].moved, true);
});
test("tracker: two cars far apart get different ids", function () {
  F.trackUpd(
    "t2",
    [
      { class: "car", score: 0.8, bbox: [10, 10, 40, 20] },
      { class: "car", score: 0.8, bbox: [400, 200, 40, 20] }
    ],
    640,
    360
  );
  var r = F.trackUpd(
    "t2",
    [
      { class: "car", score: 0.8, bbox: [12, 10, 40, 20] },
      { class: "car", score: 0.8, bbox: [402, 200, 40, 20] }
    ],
    640,
    360
  );
  assert.strictEqual(r.length, 2);
  assert.notStrictEqual(r[0].id, r[1].id);
});
test("ground mapping: picture corners land on the footprint corners", function () {
  var f = F.twinH(
      [
        [0, 0.36],
        [1, 0.36],
        [1, 1],
        [0, 1]
      ],
      [
        [-50, 100],
        [50, 100],
        [5, 7],
        [-5, 7]
      ]
    ),
    p = f(0, 0.36),
    q = f(1, 1),
    m = f(0.5, 1);
  near(p[0], -50, 1e-6);
  near(p[1], 100, 1e-6);
  near(q[0], 5, 1e-6);
  near(q[1], 7, 1e-6);
  near(m[0], 0, 1e-6);
});
test("ground mapping: things lower in the picture are nearer the camera", function () {
  var f = F.twinH(
    [
      [0, 0.36],
      [1, 0.36],
      [1, 1],
      [0, 1]
    ],
    [
      [-50, 100],
      [50, 100],
      [5, 7],
      [-5, 7]
    ]
  );
  assert.ok(f(0.5, 0.9)[1] < f(0.5, 0.5)[1]);
});
test("footprint triangulation: an L-shaped building is fully covered", function () {
  var L = [
      [0, 0],
      [4, 0],
      [4, 2],
      [2, 2],
      [2, 4],
      [0, 4]
    ],
    t = F.insEar(L),
    area = 0;
  t.forEach(function (k) {
    area +=
      Math.abs(
        (k[1][0] - k[0][0]) * (k[2][1] - k[0][1]) - (k[2][0] - k[0][0]) * (k[1][1] - k[0][1])
      ) / 2;
  });
  assert.strictEqual(t.length, 4);
  near(area, 12, 1e-9);
});
test("point in footprint", function () {
  var L = [
    [0, 0],
    [4, 0],
    [4, 2],
    [2, 2],
    [2, 4],
    [0, 4]
  ];
  assert.strictEqual(F.insIn(L, 1, 1), true);
  assert.strictEqual(F.insIn(L, 3, 3), false);
});
test("scale ruler: metres down to nanometres", function () {
  assert.strictEqual(F.insFmt(48.2), "≈ 48.2 m");
  assert.strictEqual(F.insFmt(0.104), "≈ 10.4 cm");
  assert.strictEqual(F.insFmt(3.49e-6), "≈ 3.49 µm");
  assert.strictEqual(F.insFmt(1.86e-9), "≈ 1.86 nm");
});
test("model choice: aircraft category and fallback", function () {
  assert.strictEqual(F.planeCls({ cat: 8 }), "heli");
  assert.strictEqual(F.planeCls({ cat: 6 }), "wide");
  assert.strictEqual(F.planeCls({ cat: 0, v: 55, alt: 900 }), "prop");
  assert.strictEqual(F.planeCls({ cat: 0, v: 230, alt: 11000 }), "plane");
});
test("model choice: ship type codes", function () {
  assert.strictEqual(F.shipCls({ st: 69 }), "cruise");
  assert.strictEqual(F.shipCls({ st: 80 }), "tanker");
  assert.strictEqual(F.shipCls({ st: 52 }), "tug");
  assert.strictEqual(F.shipCls({ st: 70 }), "ship");
  assert.strictEqual(F.shipCls({}), "ship");
});
test("news: duplicate headlines collapse, newest first, bad links dropped", function () {
  var r = F.newsClean([
    { t: "Storm hits coast", u: "https://a.com/1", d: 5 },
    { t: "Storm Hits Coast!", u: "https://b.com/2", d: 9 },
    { t: "Other story", u: "javascript:alert(1)", d: 20 },
    { t: "Later story", u: "https://c.com/3", d: 12 }
  ]);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].t, "Later story");
  assert.strictEqual(r[1].u, "https://b.com/2");
});
test("flight: halfway along the route reads on course, about 50 percent", function () {
  var o = { lat: 30.19, lon: -97.67 },
    d = { lat: 40.64, lon: -73.78 },
    g = F.flightProgress({ lat: 35.9, lon: -86.4, trk: 58, v: 230 }, o, d);
  assert.strictEqual(g.st, "on");
  assert.ok(g.pct > 40 && g.pct < 60, "pct " + g.pct);
  assert.ok(g.xt < 60, "xt " + g.xt);
  assert.ok(g.eta > 60 && g.eta < 120, "eta " + g.eta);
});
test("flight: far from the line and heading away reads off the route", function () {
  var o = { lat: 30.19, lon: -97.67 },
    d = { lat: 40.64, lon: -73.78 },
    g = F.flightProgress({ lat: 28.0, lon: -84.0, trk: 180, v: 230 }, o, d);
  assert.strictEqual(g.st, "off");
  assert.ok(g.xt > 300);
});
test("flight: close to the destination reads arriving", function () {
  var o = { lat: 30.19, lon: -97.67 },
    d = { lat: 40.64, lon: -73.78 },
    g = F.flightProgress({ lat: 40.5, lon: -74.1, trk: 60, v: 90 }, o, d);
  assert.strictEqual(g.st, "arriving");
});
test("watchlist: airborne, on the ground, gone, under way, stopped", function () {
  assert.strictEqual(F.watchState({ k: "plane" }, { alt: 9000, v: 220 }), "air");
  assert.strictEqual(F.watchState({ k: "plane" }, { alt: 20, v: 5 }), "ground");
  assert.strictEqual(F.watchState({ k: "plane" }, null), "gone");
  assert.strictEqual(F.watchState({ k: "ship" }, { sog: 12 }), "moving");
  assert.strictEqual(F.watchState({ k: "ship" }, { sog: 0.2 }), "stopped");
});
test("search: airline flight numbers become callsigns, place names are left alone", function () {
  assert.strictEqual(F.craftKey("AA 1482"), "AAL1482");
  assert.strictEqual(F.craftKey("ua-88"), "UAL88");
  assert.strictEqual(F.craftKey("UAL88"), "UAL88");
  assert.strictEqual(F.craftKey("TX 130"), "TX130");
});
test("chatter: newest first, duplicates and unsafe links dropped, long posts trimmed", function () {
  var now = Date.now(),
    r = F.chatMerge([
      {
        net: "Bluesky",
        who: "@a",
        t: "Ground stop at JFK",
        d: now - 5000,
        u: "https://bsky.app/1"
      },
      {
        net: "Bluesky",
        who: "@a",
        t: "Ground stop at JFK",
        d: now - 9000,
        u: "https://bsky.app/2"
      },
      { net: "Mastodon", who: "@b", t: "x".repeat(400), d: now - 1000, u: "https://m.social/3" },
      { net: "X", who: "@c", t: "bad", d: now, u: "javascript:1" }
    ]);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].net, "Mastodon");
  assert.ok(r[0].t.length <= 300);
});
test("chatter: a topic becomes sensible hashtags", function () {
  assert.deepStrictEqual(F.chatTags("ground stop"), ["groundstop", "ground", "stop"]);
});
test("drive: each route choice picks the right road", function () {
  var L = [
    { s: 900, m: 12000, nc: 6, hz: 0.8 },
    { s: 1100, m: 12500, nc: 1, hz: 0.8 },
    { s: 1500, m: 14000, nc: 3, hz: 0, back: true }
  ];
  assert.strictEqual(F.drvPickFrom(L, "fast"), L[0]);
  assert.strictEqual(F.drvPickFrom(L, "nocam"), L[1]);
  assert.strictEqual(F.drvPickFrom(L, "back"), L[2]);
  assert.strictEqual(F.drvPickFrom(L, "safe"), L[2]);
});
test("drive: with no hazard anywhere the safest road is the quickest, and absurd detours are never offered", function () {
  var L = [
    { s: 900, m: 1, nc: 2, hz: 0 },
    { s: 1500, m: 1, nc: 2, hz: 0, back: true },
    { s: 9000, m: 1, nc: 0, hz: 0 }
  ];
  assert.strictEqual(F.drvPickFrom(L, "safe"), L[0]);
  assert.strictEqual(F.drvPickFrom(L, "nocam"), L[0]);
});
test("drive: a route through a hazard scores worse than one that stays clear", function () {
  var H = [{ lat: 30.5, lon: -97.5, n: "Wildfire", r: 40 }],
    a = {
      pts: [
        [30.3, -97.7],
        [30.5, -97.5],
        [30.7, -97.3]
      ]
    },
    b = {
      pts: [
        [30.3, -96.9],
        [30.3, -96.6],
        [30.7, -96.4]
      ]
    };
  assert.ok(F.routeRisk(a, H) > 0.9);
  assert.strictEqual(F.routeRisk(b, H), 0);
  assert.strictEqual(a.hzNear.n, "Wildfire");
});
test("emergency: compass words and emergency numbers", function () {
  assert.strictEqual(F.compass(0), "north");
  assert.strictEqual(F.compass(135), "south-east");
  assert.strictEqual(F.compass(-90), "west");
  assert.strictEqual(F.compass(359), "north");
  assert.strictEqual(F.emgNum("US"), "911");
  assert.strictEqual(F.emgNum("DE"), "112");
});
test("records: company names match across punctuation and suffixes, exact matches win", function () {
  assert.strictEqual(F.recNorm("Google, L.L.C."), F.recNorm("GOOGLE LLC"));
  assert.strictEqual(F.recNorm("The Acme Co., Inc."), "ACME");
  var r = F.recPickBest(
    [{ n: "ACME HOLDINGS LLC" }, { n: "ACME, INC." }, { n: "ACME PAINT LLC" }],
    "n",
    "Acme Inc"
  );
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].n, "ACME, INC.");
});
test("records: role and name casing", function () {
  assert.strictEqual(F.recCap("DIRECTEUR GENERAL"), "Directeur General");
  assert.strictEqual(F.recCap("jean-pierre"), "Jean-Pierre");
});
test("country file: money wording and matching a travel advisory to a country", function () {
  assert.strictEqual(F.ctyMoney(3366315927447), "$3.37 trillion");
  assert.strictEqual(F.ctyMoney(45200), "$45,200");
  var L = [
    { c: "niger", lvl: 4 },
    { c: "nigeria", lvl: 3 },
    { c: "the bahamas", lvl: 2 }
  ];
  assert.strictEqual(F.ctyAdvFind(L, "Nigeria").lvl, 3);
  assert.strictEqual(F.ctyAdvFind(L, "Niger").lvl, 4);
  assert.strictEqual(F.ctyAdvFind(L, "The Bahamas").lvl, 2);
  assert.strictEqual(F.ctyAdvFind(L, "France"), null);
});
test("warnings: a European warning matches by area name or polygon, and expired or minor ones are dropped", function () {
  var soon = new Date(Date.now() + 6 * 36e5).toISOString(),
    past = new Date(Date.now() - 36e5).toISOString(),
    mk = function (sev, ex, area) {
      return {
        uuid: "u",
        alert: {
          identifier: "i",
          info: [
            { language: "fr-FR", event: "Vent violent", severity: sev, expires: ex, area: [area] },
            {
              language: "en-GB",
              event: "Severe wind",
              severity: sev,
              headline: "Orange wind warning",
              instruction: "Stay indoors",
              expires: ex,
              area: [area]
            }
          ]
        }
      };
    };
  var m = F.maMatch(mk("Severe", soon, { areaDesc: "Gironde" }), 44.8, -0.6, [
    "gironde",
    "nouvelle-aquitaine"
  ]);
  assert.strictEqual(m.ev, "Severe wind");
  assert.strictEqual(m.lvl, 2);
  assert.strictEqual(
    F.maMatch(mk("Severe", soon, { areaDesc: "Finistère" }), 44.8, -0.6, ["gironde"]),
    null
  );
  assert.strictEqual(
    F.maMatch(mk("Severe", past, { areaDesc: "Gironde" }), 44.8, -0.6, ["gironde"]),
    null
  );
  assert.strictEqual(
    F.maMatch(mk("Minor", soon, { areaDesc: "Gironde" }), 44.8, -0.6, ["gironde"]),
    null
  );
  assert.strictEqual(
    F.maMatch(
      mk("Extreme", soon, { areaDesc: "Coast", polygon: ["44,-1 44,0 45,0 45,-1 44,-1"] }),
      44.8,
      -0.6,
      []
    ).lvl,
    3
  );
  assert.strictEqual(
    F.maMatch(
      mk("Extreme", soon, { areaDesc: "Coast", polygon: ["50,-1 50,0 51,0 51,-1 50,-1"] }),
      44.8,
      -0.6,
      []
    ),
    null
  );
});
test("offline pack: a sensible, bounded tile list around a point", function () {
  var L = F.packTiles(30.27, -97.74);
  assert.ok(L.length > 60 && L.length < 400, String(L.length));
  assert.ok(L.indexOf("3/3/1") >= 0);
  L.forEach(function (k) {
    var q = k.split("/").map(Number),
      n = Math.pow(2, q[0]);
    assert.ok(q[1] >= 0 && q[1] < n && q[2] >= 0 && q[2] < n, k);
  });
  assert.strictEqual(new Set(L).size, L.length);
});
test("cockpit: height maps to the right pressure level", function () {
  assert.strictEqual(F.ckpLevel(0), 1000);
  assert.strictEqual(F.ckpLevel(1500), 850);
  assert.strictEqual(F.ckpLevel(5500), 500);
  assert.strictEqual(F.ckpLevel(10700), 250);
  assert.strictEqual(F.ckpLevel(20000), 150);
});
test("cockpit: the model's numbers become the right view through the windscreen", function () {
  var s = F.ckpScene({ lvCloud: 90, low: 80, mid: 50, high: 10, precip: 0, day: 1 }, 3000);
  assert.strictEqual(s.txt, "In cloud");
  assert.ok(s.cloud > 0.8);
  s = F.ckpScene({ lvCloud: 0, low: 95, mid: 20, high: 0, precip: 0, day: 1 }, 11000);
  assert.strictEqual(s.txt, "Above a solid cloud deck");
  assert.strictEqual(s.cloud, 0);
  assert.ok(s.under > 0.9);
  s = F.ckpScene(
    { lvCloud: 10, low: 90, mid: 90, high: 90, precip: 2, snow: 0, lvT: 8, frz: 3200, day: 0 },
    600
  );
  assert.ok(/Under an overcast sky · rain/.test(s.txt));
  assert.ok(s.rain > 0 && s.snow === 0 && s.night);
  s = F.ckpScene(
    { lvCloud: 10, low: 90, mid: 90, high: 90, precip: 2, snow: 1, lvT: -6, frz: 200, day: 1 },
    600
  );
  assert.ok(s.snow > 0 && s.rain === 0);
  s = F.ckpScene(
    { lvCloud: 0, low: 0, mid: 0, high: 0, precip: 3, lvT: -50, frz: 3000, day: 1 },
    11000
  );
  assert.strictEqual(s.txt, "Clear air");
  assert.strictEqual(s.rain + s.snow, 0);
  assert.strictEqual(F.ckpScene(null, 5000).cloud, 0);
});
test("aircraft: a community-network record converts to the app's units, and grounded or positionless aircraft are skipped", function () {
  var p = F.planeFromAc({
    hex: "A93393",
    flight: "EJA692  ",
    lat: 30.13,
    lon: -99.23,
    alt_baro: 23000,
    gs: 214.6,
    track: 233.7,
    category: "A2",
    r: "N692QS",
    t: "C68A"
  });
  assert.strictEqual(p.id, "a93393");
  assert.strictEqual(p.n, "EJA692");
  assert.ok(Math.abs(p.alt - 7010.4) < 0.1);
  assert.ok(Math.abs(p.v - 110.39) < 0.05);
  assert.strictEqual(p.cat, 3);
  assert.strictEqual(p.kind, "plane");
  assert.strictEqual(F.planeFromAc({ hex: "abc", lat: 1, lon: 1, alt_baro: "ground" }), null);
  assert.strictEqual(F.planeFromAc({ hex: "abc", alt_baro: 100 }), null);
  assert.strictEqual(
    F.planeFromAc({ hex: "~abc123", lat: 1, lon: 2, alt_baro: 1000, category: "A7" }).cat,
    8
  );
  assert.strictEqual(
    F.planeFromAc({ hex: "abc", r: "N1", lat: 1, lon: 2, alt_baro: 1000 }).n,
    "N1"
  );
});
// GTFS-Realtime test feed, encoded by hand so the decoder is checked against the wire format.
function pbEnc(fields) {
  var out = [];
  function varint(n) {
    while (n > 127) {
      out.push((n % 128) + 128);
      n = Math.floor(n / 128);
    }
    out.push(n);
  }
  fields.forEach(function (f) {
    var no = f[0],
      v = f[1];
    if (typeof v === "number" && f[2] === "f32") {
      varint(no * 8 + 5);
      var b = Buffer.alloc(4);
      b.writeFloatLE(v);
      out.push.apply(out, b);
    } else if (typeof v === "number") {
      varint(no * 8);
      varint(v);
    } else {
      var bytes = typeof v === "string" ? Array.from(Buffer.from(v, "utf8")) : v;
      varint(no * 8 + 2);
      varint(bytes.length);
      out.push.apply(out, bytes);
    }
  });
  return out;
}
test("transit: a GTFS-Realtime vehicle position decodes to position, route, status and seats", function () {
  var pos = pbEnc([
      [1, 30.2672, "f32"],
      [2, -97.7431, "f32"],
      [3, 90, "f32"],
      [5, 10, "f32"]
    ]),
    trip = pbEnc([
      [1, "trip-9"],
      [5, "801"]
    ]),
    desc = pbEnc([
      [1, "5012"],
      [2, "Bus 5012"]
    ]),
    vp = pbEnc([
      [1, trip],
      [2, pos],
      [4, 1],
      [5, 1794849321],
      [7, "STOP42"],
      [8, desc],
      [9, 2]
    ]),
    ent = pbEnc([
      [1, "e1"],
      [4, vp]
    ]),
    hdr = pbEnc([
      [1, "2.0"],
      [3, 1794849321]
    ]),
    feed = new Uint8Array(
      pbEnc([
        [1, hdr],
        [2, ent],
        [2, pbEnc([[1, "e2"]])]
      ])
    );
  var v = F.gtfsRtVehicles(feed);
  assert.strictEqual(v.length, 1);
  near(v[0].lat, 30.2672, 1e-4);
  near(v[0].lon, -97.7431, 1e-4);
  near(v[0].hdg, 90, 1e-6);
  near(v[0].spd, 36, 1e-4);
  assert.strictEqual(v[0].route, "801");
  assert.strictEqual(v[0].veh, "Bus 5012");
  assert.strictEqual(v[0].status, "Stopped at stop STOP42");
  assert.strictEqual(v[0].occ, "Few seats available");
  assert.strictEqual(v[0].at, 1794849321000);
});
test("transit: a truncated feed is rejected instead of misread", function () {
  var ent = pbEnc([
      [1, "e1"],
      [
        4,
        pbEnc([
          [
            2,
            pbEnc([
              [1, 1, "f32"],
              [2, 2, "f32"]
            ])
          ]
        ])
      ]
    ]),
    feed = new Uint8Array(pbEnc([[2, ent]]));
  assert.throws(function () {
    F.gtfsRtVehicles(feed.subarray(0, feed.length - 3));
  });
});
test("transit: compass headings and position checks", function () {
  assert.strictEqual(F.trCompass("NW"), 315);
  assert.strictEqual(F.trCompass("e"), 90);
  assert.strictEqual(F.trCompass(""), null);
  assert.strictEqual(F.trValid({ lat: 42.35, lon: -71.06 }), true);
  assert.strictEqual(F.trValid({ lat: 0, lon: 0 }), false);
  assert.strictEqual(F.trValid({ lat: null, lon: 5 }), false);
  assert.strictEqual(F.trValid({ lat: 95, lon: 5 }), false);
});
test("emergency data: hurricane category, NHC coordinates and geomagnetic storm level", function () {
  assert.strictEqual(F.hzCategory(60), "");
  assert.strictEqual(F.hzCategory(64), "Category 1");
  assert.strictEqual(F.hzCategory(100), "Category 3");
  assert.strictEqual(F.hzCategory(140), "Category 5");
  assert.strictEqual(F.hzCoord(null, "26.1N"), 26.1);
  assert.strictEqual(F.hzCoord(null, "94.2W"), -94.2);
  assert.strictEqual(F.hzCoord(-80.5, "ignored"), -80.5);
  assert.strictEqual(F.kpWords(0.7), "Quiet");
  assert.strictEqual(F.kpWords(5.33), "Minor storm (G1)");
  assert.strictEqual(F.kpWords(9), "Extreme storm (G5)");
});
test("focus: TopoJSON outlines decode, including reversed arcs and quantized coordinates", function () {
  var topo = {
    type: "Topology",
    transform: { scale: [0.5, 0.5], translate: [-100, 30] },
    arcs: [
      [
        [0, 0],
        [4, 0],
        [0, 4]
      ],
      [
        [0, 0],
        [0, 4],
        [4, 0]
      ]
    ],
    objects: {
      states: {
        type: "GeometryCollection",
        geometries: [{ type: "Polygon", arcs: [[0, ~1]], properties: { name: "Square" } }]
      }
    }
  };
  var f = F.topoFeatures(topo, "states");
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].name, "Square");
  assert.deepStrictEqual(f[0].box, { w: -100, e: -98, s: 30, n: 32 });
  assert.strictEqual(F.pointInRings(f[0].rings, 31, -99), true);
  assert.strictEqual(F.pointInRings(f[0].rings, 33, -99), false);
});
test("focus: an outline crossing the antimeridian stays continuous, and city circles have the right size", function () {
  var topo = {
    type: "Topology",
    arcs: [
      [
        [177, -19],
        [-179, -19],
        [-179, -16],
        [177, -16],
        [177, -19]
      ]
    ],
    objects: {
      countries: {
        type: "GeometryCollection",
        geometries: [{ type: "Polygon", arcs: [[0]], properties: { name: "Fiji" } }]
      }
    }
  };
  var f = F.topoFeatures(topo, "countries")[0];
  assert.ok(f.box.e - f.box.w < 10, "box " + JSON.stringify(f.box));
  assert.strictEqual(F.pointInRings(f.rings, -17.5, 178), true);
  assert.strictEqual(F.pointInRings(f.rings, -17.5, -179.5 + 360), true);
  var c = F.focCircle(30, -97, 35),
    b = F.ringsBox([c]);
  assert.ok(Math.abs((b.n - b.s) * 110.57 - 70) < 1);
});
test("ground: CSV parsing handles quotes, commas inside fields and CRLF", function () {
  var r = F.gdCsv('a,b,c\r\n"x, y",2,"say ""hi"""\n\nlast,,\n');
  assert.deepStrictEqual(r, [
    ["a", "b", "c"],
    ["x, y", "2", 'say "hi"'],
    ["last", "", ""]
  ]);
});

test("ground: scooter systems keep open feeds in known cities only", function () {
  var rows = F.gdCsv(
    "Country Code,Name,Location,System ID,URL,Auto-Discovery URL,Supported Versions,Authentication Info URL,Authentication Type,Authentication Parameter Name\n" +
      "BE,Dott Brussels,Brussels,dott-brussels,https://ridedott.com,https://gbfs.example/brussels/gbfs.json,2.3,,,\n" +
      'US,Lime Denver,"Denver, CO",lime-den,https://li.me,https://gbfs.example/den/gbfs.json,2.2,https://auth.example,api_key,key\n' +
      'US,Bird Denver,"Denver, CO",bird-den,https://bird.co,https://gbfs.example/bird-den/gbfs.json,2.3,,,\n' +
      "US,City Bikes,Denver,cb,https://x,https://gbfs.example/cb.json,2.3,,,\n" +
      "FR,Voi Lyon,Lyon,voi-lyon,https://voi.com,https://gbfs.example/lyon.json,2.3,,,\n"
  );
  var s = F.scSystems(rows);
  assert.deepStrictEqual(
    s.map(function (x) {
      return x.name + "@" + x.city;
    }),
    ["Dott Brussels@Brussels", "Bird Denver@Denver"]
  );
  assert.strictEqual(s[1].lat, 39.739);
});

test("ground: GBFS discovery finds the vehicle feed in v2 and v3 layouts", function () {
  var v2 = {
    data: {
      en: {
        feeds: [
          { name: "system_information", url: "https://a/si" },
          { name: "free_bike_status", url: "https://a/fbs" }
        ]
      }
    }
  };
  var v3 = { data: { feeds: [{ name: "vehicle_status", url: "https://a/vs" }] } };
  assert.strictEqual(F.scFeedUrl(v2), "https://a/fbs");
  assert.strictEqual(F.scFeedUrl(v3), "https://a/vs");
  assert.strictEqual(
    F.scFeedUrl({ data: { en: { feeds: [{ name: "free_bike_status", url: "http://a" }] } } }),
    null
  );
  assert.strictEqual(F.scFeedUrl(null), null);
});

test("ground: nearest networks are chosen from the area centre", function () {
  var b = { s: 39, n: 41, w: -106, e: -104 },
    pts = [
      [50, 4],
      [40, -105.1],
      [40.5, -104.2]
    ];
  assert.deepStrictEqual(
    F.gdNearest(pts, b, 2, function (p) {
      return p;
    }),
    [
      [40, -105.1],
      [40.5, -104.2]
    ]
  );
  assert.strictEqual(F.gdInBox(b, 41.2, -105, 0.3), true);
  assert.strictEqual(F.gdInBox(b, 41.5, -105, 0.3), false);
});

test("ground: traffic wording and colours", function () {
  assert.strictEqual(F.tfWords("TRFC HAZD/ DEBRIS"), "Trfc hazd/ debris");
  assert.strictEqual(F.tfWords("some-lanes-closed"), "Some lanes closed");
  assert.strictEqual(F.tfColor("COLLISION"), "#ff4d5e");
  assert.strictEqual(F.tfColor("TRFC HAZD/ DEBRIS"), "#ffb02e");
});

test("ground: border lanes read CBP statuses and ports group their crossings", function () {
  assert.strictEqual(F.bwLane({ operational_status: "N/A", delay_minutes: "" }), null);
  assert.strictEqual(F.bwLane({ operational_status: "Update Pending" }), null);
  assert.deepStrictEqual(F.bwLane({ operational_status: "Lanes Closed" }), {
    min: null,
    open: 0,
    text: "Closed"
  });
  assert.strictEqual(
    F.bwLane({ operational_status: "no delay", delay_minutes: "0", lanes_open: "4" }).text,
    "No delay · 4 open"
  );
  assert.strictEqual(
    F.bwLane({ operational_status: "delay", delay_minutes: "35", lanes_open: "2" }).min,
    35
  );
  var lane = function (m) {
    return {
      operational_status: m ? "delay" : "no delay",
      delay_minutes: String(m),
      lanes_open: "3"
    };
  };
  var list = [
    {
      port_number: "090101",
      port_name: "Buffalo/Niagara Falls",
      crossing_name: "Peace Bridge",
      border: "Canadian Border",
      port_status: "Open",
      passenger_vehicle_lanes: { standard_lanes: lane(10) }
    },
    {
      port_number: "090104",
      port_name: "Buffalo/Niagara Falls",
      crossing_name: "Rainbow Bridge",
      border: "Canadian Border",
      port_status: "Open",
      passenger_vehicle_lanes: { standard_lanes: lane(50) }
    },
    { port_number: "999901", port_name: "Nowhere", crossing_name: "X", port_status: "Open" }
  ];
  var items = F.bwItems({ key: "border", label: "Border", color: "#fff" }, list, {
    "0901": ["0901", "Buffalo Niagara Falls", 43.1, -79.06]
  });
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].label, "BUFFALO NIAGARA FALLS 50m");
  assert.strictEqual(items[0].color, F.bwColor(50));
  assert.strictEqual(items[0].big, true);
  assert.ok(
    items[0].rows.some(function (r) {
      return r[0] === "RAINBOW BRIDGE · CARS" && r[1] === "50 min · 3 open";
    })
  );
});

var IL_D = { key: "x", label: "X", color: "#ffffff" };

test("infrastructure: addresses, outage levels and countries placed from the bundled table", function () {
  assert.strictEqual(
    F.osmAddress({
      "addr:housenumber": "1500",
      "addr:street": "Red River St",
      "addr:city": "Austin"
    }),
    "1500 Red River St, Austin"
  );
  assert.strictEqual(F.osmAddress({}), "—");
  assert.strictEqual(F.ioLevel(2e6)[0], "Severe");
  assert.strictEqual(F.ioLevel(50000)[0], "Major");
  assert.strictEqual(F.ioLevel(0)[0], "Minor");
  var items = F.ioItems(
    IL_D,
    [
      {
        entity: { code: "KG", name: "Kyrgyzstan" },
        scores: { "ping-slash24.median": 549449, overall: 549449 },
        event_cnt: 2
      },
      { entity: { code: "ZZ", name: "Nowhere" }, scores: { overall: 10 } }
    ],
    { KG: [41.204, 74.766] }
  );
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].lat, 41.204);
  assert.ok(
    items[0].rows.some(function (r) {
      return r[0] === "SEEN IN" && r[1] === "Active probing";
    })
  );
});

test("infrastructure: disaster declarations map to county or state outlines", function () {
  var box = { s: 29, n: 31, w: -86, e: -84 },
    shapes = {
      12037: { name: "Franklin", rings: [[[0, 0]]], box: box },
      12: { name: "Florida", rings: [[[0, 0]]], box: box }
    };
  var rows = [
    {
      disasterNumber: 4955,
      declarationType: "DR",
      declarationTitle: "HURRICANE ISAIAS",
      designatedArea: "Franklin (County)",
      fipsStateCode: "12",
      fipsCountyCode: "037",
      declarationDate: "2026-10-27T00:00:00.000Z",
      incidentBeginDate: "2026-10-06T00:00:00.000Z"
    },
    {
      disasterNumber: 4955,
      declarationType: "DR",
      declarationTitle: "HURRICANE ISAIAS",
      designatedArea: "Franklin (County)",
      fipsStateCode: "12",
      fipsCountyCode: "037"
    },
    {
      disasterNumber: 3700,
      declarationType: "EM",
      declarationTitle: "HURRICANE ISAIAS",
      designatedArea: "Statewide",
      fipsStateCode: "12",
      fipsCountyCode: "000"
    },
    { disasterNumber: 1, declarationType: "DR", fipsStateCode: "99", fipsCountyCode: "001" }
  ];
  var it = F.fdItems(IL_D, rows, shapes);
  assert.strictEqual(it.length, 2);
  assert.strictEqual(it[0].n, "Hurricane isaias");
  assert.strictEqual(it[0].lat, 30);
  assert.strictEqual(it[1].tag, "EMERGENCY · FEMA 3700");
});

test("infrastructure: Seattle local times convert to UTC across daylight saving", function () {
  assert.strictEqual(F.seaTime("2026-07-01T12:00:00.000"), Date.UTC(2026, 6, 1, 19, 0));
  assert.strictEqual(F.seaTime("2026-12-01T12:00:00.000"), Date.UTC(2026, 11, 1, 20, 0));
  assert.strictEqual(F.usDst(2026, 2, 8, 3), true);
  assert.strictEqual(F.usDst(2026, 2, 7, 12), false);
  assert.strictEqual(F.usDst(2026, 10, 1, 1), true);
  assert.strictEqual(F.usDst(2026, 10, 1, 3), false);
  assert.strictEqual(F.seaTime("bad"), null);
});

test("radio: only https streams are kept, and weather radio sites merge their counties", function () {
  var st = F.rbItems(IL_D, [
    {
      stationuuid: "a",
      name: "KUT",
      url_resolved: "https://stream.example/kut",
      geo_lat: 30.28,
      geo_long: -97.74,
      tags: "news,npr",
      codec: "MP3",
      bitrate: 128
    },
    { stationuuid: "a", name: "KUT again", url_resolved: "https://stream.example/kut" },
    {
      stationuuid: "b",
      name: "Plain",
      url_resolved: "http://stream.example/x",
      geo_lat: 1,
      geo_long: 1
    },
    { stationuuid: "c", name: "Bad", url_resolved: "javascript:alert(1)", geo_lat: 1, geo_long: 1 }
  ]);
  assert.strictEqual(st.length, 1);
  assert.strictEqual(st[0].audio, "https://stream.example/kut");
  assert.strictEqual(st[0].tag, "RADIO · MP3 128K");
  var js =
    'ST[0] = "TX";\nCOUNTY[0] = "Travis";\nCOUNTY[1] = "Hays";\nCOUNTY[2] = "Nowhere";\n' +
    'SITENAME[0] = "Austin";\nSITESTATE[0] = "TX";\nFREQ[0] = "162.400";\nFREQ[1] = "162.400";\n' +
    'CALLSIGN[0] = "WXK27";\nCALLSIGN[1] = "WXK27";\nCALLSIGN[2] = "";\nLAT[0] = "30.32";\nLAT[1] = "30.32";\n' +
    'LON[0] = "-97.77";\nLON[1] = "-97.77";\nSTATUS[0] = "NORMAL";\nWFO[0] = "Austin/San Antonio|TX";\n';
  var nw = F.nwrParse(js);
  assert.strictEqual(nw.length, 1);
  assert.deepStrictEqual(nw[0].counties, ["Travis", "Hays"]);
  assert.strictEqual(nw[0].wfo, "Austin/San Antonio, TX");
  assert.strictEqual(F.liveAtcUrl("kaus"), "https://www.liveatc.net/search/?icao=KAUS");
  assert.strictEqual(F.liveAtcUrl("?"), "");
});

console.log("\n" + n + " tests passed");
