/**
 * @file Replica: the default 3D view, with no third-party branding on screen.
 * A 3D model of the area in view, built from OpenStreetMap: buildings at their real footprint,
 * height, colour and roof shape, roads, trees, water, parks, and the names of streets, landmarks,
 * cities, states and countries, over US aerial photos and a Sentinel-2 mosaic of the whole Earth.
 * Runs in the same CesiumJS viewer as the Google view (module 11), so cameras, aircraft, ships,
 * data layers and taps all work the same; Google's tiles are not loaded at all here.
 *
 * Module 38 of 41. Modules share one scope: build.py concatenates them in order
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

// Typical wall colours for building:material, used when no colour is mapped.
var REP_MATERIAL = {
  brick: "#a4553f",
  stone: "#c9c2b2",
  sandstone: "#d6c39a",
  limestone: "#ddd5c0",
  marble: "#eeeae2",
  granite: "#a9a39b",
  concrete: "#bdbab3",
  glass: "#8fb3c9",
  metal: "#a9b0b8",
  steel: "#a9b0b8",
  wood: "#a07a52",
  timber_framing: "#d9cbb0",
  plaster: "#e6e0d2",
  stucco: "#e6e0d2"
};

// Colour words mappers use that are not CSS colour names.
var REP_COLOUR_WORDS = {
  cream: "#f3ead2",
  sand: "#d8c9a3",
  lightbrown: "#b5835a",
  darkbrown: "#5c4033",
  darkgrey: "#555a60",
  lightgrey: "#c8ccd0"
};
var REP_CSS_NAMES =
  /^(white|black|gray|grey|silver|lightgray|darkgray|dimgray|slategray|red|darkred|maroon|brown|saddlebrown|sienna|chocolate|peru|tan|beige|wheat|ivory|linen|khaki|yellow|gold|orange|pink|salmon|coral|green|darkgreen|olive|teal|blue|navy|lightblue|skyblue|steelblue|purple|whitesmoke|gainsboro|snow|antiquewhite|burlywood|rosybrown|indianred|firebrick|seashell|floralwhite|cornsilk|azure|aliceblue|lavender)$/;

// An OpenStreetMap colour tag as a CSS colour, or "" if it is not one.
function repColour(v) {
  v = String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return v;
  if (/^[0-9a-f]{6}$/.test(v)) return "#" + v;
  if (REP_COLOUR_WORDS[v]) return REP_COLOUR_WORDS[v];
  return REP_CSS_NAMES.test(v) ? v : "";
}

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

// Footprint centre [lon, lat] and equivalent radius in metres.
function repFootprint(ring) {
  var lat0 = ring[0][1],
    kx = 111320 * Math.cos(lat0 * D),
    ky = 110540,
    a = 0,
    cx = 0,
    cy = 0;
  for (var i = 0; i < ring.length; i++) {
    cx += ring[i][0] / ring.length;
    cy += ring[i][1] / ring.length;
    var j = (i + 1) % ring.length;
    a += ring[i][0] * kx * ring[j][1] * ky - ring[j][0] * kx * ring[i][1] * ky;
  }
  return { c: [cx, cy], r: Math.sqrt(Math.abs(a / 2) / Math.PI) };
}

var REP_PITCHED =
  /^(gabled|hipped|pyramidal|half-hipped|mansard|gambrel|saltbox|side_hipped|round|skillion)$/;

// Walls, roof shape and colours for one building from its tags.
function repBuilding(w, ring, t) {
  var kind = t.building && t.building !== "yes" ? t.building : t.amenity || "default",
    fp = repFootprint(ring),
    shape = String(t["roof:shape"] || "").toLowerCase(),
    roofShape = /^(dome|onion)$/.test(shape) ? "dome" : REP_PITCHED.test(shape) ? "pitched" : "",
    rh = parseFloat(t["roof:height"]),
    rl = parseFloat(t["roof:levels"]);
  if (!(rh > 0)) rh = rl > 0 ? rl * 3 : 0;
  if (roofShape && !rh)
    rh = roofShape === "dome" ? Math.min(fp.r * 0.9, 40) : Math.min(fp.r * 0.5, 8);
  if (!roofShape) rh = 0;
  var explicit = !!(t.height || t["building:levels"]),
    min = repMinHeight(t),
    h = repHeight(t),
    walls = explicit ? Math.max(min + 2, h - rh) : h;
  return {
    id: w.id,
    ring: ring,
    h: walls,
    top: walls + rh,
    min: min,
    c: fp.c,
    r: fp.r,
    part: !t.building && !!t["building:part"],
    color:
      repColour(t["building:colour"] || t.colour) ||
      REP_MATERIAL[String(t["building:material"] || "").toLowerCase()] ||
      REP_COLORS[kind] ||
      REP_COLORS.default,
    roof: roofShape ? { shape: roofShape, color: repColour(t["roof:colour"]) || "#7c7f86" } : null,
    name: t.name || "",
    kind: kind
  };
}

// True if point p ([lon, lat]) is inside the ring.
function repInside(p, ring) {
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

var REP_ROADS = {
  motorway: [9, "#7d8da3"],
  trunk: [8, "#7d8da3"],
  primary: [7, "#6f7f95"],
  secondary: [6, "#64748a"],
  tertiary: [5, "#5a6a80"],
  residential: [3.5, "#4f5e72"],
  unclassified: [3.5, "#4f5e72"],
  living_street: [3, "#4f5e72"],
  pedestrian: [3, "#8a8172"]
};

var REP_PLACES = /^(city|town|village|suburb|quarter|neighbourhood)$/;

// Overpass elements to {buildings, roads, water, parks, trees, places}; rings are [lon, lat] lists.
function repParse(j) {
  var out = { buildings: [], roads: [], water: [], parks: [], trees: [], places: [] };
  ((j && j.elements) || []).forEach(function (w) {
    var t = w.tags || {};
    if (w.type === "node") {
      var lat = num(w.lat),
        lon = num(w.lon);
      if (lat == null || lon == null) return;
      if (t.natural === "tree") {
        var th = parseFloat(t.height);
        out.trees.push({ lon: lon, lat: lat, h: th > 2 && th < 60 ? th : 9 });
      } else if (t.name && REP_PLACES.test(t.place || ""))
        out.places.push({ lon: lon, lat: lat, name: t.name, kind: t.place });
      return;
    }
    var g = w.geometry;
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
      if (ring.length >= 4) out.buildings.push(repBuilding(w, ring, t));
    } else if (t.highway && REP_ROADS[t.highway]) {
      out.roads.push({
        line: ring,
        w: REP_ROADS[t.highway][0],
        color: REP_ROADS[t.highway][1],
        name: t.name || ""
      });
    } else if (t.natural === "water" || t.waterway === "riverbank") {
      if (ring.length >= 4) out.water.push({ ring: ring });
    } else if (t.leisure === "park" || t.landuse === "grass" || t.leisure === "garden") {
      if (ring.length >= 4) out.parks.push({ ring: ring, name: t.name || "" });
    }
  });
  // Mapped building parts replace the plain outline they sit in (OSM "Simple 3D Buildings").
  var parts = out.buildings.filter(function (b) {
    return b.part;
  });
  if (parts.length)
    out.buildings = out.buildings.filter(function (b) {
      return (
        b.part ||
        !parts.some(function (p) {
          return repInside(p.c, b.ring);
        })
      );
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

// Separate outputs, so trees can never crowd buildings out of the element limit.
function repQuery(a) {
  var bb =
    "(" +
    [a.s, a.w, a.n, a.e]
      .map(function (v) {
        return v.toFixed(4);
      })
      .join(",") +
    ");";
  return (
    "[out:json][timeout:25];(" +
    'way["building"]' +
    bb +
    'way["building:part"]' +
    bb +
    'way["highway"~"^(' +
    Object.keys(REP_ROADS).join("|") +
    ')$"]' +
    bb +
    'way["natural"="water"]' +
    bb +
    'way["leisure"~"^(park|garden)$"]' +
    bb +
    ");out geom tags 12000;" +
    'node["natural"="tree"]' +
    bb +
    "out 2500;" +
    'node["place"]["name"]' +
    bb +
    "out 80;"
  );
}

// ---------- Drawing the replica ----------
function repFlat(ring, h) {
  var f = [];
  for (var i = 0; i < ring.length; i++) f.push(ring[i][0], ring[i][1], h);
  return f;
}

// A ring shrunk toward its centre by factor k, for stepped pitched roofs.
function repShrink(ring, c, k) {
  return ring.map(function (p) {
    return [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k];
  });
}

// Shared label style: white text with a dark outline, crisp at half scale.
function repLabel(C, coll, lon, lat, h, text, o) {
  coll.add({
    position: C.Cartesian3.fromDegrees(lon, lat, h),
    text: text,
    font: (o.weight || 600) + " " + (o.px || 26) + "px Inter, system-ui, sans-serif",
    scale: 0.5,
    fillColor: C.Color.fromCssColorString(o.color || "#ffffff"),
    outlineColor: C.Color.fromCssColorString("#000000cc"),
    outlineWidth: 4,
    style: C.LabelStyle.FILL_AND_OUTLINE,
    horizontalOrigin: C.HorizontalOrigin.CENTER,
    verticalOrigin: C.VerticalOrigin.BOTTOM,
    distanceDisplayCondition: new C.DistanceDisplayCondition(o.near || 0, o.far),
    disableDepthTestDistance: o.over || 0
  });
}

function repBuild(parts) {
  var C = window.Cesium,
    v = T4.v,
    prims = [];
  if (!C || !v) return prims;
  var batch = function (inst, flat) {
    // Built on the main thread in batches, so no helper scripts have to be fetched from the CDN.
    for (var k = 0; k < inst.length; k += 700)
      prims.push(
        v.scene.primitives.add(
          new C.Primitive({
            geometryInstances: inst.slice(k, k + 700),
            appearance: new C.PerInstanceColorAppearance({
              flat: !!flat,
              translucent: false,
              closed: !flat
            }),
            asynchronous: false
          })
        )
      );
  };
  var colour = function (c) {
    return C.ColorGeometryInstanceAttribute.fromColor(C.Color.fromCssColorString(c));
  };
  var slab = function (ring, from, to, c, id) {
    return new C.GeometryInstance({
      geometry: new C.PolygonGeometry({
        polygonHierarchy: new C.PolygonHierarchy(
          C.Cartesian3.fromDegreesArray([].concat.apply([], ring))
        ),
        height: from,
        extrudedHeight: to,
        vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT
      }),
      attributes: { color: colour(c) },
      id: id
    });
  };
  var blob = function (lon, lat, h, rx, rz, c, parts, id) {
    return new C.GeometryInstance({
      geometry: new C.EllipsoidGeometry({
        radii: new C.Cartesian3(rx, rx, rz),
        stackPartitions: parts,
        slicePartitions: parts,
        vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT
      }),
      modelMatrix: C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(lon, lat, h)),
      attributes: { color: colour(c) },
      id: id
    });
  };
  var flat = function (list, h, c) {
    var inst = [];
    list.forEach(function (x) {
      try {
        inst.push(slab(x.ring, h, undefined, c));
      } catch (e) {
        /* skip a malformed outline */
      }
    });
    batch(inst, true);
  };
  flat(parts.water, 0.3, "#1d5fae");
  flat(parts.parks, 0.5, "#2f6d3a");

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

  // Walls, then roofs: stepped tiers for pitched roofs and a half-buried ellipsoid for domes.
  var walls = [],
    roofs = [];
  parts.buildings.forEach(function (b) {
    var id = repBuildingItem(b);
    try {
      walls.push(slab(b.ring, b.min, b.h, b.color, id));
      if (b.roof && b.roof.shape === "pitched") {
        var mid = b.h + (b.top - b.h) * 0.5;
        roofs.push(slab(repShrink(b.ring, b.c, 0.72), b.h, mid, b.roof.color, id));
        roofs.push(slab(repShrink(b.ring, b.c, 0.36), mid, b.top, b.roof.color, id));
      } else if (b.roof)
        roofs.push(blob(b.c[0], b.c[1], b.h, b.r * 0.85, b.top - b.h, b.roof.color, 20, id));
    } catch (e) {
      /* skip a malformed outline */
    }
  });
  batch(walls);
  batch(roofs);

  // Mapped street trees: a low-poly crown on a short trunk.
  var trees = [];
  parts.trees.forEach(function (t, i) {
    var crown = t.h * 0.42;
    trees.push(
      blob(t.lon, t.lat, t.h - crown, crown * 0.8, crown, i % 3 ? "#3f6f37" : "#4b7d3f", 7)
    );
  });
  batch(trees);

  // Names: streets, landmarks and neighbourhoods, each at the distances where they help.
  var lab = v.scene.primitives.add(new C.LabelCollection()),
    seen = {};
  parts.roads
    .slice()
    .sort(function (a, b) {
      return b.line.length - a.line.length;
    })
    .forEach(function (r) {
      if (!r.name || seen["s" + r.name]) return;
      seen["s" + r.name] = 1;
      var m = r.line[Math.floor(r.line.length / 2)];
      repLabel(C, lab, m[0], m[1], 3, r.name, { px: 24, far: 1800, over: 300 });
    });
  parts.buildings.forEach(function (b) {
    if (!b.name || seen["b" + b.name]) return;
    seen["b" + b.name] = 1;
    repLabel(C, lab, b.c[0], b.c[1], b.top + 6, b.name, {
      px: 26,
      weight: 700,
      color: "#ffe7a8",
      far: 5000,
      over: 800
    });
  });
  parts.places.forEach(function (p) {
    if (seen["p" + p.name]) return;
    seen["p" + p.name] = 1;
    repLabel(C, lab, p.lon, p.lat, 120, p.name, {
      px: 32,
      weight: 700,
      color: "#d9f6ff",
      near: 600,
      far: 22000,
      over: 1e6
    });
  });
  prims.push(lab);
  return prims;
}

// What a tapped building shows.
function repBuildingItem(b) {
  return {
    kind: "info",
    layer: "replica",
    id: "rep:" + b.id,
    n: b.name || tfWords(b.kind === "default" ? "Building" : b.kind),
    lat: b.c[1],
    lon: b.c[0],
    color: "#cfd6de",
    tag: "BUILDING · REPLICA",
    rows: [
      ["TYPE", b.kind === "default" ? "Building" : tfWords(b.kind)],
      ["HEIGHT", Math.round(b.top) + " m"],
      ["SOURCE", "OpenStreetMap contributors"]
    ]
  };
}

// ---------- Countries, states and cities: outlines and names over the whole globe ----------
// Average of the ring with the most points: the mainland for most countries.
function repRingLabelAt(rings) {
  var r = rings.reduce(function (a, b) {
    return b.length > a.length ? b : a;
  }, []);
  var x = 0,
    y = 0;
  r.forEach(function (p) {
    x += p[0];
    y += p[1];
  });
  return r.length ? [x / r.length, y / r.length] : null;
}

function repAtlas() {
  if (REP.atlas) return;
  REP.atlas = "pending";
  focLoad()
    .then(function () {
      var C = window.Cesium,
        v = T4.v;
      if (!C || !v) return;
      var lines = v.scene.primitives.add(new C.PolylineCollection()),
        names = v.scene.primitives.add(new C.LabelCollection());
      var draw = function (list, css, width, label) {
        // Country borders glow; state lines are thin and fainter.
        var mat =
          css === "glow"
            ? C.Material.fromType("PolylineGlow", {
                color: C.Color.fromCssColorString("#7fe6ff"),
                glowPower: 0.18
              })
            : C.Material.fromType("Color", { color: C.Color.fromCssColorString(css) });
        list.forEach(function (f) {
          f.rings.forEach(function (r) {
            if (r.length < 2) return;
            lines.add({
              positions: C.Cartesian3.fromDegreesArrayHeights(repFlat(r, 60)),
              width: width,
              material: mat
            });
          });
          var at = repRingLabelAt(f.rings);
          if (at)
            repLabel(
              C,
              names,
              at[0],
              at[1],
              2000,
              label.upper ? f.name.toUpperCase() : f.name,
              label
            );
        });
      };
      draw(FOC.countries, "glow", 5, {
        px: 30,
        weight: 800,
        color: "#ffffff",
        near: 1.2e6,
        far: 3.2e7,
        upper: true
      });
      draw(FOC.states, "#9fe8ff55", 1, {
        px: 26,
        weight: 700,
        color: "#cfe9ff",
        near: 1.5e5,
        far: 5e6
      });
      REP.atlas = [lines, names];
      REP.atlas.forEach(function (p) {
        p.show = REP.on;
      });
      v.scene.requestRender();
    })
    .catch(function () {
      REP.atlas = null;
    });
}

// City and town names for the region in view, between street level and space.
var REP_CITY_MIN_M = 12000,
  REP_CITY_MAX_M = 1.2e6;

function repCities(lat, lon, height) {
  var big = height > 250000,
    step = big ? 6 : 2,
    la = Math.floor(lat / step) * step,
    lo = Math.floor(lon / step) * step,
    key = step + ":" + la + "," + lo;
  REP.cities = REP.cities || [];
  if (
    REP.citiesBusy ||
    REP.cities.some(function (c) {
      return c.key === key;
    })
  )
    return;
  REP.citiesBusy = true;
  var q =
    '[out:json][timeout:20];node["place"~"^(' +
    (big ? "city" : "city|town") +
    ')$"]["name"](' +
    [la, lo, la + step, lo + step].join(",") +
    ");out 400;";
  overpassGet(q, 25000)
    .then(function (j) {
      var C = window.Cesium,
        v = T4.v;
      if (!C || !v) return;
      var coll = v.scene.primitives.add(new C.LabelCollection());
      (j.elements || []).forEach(function (n) {
        var t = n.tags || {},
          city = t.place === "city",
          pop = parseFloat(t.population) || 0;
        repLabel(C, coll, n.lon, n.lat, 300, t["name:en"] || t.name, {
          px: city ? (pop > 1e6 ? 34 : 30) : 24,
          weight: city ? 800 : 650,
          color: city ? "#ffffff" : "#e3eef5",
          near: REP_CITY_MIN_M,
          far: city ? (pop > 1e6 ? 2.6e6 : 1.2e6) : 2.2e5,
          over: 1e7
        });
      });
      coll.show = REP.on;
      REP.cities.push({ key: key, prims: [coll] });
      while (REP.cities.length > 10) repDrop(REP.cities.shift());
      v.scene.requestRender();
    })
    .catch(function () {
      /* names are optional; try again when the view moves to a new region */
    })
    .then(function () {
      REP.citiesBusy = false;
    });
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
  if (!REP.on || !v) return;
  var cp = v.camera.positionCartographic;
  repCredit(cp);
  if (REP.busy || document.hidden || Date.now() < (REP.retry || 0)) return;
  if (cp.height > REP_CITY_MIN_M && cp.height < REP_CITY_MAX_M)
    repCities(cp.latitude / D, cp.longitude / D, cp.height);
  if (Date.now() > (REP.hold || 0)) repStatus(cp.height > REP_MAX_M ? "far" : "");
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
  overpassGet(repQuery(a), 30000)
    .then(function (j) {
      if (!REP.on) return;
      var parts = repParse(j);
      a.prims = repBuild(parts);
      REP.areas.push(a);
      while (REP.areas.length > REP_MAX_AREAS) repDrop(REP.areas.shift());
      v.scene.requestRender();
      REP.last = parts.buildings.length;
      repStatus(parts.buildings.length ? "built" : "empty");
      REP.hold = Date.now() + 2500;
    })
    .catch(function () {
      repStatus("offline");
      REP.retry = Date.now() + 8000;
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
          ? "Map servers busy, retrying…"
          : s === "built"
            ? (REP.last || 0).toLocaleString() + (REP.last === 1 ? " building" : " buildings")
            : s === "empty"
              ? "No mapped buildings here"
              : "";
  el.style.display = REP.on && s ? "block" : "none";
}

// Imagery under the replica, sharpest last so it sits on top:
//  - EOxCloudless Sentinel-2 mosaic worldwide (10 m). CC BY-NC-SA 4.0: free for non-commercial
//    use, and the credit must be visible on the map while it shows (repCredit).
//  - US aerial photos (USDA NAIP via The National Map), public domain.
var REP_S2 = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg",
  REP_S2_CREDIT =
    "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)";
var REP_USGS =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}";
var REP_USGS_AREAS = [
  [-125, 24, -66.5, 49.5], // contiguous US
  [-170, 51, -129.5, 71.5], // Alaska
  [-160.5, 18.8, -154.6, 22.4], // Hawaii
  [-67.4, 17.8, -65.2, 18.6] // Puerto Rico and the Virgin Islands
];

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
  var tiles = function (url, max, r) {
    return v.imageryLayers.addImageryProvider(
      new C.UrlTemplateImageryProvider({
        url: url,
        tilingScheme: new C.WebMercatorTilingScheme(),
        rectangle: r ? C.Rectangle.fromDegrees(r[0], r[1], r[2], r[3]) : undefined,
        maximumLevel: max
      })
    );
  };
  REP.img = [tiles(REP_S2, 15)].concat(
    REP_USGS_AREAS.map(function (r) {
      return tiles(REP_USGS, 19, r);
    })
  );
}

// True when the point is covered by the US aerial photos.
function repInUS(lat, lon) {
  return REP_USGS_AREAS.some(function (r) {
    return lon >= r[0] && lon <= r[2] && lat >= r[1] && lat <= r[3];
  });
}

// The Sentinel-2 credit, shown on the map whenever that imagery is in view: everywhere from
// high up, and outside the US close in.
function repCredit(cp) {
  var el = $("repcr");
  if (!el) {
    el = document.createElement("div");
    el.id = "repcr";
    el.textContent = REP_S2_CREDIT;
    $("real").appendChild(el);
  }
  var show = REP.on && (cp.height > 400000 || !repInUS(cp.latitude / D, cp.longitude / D));
  el.style.display = show ? "block" : "none";
}

// Show or hide everything the replica has drawn: areas, city names, borders and country names.
function repShowAll(on) {
  var all = REP.areas.concat(
    REP.cities || [],
    Array.isArray(REP.atlas) ? [{ prims: REP.atlas }] : []
  );
  all.forEach(function (a) {
    (a.prims || []).forEach(function (p) {
      p.show = on;
    });
  });
}

function repOn() {
  if (!T4.v) return;
  REP.on = true;
  document.body.classList.add("replica");
  if (T4.ts) T4.ts.show = false;
  repImagery();
  repAtlas();
  repShowAll(true);
  repButton();
  T4.v.scene.requestRender();
  repTick();
}

function repOff() {
  REP.on = false;
  document.body.classList.remove("replica");
  if (T4.v && T4.v.scene.globe) T4.v.scene.globe.show = false;
  repShowAll(false);
  repStatus("");
  if ($("repcr")) $("repcr").style.display = "none";
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
  b.textContent = REP.on ? "GOOGLE" : "REPLICA";
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
      "Buildings, roofs, colours, roads, trees, water, parks and place names © OpenStreetMap contributors (ODbL). Aerial photos (US): USDA and USGS, The National Map. Satellite imagery elsewhere: " +
        REP_S2_CREDIT +
        ", CC BY-NC-SA 4.0. Borders: Natural Earth via world-atlas and us-atlas. Every other source is listed in Layers and in each item's details."
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
