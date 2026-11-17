/**
 * @file Undersea cables, communication towers and wind farms, and the clear globe look.
 * Submarine cable routes and landing points with owners, length and service date on tap
 * (TeleGeography); communication towers and masts with their operators (OpenStreetMap); and
 * wind farms grouped from turbine records (USGS US Wind Turbine Database, and OpenStreetMap
 * outside the US). Also switches existing installs to the clear look once.
 *
 * Module 36 of 44. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- One-time move to the clear look ----------
// Turns on cables, full daylight imagery and every camera as a point, once; anything the user
// changes afterwards stays.
(function () {
  if (SET.lookV >= 1) return;
  SET.lookV = 1;
  WL.night = false;
  WL.cables = true;
  WL.img = true;
  WL.dots = true;
  setSave();
  ls("ojos-layers", WL);
})();

// ---------- Undersea cables (TeleGeography) ----------
var CB_API = "https://www.submarinecablemap.com/api/v3/";

// Cable routes: one item per cable with its line parts; the item sits at the label point.
function cableItems(d, gj) {
  var by = {};
  ((gj && gj.features) || []).forEach(function (f) {
    var p = f.properties || {},
      g = f.geometry || {},
      parts =
        g.type === "MultiLineString"
          ? g.coordinates
          : g.type === "LineString"
            ? [g.coordinates]
            : [];
    if (!p.id || !parts.length) return;
    var e = by[p.id];
    if (!e) {
      var lp = p.coordinates || (parts[0] && parts[0][Math.floor(parts[0].length / 2)]) || [];
      e = by[p.id] = ilItem(d, {
        id: "cable:" + p.id,
        cable: p.id,
        n: p.name || p.id,
        label: "",
        lat: num(lp[1]),
        lon: num(lp[0]),
        color: /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : "#4cc3ff",
        parts: [],
        tag: "Undersea cable · TeleGeography",
        links: [
          [
            "Cable page on TeleGeography",
            "https://www.submarinecablemap.com/submarine-cable/" + encodeURIComponent(p.id)
          ]
        ],
        rows: [["SOURCE", "TeleGeography Submarine Cable Map (CC BY-NC-SA)"]]
      });
    }
    parts.forEach(function (pt) {
      if (pt && pt.length > 1) e.parts.push(pt);
    });
  });
  return Object.keys(by).map(function (k) {
    return by[k];
  });
}

// Rows for one cable from its detail record.
function cableRows(j) {
  var lps = (j.landing_points || []).map(function (l) {
    return l.name;
  });
  return [
    [
      "WHAT IT DOES",
      "Carries internet, phone and data traffic between " +
        (lps.length ? lps.length + " landing points" : "countries")
    ],
    ["OWNED BY", j.owners || "—"],
    ["BUILT BY", j.suppliers || "—"],
    ["LENGTH", j.length || "—"],
    [
      "IN SERVICE",
      j.is_planned
        ? "Planned · " + (j.rfs || "date to be set")
        : j.rfs || (j.rfs_year ? String(j.rfs_year) : "—")
    ],
    [
      "LANDS AT",
      lps.slice(0, 12).join("; ") +
        (lps.length > 12 ? " and " + (lps.length - 12) + " more" : "") || "—"
    ],
    ["SOURCE", "TeleGeography Submarine Cable Map (CC BY-NC-SA)"]
  ];
}

// Draw each cable as a thin coloured line; leave tap points along the route.
function cableDraw(d, t, P) {
  if (!d.items.length) return;
  var km = viewKm(),
    every = km > 6000 ? 6 : km > 1500 ? 3 : 1;
  ctx.save();
  ctx.lineWidth = km > 6000 ? 1.1 : km > 1500 ? 1.5 : 2.2;
  ctx.globalAlpha = 0.85;
  for (var i = 0; i < d.items.length; i++) {
    var e = d.items[i];
    ctx.strokeStyle = e.color;
    ctx.beginPath();
    for (var k = 0; k < e.parts.length; k++) {
      var pt = e.parts[k],
        on = false;
      for (var m = 0; m < pt.length; m++) {
        var p = P(pt[m][0], pt[m][1]);
        if (p[2] <= 0) {
          on = false;
          continue;
        }
        if (on) ctx.lineTo(p[0], p[1]);
        else ctx.moveTo(p[0], p[1]);
        on = true;
        if (m % every === 0 && p[0] > 0 && p[0] < W && p[1] > 0 && p[1] < H)
          screenPts.push([p[0], p[1], e]);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

ilDef({
  key: "cables",
  label: "Undersea cables",
  color: "#4cc3ff",
  icon: "〰",
  every: 24 * 3600000,
  draw: cableDraw,
  load: function (d) {
    return getJSON(CB_API + "cable/cable-geo.json", 40000).then(function (gj) {
      return cableItems(d, gj);
    });
  },
  fill: function (e) {
    return getJSON(CB_API + "cable/" + encodeURIComponent(e.cable) + ".json", 20000).then(
      function (j) {
        e.rows = cableRows(j || {});
        if (j && j.url) {
          var u = safeUrl(j.url);
          if (/^https?:\/\//.test(u)) e.links = e.links.concat([["Operator website", u]]);
        }
      }
    );
  }
});

// ---------- Communication towers (OpenStreetMap) ----------
osmLayer({
  key: "towers",
  label: "Cell & radio towers",
  color: "#ff6ad5",
  icon: "📡",
  tag: "Communication tower · OpenStreetMap",
  unnamed: "Communication tower",
  filter: '["tower:type"="communication"]',
  maxKm: 80,
  rows: function (t) {
    var uses = [
      ["communication:mobile_phone", "Mobile phone"],
      ["communication:radio", "Radio"],
      ["communication:television", "Television"],
      ["communication:microwave", "Microwave link"],
      ["communication:amateur_radio", "Amateur radio"]
    ]
      .filter(function (u) {
        return t[u[0]] && t[u[0]] !== "no";
      })
      .map(function (u) {
        return u[1];
      });
    return [
      ["USED FOR", uses.join(", ") || "Communications"],
      ["CARRIERS", t["communication:mobile_phone:operator"] || t.network || "—"],
      ["STRUCTURE", t.man_made ? tfWords(t.man_made) : "—"],
      ["HEIGHT", t.height ? t.height + " m" : "—"]
    ];
  }
});

// ---------- Wind farms (USGS USWTDB in the US, OpenStreetMap elsewhere) ----------
// Turbines are grouped by project so each wind farm is one point.
function windFarms(d, feats) {
  var by = {};
  (feats || []).forEach(function (f) {
    var a = f.attributes || {},
      g = f.geometry || {},
      k = a.p_name || "Unnamed project";
    if (num(g.y) == null) return;
    var w = (by[k] = by[k] || { a: a, n: 0, lat: 0, lon: 0, models: {} });
    w.n++;
    w.lat += g.y;
    w.lon += g.x;
    if (a.t_manu) w.models[a.t_manu + (a.t_model ? " " + a.t_model : "")] = 1;
  });
  return Object.keys(by).map(function (k) {
    var w = by[k],
      a = w.a,
      mw = num(a.p_cap);
    return ilItem(d, {
      id: "wind:" + k,
      n: k,
      label: mw && mw >= 100 ? k.toUpperCase() : "",
      lat: w.lat / w.n,
      lon: w.lon / w.n,
      size: mw >= 200 ? 6.5 : mw >= 50 ? 5 : 4,
      tag: (mw ? Math.round(mw) + " MW" : "Wind farm") + " · USGS",
      rows: [
        [
          "TURBINES",
          (a.p_tnum || w.n) + (a.p_tnum && a.p_tnum !== w.n ? " (" + w.n + " in view)" : "")
        ],
        ["CAPACITY", mw ? Math.round(mw).toLocaleString() + " MW" : "—"],
        ["ONLINE SINCE", a.p_year ? String(a.p_year) : "—"],
        ["TURBINE MODELS", Object.keys(w.models).slice(0, 3).join(", ") || "—"],
        ["OFFSHORE", a.t_offshore === 1 ? "Yes" : "No"],
        ["STATE", [a.t_county, a.t_state].filter(Boolean).join(", ") || "—"],
        ["SOURCE", "U.S. Wind Turbine Database (USGS, LBNL, ACP)"]
      ]
    });
  });
}

function windOsm(d, j) {
  return ((j && j.elements) || []).map(function (x) {
    var t = x.tags || {},
      c = x.center || x;
    return ilItem(d, {
      id: "windosm:" + x.type + x.id,
      n: t.name || "Wind farm",
      label: "",
      lat: num(c.lat),
      lon: num(c.lon),
      size: 5,
      tag: "Wind farm · OpenStreetMap",
      rows: [
        ["OUTPUT", plantOutput(t["plant:output:electricity"])],
        ["OPERATOR", t.operator || "—"],
        ["SOURCE", "OpenStreetMap contributors"]
      ]
    });
  });
}

ilDef({
  key: "windfarm",
  label: "Wind farms",
  color: "#7fe3ff",
  icon: "🌬",
  every: 24 * 3600000,
  maxKm: 800,
  drawKm: 800,
  byArea: true,
  none: "NONE HERE",
  load: function (d, b) {
    var env = [b.w, b.s, b.e, b.n]
        .map(function (v) {
          return v.toFixed(3);
        })
        .join(","),
      us =
        b.s < 72 && b.n > 17 && b.w < -64 && b.e > -180
          ? getJSON(
              "https://energy.usgs.gov/arcgis/rest/services/Hosted/uswtdbDyn/FeatureServer/0/query?where=1%3D1&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&resultRecordCount=2000&f=json&outFields=p_name,p_year,p_tnum,p_cap,t_manu,t_model,t_state,t_county,t_offshore&geometry=" +
                env,
              30000
            )
              .then(function (j) {
                return windFarms(d, j.features);
              })
              .catch(function () {
                return [];
              })
          : Promise.resolve([]),
      osm = overpassGet(
        '[out:json][timeout:25];nwr["power"="plant"]["plant:source"="wind"](' +
          [b.s, b.w, b.n, b.e]
            .map(function (v) {
              return v.toFixed(3);
            })
            .join(",") +
          ");out center tags 800;",
        30000
      )
        .then(function (j) {
          return windOsm(d, j);
        })
        .catch(function () {
          return [];
        });
    return Promise.all([us, osm]).then(function (r) {
      // Inside the US the USGS record is used; OpenStreetMap fills in the rest of the world.
      var usItems = r[0];
      var rest = r[1].filter(function (e) {
        return !usItems.length || !(e.lat > 24 && e.lat < 50 && e.lon > -125 && e.lon < -66);
      });
      return usItems.concat(rest);
    });
  }
});
