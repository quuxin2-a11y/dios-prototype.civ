/*
 * Layers follow the zoom. Each layer has a range of view widths where it is useful: close-up layers
 * (bikes, pharmacies, buildings, property records) only when zoomed in, worldwide ones (satellites, day and
 * night, economy, country facts) only when zoomed out. A layer the person switched on stays switched on;
 * outside its range it is simply not drawn or loaded, and the Layers list says "ZOOM IN TO SHOW" or
 * "ZOOM OUT TO SHOW". Settings → Layers follow the zoom turns this off; a layer shown on its own with a
 * double-tap (solo) shows at any zoom.
 *
 * WL (module 10) is a view of the person's choices (WLU) through wlGate, which reads a layer as off while
 * WLZ.off names it. wlZoomCheck recomputes WLZ.off from the view a few times a second.
 */
// Set up before module 10 first reads a layer, since the modules run in order.
var WLZ = WLZ || { off: {}, km: 0 };
// Shown only when the view is narrower than this many km (layers without a maxKm of their own).
var WLZ_NEAR = { parcel: 80, bldg: 60 };
// Shown only when the view is wider than this many km.
var WLZ_FAR = {
  sat: 2500,
  night: 2500,
  space: 2500,
  economy: 2500,
  currency: 2500,
  countryfacts: 2500,
  farming: 2500,
  advisory: 2500,
  drought: 1200,
  outbreaks: 1200,
  leaders: 1200,
  cables: 250
};

// Layers that need one of the person's own keys: hidden from the Layers list and off until it is added.
// (Inside the function, because module 10 asks before this module has run.)
function wlNeedsKey(k) {
  var n = { ship: "ais" }[k];
  return !!n && !(typeof KEYS === "object" && KEYS && KEYS[n]);
}

function wlGate(raw) {
  WLZ = WLZ || { off: {}, km: 0 };
  return new Proxy(raw, {
    get: function (t, k) {
      if (k === "toJSON")
        return function () {
          return Object.assign({}, t); // what is saved is always the person's choices
        };
      var v = t[k];
      return v === true && ((WLZ && WLZ.off[k]) || wlNeedsKey(k)) ? false : v;
    }
  });
}

// Width of the view in km, on whichever map is showing.
function wlKm() {
  try {
    if (typeof T3 === "object" && T3 && T3.on && T3.map) {
      var z = T3.map.getZoom(),
        c = T3.map.getCenter();
      return (156543 * Math.cos((c.lat * Math.PI) / 180) * innerWidth) / Math.pow(2, z) / 1000;
    }
  } catch (x) {}
  return viewKm();
}

// [narrowest, widest] view in km at which a layer shows.
function wlBand(k) {
  var near = (IL[k] && IL[k].maxKm) || WLZ_NEAR[k] || Infinity;
  return [WLZ_FAR[k] || 0, near];
}

// Why a switched-on layer is hidden right now, for the Layers list, or "".
function wlZoomWhy(k) {
  var w = WLZ.off[k];
  return w === "in" ? "ZOOM IN TO SHOW" : w === "out" ? "ZOOM OUT TO SHOW" : "";
}

function wlZoomCheck() {
  if (!WLZ || typeof WLU !== "object") return;
  var km = wlKm(),
    on = typeof SET === "object" && SET && SET.zoomLayers !== false,
    next = {},
    changed = [];
  if (!isFinite(km) || km <= 0) return;
  WLZ.km = km;
  if (on)
    Object.keys(WLU).forEach(function (k) {
      if (WLU[k] !== true || (typeof SOLO === "object" && SOLO.key === k)) return;
      var b = wlBand(k),
        was = WLZ.off[k],
        // A little give at the edges, so a layer does not flicker on and off at the boundary.
        tooWide = km > b[1] * (was === "in" ? 0.9 : 1),
        tooNarrow = km < b[0] * (was === "out" ? 1.1 : 1);
      if (tooWide) next[k] = "in";
      else if (tooNarrow) next[k] = "out";
    });
  Object.keys(next)
    .concat(Object.keys(WLZ.off))
    .forEach(function (k) {
      if (next[k] !== WLZ.off[k] && changed.indexOf(k) < 0) changed.push(k);
    });
  if (!changed.length) return;
  WLZ.off = next;
  // Layers that just came into range load if they have nothing yet.
  changed.forEach(function (k) {
    if (next[k] || !WL[k] || !EMBED_OK) return;
    var d = WLDEF.filter(function (w) {
      return w[0] === k;
    })[0];
    if (d && d[4] && (!d[3] || !d[3]()))
      try {
        d[4]();
      } catch (x) {}
  });
  if (changed.indexOf("labels") >= 0) {
    patchA = null;
    patchP = null;
  }
  lastView = "";
  wstat();
}

setInterval(function () {
  if (!document.hidden) wlZoomCheck();
}, 600);
