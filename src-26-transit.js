/**
 * @file Public transit.
 * Live positions of buses, trains, trams, subways and ferries from transit agencies' open data:
 * JSON APIs and GTFS-Realtime feeds (decoded by a small protobuf reader). Feeds are fetched only
 * for areas near the map view.
 *
 * Module 26 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Public transit ----------
// Every source here is published by the operator (or a public mirror of it) for anyone to use,
// without a key. Positions describe vehicles, never passengers.
var TRANSIT = [],
  TR = { fly: {}, last: {}, byFeed: {}, err: {}, inView: [] },
  TR_REFRESH_MS = 30000,
  TR_MAX = 6000;

var TR_MODES = {
  tram: ["Tram", "#ffb547"],
  subway: ["Subway", "#ff5d8f"],
  rail: ["Train", "#c58bff"],
  bus: ["Bus", "#ffd84a"],
  ferry: ["Ferry", "#4cc3ff"],
  transit: ["Transit vehicle", "#9fe870"]
};

var TR_OCC = [
  "Empty",
  "Many seats available",
  "Few seats available",
  "Standing room only",
  "Crowded",
  "Full",
  "Not taking passengers"
];

var TR_STATUS = ["Arriving at", "Stopped at", "Heading to"];

var TR_FEEDS = [
  {
    id: "mbta",
    name: "MBTA",
    city: "Boston, MA",
    box: { s: 41.2, w: -72.2, n: 43.1, e: -69.8 },
    src: "MBTA V3 API",
    load: trMbta
  },
  {
    id: "septa",
    name: "SEPTA",
    city: "Philadelphia, PA",
    box: { s: 39.6, w: -76.1, n: 40.6, e: -74.5 },
    src: "SEPTA TransitView",
    load: trSepta
  },
  {
    id: "ttc",
    name: "TTC",
    city: "Toronto, ON",
    box: { s: 43.5, w: -79.8, n: 43.95, e: -79.0 },
    src: "TTC via Umo public feed",
    load: trTtc
  },
  {
    id: "kcm",
    name: "King County Metro",
    city: "Seattle, WA",
    box: { s: 47.1, w: -122.6, n: 47.9, e: -121.6 },
    src: "King County Metro GTFS-Realtime",
    url: "https://s3.amazonaws.com/kcm-alerts-realtime-prod/vehiclepositions.pb",
    load: trGtfsRt
  },
  {
    id: "capmetro",
    name: "CapMetro",
    city: "Austin, TX",
    box: { s: 29.9, w: -98.1, n: 30.7, e: -97.3 },
    src: "CapMetro GTFS-Realtime (data.texas.gov)",
    url: "https://data.texas.gov/download/eiei-9rpf/application%2Foctet-stream",
    load: trGtfsRt
  },
  {
    id: "hsl",
    name: "HSL",
    city: "Helsinki, Finland",
    box: { s: 59.9, w: 24.3, n: 60.6, e: 25.6 },
    src: "HSL GTFS-Realtime",
    url: "https://realtime.hsl.fi/realtime/vehicle-positions/v2/hsl",
    load: trGtfsRt
  },
  {
    id: "metrotransit",
    name: "Metro Transit",
    city: "Minneapolis–St Paul, MN",
    box: { s: 44.6, w: -93.8, n: 45.4, e: -92.8 },
    src: "Metro Transit GTFS-Realtime",
    url: "https://svc.metrotransit.org/mtgtfs/vehiclepositions.pb",
    load: trGtfsRt
  },
  {
    id: "rtd",
    name: "RTD",
    city: "Denver, CO",
    box: { s: 39.4, w: -105.4, n: 40.3, e: -104.6 },
    src: "RTD GTFS-Realtime",
    url: "https://open-data.rtd-denver.com/files/gtfs-rt/rtd/VehiclePosition.pb",
    load: trGtfsRt
  },
  {
    id: "calgary",
    name: "Calgary Transit",
    city: "Calgary, AB",
    box: { s: 50.8, w: -114.4, n: 51.3, e: -113.8 },
    src: "Calgary Transit GTFS-Realtime (City of Calgary)",
    url: "https://data.calgary.ca/download/am7c-qe3u/application%2Foctet-stream",
    load: trGtfsRt
  },
  {
    id: "ets",
    name: "Edmonton Transit",
    city: "Edmonton, AB",
    box: { s: 53.3, w: -113.8, n: 53.8, e: -113.2 },
    src: "ETS GTFS-Realtime (City of Edmonton)",
    url: "https://gtfs.edmonton.ca/TMGTFSRealTimeWebService/Vehicle/VehiclePositions.pb",
    load: trGtfsRt
  },
  {
    id: "halifax",
    name: "Halifax Transit",
    city: "Halifax, NS",
    box: { s: 44.5, w: -63.9, n: 44.9, e: -63.3 },
    src: "Halifax Transit GTFS-Realtime",
    url: "https://gtfs.halifax.ca/realtime/Vehicle/VehiclePositions.pb",
    load: trGtfsRt
  },
  {
    id: "translink",
    name: "Translink",
    city: "South East Queensland, Australia",
    box: { s: -28.3, w: 152.6, n: -26.3, e: 153.6 },
    src: "Translink SEQ GTFS-Realtime",
    url: "https://gtfsrt.api.translink.com.au/api/realtime/SEQ/VehiclePositions",
    load: trGtfsRt
  },
  {
    id: "ovapi",
    name: "OVapi",
    city: "Netherlands",
    box: { s: 50.7, w: 3.3, n: 53.6, e: 7.3 },
    src: "OVapi GTFS-Realtime (Netherlands)",
    url: "https://gtfs.ovapi.nl/nl/vehiclePositions.pb",
    load: trGtfsRt
  },
  {
    id: "entur",
    name: "Entur",
    city: "Norway",
    box: { s: 57.9, w: 4.5, n: 71.2, e: 31.2 },
    src: "Entur GTFS-Realtime (Norway)",
    url: "https://api.entur.io/realtime/v1/gtfs-rt/vehicle-positions",
    load: trGtfsRt
  },
  {
    id: "amtrak",
    name: "Amtrak",
    city: "United States",
    box: { s: 24, w: -125, n: 50, e: -66 },
    wide: true,
    src: "Amtraker (public Amtrak data)",
    load: trAmtrak
  }
];

function trMode(k) {
  return TR_MODES[k] || TR_MODES.transit;
}

function trVehicle(feed, o) {
  var m = trMode(o.mode);
  o.kind = "transit";
  o.id = feed.id + ":" + o.veh;
  o.agency = o.agency || feed.name;
  o.city = feed.city;
  o.src = feed.src;
  o.color = o.color || m[1];
  o.n = o.n || (o.route ? "Route " + o.route : m[0] + " " + o.veh);
  return o;
}

function trValid(o) {
  return (
    o &&
    typeof o.lat === "number" &&
    typeof o.lon === "number" &&
    isFinite(o.lat) &&
    isFinite(o.lon) &&
    Math.abs(o.lat) <= 90 &&
    Math.abs(o.lon) <= 180 &&
    (o.lat !== 0 || o.lon !== 0)
  );
}

function trCompass(c) {
  var i = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].indexOf(String(c || "").toUpperCase());
  return i < 0 ? null : i * 45;
}

function trTime(v) {
  var t = typeof v === "number" ? v * 1000 : Date.parse(v);
  return isFinite(t) ? t : Date.now();
}

// ----- operators with JSON APIs -----
function trMbta(feed) {
  return getJSON(
    "https://api-v3.mbta.com/vehicles?include=route,stop&fields[stop]=name&fields[route]=short_name,long_name,type,color",
    20000
  ).then(function (j) {
    var inc = {};
    (j.included || []).forEach(function (x) {
      inc[x.type + ":" + x.id] = x.attributes || {};
    });
    var MODE = ["tram", "subway", "rail", "bus", "ferry"];
    return (j.data || []).map(function (v) {
      var a = v.attributes || {},
        rel = v.relationships || {},
        rid = rel.route && rel.route.data ? rel.route.data.id : "",
        sid = rel.stop && rel.stop.data ? rel.stop.data.id : "",
        r = inc["route:" + rid] || {},
        s = inc["stop:" + sid] || {},
        st = TR_STATUS[["INCOMING_AT", "STOPPED_AT", "IN_TRANSIT_TO"].indexOf(a.current_status)];
      return trVehicle(feed, {
        veh: a.label || v.id,
        route: r.short_name || r.long_name || rid,
        mode: MODE[r.type] || "bus",
        color: r.color && /^[0-9a-f]{6}$/i.test(r.color) ? "#" + r.color : null,
        lat: a.latitude,
        lon: a.longitude,
        hdg: a.bearing,
        spd: a.speed != null ? a.speed * 3.6 : null,
        status: st && s.name ? st + " " + s.name : st || null,
        occ: a.occupancy_status ? trWords(a.occupancy_status) : null,
        at: trTime(a.updated_at)
      });
    });
  });
}

function trSepta(feed) {
  var TROLLEY = { 10: 1, 11: 1, 13: 1, 15: 1, 34: 1, 36: 1, 101: 1, 102: 1 };
  return getJSON("https://www3.septa.org/api/TransitViewAll/index.php", 20000).then(function (j) {
    var out = [],
      routes = (j.routes && j.routes[0]) || {};
    Object.keys(routes).forEach(function (rid) {
      (routes[rid] || []).forEach(function (v) {
        var late = num(v.late);
        out.push(
          trVehicle(feed, {
            veh: String(v.VehicleID || v.label),
            route: String(v.route_id || rid),
            mode: TROLLEY[rid] ? "tram" : "bus",
            lat: num(v.lat),
            lon: num(v.lng),
            hdg: num(v.heading),
            dest: v.destination ? v.Direction + " to " + v.destination : v.Direction,
            status: v.next_stop_name ? "Heading to " + v.next_stop_name : null,
            late: late,
            occ: v.estimated_seat_availability ? trWords(v.estimated_seat_availability) : null,
            at: trTime(num(v.timestamp))
          })
        );
      });
    });
    return out;
  });
}

function trTtc(feed) {
  return getJSON(
    "https://retro.umoiq.com/service/publicJSONFeed?command=vehicleLocations&a=ttc&t=0",
    20000
  ).then(function (j) {
    var list = j.vehicle ? [].concat(j.vehicle) : [];
    return list.map(function (v) {
      var r = String(v.routeTag || ""),
        h = num(v.heading);
      return trVehicle(feed, {
        veh: String(v.id),
        route: r,
        mode: /^5\d\d$/.test(r) ? "tram" : "bus",
        lat: num(v.lat),
        lon: num(v.lon),
        hdg: h != null && h >= 0 ? h : null,
        spd: num(v.speedKmHr),
        at: Date.now() - (num(v.secsSinceReport) || 0) * 1000
      });
    });
  });
}

function trAmtrak(feed) {
  return getJSON("https://api-v3.amtraker.com/v3/trains", 25000).then(function (j) {
    var out = [];
    Object.keys(j || {}).forEach(function (k) {
      (j[k] || []).forEach(function (t) {
        if (t.trainState && t.trainState !== "Active") return;
        out.push(
          trVehicle(feed, {
            veh: String(t.trainID || t.trainNum),
            n: (t.routeName || "Train") + " " + (t.trainNum || ""),
            route: t.routeName,
            agency: t.provider || feed.name,
            mode: "rail",
            color: t.iconColor && /^#[0-9a-f]{6}$/i.test(t.iconColor) ? t.iconColor : null,
            lat: num(t.lat),
            lon: num(t.lon),
            hdg: trCompass(t.heading),
            spd: t.velocity != null ? num(t.velocity) * 1.609 : null,
            status: t.eventName ? "Last reported near " + t.eventName : null,
            dest: t.origName && t.destName ? t.origName + " to " + t.destName : t.destName,
            timely: t.trainTimely || null,
            at: trTime(t.lastValTS || t.updatedAt)
          })
        );
      });
    });
    return out;
  });
}

function trWords(s) {
  s = String(s).toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ----- GTFS-Realtime (protobuf) -----
// A minimal reader for the VehiclePosition part of the GTFS-Realtime schema:
// https://gtfs.org/documentation/realtime/proto/
function pbVarint(b, p) {
  var x = 0,
    m = 1,
    c;
  do {
    if (p >= b.length) throw new Error("protobuf: truncated varint");
    c = b[p++];
    x += (c & 127) * m;
    m *= 128;
  } while (c & 128);
  return [x, p];
}

// Returns [field, wireType, value] triples for one message. Length-delimited values are
// returned as [start, end] byte ranges; 32-bit values as their byte offset.
function pbFields(b, s, e) {
  var out = [],
    p = s,
    r,
    key,
    wt,
    v;
  while (p < e) {
    r = pbVarint(b, p);
    key = r[0];
    p = r[1];
    wt = key % 8;
    if (wt === 0) {
      r = pbVarint(b, p);
      v = r[0];
      p = r[1];
    } else if (wt === 1) {
      v = p;
      p += 8;
    } else if (wt === 2) {
      r = pbVarint(b, p);
      v = [r[1], r[1] + r[0]];
      p = r[1] + r[0];
    } else if (wt === 5) {
      v = p;
      p += 4;
    } else throw new Error("protobuf: unsupported wire type " + wt);
    if (p > e) throw new Error("protobuf: field runs past the message");
    out.push([Math.floor(key / 8), wt, v]);
  }
  return out;
}

function pbMsg(b, range) {
  var o = {};
  pbFields(b, range[0], range[1]).forEach(function (f) {
    (o[f[0]] = o[f[0]] || []).push(f);
  });
  return o;
}

function pbStr(b, f) {
  if (!f || f[1] !== 2) return "";
  return new TextDecoder().decode(b.subarray(f[2][0], f[2][1]));
}

function pbF32(b, f) {
  if (!f || f[1] !== 5) return null;
  return new DataView(b.buffer, b.byteOffset + f[2], 4).getFloat32(0, true);
}

function pbNum(f) {
  return f && f[1] === 0 ? f[2] : null;
}

function pbFirst(m, k) {
  return m[k] ? m[k][0] : null;
}

// FeedMessage.entity(2) -> FeedEntity.vehicle(4) -> VehiclePosition
function gtfsRtVehicles(b) {
  var feedMsg = pbMsg(b, [0, b.length]),
    out = [];
  (feedMsg[2] || []).forEach(function (ent) {
    if (ent[1] !== 2) return;
    var em = pbMsg(b, ent[2]),
      vf = pbFirst(em, 4);
    if (!vf || vf[1] !== 2) return;
    var vp = pbMsg(b, vf[2]),
      posF = pbFirst(vp, 2);
    if (!posF || posF[1] !== 2) return;
    var pos = pbMsg(b, posF[2]),
      trip = pbFirst(vp, 1) ? pbMsg(b, pbFirst(vp, 1)[2]) : {},
      desc = pbFirst(vp, 8) ? pbMsg(b, pbFirst(vp, 8)[2]) : {},
      ts = pbNum(pbFirst(vp, 5)),
      st = pbNum(pbFirst(vp, 4)),
      occ = pbNum(pbFirst(vp, 9)),
      speed = pbF32(b, pbFirst(pos, 5)),
      stop = pbStr(b, pbFirst(vp, 7));
    out.push({
      lat: pbF32(b, pbFirst(pos, 1)),
      lon: pbF32(b, pbFirst(pos, 2)),
      hdg: pbF32(b, pbFirst(pos, 3)),
      spd: speed != null ? speed * 3.6 : null,
      route: pbStr(b, pbFirst(trip, 5)),
      veh: pbStr(b, pbFirst(desc, 2)) || pbStr(b, pbFirst(desc, 1)) || pbStr(b, pbFirst(em, 1)),
      status: st != null && TR_STATUS[st] && stop ? TR_STATUS[st] + " stop " + stop : null,
      occ: occ != null && TR_OCC[occ] ? TR_OCC[occ] : null,
      at: ts ? ts * 1000 : Date.now()
    });
  });
  return out;
}

// Binary GET: native HTTP on Android (no browser CORS limits), fetch on the web.
function netBin(url, ms) {
  var web = function () {
    var ac = window.AbortController ? new AbortController() : null,
      tm = setTimeout(function () {
        if (ac) ac.abort();
      }, ms || 20000);
    return fetch(url, { signal: ac && ac.signal, mode: "cors", credentials: "omit" }).then(
      function (r) {
        clearTimeout(tm);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.arrayBuffer().then(function (x) {
          return new Uint8Array(x);
        });
      }
    );
  };
  var n = nativeHttp();
  if (!n) return web();
  return n
    .get({
      url: url,
      responseType: "arraybuffer",
      connectTimeout: ms || 20000,
      readTimeout: ms || 20000
    })
    .then(function (r) {
      if (!r || r.status >= 400) throw new Error("HTTP " + (r && r.status));
      var d = r.data;
      if (d instanceof ArrayBuffer) return new Uint8Array(d);
      // Capacitor returns binary bodies base64-encoded.
      var s = atob(String(d)),
        u = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
      return u;
    })
    .catch(web);
}

function trGtfsRt(feed) {
  return netBin(feed.url, 20000).then(function (b) {
    return gtfsRtVehicles(b).map(function (v) {
      v.mode = "transit";
      v.n = feed.name + (v.route ? " · route " + v.route : "");
      v.routeIsId = true;
      return trVehicle(feed, v);
    });
  });
}

// ----- loading -----
function trFeedsInView() {
  if (typeof radius !== "function") return [];
  var b = viewBox(0.4),
    km = viewKm();
  var fb = focusBox();
  return TR_FEEDS.filter(function (f) {
    var x = f.box;
    if (fb) return x.s < fb.n && x.n > fb.s && x.w < fb.e && x.e > fb.w;
    if (km > (f.wide ? 9000 : 2500)) return false;
    return x.s < b.n && x.n > b.s && x.w < b.e && x.e > b.w;
  });
}

function trRebuild() {
  var all = [];
  TR.inView.forEach(function (f) {
    var a = TR.byFeed[f.id];
    if (a) all = all.concat(a);
  });
  TRANSIT = all.length > TR_MAX ? all.slice(0, TR_MAX) : all;
}

function trTick(force) {
  if (!WL.transit || !EMBED_OK || (document.hidden && !force)) return;
  TR.inView = trFeedsInView();
  trRebuild();
  var now = Date.now();
  TR.inView.forEach(function (f) {
    if (TR.fly[f.id]) return;
    if (!force && now - (TR.last[f.id] || 0) < TR_REFRESH_MS) return;
    TR.last[f.id] = now;
    TR.fly[f.id] = true;
    f.load(f)
      .then(function (list) {
        TR.byFeed[f.id] = list.filter(trValid);
        TR.err[f.id] = false;
        WSTAT.transit = "ok";
      })
      .catch(function () {
        TR.err[f.id] = true;
        if (!TRANSIT.length) WSTAT.transit = "x";
      })
      .then(function () {
        TR.fly[f.id] = false;
        trRebuild();
        wstat();
      });
  });
  wstat();
}

function trLoad() {
  TR.last = {};
  trTick(true);
}

function trStatus() {
  if (!WL.transit) return "";
  if (!EMBED_OK) return "APP";
  if (!TR.inView.length) return "ZOOM TO A COVERED CITY";
  if (TRANSIT.length)
    return (
      TRANSIT.length.toLocaleString() +
      " · " +
      TR.inView
        .filter(function (f) {
          return (TR.byFeed[f.id] || []).length;
        })
        .map(function (f) {
          return f.name;
        })
        .join(", ")
    );
  var failed = TR.inView.every(function (f) {
    return TR.err[f.id];
  });
  if (failed) return nativeHttp() ? "OFFLINE" : "ANDROID APP ONLY";
  return "LOADING…";
}

// ----- drawing on the globe and map -----
function drawTransit(t, P) {
  if (!WL.transit || !TRANSIT.length) return;
  var km = viewKm(),
    boxes = km < 120,
    labels = km < 45,
    shown = 0;
  ctx.save();
  ctx.font = "600 9.5px 'JetBrains Mono',monospace";
  ctx.textBaseline = "middle";
  for (var i = 0; i < TRANSIT.length; i++) {
    var e = TRANSIT[i];
    if (!focusHas(e.lat, e.lon)) continue;
    var p = P(e.lon, e.lat);
    if (p[2] <= 0 || p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > H + 20) continue;
    var c = okColor(e.color);
    if (!boxes) {
      ctx.fillStyle = c;
      ctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3);
    } else {
      if (e.hdg != null && isFinite(e.hdg)) {
        var a = e.hdg * D;
        ctx.strokeStyle = c;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p[0] + Math.sin(a) * 6, p[1] - Math.cos(a) * 6);
        ctx.lineTo(p[0] + Math.sin(a) * 12, p[1] - Math.cos(a) * 12);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(2,8,14,.85)";
      ctx.fillRect(p[0] - 6, p[1] - 4.5, 12, 9);
      ctx.fillStyle = c;
      ctx.fillRect(p[0] - 5, p[1] - 3.5, 10, 7);
      if (labels && shown < 300) {
        var txt = String(e.routeIsId ? e.veh : e.route || e.veh || "").slice(0, 14),
          tw = ctx.measureText(txt).width;
        ctx.fillStyle = "rgba(2,8,14,.8)";
        ctx.fillRect(p[0] + 9, p[1] - 7, tw + 8, 14);
        ctx.strokeStyle = c;
        ctx.lineWidth = 1;
        ctx.strokeRect(p[0] + 9, p[1] - 7, tw + 8, 14);
        ctx.fillStyle = c;
        ctx.fillText(txt, p[0] + 13, p[1]);
        shown++;
      }
    }
    screenPts.push([p[0], p[1], e]);
  }
  ctx.restore();
}

// ----- dossier -----
function trTag(e) {
  return (trMode(e.mode)[0] + " · " + e.agency + " · live").toUpperCase();
}

function trRows(e) {
  var rows = [[e.routeIsId ? "ROUTE ID" : "ROUTE", e.route || "—"]];
  rows.push(["TYPE", trMode(e.mode)[0]]);
  rows.push(["OPERATOR", e.agency + " · " + e.city]);
  if (e.dest) rows.push(["SERVICE", e.dest]);
  rows.push(["STATUS", e.status || (e.spd > 2 ? "Moving" : e.spd != null ? "Stopped" : "—")]);
  if (e.timely) rows.push(["ON TIME", e.timely]);
  if (e.late != null)
    rows.push([
      "SCHEDULE",
      e.late > 0 ? e.late + " min late" : e.late < 0 ? -e.late + " min early" : "On time"
    ]);
  rows.push([
    "SPEED",
    e.spd != null ? Math.round(e.spd) + " km/h · " + Math.round(e.spd / 1.609) + " mph" : "—"
  ]);
  rows.push(["HEADING", e.hdg != null && isFinite(e.hdg) ? Math.round(e.hdg) + "°" : "—"]);
  if (e.occ) rows.push(["SEATS", e.occ]);
  rows.push(["VEHICLE", e.veh || "—"]);
  rows.push(["LAST REPORT", ago(e.at)]);
  rows.push(["SOURCE", e.src + " (open data)"]);
  return rows;
}

// ----- registration -----
WLDEF.push([
  "transit",
  "Public transit: buses, trains, trams",
  "#ffd84a",
  function () {
    return TRANSIT.length;
  },
  trLoad
]);
setInterval(trTick, 10000);
if (EMBED_OK && WL.transit) setTimeout(trLoad, 1500);
