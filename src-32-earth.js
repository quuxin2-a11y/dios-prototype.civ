/**
 * @file Earth data layers.
 * NASA satellite views of the whole globe (yesterday's true colour, last night's lights, and the
 * Black Marble city lights) from NASA GIBS; smoke plumes and fire detections from NOAA's Hazard
 * Mapping System; and modelled air quality from Open-Meteo (Copernicus CAMS).
 *
 * Module 32 of 36. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- NASA satellite views (GIBS) ----------
// Each view replaces the globe imagery while it is on; only one can be on at a time.
// Tile matrix sets differ by product, so the deepest one that answers is found on first use.
var EO_GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/";

function eoDay(back) {
  return new Date(Date.now() - back * 864e5).toISOString().slice(0, 10);
}

var EO_VIEWS = {
  eo_today: {
    label: "NASA · Yesterday from space",
    color: "#8fd3ff",
    layer: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
    ext: "jpg",
    levels: [9, 8],
    dates: function () {
      return [eoDay(1), eoDay(2)];
    }
  },
  eo_dnb: {
    label: "NASA · Last night's lights",
    color: "#ffd84a",
    layer: "VIIRS_SNPP_DayNightBand_At_Sensor_Radiance",
    ext: "png",
    levels: [8, 7, 9],
    dates: function () {
      return [eoDay(1), eoDay(2)];
    }
  },
  eo_lights: {
    label: "NASA · City lights (Black Marble)",
    color: "#ffb02e",
    layer: "VIIRS_Black_Marble",
    ext: "png",
    levels: [8, 7, 9],
    dates: function () {
      return ["2016-01-01"];
    }
  }
};
var EO = { cur: null, want: null, order: Object.keys(EO_VIEWS) };

function eoUrl(v, date, lvl) {
  return function (z, x, y) {
    return (
      EO_GIBS +
      v.layer +
      "/default/" +
      date +
      "/GoogleMapsCompatible_Level" +
      lvl +
      "/" +
      z +
      "/" +
      y +
      "/" +
      x +
      "." +
      v.ext
    );
  };
}

// Find a date and tile matrix set that serve tiles, trying each pair in turn.
function eoProbe(v) {
  if (v.found) return Promise.resolve(v.found);
  var tries = [];
  v.dates().forEach(function (d) {
    v.levels.forEach(function (l) {
      tries.push([d, l]);
    });
  });
  var i = 0;
  var next = function () {
    var t = tries[i++];
    if (!t) return Promise.reject(new Error("no tiles"));
    return loadPix(eoUrl(v, t[0], t[1])(1, 0, 0))
      .then(function () {
        v.found = { date: t[0], lvl: t[1] };
        return v.found;
      })
      .catch(next);
  };
  return next();
}

// Called by styleSet so a chosen map style does not override a NASA view. styleSet also runs
// at start-up, before this module has loaded, so EO may not exist yet.
function earthKey() {
  return typeof EO === "object" && EO ? EO.cur : null;
}

function eoApply(k) {
  EO.want = k;
  if (!k) {
    EO.cur = null;
    styleSet(SET.style || "sat", true);
    return;
  }
  var v = EO_VIEWS[k];
  WSTAT[k] = "";
  eoProbe(v)
    .then(function (f) {
      if (EO.want !== k) return;
      EO.cur = k;
      if (!WL.img) WL.img = true;
      imgSource(eoUrl(v, f.date, f.lvl), f.lvl, "#000000");
      WSTAT[k] = "ok";
      wstat();
    })
    .catch(function () {
      WSTAT[k] = "x";
      WL[k] = false;
      ls("ojos-layers", WL);
      wstat();
    });
}

EO.order.forEach(function (k) {
  if (WL[k] === undefined) WL[k] = false;
  WLDEF.push([k, EO_VIEWS[k].label, EO_VIEWS[k].color, null, null]);
});

// Keep exactly one NASA view on: the one turned on most recently wins.
function eoTick() {
  var on = EO.order.filter(function (k) {
    return WL[k];
  });
  if (on.length > 1) {
    var keep =
      on.filter(function (k) {
        return k !== EO.want;
      })[0] || on[0];
    on.forEach(function (k) {
      if (k !== keep) WL[k] = false;
    });
    ls("ojos-layers", WL);
    on = [keep];
    wstat();
  }
  var k = on[0] || null;
  if (k !== EO.want) eoApply(k);
}
setInterval(eoTick, 400);

// ---------- Smoke plumes (NOAA Hazard Mapping System) ----------
var HMS = "https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/";

function hmsDay(back) {
  var d = new Date(Date.now() - back * 864e5),
    y = d.getUTCFullYear(),
    m = String(d.getUTCMonth() + 1).padStart(2, "0"),
    dd = String(d.getUTCDate()).padStart(2, "0");
  return { y: y, m: m, ymd: y + m + dd };
}

// Fetch today's file, or yesterday's if today's analysis is not out yet.
function hmsGet(path) {
  var tryDay = function (back) {
    var d = hmsDay(back);
    return netGet(HMS + path(d), 40000, null, true);
  };
  return tryDay(0).catch(function () {
    return tryDay(1);
  });
}

// HMS times look like "2026319 1300UTC": year, day of year, hours and minutes.
function hmsTime(yd, hm) {
  var m = /^(\d{4})(\d{3})$/.exec(String(yd || "").trim()),
    t = /^(\d{2})(\d{2})/.exec(String(hm || "").trim());
  if (!m) return null;
  return Date.UTC(+m[1], 0, +m[2], t ? +t[1] : 0, t ? +t[2] : 0);
}

var SMOKE = {
  Light: ["#9fe870", "rgba(159,232,112,.16)"],
  Medium: ["#ffd84a", "rgba(255,216,74,.22)"],
  Heavy: ["#ff4d5e", "rgba(255,77,94,.28)"]
};

function smokeParse(xml) {
  var doc = new DOMParser().parseFromString(xml, "text/xml"),
    pms = doc.getElementsByTagName("Placemark"),
    out = [];
  for (var i = 0; i < pms.length; i++) {
    var pm = pms[i],
      desc = (pm.getElementsByTagName("description")[0] || {}).textContent || "",
      field = function (k) {
        var m = new RegExp(k + ":\\s*([^<\\n]+)").exec(desc);
        return m ? m[1].trim() : "";
      },
      rings = [];
    var cs = pm.getElementsByTagName("coordinates");
    for (var j = 0; j < cs.length; j++) {
      var r = cs[j].textContent
        .trim()
        .split(/\s+/)
        .map(function (t) {
          var p = t.split(",");
          return [parseFloat(p[0]), parseFloat(p[1])];
        })
        .filter(function (p) {
          return isFinite(p[0]) && isFinite(p[1]);
        });
      if (r.length > 2) rings.push(r);
    }
    if (!rings.length) continue;
    var st = field("Start Time").split(" "),
      en = field("End Time").split(" ");
    out.push({
      density: field("Density") || "Light",
      sat: field("Satellite"),
      start: hmsTime(st[0], st[1]),
      end: hmsTime(en[0], en[1]),
      rings: rings
    });
  }
  return out;
}

ilDef({
  key: "smoke",
  label: "Wildfire smoke",
  color: "#ffd84a",
  icon: "🌫",
  every: 60 * 60000,
  drawKm: 12000,
  ringKm: 12000,
  none: "NONE ANALYSED TODAY",
  load: function (d) {
    return hmsGet(function (x) {
      return "Smoke_Polygons/KML/" + x.y + "/" + x.m + "/hms_smoke" + x.ymd + ".kml";
    }).then(function (xml) {
      return smokeParse(xml).map(function (p, i) {
        var c = SMOKE[p.density] || SMOKE.Light,
          b = ringsBox(p.rings);
        return ilItem(d, {
          id: "smoke:" + i,
          n: p.density + " smoke",
          label: "",
          lat: (b.s + b.n) / 2,
          lon: (b.w + b.e) / 2,
          rings: p.rings,
          fill: c[1],
          color: c[0],
          noMark: true,
          tag: p.density + " smoke · NOAA HMS",
          rows: [
            ["DENSITY", p.density],
            ["SEEN", p.start ? ilWhen(p.start) + " to " + ilWhen(p.end) : "—"],
            ["SATELLITE", p.sat || "—"],
            ["SOURCE", "NOAA Hazard Mapping System (analyst-drawn)"]
          ]
        });
      });
    });
  }
});

// ---------- Fire detections (NOAA Hazard Mapping System) ----------
// The file lists every detection from every satellite pass; nearby repeats are merged.
function firesParse(text) {
  var cells = {};
  String(text || "")
    .split(/\r?\n/)
    .forEach(function (ln) {
      var f = ln.split(",").map(function (x) {
          return x.trim();
        }),
        lon = parseFloat(f[0]),
        lat = parseFloat(f[1]);
      if (!isFinite(lon) || !isFinite(lat)) return;
      var k = Math.round(lat * 20) + ":" + Math.round(lon * 20),
        frp = parseFloat(f[7]),
        at = hmsTime(f[2], f[3]),
        c = cells[k];
      if (!c) c = cells[k] = { lat: lat, lon: lon, n: 0, frp: null, first: at, last: at, sats: [] };
      c.n++;
      if (isFinite(frp) && frp >= 0) c.frp = Math.max(c.frp || 0, frp);
      if (at && (!c.first || at < c.first)) c.first = at;
      if (at && (!c.last || at > c.last)) c.last = at;
      if (f[4] && c.sats.indexOf(f[4]) < 0) c.sats.push(f[4]);
    });
  return Object.keys(cells).map(function (k) {
    return cells[k];
  });
}

function fireColor(frp) {
  if (frp == null) return "#ff9a2e";
  if (frp >= 100) return "#ff2e4d";
  if (frp >= 20) return "#ff6a2e";
  return "#ffb02e";
}

ilDef({
  key: "firehot",
  label: "Fire detections",
  color: "#ff6a2e",
  icon: "🔥",
  every: 30 * 60000,
  drawKm: 4000,
  none: "NONE TODAY",
  load: function (d) {
    return hmsGet(function (x) {
      return "Fire_Points/Text/" + x.y + "/" + x.m + "/hms_fire" + x.ymd + ".txt";
    }).then(function (t) {
      return firesParse(t)
        .slice(0, 12000)
        .map(function (c) {
          return ilItem(d, {
            id: "fire:" + c.lat.toFixed(2) + "," + c.lon.toFixed(2),
            n: "Fire detection",
            label: "",
            lat: c.lat,
            lon: c.lon,
            color: fireColor(c.frp),
            size: c.frp >= 100 ? 4.5 : 3,
            tag: "Fire detection · NOAA HMS",
            rows: [
              ["DETECTIONS", c.n + " today"],
              ["FIRE POWER", c.frp != null ? c.frp.toFixed(1) + " MW" : "Not measured"],
              ["FIRST SEEN", c.first ? ilWhen(c.first) : "—"],
              ["LAST SEEN", c.last ? ilWhen(c.last) : "—"],
              ["SATELLITES", c.sats.join(", ") || "—"],
              ["NOTE", "A heat source seen from space; not every detection is a wildfire"],
              ["SOURCE", "NOAA Hazard Mapping System"]
            ]
          });
        });
    });
  }
});

// ---------- Air quality (Open-Meteo, modelled by Copernicus CAMS) ----------
var AQ_BANDS = [
  [50, "Good", "#39d98a"],
  [100, "Moderate", "#ffd84a"],
  [150, "Unhealthy for sensitive groups", "#ff9a2e"],
  [200, "Unhealthy", "#ff4d5e"],
  [300, "Very unhealthy", "#b04dff"],
  [Infinity, "Hazardous", "#8b1a3a"]
];

function aqBand(v) {
  for (var i = 0; i < AQ_BANDS.length; i++) if (v <= AQ_BANDS[i][0]) return AQ_BANDS[i];
  return AQ_BANDS[AQ_BANDS.length - 1];
}

// A grid of n by n points across the area.
function aqGrid(b, n) {
  var out = [];
  for (var i = 0; i < n; i++)
    for (var j = 0; j < n; j++)
      out.push([
        +(b.s + ((i + 0.5) * (b.n - b.s)) / n).toFixed(2),
        +(b.w + ((j + 0.5) * (b.e - b.w)) / n).toFixed(2)
      ]);
  return out;
}

function aqUnit(v, u) {
  return v == null ? "—" : Math.round(v) + " " + u;
}

ilDef({
  key: "airq",
  label: "Air quality",
  color: "#39d98a",
  icon: "💨",
  every: 30 * 60000,
  maxKm: 5000,
  drawKm: 5000,
  byArea: true,
  load: function (d, b) {
    var pts = aqGrid(b, 6);
    return getJSON(
      "https://air-quality-api.open-meteo.com/v1/air-quality?current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide&latitude=" +
        pts
          .map(function (p) {
            return p[0];
          })
          .join(",") +
        "&longitude=" +
        pts
          .map(function (p) {
            return p[1];
          })
          .join(","),
      25000
    ).then(function (j) {
      return [].concat(j || []).reduce(function (out, r, i) {
        var c = (r && r.current) || {},
          v = num(c.us_aqi),
          p = pts[i];
        if (v == null || !p) return out;
        var band = aqBand(v);
        out.push(
          ilItem(d, {
            id: "airq:" + p[0] + "," + p[1],
            n: "Air quality · " + band[1],
            label: "AQI " + Math.round(v),
            lat: p[0],
            lon: p[1],
            color: band[2],
            size: 6,
            big: true,
            tag: "US AQI " + Math.round(v) + " · modelled",
            rows: [
              ["US AQI", Math.round(v) + " · " + band[1]],
              ["PM2.5", aqUnit(c.pm2_5, "µg/m³")],
              ["PM10", aqUnit(c.pm10, "µg/m³")],
              ["OZONE", aqUnit(c.ozone, "µg/m³")],
              ["NITROGEN DIOXIDE", aqUnit(c.nitrogen_dioxide, "µg/m³")],
              ["NOTE", "Model estimate for this grid point, not a ground monitor"],
              ["SOURCE", "Open-Meteo (Copernicus CAMS)"]
            ]
          })
        );
        return out;
      }, []);
    });
  }
});
