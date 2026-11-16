/**
 * @file Emergency data layers.
 * Hurricanes (NHC), river flood gauges (NOAA NWPS), tide stations (NOAA CO-OPS), tsunami messages
 * (US Tsunami Warning Centers), wildfire perimeters (NIFC WFIGS) and space weather (NOAA SWPC),
 * built on a small framework for public info layers that later data packs reuse.
 *
 * Module 27 of 33. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Info layers: a shared loader, drawer and dossier for public data layers ----------
// Each layer: key, label, colour, icon, how often to refresh (ms), the widest view (km) it loads
// and draws at, and a load function that resolves to items {n, lat, lon, color, tag, rows}.
var IL = {},
  IL_ORDER = [];

function ilDef(d) {
  d.items = [];
  d.at = 0;
  d.busy = false;
  d.st = "";
  d.area = "";
  IL[d.key] = d;
  IL_ORDER.push(d.key);
  if (WL[d.key] === undefined) WL[d.key] = false;
  WLDEF.push([
    d.key,
    d.label,
    d.color,
    function () {
      return d.count ? d.count() : d.items.length;
    },
    function () {
      ilLoad(d, true);
    }
  ]);
}

function ilItem(d, o) {
  o.kind = "info";
  o.layer = d.key;
  o.color = o.color || d.color;
  o.tag = String(o.tag || d.tag || d.label).toUpperCase();
  o.id = o.id || d.key + ":" + o.lat + "," + o.lon;
  return o;
}

function ilValid(o) {
  return (
    o &&
    typeof o.lat === "number" &&
    typeof o.lon === "number" &&
    isFinite(o.lat) &&
    isFinite(o.lon) &&
    Math.abs(o.lat) <= 90 &&
    Math.abs(o.lon) <= 180
  );
}

// The area a layer should load for: the focus area when one is set, otherwise the view.
function ilArea() {
  var f = focusBox();
  if (f) return f;
  var b = viewBox(0.3);
  return {
    s: Math.max(-90, b.s),
    n: Math.min(90, b.n),
    w: Math.max(-180, b.w),
    e: Math.min(180, b.e)
  };
}

function ilAreaKey(b) {
  var r = function (v) {
    return Math.round(v * 2) / 2;
  };
  return [r(b.s), r(b.w), r(b.n), r(b.e)].join(",");
}

function ilLoad(d, force) {
  if (!WL[d.key] || !EMBED_OK || d.busy) return;
  var km = viewKm();
  if (d.maxKm && km > d.maxKm && !focusBox()) {
    d.st = "ZOOM IN TO LOAD";
    return;
  }
  var area = ilArea(),
    ak = d.byArea ? ilAreaKey(area) : "";
  if (!force && Date.now() - d.at < d.every && ak === d.area) return;
  d.busy = true;
  d.at = Date.now();
  d.area = ak;
  d.st = d.items.length ? d.st : "LOADING…";
  d.load(d, area)
    .then(function (list) {
      d.items = (list || []).filter(ilValid);
      d.st = d.status ? d.status(d) : d.items.length ? "" : d.none || "NONE ACTIVE";
      WSTAT[d.key] = "ok";
    })
    .catch(function () {
      WSTAT[d.key] = "x";
      d.st = nativeHttp() ? "OFFLINE" : "ANDROID APP ONLY";
    })
    .then(function () {
      d.busy = false;
      wstat();
    });
}

// Called from module 10 before this module has run, so it must cope with IL being undefined.
function ilStatus(key) {
  var d = IL && IL[key];
  if (!d || !WL[key]) return null;
  if (!EMBED_OK) return "APP";
  if (d.items.length && !d.st) return d.items.length.toLocaleString();
  return d.st || (d.items.length ? d.items.length.toLocaleString() : "…");
}

setInterval(function () {
  if (document.hidden) return;
  IL_ORDER.forEach(function (k) {
    ilLoad(IL[k], false);
  });
}, 15000);

function ilPoly(P, rings, fill, stroke) {
  ctx.beginPath();
  rings.forEach(function (ring) {
    var started = false;
    for (var i = 0; i < ring.length; i++) {
      var p = P(ring[i][0], ring[i][1]);
      if (p[2] <= 0) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(p[0], p[1]);
        started = true;
      } else ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
  });
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill("evenodd");
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function ilLine(P, pts, color) {
  ctx.beginPath();
  var started = false;
  for (var i = 0; i < pts.length; i++) {
    var p = P(pts[i][0], pts[i][1]);
    if (p[2] <= 0) {
      started = false;
      continue;
    }
    if (!started) {
      ctx.moveTo(p[0], p[1]);
      started = true;
    } else ctx.lineTo(p[0], p[1]);
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawInfoLayers(t, P) {
  if (!IL_ORDER) return;
  var km = viewKm(),
    labels = km < 300;
  ctx.save();
  ctx.font = "600 9.5px 'JetBrains Mono',monospace";
  ctx.textBaseline = "middle";
  IL_ORDER.forEach(function (k) {
    var d = IL[k];
    if (!WL[k]) return;
    if (d.draw) {
      d.draw(d, t, P);
      return;
    }
    if (!d.items.length || (d.drawKm && km > d.drawKm)) return;
    var shown = 0;
    for (var i = 0; i < d.items.length; i++) {
      var e = d.items[i];
      if (!focusHas(e.lat, e.lon)) continue;
      if (e.rings && km < (d.ringKm || 4000)) {
        ctx.lineWidth = 1.2;
        ilPoly(P, e.rings, e.fill || "rgba(255,80,40,.22)", okColor(e.color));
      }
      if (e.line && e.line.length > 1 && km < 300) ilLine(P, e.line, okColor(e.color));
      var p = P(e.lon, e.lat);
      if (p[2] <= 0 || p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > H + 20) continue;
      var c = okColor(e.color),
        s = e.size || 5;
      if (e.noMark) {
        screenPts.push([p[0], p[1], e]);
        continue;
      }
      ctx.fillStyle = "rgba(2,8,14,.85)";
      ctx.beginPath();
      ctx.moveTo(p[0], p[1] - s - 1.5);
      ctx.lineTo(p[0] + s + 1.5, p[1]);
      ctx.lineTo(p[0], p[1] + s + 1.5);
      ctx.lineTo(p[0] - s - 1.5, p[1]);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1] - s);
      ctx.lineTo(p[0] + s, p[1]);
      ctx.lineTo(p[0], p[1] + s);
      ctx.lineTo(p[0] - s, p[1]);
      ctx.closePath();
      ctx.fill();
      if ((labels || e.big) && e.label && shown < 120) {
        var tw = ctx.measureText(e.label).width;
        ctx.fillStyle = "rgba(2,8,14,.8)";
        ctx.fillRect(p[0] + s + 4, p[1] - 7, tw + 8, 14);
        ctx.fillStyle = c;
        ctx.fillText(e.label, p[0] + s + 8, p[1]);
        shown++;
      }
      screenPts.push([p[0], p[1], e]);
    }
  });
  ctx.restore();
}

// Called by entDossier for items of kind "info". Layers may fill extra rows on demand.
function ilRows(e) {
  var d = IL[e.layer];
  if (d && d.fill && !e.filled && !e.filling) {
    e.filling = true;
    d.fill(e)
      .catch(function () {
        e.rows = e.rows.concat([["LIVE DATA", "Not available right now"]]);
      })
      .then(function () {
        e.filling = false;
        e.filled = true;
        if (selected === e) entDossier(e);
      });
  }
  return e.rows.concat(e.filling ? [["LIVE DATA", "Loading…"]] : []);
}

function ilWhen(t) {
  return t ? new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";
}

// ---------- Hurricanes and tropical storms (National Hurricane Center) ----------
var HZ_CLASS = {
  HU: ["Hurricane", "#ff3b3b"],
  TS: ["Tropical storm", "#ff9a2e"],
  TD: ["Tropical depression", "#ffd84a"],
  STS: ["Subtropical storm", "#ff9a2e"],
  STD: ["Subtropical depression", "#ffd84a"],
  PTC: ["Potential tropical cyclone", "#c58bff"],
  PT: ["Post-tropical cyclone", "#9fb4c8"]
};

function hzCategory(kt) {
  var c = [64, 83, 96, 113, 137].filter(function (x) {
    return kt >= x;
  }).length;
  return c ? "Category " + c : "";
}

function hzCoord(num, txt) {
  if (typeof num === "number") return num;
  var m = /^(-?[\d.]+)\s*([NSEW])?/.exec(String(txt || ""));
  if (!m) return null;
  var v = parseFloat(m[1]);
  return m[2] === "S" || m[2] === "W" ? -v : v;
}

ilDef({
  key: "storm",
  label: "Hurricanes & tropical storms",
  color: "#ff9a2e",
  icon: "🌀",
  every: 10 * 60000,
  none: "NONE ACTIVE",
  load: function (d) {
    return getJSON("https://www.nhc.noaa.gov/CurrentStorms.json", 20000).then(function (j) {
      return (j.activeStorms || []).map(function (s) {
        var cl = HZ_CLASS[s.classification] || [s.classification || "Storm", d.color],
          kt = num(s.intensity),
          cat = kt ? hzCategory(kt) : "";
        return ilItem(d, {
          id: "storm:" + s.id,
          n: cl[0] + " " + (s.name || ""),
          label: (s.name || "").toUpperCase(),
          lat: hzCoord(s.latitudeNumeric, s.latitude),
          lon: hzCoord(s.longitudeNumeric, s.longitude),
          color: cl[1],
          size: 8,
          big: true,
          tag: (cat || cl[0]) + " · NHC",
          rows: [
            ["TYPE", cl[0] + (cat ? " · " + cat : "")],
            ["WINDS", kt ? kt + " kt · " + Math.round(kt * 1.151) + " mph" : "—"],
            ["PRESSURE", s.pressure ? s.pressure + " mb" : "—"],
            [
              "MOVING",
              s.movementDir != null && s.movementSpeed != null
                ? s.movementDir + "° at " + s.movementSpeed + " mph"
                : "—"
            ],
            ["UPDATED", ilWhen(Date.parse(s.lastUpdate))],
            ["SOURCE", "National Hurricane Center"]
          ]
        });
      });
    });
  }
});

// ---------- River flood gauges (NOAA National Water Prediction Service) ----------
var FL_CAT = {
  major: ["Major flooding", "#c32aff", 4],
  moderate: ["Moderate flooding", "#ff2e4d", 3],
  minor: ["Minor flooding", "#ff8a1f", 2],
  action: ["Near flood stage", "#ffd84a", 1],
  no_flooding: ["Normal", "#39d98a", 0]
};

function flLevel(s) {
  if (!s || s.primary == null || s.primary === -999) return null;
  return s.primary + " " + (s.primaryUnit || "");
}

ilDef({
  key: "flood",
  label: "River levels & flood gauges",
  color: "#4cc3ff",
  icon: "≋",
  every: 15 * 60000,
  maxKm: 1500,
  drawKm: 1500,
  byArea: true,
  load: function (d, b) {
    return getJSON(
      "https://api.water.noaa.gov/nwps/v1/gauges?bbox.xmin=" +
        b.w.toFixed(2) +
        "&bbox.ymin=" +
        b.s.toFixed(2) +
        "&bbox.xmax=" +
        b.e.toFixed(2) +
        "&bbox.ymax=" +
        b.n.toFixed(2) +
        "&srid=EPSG_4326",
      25000
    ).then(function (j) {
      return (j.gauges || []).map(function (g) {
        var st = g.status || {},
          ob = st.observed || {},
          fc = st.forecast || {},
          cat = FL_CAT[ob.floodCategory],
          fcat = FL_CAT[fc.floodCategory];
        return ilItem(d, {
          id: "flood:" + g.lid,
          n: g.name || g.lid,
          label: cat && cat[2] ? cat[0].toUpperCase() : "",
          lat: g.latitude,
          lon: g.longitude,
          color: cat ? cat[1] : "#7d93a8",
          size: cat && cat[2] ? 6 : 3.5,
          big: !!(cat && cat[2] >= 2),
          tag: (cat ? cat[0] : "River gauge") + " · NOAA",
          rows: [
            ["GAUGE", g.lid],
            ["LEVEL", flLevel(ob) || "No reading"],
            [
              "FLOW",
              ob.secondary != null && ob.secondary !== -999
                ? ob.secondary + " " + (ob.secondaryUnit || "")
                : "—"
            ],
            ["STATUS", cat ? cat[0] : "Not rated"],
            ["FORECAST", flLevel(fc) ? flLevel(fc) + (fcat ? " · " + fcat[0] : "") : "None issued"],
            ["READING", ob.validTime ? ago(Date.parse(ob.validTime)) : "—"],
            ["FORECAST OFFICE", (g.wfo && g.wfo.name) || "—"],
            ["SOURCE", "NOAA National Water Prediction Service"]
          ]
        });
      });
    });
  }
});

// ---------- Tide stations (NOAA CO-OPS); readings and predictions are fetched on tap ----------
var TIDE_API = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

function tideYmd(d) {
  return (
    d.getUTCFullYear() +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0")
  );
}

ilDef({
  key: "tide",
  label: "Tides & water levels",
  color: "#3fe0d0",
  icon: "∿",
  every: 24 * 3600000,
  drawKm: 1500,
  load: function (d) {
    if (d.items.length) return Promise.resolve(d.items);
    return getJSON(
      "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels",
      30000
    ).then(function (j) {
      return (j.stations || []).map(function (s) {
        return ilItem(d, {
          id: "tide:" + s.id,
          station: s.id,
          n: s.name + (s.state ? ", " + s.state : ""),
          label: "",
          lat: s.lat,
          lon: s.lng,
          size: 3.5,
          tag: "TIDE STATION · NOAA",
          rows: [
            ["STATION", s.id],
            ["SOURCE", "NOAA Tides & Currents"]
          ]
        });
      });
    });
  },
  fill: function (e) {
    var q =
        "&station=" +
        e.station +
        "&datum=MLLW&units=english&time_zone=gmt&format=json&application=OjosDeDios",
      now = new Date();
    return Promise.all([
      getJSON(TIDE_API + "?date=latest&product=water_level" + q, 15000).catch(function () {
        return null;
      }),
      getJSON(
        TIDE_API +
          "?begin_date=" +
          tideYmd(now) +
          "&range=48&product=predictions&interval=hilo" +
          q,
        15000
      ).catch(function () {
        return null;
      })
    ]).then(function (r) {
      var w = r[0] && r[0].data && r[0].data[0],
        nxt = ((r[1] && r[1].predictions) || []).filter(function (p) {
          return Date.parse(p.t.replace(" ", "T") + "Z") > Date.now();
        });
      var add = [];
      if (w)
        add.push([
          "WATER LEVEL",
          (+w.v).toFixed(2) +
            " ft above low water · " +
            ago(Date.parse(w.t.replace(" ", "T") + "Z"))
        ]);
      nxt.slice(0, 2).forEach(function (p) {
        add.push([
          p.type === "H" ? "NEXT HIGH" : "NEXT LOW",
          (+p.v).toFixed(1) + " ft · " + ilWhen(Date.parse(p.t.replace(" ", "T") + "Z"))
        ]);
      });
      if (!add.length) add.push(["LIVE DATA", "No reading published"]);
      e.rows = add.concat(e.rows);
    });
  }
});

// ---------- Tsunami messages (US National and Pacific Tsunami Warning Centers) ----------
var TS_LEVEL = [
  [/warning/i, "#ff2e4d", "Warning"],
  [/advisory/i, "#ff8a1f", "Advisory"],
  [/watch/i, "#ffd84a", "Watch"],
  [/./, "#4cc3ff", "Information statement"]
];

function tsParse(xml, src) {
  var doc = new DOMParser().parseFromString(xml, "application/xml"),
    feedTitle = (doc.querySelector("feed > title") || {}).textContent || "",
    out = [];
  Array.prototype.forEach.call(doc.getElementsByTagName("entry"), function (en) {
    var get = function (tag) {
        var x = en.getElementsByTagName(tag)[0];
        return x ? x.textContent.trim() : "";
      },
      lat = num(get("geo:lat")),
      lon = num(get("geo:long")),
      upd = Date.parse(get("updated")),
      lv = TS_LEVEL.filter(function (l) {
        return l[0].test(feedTitle);
      })[0];
    if (lat == null || lon == null || !(Date.now() - upd < 72 * 3600000)) return;
    out.push({
      lat: lat,
      lon: lon,
      n: get("title") || "Tsunami message",
      color: lv[1],
      tag: "TSUNAMI " + lv[2].toUpperCase(),
      label: lv[2].toUpperCase(),
      size: 7,
      big: true,
      rows: [
        ["MESSAGE", feedTitle || lv[2]],
        ["ISSUED", ilWhen(upd)],
        ["CENTER", src],
        ["SOURCE", "tsunami.gov"]
      ]
    });
  });
  return out;
}

ilDef({
  key: "tsunami",
  label: "Tsunami messages",
  color: "#4cc3ff",
  icon: "≈",
  every: 5 * 60000,
  none: "NONE IN 72 H",
  load: function (d) {
    var feeds = [
      ["https://www.tsunami.gov/events/xml/PAAQAtom.xml", "National Tsunami Warning Center"],
      ["https://www.tsunami.gov/events/xml/PHEBAtom.xml", "Pacific Tsunami Warning Center"]
    ];
    return Promise.all(
      feeds.map(function (f) {
        return netGet(f[0], 20000, null, true)
          .then(function (x) {
            return tsParse(x, f[1]);
          })
          .catch(function () {
            return null;
          });
      })
    ).then(function (r) {
      if (
        r.every(function (x) {
          return x === null;
        })
      )
        throw new Error("tsunami feeds unreachable");
      var all = [];
      r.forEach(function (x) {
        (x || []).forEach(function (o) {
          all.push(ilItem(d, o));
        });
      });
      return all;
    });
  }
});

// ---------- Wildfire perimeters (National Interagency Fire Center, WFIGS) ----------
function fireCentre(rings) {
  var r = rings[0] || [],
    x = 0,
    y = 0;
  r.forEach(function (p) {
    x += p[0];
    y += p[1];
  });
  return r.length ? [x / r.length, y / r.length] : [null, null];
}

ilDef({
  key: "fireperim",
  label: "Wildfire perimeters (US)",
  color: "#ff5a28",
  icon: "▱",
  every: 30 * 60000,
  drawKm: 4000,
  none: "NONE ACTIVE",
  load: function (d) {
    return getJSON(
      "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?where=1%3D1&outFields=poly_IncidentName,poly_GISAcres,attr_PercentContained,attr_FireDiscoveryDateTime&outSR=4326&maxAllowableOffset=0.005&geometryPrecision=4&f=geojson",
      40000
    ).then(function (j) {
      return (j.features || []).map(function (f) {
        var g = f.geometry || {},
          p = f.properties || {},
          rings =
            g.type === "Polygon"
              ? g.coordinates
              : g.type === "MultiPolygon"
                ? [].concat.apply([], g.coordinates)
                : [],
          c = fireCentre(rings),
          acres = num(p.poly_GISAcres),
          pct = num(p.attr_PercentContained);
        return ilItem(d, {
          id: "fire:" + p.poly_IncidentName + ":" + c.join(","),
          n: (p.poly_IncidentName || "Wildfire") + " Fire",
          label: (p.poly_IncidentName || "").toUpperCase(),
          lat: c[1],
          lon: c[0],
          rings: rings,
          size: 4.5,
          big: acres > 1000,
          tag: "WILDFIRE PERIMETER · NIFC",
          rows: [
            ["AREA", acres != null ? Math.round(acres).toLocaleString() + " acres" : "—"],
            ["CONTAINED", pct != null ? Math.round(pct) + "%" : "Not reported"],
            ["DISCOVERED", ilWhen(num(p.attr_FireDiscoveryDateTime))],
            ["SOURCE", "National Interagency Fire Center (WFIGS)"]
          ]
        });
      });
    });
  }
});

// ---------- Space weather: geomagnetic activity and the aurora forecast (NOAA SWPC) ----------
var KP_WORDS = [
  [9, "Extreme storm (G5)"],
  [8, "Severe storm (G4)"],
  [7, "Strong storm (G3)"],
  [6, "Moderate storm (G2)"],
  [5, "Minor storm (G1)"],
  [4, "Active"],
  [0, "Quiet"]
];

function kpWords(kp) {
  for (var i = 0; i < KP_WORDS.length; i++) if (kp >= KP_WORDS[i][0]) return KP_WORDS[i][1];
  return "Quiet";
}

ilDef({
  key: "space",
  label: "Space weather & aurora",
  color: "#7dff9a",
  icon: "☼",
  every: 15 * 60000,
  count: function () {
    return IL.space && IL.space.kp != null ? 1 : 0;
  },
  status: function (d) {
    return d.kp != null ? "KP " + d.kp.toFixed(1) + " · " + kpWords(d.kp).toUpperCase() : "";
  },
  load: function (d) {
    return Promise.all([
      getJSON("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", 20000),
      getJSON("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json", 30000).catch(
        function () {
          return null;
        }
      )
    ]).then(function (r) {
      var k = (r[0] || []).filter(function (x) {
        return x && x.Kp != null;
      });
      d.kp = k.length ? +k[k.length - 1].Kp : null;
      d.cells = [];
      ((r[1] && r[1].coordinates) || []).forEach(function (c) {
        if (c[2] >= 8) d.cells.push([c[0] > 180 ? c[0] - 360 : c[0], c[1], c[2]]);
      });
      return [];
    });
  },
  draw: function (d, t, P) {
    if (!d.cells || !d.cells.length) return;
    for (var i = 0; i < d.cells.length; i++) {
      var c = d.cells[i];
      if (!focusHas(c[1], c[0])) continue;
      var p = P(c[0], c[1]);
      if (p[2] <= 0 || p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > H + 10) continue;
      ctx.fillStyle = "rgba(90,255,140," + Math.min(0.5, c[2] / 60).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(p[0], p[1], 3.2, 0, 7);
      ctx.fill();
    }
  }
});

if (EMBED_OK)
  setTimeout(function () {
    IL_ORDER.forEach(function (k) {
      if (WL[k]) ilLoad(IL[k], true);
    });
  }, 1800);
