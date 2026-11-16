/**
 * @file Replica: the default 3D view, with no third-party branding on screen.
 * A clean 3D model of the area in view, built from OpenStreetMap: buildings at their real
 * footprint and height, roads, water and parks, over NASA satellite imagery of the whole Earth.
 * Runs in the same CesiumJS viewer as the Google view (module 11), so cameras, aircraft, ships,
 * data layers and taps all work the same; Google's tiles are not loaded at all here.
 *
 * Module 38 of 39. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

var REP = {
  on: false,
  areas: [], // [{key, prims: [...]}], newest last
  busy: false,
  t: 0,
  img: null
};
var REP_MAX_AREAS = 4,
  REP_MAX_M = 14000; // replica buildings load below this camera height

// ---------- Parsing OpenStreetMap ways into replica parts ----------
var REP_COLORS = {
  commercial: "#b9c7d8",
  office: "#b9c7d8",
  retail: "#c9c0d6",
  industrial: "#a8a39a",
  warehouse: "#a8a39a",
  residential: "#ddd5c6",
  house: "#e2d8c4",
  apartments: "#d8d0c2",
  school: "#d9c39a",
  university: "#d9c39a",
  hospital: "#e7c4c4",
  church: "#d7cfb8",
  default: "#cfd6de"
};

// Height in metres from height, building:levels or a sensible default.
function repHeight(t) {
  var h = parseFloat(String(t.height || "").replace(",", "."));
  if (isFinite(h) && h > 0) return Math.min(h, 900);
  var lv = parseFloat(t["building:levels"]);
  if (isFinite(lv) && lv > 0) return Math.min(lv * 3.2 + 1, 900);
  return /^(house|garage|shed|hut|detached)$/.test(t.building || "") ? 6 : 10;
}

function repMinHeight(t) {
  var h = parseFloat(t.min_height);
  if (isFinite(h) && h > 0) return h;
  var lv = parseFloat(t["building:min_level"]);
  return isFinite(lv) && lv > 0 ? lv * 3.2 : 0;
}

var REP_ROADS = {
  motorway: [9, "#7d8da3"],
  trunk: [8, "#7d8da3"],
  primary: [7, "#6f7f95"],
  secondary: [6, "#64748a"],
  tertiary: [5, "#5a6a80"],
  residential: [3.5, "#4f5e72"],
  unclassified: [3.5, "#4f5e72"]
};

// Overpass "out geom" ways to {buildings, roads, water, parks}; rings are [lon, lat] lists.
function repParse(j) {
  var out = { buildings: [], roads: [], water: [], parks: [] };
  ((j && j.elements) || []).forEach(function (w) {
    var g = w.geometry,
      t = w.tags || {};
    if (w.type !== "way" || !g || g.length < 2) return;
    var ring = g
      .map(function (p) {
        return [num(p.lon), num(p.lat)];
      })
      .filter(function (p) {
        return p[0] != null && p[1] != null;
      });
    if (ring.length < 2) return;
    if (t.building || t["building:part"]) {
      if (ring.length < 4) return;
      var kind = t.building && t.building !== "yes" ? t.building : t.amenity || "default";
      out.buildings.push({
        id: w.id,
        ring: ring,
        h: repHeight(t),
        min: repMinHeight(t),
        color: REP_COLORS[kind] || REP_COLORS.default,
        name: t.name || "",
        kind: kind
      });
    } else if (t.highway && REP_ROADS[t.highway]) {
      out.roads.push({ line: ring, w: REP_ROADS[t.highway][0], color: REP_ROADS[t.highway][1] });
    } else if (t.natural === "water" || t.waterway === "riverbank") {
      if (ring.length >= 4) out.water.push({ ring: ring });
    } else if (t.leisure === "park" || t.landuse === "grass" || t.leisure === "garden") {
      if (ring.length >= 4) out.parks.push({ ring: ring, name: t.name || "" });
    }
  });
  return out;
}

// Area loaded around a point: about 2-3 km across, snapped so nearby views share a load.
function repArea(lat, lon) {
  var step = 0.02,
    la = Math.round(lat / step) * step,
    lo = Math.round(lon / step) * step,
    dLo = 0.014 / Math.max(0.3, Math.cos(la * D));
  return {
    key: la.toFixed(2) + "," + lo.toFixed(2),
    s: la - 0.014,
    n: la + 0.014,
    w: lo - dLo,
    e: lo + dLo
  };
}

function repQuery(a) {
  var bb = [a.s, a.w, a.n, a.e]
    .map(function (v) {
      return v.toFixed(4);
    })
    .join(",");
  return (
    "[out:json][timeout:25];(" +
    'way["building"](' +
    bb +
    ");" +
    'way["building:part"](' +
    bb +
    ");" +
    'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"](' +
    bb +
    ");" +
    'way["natural"="water"](' +
    bb +
    ");" +
    'way["leisure"~"^(park|garden)$"](' +
    bb +
    ");" +
    ");out geom tags 12000;"
  );
}

// ---------- Drawing the replica ----------
function repFlat(ring, h) {
  var f = [];
  for (var i = 0; i < ring.length; i++) f.push(ring[i][0], ring[i][1], h);
  return f;
}

function repBuild(parts) {
  var C = window.Cesium,
    v = T4.v,
    prims = [];
  if (!C || !v) return prims;
  var poly = function (list, height, extrude, colorOf, idOf) {
    var inst = [];
    list.forEach(function (x) {
      try {
        inst.push(
          new C.GeometryInstance({
            geometry: new C.PolygonGeometry({
              polygonHierarchy: new C.PolygonHierarchy(
                C.Cartesian3.fromDegreesArray([].concat.apply([], x.ring))
              ),
              height: extrude ? x.min : height,
              extrudedHeight: extrude ? x.h : undefined,
              vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT
            }),
            attributes: { color: C.ColorGeometryInstanceAttribute.fromColor(colorOf(x)) },
            id: idOf ? idOf(x) : undefined
          })
        );
      } catch (e) {
        /* skip a malformed outline */
      }
    });
    if (!inst.length) return;
    prims.push(
      v.scene.primitives.add(
        new C.Primitive({
          geometryInstances: inst,
          appearance: new C.PerInstanceColorAppearance({
            flat: !extrude,
            translucent: false,
            closed: !!extrude
          }),
          asynchronous: true
        })
      )
    );
  };
  var water = C.Color.fromCssColorString("#1d5fae"),
    park = C.Color.fromCssColorString("#2f6d3a");
  poly(parts.water, 0.3, false, function () {
    return water;
  });
  poly(parts.parks, 0.5, false, function () {
    return park;
  });
  if (parts.roads.length) {
    var pl = v.scene.primitives.add(new C.PolylineCollection());
    parts.roads.forEach(function (r) {
      pl.add({
        positions: C.Cartesian3.fromDegreesArrayHeights(repFlat(r.line, 0.8)),
        width: r.w,
        material: C.Material.fromType("Color", { color: C.Color.fromCssColorString(r.color) })
      });
    });
    prims.push(pl);
  }
  poly(
    parts.buildings,
    0,
    true,
    function (b) {
      return C.Color.fromCssColorString(b.color);
    },
    function (b) {
      return repBuildingItem(b);
    }
  );
  return prims;
}

// What a tapped building shows.
function repBuildingItem(b) {
  var c = b.ring.reduce(
    function (a, p) {
      return [a[0] + p[0] / b.ring.length, a[1] + p[1] / b.ring.length];
    },
    [0, 0]
  );
  return {
    kind: "info",
    layer: "replica",
    id: "rep:" + b.id,
    n: b.name || tfWords(b.kind === "default" ? "Building" : b.kind),
    lat: c[1],
    lon: c[0],
    color: "#cfd6de",
    tag: "BUILDING · REPLICA",
    rows: [
      ["TYPE", b.kind === "default" ? "Building" : tfWords(b.kind)],
      ["HEIGHT", Math.round(b.h) + " m"],
      ["SOURCE", "OpenStreetMap contributors"]
    ]
  };
}

function repDrop(a) {
  var v = T4.v;
  (a.prims || []).forEach(function (p) {
    try {
      v.scene.primitives.remove(p);
    } catch (e) {
      /* already removed */
    }
  });
}

// Load the replica for the area under the camera, if it is close enough and not loaded yet.
function repTick() {
  var C = window.Cesium,
    v = T4.v;
  if (!REP.on || !v || REP.busy || document.hidden) return;
  var cp = v.camera.positionCartographic;
  repStatus(cp.height > REP_MAX_M ? "far" : "");
  if (cp.height > REP_MAX_M) return;
  var mid = null;
  try {
    mid = v.camera.pickEllipsoid(
      new C.Cartesian2(v.scene.canvas.clientWidth / 2, v.scene.canvas.clientHeight / 2)
    );
  } catch (e) {}
  var cg = mid ? C.Cartographic.fromCartesian(mid) : cp,
    a = repArea(cg.latitude / D, cg.longitude / D);
  if (
    REP.areas.some(function (x) {
      return x.key === a.key;
    })
  )
    return;
  REP.busy = true;
  repStatus("loading");
  getJSON("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(repQuery(a)), 30000)
    .then(function (j) {
      if (!REP.on) return;
      a.prims = repBuild(repParse(j));
      REP.areas.push(a);
      while (REP.areas.length > REP_MAX_AREAS) repDrop(REP.areas.shift());
      v.scene.requestRender();
      repStatus("");
    })
    .catch(function () {
      repStatus("offline");
    })
    .then(function () {
      REP.busy = false;
    });
}

// A small status chip while the replica loads or when zoomed out too far for buildings.
function repStatus(s) {
  var el = $("repst");
  if (!el) {
    el = document.createElement("div");
    el.id = "repst";
    $("real").appendChild(el);
  }
  el.textContent =
    s === "loading"
      ? "Building replica…"
      : s === "far"
        ? "Zoom in to a city to see the replica"
        : s === "offline"
          ? "Replica data unavailable right now"
          : "";
  el.style.display = REP.on && s ? "block" : "none";
}

// NASA true-colour imagery for the globe under the replica (public domain, no logo needed).
function repImagery() {
  var C = window.Cesium,
    v = T4.v;
  if (!v.scene.globe) {
    v.scene.globe = new C.Globe(C.Ellipsoid.WGS84);
    v.scene.globe.baseColor = C.Color.fromCssColorString("#0d2a4d");
    v.scene.globe.showGroundAtmosphere = true;
  }
  v.scene.globe.show = true;
  if (REP.img) return;
  REP.img = "pending";
  eoProbe(EO_VIEWS.eo_today)
    .then(function (f) {
      var url =
        EO_GIBS +
        EO_VIEWS.eo_today.layer +
        "/default/" +
        f.date +
        "/GoogleMapsCompatible_Level" +
        f.lvl +
        "/{z}/{y}/{x}.jpg";
      REP.img = v.imageryLayers.addImageryProvider(
        new C.UrlTemplateImageryProvider({
          url: url,
          tilingScheme: new C.WebMercatorTilingScheme(),
          maximumLevel: f.lvl
        })
      );
    })
    .catch(function () {
      REP.img = null;
    });
}

function repOn() {
  if (!T4.v) return;
  REP.on = true;
  document.body.classList.add("replica");
  if (T4.ts) T4.ts.show = false;
  repImagery();
  REP.areas.forEach(function (a) {
    (a.prims || []).forEach(function (p) {
      p.show = true;
    });
  });
  repButton();
  T4.v.scene.requestRender();
  repTick();
}

function repOff() {
  REP.on = false;
  document.body.classList.remove("replica");
  if (T4.v && T4.v.scene.globe) T4.v.scene.globe.show = false;
  REP.areas.forEach(function (a) {
    (a.prims || []).forEach(function (p) {
      p.show = false;
    });
  });
  repStatus("");
  repButton();
}

// The switch between Replica and the Google view, in the 3D view's side bar.
function repButton() {
  var bar = $("t4bar");
  if (!bar) return;
  var b = $("bRepSw");
  if (!b) {
    b = document.createElement("button");
    b.id = "bRepSw";
    b.style.cssText = "width:auto;padding:0 9px;font-size:10px;letter-spacing:.08em";
    bar.insertBefore(b, bar.firstChild);
  }
  b.textContent = REP.on ? "GOOGLE 3D" : "REPLICA";
  b.setAttribute("aria-label", REP.on ? "Switch to the Google 3D view" : "Switch to Replica");
  var i = $("bRepInfo");
  if (!i) {
    i = document.createElement("button");
    i.id = "bRepInfo";
    i.textContent = "ⓘ";
    i.setAttribute("aria-label", "Map data sources");
    bar.insertBefore(i, b.nextSibling);
  }
  i.style.display = REP.on ? "" : "none";
}

document.addEventListener("click", function (e) {
  if (e.target.closest("#bRepInfo")) {
    note(
      "Map data",
      "Buildings, roads, water and parks © OpenStreetMap contributors (ODbL). Satellite imagery: NASA EOSDIS GIBS. Every other source is listed in Layers and in each item's details."
    );
    return;
  }
  if (!e.target.closest("#bRepSw")) return;
  if (REP.on) {
    if (!kG3()) {
      note(
        "Google 3D",
        "The Google view needs a Google Maps key with Map Tiles API. Add it under Layers → Sources & keys."
      );
      return;
    }
    t4Google();
  } else repOn();
});

setInterval(repTick, 1500);
