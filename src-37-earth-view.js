/**
 * @file Start-up and the 3D view's data.
 * Decides how the app starts (the dashboard on the dark globe, with a safe start after a start
 * that never drew), and draws the data layers and undersea cables in the CesiumJS 3D view used by
 * the classic screen's tools: data-layer items as points and cables as lines.
 *
 * Module 37 of 45. Modules share one scope: build.py concatenates them in order
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

// The dashboard on the dark globe is the app's only screen, and no saved setting can change that:
// any look saved by an older version is cleared. The original screen exists only for the
// automated tests, which ask for it with window.__ODD_CLASSIC.
// Flat map was chosen to escape the globe's flicker before Smooth globe existed: move to it once.
if (!(SET.displayV >= 1)) {
  SET.displayV = 1;
  if (SET.display === "flat" && displayFlicky()) SET.display = "hybrid";
  setSave();
}
if (!(SET.lookV >= 5)) {
  SET.lookV = 5;
  delete SET.look;
  delete SET.rw3d;
  setSave();
}

function lookMode() {
  return window.__ODD_CLASSIC ? "classic" : "world";
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

// Start-up: the dashboard (module 38) over the dark globe, always. A start that never got a map on
// screen last time (closed on a black screen, or crashed) gets a shorter wait before the
// fallback; module 42 marks the start good once a map has drawn.
var BOOT_SAFE = ls("ojos-boot") === "pending",
  BOOT_DASH = EMBED_OK && lookMode() === "world" && displayMode() !== "hybrid";
ls("ojos-boot", "pending");
if (BOOT_DASH)
  setTimeout(function () {
    rwEnter({ auto: true, mode: "globe", lon: rot.lon, lat: rot.lat });
  }, 400);
else if (EMBED_OK && lookMode() === "world")
  setTimeout(function () {
    rwEnter({ auto: true, mode: "canvas", lon: rot.lon, lat: rot.lat });
  }, 400);
