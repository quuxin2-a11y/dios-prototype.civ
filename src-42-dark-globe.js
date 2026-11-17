/**
 * @file Dark globe: the start-up view.
 * A dark vector globe drawn by MapLibre on the graphics chip (the same engine as the 3D view in
 * module 10), styled for reading data: deep navy land and sea, glowing country borders, quiet
 * state lines, and names that appear as you zoom. Cameras, aircraft, ships, every data layer and
 * the undersea cables are GPU layers on top, so the map stays smooth with 100,000+ points.
 * Zooming into a city offers the 3D Replica (module 38) for a close-up.
 * Map data: OpenStreetMap via OpenFreeMap; the credit sits behind the map's ⓘ button.
 *
 * Module 42 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

var OPS_TILES = "https://tiles.openfreemap.org/",
  OPS_FONT = ["Noto Sans Regular"],
  OPS_CLOSE_ZOOM = 14; // from here the 3D city is offered

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
        "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], min, w[0], 18, w[1]]
      }
    };
  };
  var land2 = ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]];
  return {
    version: 8,
    glyphs: OPS_TILES + "fonts/{fontstack}/{range}.pbf",
    projection: { type: "globe" },
    sky: {
      "sky-color": "#02050a",
      "horizon-color": "#0c3550",
      "fog-color": "#02050a",
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 8, 0]
    },
    sources: {
      omt: {
        type: "vector",
        url: OPS_TILES + "planet",
        attribution: "© OpenStreetMap · OpenFreeMap"
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
          "fill-extrusion-color": "#16232f",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.85
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
  var key = t3InfoKey();
  if (key === T3.ik) return;
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

// ---------- Never a black screen ----------
// If the dark globe hasn't drawn within OPS_WAIT_MS, or reports an error before it draws, the app
// falls back to the classic globe (which needs nothing from the network to appear) and says so.
var OPS_WAIT_MS = window.__OPS_WAIT_MS || 15000;

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
  note(
    "Map",
    "The dark globe couldn't load right now, so the satellite globe is shown with all your data. Tap the logo to try again."
  );
}

// ---------- Safe start ----------
// A start-up that never got a map on screen (the app was closed on a black screen, or crashed)
// makes the next start open on the classic globe once, instead of trying the same thing again.
// BOOT_SAFE and BOOT_DASH are set in module 37, which decides how the app starts.
(function bootCheck(n) {
  var drawn = !BOOT_DASH || (T3.on && T3.ready) || (T4.on && T4.ready) || (!RW.on && n >= 2);
  if (drawn) ls("ojos-boot", "ok");
  else if (n < 40) setTimeout(bootCheck, 1000, n + 1);
})(0);

// ---------- Close-up: the 3D city when zoomed in ----------
function opsCloseTick() {
  var b = $("ops3d"),
    m = T3.map,
    show =
      RW.on &&
      RW.mode === "globe" &&
      !document.body.classList.contains("bare") &&
      T3.on &&
      T3.ops &&
      m &&
      T3.ready &&
      m.getZoom() >= OPS_CLOSE_ZOOM;
  if (!b) {
    if (!show) return;
    b = document.createElement("button");
    b.id = "ops3d";
    b.innerHTML = "◆ <b>See this in 3D</b>";
    document.body.appendChild(b);
  }
  b.style.display = show ? "flex" : "none";
}
setInterval(opsCloseTick, 600);

document.addEventListener("click", function (e) {
  if (!e.target.closest("#ops3d")) return;
  rwMode("replica");
});
