/**
 * @file The dashboard: the app's one screen, over the dark globe (module 41).
 * A slim top bar (brand, live camera count, Search, Emergency, Hide menus) and a dock (Layers,
 * Cameras, Events, Conflict, Settings). Double-tapping a layer shows only that layer; double-tapping
 * it again brings the others back. Tapping the logo opens the sky (module 39); five quick
 * taps open the signature; holding it opens the sky too. "Hide menus" clears every control off
 * the screen, and one button brings them back. If the dark globe can't load, the same dashboard
 * sits over the globe the app draws itself, which needs nothing from the network.
 *
 * Module 38 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// "globe": the dark globe; "canvas": the app's own globe, used only when the dark globe can't load.
var RW = { on: false, mode: "globe" };

var RW_DOCK = [
  ["layers", "Layers", '<path d="M12 4l9 4.5-9 4.5-9-4.5z"/><path d="M3 13l9 4.5 9-4.5"/>'],
  [
    "cams",
    "Cameras",
    '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10.5l5-2.5v8l-5-2.5"/>'
  ],
  ["events", "Events", '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>'],
  [
    "conflict",
    "Conflict",
    '<path d="M12 3l2.2 5.6 6 .4-4.6 3.8 1.5 5.9L12 15.5 6.9 18.7l1.5-5.9L3.8 9l6-.4z"/>'
  ],
  [
    "set",
    "Settings",
    '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'
  ]
];

// Live counts for the top bar, the same numbers the globe's status strip shows.
function rwCounts() {
  // The camera count always; aircraft and ships only while they are switched on.
  var c = function (label, n) {
    return "<span><i>" + label + "</i>" + n.toLocaleString() + "</span>";
  };
  return (
    c("CAM", visLive.length) +
    (WL.air ? c("AIR", PLANES.length) : "") +
    (WL.ship ? c("SEA", SHIPS.length) : "")
  );
}

function rwDraw() {
  var el = $("rwdash");
  if (!el) {
    el = document.createElement("div");
    el.id = "rwdash";
    el.innerHTML =
      '<div class="rwtop">' +
      '<div class="rwbrand"><svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor"><path d="M32 3 61 32 32 61 3 32Z" stroke-width="3.2"/><path d="M32 14 50 32 32 50 14 32Z" stroke-width="2.6" opacity=".8"/></g><circle cx="32" cy="32" r="3.6" fill="currentColor"/></svg><b id="rwname">GLOBE</b></div>' +
      '<div class="rwcount mono" id="rwcount"></div>' +
      '<button data-rw="search" aria-label="Search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" width="19" height="19"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg></button>' +
      '<button class="rwemg" data-rw="emg" aria-label="Emergency">!</button>' +
      '<button data-rw="bare" aria-label="Hide menus">' +
      BARE_ICON +
      "</button>" +
      "</div>" +
      '<form class="rwsearch" id="rwForm"><input id="rwq" type="search" placeholder="Search a city, address or place" autocomplete="off"><button type="button" class="rwwhere" data-ph="where" aria-label="Where is this? Find a landmark from a photo">📷</button><button type="button" class="rwwhere" id="bDriveRw" aria-label="Drive: cameras along a route">➤</button><button>Go</button></form>' +
      '<nav class="rwdock">' +
      RW_DOCK.map(function (d) {
        return (
          '<button data-rw="' +
          d[0] +
          '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
          d[2] +
          "</svg><span>" +
          d[1] +
          "</span></button>"
        );
      }).join("") +
      "</nav>";
    document.body.appendChild(el);
  }
  var cnt = $("rwcount"),
    h = rwCounts();
  if (cnt && cnt._h !== h) {
    cnt._h = h;
    cnt.innerHTML = h;
  }
  var nm = $("rwname"),
    label = "OJOS DE DIOS";
  if (nm && nm.textContent !== label) nm.textContent = label;
  var cf = el.querySelector('.rwdock [data-rw="conflict"]');
  if (cf) cf.classList.toggle("on", !!WL.conflict);
  var sb = el.querySelector('[data-rw="search"]');
  if (sb) sb.classList.toggle("on", document.body.classList.contains("rwfind"));
}

// opt.mode picks the engine ("globe" unless given); opt.lon/lat place it; the rest goes to t4Open.
function rwEnter(opt) {
  opt = opt || {};
  if (RW.on) return;
  RW.on = true;
  document.body.classList.add("rw");
  document.body.classList.remove("sheet");
  rwDraw();
  rwMode(opt.mode || "globe", opt);
}

// The place in view in the current engine: [lon, lat, height in metres].
function rwWhere() {
  try {
    if (RW.mode === "globe" && T3.map) {
      var c = T3.map.getCenter();
      return [c.lng, c.lat, 35200000 / Math.pow(2, T3.map.getZoom())];
    }
  } catch (e) {}
  return [rot.lon, rot.lat, Math.max(800, viewKm() * 900)];
}

// "globe" is the dashboard's view; "canvas" (the globe the app draws itself, which needs nothing
// from the network) is used only when the dark globe can't load.
function rwMode(mode, opt) {
  opt = opt || {};
  var w =
    opt.lon != null
      ? [opt.lon, opt.lat, opt.h || 1.6e7]
      : RW.on && RW.t0
        ? rwWhere()
        : [rot.lon, rot.lat, 1.6e7];
  RW.mode = mode;
  RW.t0 = Date.now();
  RW.back = null; // a switch made here replaces the return from the 3D close-up
  document.body.classList.toggle("rw-globe", mode === "globe");
  document.body.classList.toggle("rw-canvas", mode === "canvas");
  rwDraw();
  if (T4.on) t4Close();
  if (mode === "canvas") {
    if (T3.on) t3Close();
    rot.lon = w[0];
    rot.lat = Math.max(-85, Math.min(85, w[1]));
    // Keep the same view width when handing over from the map engine.
    if (opt.h) zoom = clampZ((zoom * viewKm()) / Math.max(1, opt.h / 900));
    lastView = "";
    setTimeout(resize, 40);
    return;
  }
  t3Open({
    ops: true,
    lon: w[0],
    lat: w[1],
    zoom: Math.max(1.4, Math.min(17, Math.log(35200000 / Math.max(50, w[2])) / Math.LN2)),
    fail: function () {
      // No map engine (offline on the very first run): the app's own globe instead.
      if (RW.mode === "globe") rwMode("canvas", { lon: w[0], lat: w[1], h: w[2] });
    }
  });
}

function rwExit() {
  if (!RW.on) return;
  RW.on = false;
  document.body.classList.remove("rw", "rw-globe", "rw-canvas");
  if (T4.on) t4Close();
  if (T3.on) t3Close();
  setTimeout(resize, 40);
}

document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-rw]");
  if (!b) return;
  var k = b.getAttribute("data-rw");
  if (k === "exit") rwExit();
  else if (k === "bare") bareSet(true);
  else if (k === "emg") emgAsk();
  else if (k === "conflict") cfToggle();
  else if (k === "search") {
    var on = !document.body.classList.contains("rwfind");
    document.body.classList.toggle("rwfind", on);
    b.classList.toggle("on", on);
    if (on) $("rwq").focus();
  } else if (k === "galaxy") galOpen();
  else if (k === "set") brOpen("set");
  else if (k === "cams") cgOpen();
  else if (k === "layers" || k === "events") {
    var g = document.querySelector(".grid");
    if (document.body.classList.contains("sheet") && g && g.getAttribute("data-tab") === k)
      document.body.classList.remove("sheet");
    else setTab(k);
  }
});

// ---------- Hide menus: only the map and the data on it ----------
var BARE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';

function bareSet(on) {
  document.body.classList.toggle("bare", !!on);
  if (on) document.body.classList.remove("sheet", "rwfind");
  var x = $("bareX");
  if (!x) {
    x = document.createElement("button");
    x.id = "bareX";
    x.setAttribute("aria-label", "Show menus");
    x.innerHTML = BARE_ICON;
    document.body.appendChild(x);
  }
  if (T4.v) T4.v.scene.requestRender();
}

document.addEventListener("click", function (e) {
  if (e.target.closest("#bareX")) bareSet(false);
  else if (e.target.closest("#bBare")) bareSet(true);
});

// Search from the dashboard goes through the app's own search.
document.addEventListener("submit", function (e) {
  if (e.target.id !== "rwForm") return;
  e.preventDefault();
  var q = $("rwq").value.trim();
  if (!q) return;
  $("addr").value = q;
  var f = $("addrForm");
  if (f.requestSubmit) f.requestSubmit();
  else f.dispatchEvent(new Event("submit", { cancelable: true }));
  $("rwq").blur();
  document.body.classList.remove("rwfind");
});

// The logo: one tap opens the sky, five quick taps still open
// the signature (module 25), and holding it opens the sky. A single tap waits 420 ms to be sure
// it is not the start of the five.
var LOGO_SEL = ".brand, #brandov, .rwbrand",
  LOGO = { n: 0, timer: 0, hold: 0, held: false };

function logoTap() {
  if (ST || T4.st) return; // the logo first leaves the clean screen there (module 10)
  galOpen();
}

document.addEventListener("pointerdown", function (e) {
  if (!e.target.closest(LOGO_SEL)) return;
  clearTimeout(LOGO.hold);
  LOGO.held = false;
  LOGO.hold = setTimeout(function () {
    LOGO.held = true;
    LOGO.n = 0;
    clearTimeout(LOGO.timer);
    galOpen();
  }, 650);
});
["pointerup", "pointercancel", "pointerleave"].forEach(function (t) {
  document.addEventListener(t, function () {
    clearTimeout(LOGO.hold);
  });
});
document.addEventListener("click", function (e) {
  if (!e.target.closest(LOGO_SEL)) return;
  if (LOGO.held) {
    LOGO.held = false;
    return;
  }
  LOGO.n++;
  clearTimeout(LOGO.timer);
  LOGO.timer = setTimeout(function () {
    if (LOGO.n === 1) logoTap();
    LOGO.n = 0;
  }, 420);
});

setInterval(function () {
  if (!RW.on) return;
  // If the engine was closed some other way, leave the dashboard (after time for it to load).
  if (RW.mode === "globe" && !T3.on && !T4.on && Date.now() - RW.t0 > 25000) {
    errLog("Dashboard: the dark globe closed; showing the app's own globe");
    rwMode("canvas");
    return;
  }
  rwDraw();
}, 1000);

// ---------- Double-tap a layer: show only that one ----------
// Double-tapping a row in Layers switches every other data layer off; double-tapping it again
// brings back exactly the layers that were on before. The base map (imagery, labels, tiles,
// buildings) is left as it is. Rows are buttons that toggle on each tap, so the state is noted
// before the first tap and the second tap's toggle is held back.
var SOLO = { key: "", saved: null, last: "", t: 0, before: null, busy: false },
  SOLO_TAP_MS = 350,
  SOLO_BASE = { img: 1, labels: 1, tiles: 1, bldg: 1, parcel: 1, night: 1 };

function soloKeys() {
  return WLDEF.map(function (w) {
    return w[0];
  }).filter(function (k) {
    return !SOLO_BASE[k];
  });
}

function soloSnapshot() {
  var o = {};
  soloKeys().forEach(function (k) {
    o[k] = !!WL[k];
  });
  return o;
}

function soloApply(want) {
  SOLO.busy = true;
  Object.keys(want).forEach(function (k) {
    if (!!WL[k] !== want[k]) setLayer(k, want[k]);
  });
  SOLO.busy = false;
}

function soloLabel(k) {
  var w = WLDEF.filter(function (x) {
    return x[0] === k;
  })[0];
  return w ? w[1] : k;
}

document.addEventListener(
  "click",
  function (e) {
    var b = e.target.closest("[data-wl]");
    if (!b || SOLO.busy || !b.closest("#wlayers")) return;
    var k = b.getAttribute("data-wl"),
      now = Date.now();
    if (SOLO_BASE[k]) return;
    if (k !== SOLO.last || now - SOLO.t > SOLO_TAP_MS) {
      // First tap: remember the layers as they are, and let the tap toggle as usual.
      SOLO.last = k;
      SOLO.t = now;
      SOLO.before = soloSnapshot();
      return;
    }
    // Second tap: hold back its toggle, and switch solo on or off instead.
    e.stopImmediatePropagation();
    SOLO.last = "";
    if (SOLO.key === k && SOLO.saved) {
      soloApply(SOLO.saved);
      SOLO.key = "";
      SOLO.saved = null;
      note("Layers", "Your layers are back.");
    } else {
      SOLO.saved = SOLO.key && SOLO.saved ? SOLO.saved : SOLO.before;
      var only = {};
      soloKeys().forEach(function (x) {
        only[x] = x === k;
      });
      soloApply(only);
      SOLO.key = k;
      note(
        "Layers",
        "Showing only " + esc(soloLabel(k)) + ". Double-tap it again to bring back your layers."
      );
    }
  },
  true
);
