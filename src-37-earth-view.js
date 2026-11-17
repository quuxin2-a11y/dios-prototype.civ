/**
 * @file Earth view: the start-up 3D globe.
 * Opens Replica World (the default), or the CesiumJS view from space on its own, the way the app
 * now starts, and draws the data layers and undersea cables in it on the graphics chip: cameras as
 * points (module 11), data-layer items as points and cables as lines. Falls back to the classic
 * globe when the 3D engine or Google's tiles are not available.
 *
 * Module 37 of 44. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// v63 saved "clear" as the look for everyone; the Earth view is the default from v64.
if (!(SET.lookV >= 2)) {
  SET.lookV = 2;
  if (SET.look === "clear") delete SET.look;
  setSave();
}

// From v69 the app starts in Replica World; "clear" and "replica" were the old defaults.
if (!(SET.lookV >= 3)) {
  SET.lookV = 3;
  if (SET.look === "clear" || SET.look === "replica") delete SET.look;
  setSave();
}

// The start-up view: "world" (default: the dashboard on the dark globe, modules 39 and 42),
// "replica" (the dashboard on the 3D Replica), "clear" (the satellite globe), "classic", or
// "earth" (Google 3D on its own).
function lookMode() {
  return SET.look || "world";
}

// Signature of what the data layers hold, so points are rebuilt only when something changed.
function t4DataKey() {
  return IL_ORDER.filter(function (k) {
    return WL[k] && k !== "cables" && IL[k].items.length;
  })
    .map(function (k) {
      return k + IL[k].items.length + ":" + IL[k].at;
    })
    .join("|");
}

// Data-layer items as points, and cables as lines, in the Earth view.
function t4Data() {
  var C = window.Cesium,
    v = T4.v;
  if (!C || !v || !T4.ready) return;
  var key = t4DataKey();
  if (!T4.ipts) T4.ipts = v.scene.primitives.add(new C.PointPrimitiveCollection());
  if (T4.ik !== key) {
    T4.ik = key;
    var pc = T4.ipts,
      white = C.Color.fromCssColorString("#ffffff").withAlpha(0.9),
      sc = new C.NearFarScalar(5e4, 1.6, 2e7, 0.8),
      seen = 0;
    pc.removeAll();
    IL_ORDER.forEach(function (k) {
      var d = IL[k];
      if (!WL[k] || k === "cables") return;
      for (var i = 0; i < d.items.length && seen < 40000; i++) {
        var e = d.items[i];
        if (!ilValid(e) || !focusHas(e.lat, e.lon)) continue;
        pc.add({
          position: C.Cartesian3.fromDegrees(e.lon, e.lat, 3000),
          color: C.Color.fromCssColorString(okColor(e.color)),
          pixelSize: Math.max(5, (e.size || 5) * 1.4),
          outlineColor: white,
          outlineWidth: 1.2,
          scaleByDistance: sc,
          id: e
        });
        seen++;
      }
    });
  }
  t4Cables();
}

function t4Cables() {
  var C = window.Cesium,
    v = T4.v,
    d = IL.cables,
    on = !!WL.cables && d && d.items.length;
  if (T4.cbl) T4.cbl.show = !!on;
  if (!on || T4.cbk === d.at) return;
  T4.cbk = d.at;
  if (!T4.cbl) T4.cbl = v.scene.primitives.add(new C.PolylineCollection());
  var pl = T4.cbl;
  pl.removeAll();
  d.items.forEach(function (e) {
    var mat = C.Material.fromType("Color", {
      color: C.Color.fromCssColorString(e.color).withAlpha(0.9)
    });
    e.parts.forEach(function (pt) {
      var flat = [];
      for (var i = 0; i < pt.length; i++) flat.push(pt[i][0], pt[i][1], 1500);
      if (flat.length >= 6)
        pl.add({
          positions: C.Cartesian3.fromDegreesArrayHeights(flat),
          width: 1.6,
          material: mat,
          id: e
        });
    });
  });
}

// Start in the Earth view from space, over the place the globe was showing.
// Start-up follows Globe look, whatever view was open last time (except the standard 3D view).
if (EMBED_OK && /^(world|replica)$/.test(lookMode()))
  setTimeout(function () {
    rwEnter({
      auto: true,
      mode: lookMode() === "world" ? "globe" : "replica",
      lon: rot.lon,
      lat: rot.lat
    });
  }, 400);
else if (EMBED_OK && lookMode() === "earth" && ls("ojos-view") !== "3d")
  setTimeout(function () {
    t4Open({
      auto: true,
      space: true,
      lon: rot.lon,
      lat: rot.lat,
      replica: lookMode() === "replica"
    });
  }, 900);
