/**
 * @file Dark globe: the start-up view.
 * A dark vector globe drawn by MapLibre on the graphics chip (the same engine as the 3D view in
 * module 10), styled for reading data: deep navy land and sea, glowing country borders, quiet
 * state lines, and names that appear as you zoom. Cameras, aircraft, ships, every data layer and
 * the undersea cables are GPU layers on top, so the map stays smooth with 100,000+ points.
 * Map data: OpenStreetMap via OpenFreeMap; the credit sits behind the map's ⓘ button.
 *
 * Module 41 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

var OPS_TILES = "https://tiles.openfreemap.org/",
  OPS_FONT = ["Noto Sans Regular"];

// Label text: English where mapped, otherwise the local name.
var OPS_NAME = ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];

function opsStyle() {
  var label = function (id, layer, filter, min, size, color, extra) {
    var l = {
      id: id,
      type: "symbol",
      source: "omt",
      "source-layer": layer,
      minzoom: min,
      layout: {
        "text-field": OPS_NAME,
        "text-font": OPS_FONT,
        "text-size": size,
        "text-max-width": 8
      },
      paint: {
        "text-color": color,
        "text-halo-color": "#02050a",
        "text-halo-width": 1.4,
        "text-halo-blur": 0.6
      }
    };
    if (filter) l.filter = filter;
    for (var k in extra || {}) l.layout[k] = extra[k];
    return l;
  };
  var road = function (id, classes, min, color, w) {
    return {
      id: id,
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      minzoom: min,
      filter: ["in", ["get", "class"], ["literal", classes]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": color,
        "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], min, w[0], 18, w[1]],
        // The photos show the streets close in, so the drawn roads step back.
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 13, 1, 15, 0.3]
      }
    };
  };
  var land2 = ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]];
  return {
    version: 8,
    glyphs: OPS_TILES + "fonts/{fontstack}/{range}.pbf",
    // No sky or atmosphere layer: on some phone graphics chips it flashed the whole screen.
    projection: { type: displayMode() === "globe" ? "globe" : "mercator" },
    sources: {
      omt: {
        type: "vector",
        url: OPS_TILES + "planet",
        attribution: "© OpenStreetMap · OpenFreeMap"
      },
      // Aerial photos that fade in as you zoom into a city (credit behind the map's ⓘ).
      photo: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        ],
        tileSize: 256,
        minzoom: 10,
        maxzoom: 19,
        attribution: "Imagery © Esri, Maxar, Earthstar Geographics"
      }
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0a121b" } },
      {
        id: "landcover",
        type: "fill",
        source: "omt",
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["wood", "forest", "grass", "farmland"]]],
        paint: { "fill-color": "#0c1a17", "fill-opacity": 0.55 }
      },
      {
        id: "landuse",
        type: "fill",
        source: "omt",
        "source-layer": "landuse",
        minzoom: 8,
        filter: ["in", ["get", "class"], ["literal", ["residential", "commercial", "industrial"]]],
        paint: { "fill-color": "#0f1923", "fill-opacity": 0.8 }
      },
      {
        id: "water",
        type: "fill",
        source: "omt",
        "source-layer": "water",
        paint: { "fill-color": "#040a12" }
      },
      {
        id: "waterway",
        type: "line",
        source: "omt",
        "source-layer": "waterway",
        minzoom: 7,
        paint: { "line-color": "#0a2236", "line-width": 1 }
      },
      {
        id: "photo",
        type: "raster",
        source: "photo",
        minzoom: 10.5,
        paint: {
          "raster-opacity": ["interpolate", ["linear"], ["zoom"], 10.5, 0, 13.5, 0.92],
          "raster-brightness-max": 0.86,
          "raster-saturation": -0.12,
          "raster-fade-duration": 200
        }
      },
      road("road-minor", ["minor", "service", "tertiary"], 12, "#132634", [0.4, 6]),
      road("road-main", ["primary", "secondary"], 8, "#1a3446", [0.5, 9]),
      road("road-major", ["motorway", "trunk"], 5, "#24475e", [0.6, 12]),
      {
        id: "building",
        type: "fill-extrusion",
        source: "omt",
        "source-layer": "building",
        minzoom: 14,
        paint: {
          // Dark blocks at first, then light 3D buildings over the photos as you get close.
          "fill-extrusion-color": [
            "interpolate",
            ["linear"],
            ["zoom"],
            14,
            "#1d2c3a",
            16,
            "#b9c4d0"
          ],
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["zoom"],
            14,
            0,
            14.6,
            ["coalesce", ["get", "render_height"], 8]
          ],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-vertical-gradient": true,
          "fill-extrusion-opacity": 0.9
        }
      },
      {
        id: "states",
        type: "line",
        source: "omt",
        "source-layer": "boundary",
        minzoom: 2.5,
        filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
        paint: {
          "line-color": "#2c6f8c",
          "line-width": 0.7,
          "line-opacity": 0.7,
          "line-dasharray": [3, 2]
        }
      },
      {
        id: "borders-glow",
        type: "line",
        source: "omt",
        "source-layer": "boundary",
        filter: land2,
        paint: { "line-color": "#36c6ff", "line-width": 5, "line-blur": 4, "line-opacity": 0.35 }
      },
      {
        id: "borders",
        type: "line",
        source: "omt",
        "source-layer": "boundary",
        filter: land2,
        paint: { "line-color": "#8fe6ff", "line-width": 1.1, "line-opacity": 0.9 }
      },
      label("water-name", "water_name", null, 3, 11, "#2f6f96"),
      label("road-name", "transportation_name", null, 13, 11, "#8fb0c4", {
        "symbol-placement": "line",
        "text-max-width": 20
      }),
      label(
        "place-minor",
        "place",
        ["in", ["get", "class"], ["literal", ["suburb", "neighbourhood", "quarter", "village"]]],
        11,
        11,
        "#9ab7c9"
      ),
      label("place-town", "place", ["==", ["get", "class"], "town"], 7, 12, "#c2d8e6"),
      label(
        "place-city",
        "place",
        ["==", ["get", "class"], "city"],
        3,
        ["interpolate", ["linear"], ["zoom"], 3, 11, 10, 17],
        "#eef7fc"
      ),
      label("place-state", "place", ["==", ["get", "class"], "state"], 3.5, 10, "#6fa3c2", {
        "text-transform": "uppercase",
        "text-letter-spacing": 0.15
      }),
      label(
        "place-country",
        "place",
        ["==", ["get", "class"], "country"],
        1,
        ["interpolate", ["linear"], ["zoom"], 1, 10, 5, 15],
        "#dff4ff",
        { "text-transform": "uppercase", "text-letter-spacing": 0.2 }
      )
    ]
  };
}

// ---------- Data layers on the dark globe ----------
// Every switched-on data layer as GPU features: points, area outlines and cable routes.
function t3InfoKey() {
  return (
    IL_ORDER.filter(function (k) {
      return WL[k] && IL[k].items.length;
    })
      .map(function (k) {
        return k + IL[k].items.length + ":" + IL[k].at;
      })
      .join("|") + (FOC && FOC.areas ? FOC.areas.length : "")
  );
}

function t3InfoData() {
  var pts = [],
    shapes = [],
    lines = [],
    n = 0;
  T3.info = [];
  IL_ORDER.forEach(function (k) {
    var d = IL[k];
    if (!WL[k]) return;
    d.items.forEach(function (e) {
      if (n > 60000 || !ilValid(e) || !focusHas(e.lat, e.lon)) return;
      var i = T3.info.length,
        col = okColor(e.color);
      T3.info.push(e);
      n++;
      if (k === "cables" && e.parts) {
        e.parts.forEach(function (pt) {
          if (pt.length > 1)
            lines.push({
              type: "Feature",
              geometry: { type: "LineString", coordinates: pt },
              properties: { i: i, c: col }
            });
        });
        return;
      }
      if (Array.isArray(e.rings) && e.rings.length)
        shapes.push({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: e.rings },
          properties: { i: i, c: col }
        });
      if (!e.noMark)
        pts.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [e.lon, e.lat] },
          properties: { i: i, c: col, s: e.size || 5 }
        });
    });
  });
  var fc = function (f) {
    return { type: "FeatureCollection", features: f };
  };
  return { pts: fc(pts), shapes: fc(shapes), lines: fc(lines) };
}

function t3Info() {
  var m = T3.map;
  if (!m || !T3.ready) return;
  var key = t3InfoKey(),
    now = Date.now();
  if (key === T3.ik) return;
  // Like the cameras: at most every 3 s, and never while the map is moving.
  if (T3.ik != null && (now - (T3.infoT || 0) < 3000 || (m.isMoving && m.isMoving()))) return;
  T3.infoT = now;
  T3.ik = key;
  var d = t3InfoData();
  if (m.getSource("info")) {
    m.getSource("info").setData(d.pts);
    m.getSource("infoshape").setData(d.shapes);
    m.getSource("infoline").setData(d.lines);
    return;
  }
  m.addSource("infoshape", { type: "geojson", data: d.shapes });
  m.addSource("infoline", { type: "geojson", data: d.lines });
  m.addSource("info", { type: "geojson", data: d.pts });
  var first = m.getLayer("cams") ? "camglow" : undefined;
  m.addLayer(
    {
      id: "infoshape",
      type: "fill",
      source: "infoshape",
      paint: {
        "fill-color": ["get", "c"],
        "fill-opacity": 0.16,
        "fill-outline-color": ["get", "c"]
      }
    },
    first
  );
  m.addLayer(
    {
      id: "infoline",
      type: "line",
      source: "infoline",
      layout: { "line-cap": "round" },
      paint: {
        "line-color": ["get", "c"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1, 8, 2.4],
        "line-opacity": 0.85
      }
    },
    first
  );
  m.addLayer({
    id: "info",
    type: "circle",
    source: "info",
    paint: {
      "circle-color": ["get", "c"],
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        1,
        ["*", ["get", "s"], 0.45],
        8,
        ["*", ["get", "s"], 0.9],
        14,
        ["*", ["get", "s"], 1.4]
      ],
      "circle-stroke-color": "#02050a",
      "circle-stroke-width": 1
    }
  });
  var open = function (e) {
    var f = e.features && e.features[0],
      it = f && T3.info[f.properties.i];
    if (it) {
      select(it);
      target = null;
    }
  };
  ["info", "infoline", "infoshape"].forEach(function (id) {
    m.on("click", id, function (e) {
      // Cameras and aircraft sit on top; let their own taps win.
      if (
        m.queryRenderedFeatures(e.point, { layers: ["cams", "world"].filter(m.getLayer.bind(m)) })
          .length
      )
        return;
      if (id !== "info" && m.queryRenderedFeatures(e.point, { layers: ["info"] }).length) return;
      open(e);
    });
  });
  ["info", "infoline", "cams", "world"].forEach(function (id) {
    if (!m.getLayer(id)) return;
    m.on("mouseenter", id, function () {
      m.getCanvas().style.cursor = "pointer";
    });
    m.on("mouseleave", id, function () {
      m.getCanvas().style.cursor = "";
    });
  });
}

// ---------- Display: how the map is drawn ----------
// "globe" (default): the map engine's round globe.
// "hybrid" (Smooth globe): from space, the app's own globe drawn in plain 2D; zooming in to a
//   region switches to the flat map, and zooming back out returns to the globe. For phones whose
//   graphics chip draws the map engine's globe with flicker and lines.
// "flat": the flat map at every zoom.
// Android phones start on Smooth globe (some graphics chips, such as the Pixel 10's PowerVR,
// flicker on the map engine's globe), and so does any phone with that chip; a choice made in
// Settings always wins.
var HYB_IN_KM = 2200, // the 2D globe hands over to the flat map below this view width
  HYB_OUT_ZOOM = 3.1, // and the flat map hands back to the globe below this zoom
  HYB_HOLD_MS = 1500; // no switch back within this long after a switch

function displayFlicky() {
  return /PowerVR|Imagination|\bIMG\b/i.test(gpuName());
}

function displayAndroid() {
  return /Android/i.test(window.__ODD_UA || navigator.userAgent || "");
}

function displayMode() {
  var d = SET.display === "simple" ? "hybrid" : SET.display;
  if (/^(globe|hybrid|flat)$/.test(d || "")) return d;
  return displayAndroid() || displayFlicky() ? "hybrid" : "globe";
}

// True while the app's own globe is standing in for the map engine in Smooth globe.
function hybCanvas() {
  return typeof RW === "object" && RW.on && RW.mode === "canvas" && displayMode() === "hybrid";
}

// Zooming in on the 2D globe hands over to the flat map at the same place.
setInterval(function () {
  if (!hybCanvas() || document.hidden || Date.now() - (RW.t0 || 0) < HYB_HOLD_MS) return;
  if (Date.now() - (RW.failT || 0) < OPS_RETRY_MS) return; // the flat map just failed to load
  if (viewKm() < HYB_IN_KM) rwMode("globe", { lon: rot.lon, lat: rot.lat, h: viewKm() * 900 });
}, 300);

function displaySet(m) {
  SET.display = m;
  setSave();
  errLog("Display set to " + m);
  if (!RW.on) return;
  // The map engine is rebuilt so the new drawing applies straight away.
  if (T3.on) t3Close();
  if (T3.map)
    try {
      T3.map.remove();
    } catch (e) {}
  T3.map = null;
  T3.ready = false;
  RW.retries = 0;
  rwMode(m === "hybrid" ? "canvas" : "globe");
}

// ---------- Smooth globe: borders and names ----------
// The 2D globe draws country and US state borders and their names itself, from the same outlines
// Focus uses (module 28). Outlines are thinned once so a frame stays cheap; names are placed
// biggest first and skipped where they would overlap or not fit their area.
var HYB = { c: null, s: null, asked: false },
  HYB_NAME = {
    "United States of America": "United States",
    "Dem. Rep. Congo": "DR Congo",
    "Central African Rep.": "Central African Rep",
    "Bosnia and Herz.": "Bosnia",
    "S. Sudan": "South Sudan"
  };

function hybThin(list, step) {
  return list
    .map(function (f) {
      var big = null,
        rings = f.rings.map(function (r) {
          var out = [r[0]];
          for (var i = 1; i < r.length; i++) {
            var q = out[out.length - 1];
            if (Math.abs(r[i][0] - q[0]) + Math.abs(r[i][1] - q[1]) >= step || i === r.length - 1)
              out.push(r[i]);
          }
          if (!big || r.length > big.length) big = r;
          return out;
        }),
        lon = 0,
        lat = 0;
      // The name sits at the middle of the largest piece (the mainland, not an island).
      big.forEach(function (p) {
        lon += p[0];
        lat += p[1];
      });
      return {
        n: HYB_NAME[f.name] || f.name,
        rings: rings,
        lon: lon / big.length,
        lat: lat / big.length,
        deg: Math.max(f.box.e - f.box.w, f.box.n - f.box.s)
      };
    })
    .sort(function (a, b) {
      return b.deg - a.deg;
    });
}

function hybLines(list, P) {
  ctx.beginPath();
  for (var i = 0; i < list.length; i++)
    for (var j = 0; j < list[i].rings.length; j++) {
      var r = list[i].rings[j],
        pen = false;
      for (var k = 0; k < r.length; k++) {
        var p = P(r[k][0], r[k][1]);
        if (p[2] > 0) {
          pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
          pen = true;
        } else pen = false;
      }
    }
  ctx.stroke();
}

function hybNames(list, P, R, font, color, minPx, upper, boxes) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (var i = 0; i < list.length; i++) {
    var f = list[i],
      px = (f.deg * D * R) / 1.4; // about how wide the area looks on screen
    if (px < minPx) break; // sorted biggest first: the rest are smaller still
    var p = P(f.lon, f.lat);
    if (p[2] < 0.3 || p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) continue;
    var t = upper ? f.n.toUpperCase() : f.n,
      w = ctx.measureText(t).width;
    if (w > px * 1.6) continue;
    var b = [p[0] - w / 2 - 4, p[1] - 8, p[0] + w / 2 + 4, p[1] + 8],
      hit = false;
    for (var k = 0; k < boxes.length && !hit; k++)
      hit = b[0] < boxes[k][2] && b[2] > boxes[k][0] && b[1] < boxes[k][3] && b[3] > boxes[k][1];
    if (hit) continue;
    boxes.push(b);
    ctx.fillText(t, p[0], p[1]);
  }
}

// Called by draw3d (module 05) over the 2D globe, under the data layers.
function hybDraw(R) {
  if (!hybCanvas()) return;
  if (!HYB.c) {
    if (!HYB.asked) {
      HYB.asked = true;
      focLoad()
        .then(function () {
          HYB.c = hybThin(FOC.countries, 0.35);
          HYB.s = hybThin(FOC.states, 0.2);
          lastView = "";
        })
        .catch(function () {
          HYB.asked = false; // tried again on a later frame
        });
    }
    return;
  }
  var km = viewKm(),
    boxes = [];
  ctx.save();
  ctx.lineJoin = "round";
  if (km < 9000) {
    ctx.strokeStyle = "rgba(150,190,230,0.2)";
    ctx.lineWidth = 0.7;
    hybLines(HYB.s, proj);
  }
  ctx.strokeStyle = "rgba(160,205,240,0.42)";
  ctx.lineWidth = 0.9;
  hybLines(HYB.c, proj);
  hybNames(
    HYB.c,
    proj,
    R,
    "600 10.5px system-ui, sans-serif",
    "rgba(225,238,248,0.82)",
    34,
    true,
    boxes
  );
  if (km < 7000)
    hybNames(
      HYB.s,
      proj,
      R,
      "500 10px system-ui, sans-serif",
      "rgba(175,200,222,0.72)",
      40,
      false,
      boxes
    );
  ctx.restore();
}

// ---------- Zoom in and see it in 3D ----------
// One world: zooming into a city fades in the aerial photos, raises the buildings and tilts the
// view; zooming back out levels it again. A tilt or turn you make yourself is left alone.
var OPS_TILT_ZOOM = 15,
  OPS_FLAT_ZOOM = 12,
  RW3D_ZOOM = 14; // "See in 3D" is offered from this zoom

// Zoomed into a city, "See in 3D" opens the photo-real 3D close-up right there; its ✕ comes
// back to the map at the same place and zoom.
var rw3dBtn = document.createElement("button");
rw3dBtn.id = "rw3d";
rw3dBtn.className = "mono";
rw3dBtn.textContent = "◆ SEE IN 3D";
rw3dBtn.setAttribute("aria-label", "See this place in 3D");
document.body.appendChild(rw3dBtn);

function rw3dShow() {
  var on = false;
  try {
    on =
      RW.on &&
      RW.mode === "globe" &&
      T3.ops &&
      !!T3.map &&
      !T4.on &&
      !!kG3() &&
      T3.map.getZoom() >= RW3D_ZOOM;
  } catch (e) {}
  document.body.classList.toggle("rw3dok", on);
}

rw3dBtn.addEventListener("click", function () {
  var w = rwWhere();
  document.body.classList.remove("rw3dok");
  t4Open({ close: true, lon: w[0], lat: w[1], quiet: true });
  RW.back = w; // after t4Open, which leaves the map engine
});

// Called by t4Close (module 11).
function rw3dBack() {
  if (!RW.on || !RW.back) return;
  var w = RW.back;
  RW.back = null;
  rwMode("globe", { lon: rot.lon, lat: rot.lat, h: w[2] });
}

function opsAttach(m) {
  m.on("moveend", rw3dShow);
  m.on("zoomend", function () {
    if (!T3.ops || !T3.map) return;
    var z = m.getZoom(),
      p = m.getPitch();
    // Smooth globe: zooming far out on the flat map returns to the 2D globe at the same place.
    if (displayMode() === "hybrid" && z < HYB_OUT_ZOOM && Date.now() - (RW.t0 || 0) > HYB_HOLD_MS) {
      var w = rwWhere();
      // After this event finishes, since the handover removes this map.
      setTimeout(function () {
        if (RW.on && RW.mode === "globe") rwMode("canvas", { lon: w[0], lat: w[1], h: w[2] });
      }, 0);
      return;
    }
    if (z >= OPS_TILT_ZOOM && p < 10 && !T3.autoTilt) {
      T3.autoTilt = true;
      m.easeTo({ pitch: 52, duration: 900 });
    } else if (z < OPS_FLAT_ZOOM && T3.autoTilt) {
      T3.autoTilt = false;
      if (p > 0) m.easeTo({ pitch: 0, bearing: 0, duration: 700 });
    }
  });
}

// ---------- Never a black screen ----------
// If the dark globe hasn't drawn within OPS_WAIT_MS, or reports an error before it draws, the app
// falls back to the app's own globe (which needs nothing from the network) and says so.
var OPS_WAIT_MS = window.__OPS_WAIT_MS || (BOOT_SAFE ? 8000 : 15000),
  OPS_RETRY_MS = window.__OPS_RETRY_MS || 30000, // the dark globe is tried again this often
  OPS_RETRIES = 8;

function opsWatch() {
  clearTimeout(T3.watch);
  T3.watch = setTimeout(function () {
    if (T3.on && T3.ops && !T3.ready)
      opsFail("the map did not draw within " + OPS_WAIT_MS / 1000 + " s");
  }, OPS_WAIT_MS);
}

function opsFail(why) {
  if (!T3.ops) return;
  clearTimeout(T3.watch);
  errLog("Dark globe: " + why);
  RW.failT = Date.now();
  try {
    if (T3.map) T3.map.remove();
  } catch (e) {}
  T3.map = null;
  T3.ready = false;
  T3.ops = false;
  if (T3.on) t3Close();
  if (RW.on) rwMode("canvas");
  lastView = "";
  setTimeout(resize, 40);
  // Said once; the dark globe is then retried quietly in the background (opsRetry).
  if (!RW.retries)
    note(
      "Map",
      "The dark globe couldn't load right now, so a simpler globe is shown with all your data. It will switch back by itself as soon as it can."
    );
}

// The fallback never sticks: the dark globe is tried again every OPS_RETRY_MS while online,
// and straight away when the connection comes back.
function opsRetry() {
  if (
    !RW.on ||
    RW.mode !== "canvas" ||
    displayMode() === "hybrid" ||
    !navigator.onLine ||
    (RW.retries || 0) >= OPS_RETRIES
  )
    return;
  RW.retries = (RW.retries || 0) + 1;
  rwMode("globe");
}
setInterval(function () {
  if (RW.on && RW.mode === "globe" && T3.ready) RW.retries = 0;
  if (RW.on && RW.mode === "canvas" && Date.now() - RW.t0 > OPS_RETRY_MS) opsRetry();
}, 2000);
window.addEventListener("online", opsRetry);

// ---------- Marking a good start ----------
// BOOT_SAFE and BOOT_DASH are set in module 37, which decides how the app starts.
(function bootCheck(n) {
  var drawn =
    !BOOT_DASH || (T3.on && T3.ready) || (RW.on && RW.mode === "canvas") || (!RW.on && n >= 8);
  if (drawn) ls("ojos-boot", "ok");
  else if (n < 160) setTimeout(bootCheck, 250, n + 1);
})(0);
