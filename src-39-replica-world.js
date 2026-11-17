/**
 * @file The dashboard: the app's main screen, over either map engine.
 * The dark globe (module 42) by default, or the full-screen 3D Replica (module 38); the logo
 * switches between them at the same place. A top bar
 * with the brand, live counts, the sky and "hide menus", and a dock for Layers, Cameras, Events,
 * Search and Settings. "Hide menus" clears every control off the screen (one button brings them
 * back), on the globe too. Layers, settings and selections are the same ones
 * the globe uses, so a change in one world shows in the other.
 *
 * Module 39 of 44. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// One dashboard, two map engines: "globe" (the dark globe, module 42) and "replica" (the 3D city,
// module 38). The logo switches between them, keeping the place in view.
var RW = { on: false, mode: "globe" };

var RW_DOCK = [
  ["layers", "Layers", '<path d="M12 4l9 4.5-9 4.5-9-4.5z"/><path d="M3 13l9 4.5 9-4.5"/>'],
  [
    "cams",
    "Cameras",
    '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10.5l5-2.5v8l-5-2.5"/>'
  ],
  ["events", "Events", '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>'],
  ["search", "Search", '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'],
  [
    "set",
    "Settings",
    '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'
  ]
];

// Live counts for the top bar, the same numbers the globe's status strip shows.
function rwCounts() {
  var c = function (label, n, on) {
    return "<span><i>" + label + "</i>" + (on ? n.toLocaleString() : "—") + "</span>";
  };
  return (
    c("CAM", visLive.length, true) +
    c("AIR", PLANES.length, WL.air) +
    c("SEA", SHIPS.length, WL.ship)
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
      '<button class="rwemg" data-rw="emg" aria-label="Emergency">!</button>' +
      '<button class="rwgal" data-rw="galaxy" aria-label="Sky">✦</button>' +
      '<button data-rw="bare" aria-label="Hide menus">' +
      BARE_ICON +
      "</button>" +
      "</div>" +
      '<form class="rwsearch" id="rwForm"><input id="rwq" type="search" placeholder="Search a city, address or place" autocomplete="off"><button type="button" class="rwwhere" data-ph="where" aria-label="Where is this? Find a landmark from a photo">📷</button><button>Go</button></form>' +
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
    label = RW.mode === "replica" ? "REPLICA 3D" : "OJOS DE DIOS";
  if (nm && nm.textContent !== label) nm.textContent = label;
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
    if (RW.mode === "replica" && T4.v) {
      var p = T4.v.camera.positionCartographic;
      return [p.longitude / D, p.latitude / D, p.height];
    }
  } catch (e) {}
  return [rot.lon, rot.lat, 1.6e7];
}

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
  document.body.classList.toggle("rw-globe", mode === "globe");
  document.body.classList.toggle("rw-replica", mode === "replica");
  rwDraw();
  if (mode === "globe") {
    if (T4.on) t4Close();
    t3Open({
      ops: true,
      lon: w[0],
      lat: w[1],
      zoom: Math.max(1.4, Math.min(17, Math.log(35200000 / Math.max(50, w[2])) / Math.LN2)),
      fail: function () {
        // No map engine (offline on the first run): the 3D replica still works from the phone.
        if (RW.mode === "globe") rwMode("replica", { lon: w[0], lat: w[1], h: w[2] });
      }
    });
  } else {
    if (T3.on) t3Close();
    // Photo-real 3D (Google's tiles) unless the model was chosen or there is no key for it.
    var close = w[2] < 60000,
      photo = SET.rw3d !== "model" && !!kG3();
    if (T4.on) photo ? t4Google() : repOn();
    else
      t4Open(
        Object.assign(
          { replica: !photo, quiet: true },
          close
            ? { close: true, lon: w[0], lat: w[1] }
            : { space: true, lon: w[0], lat: w[1], h: w[2] },
          opt.auto && !photo ? { auto: true } : {}
        )
      );
  }
}

function rwExit() {
  if (!RW.on) return;
  RW.on = false;
  document.body.classList.remove("rw", "rw-globe", "rw-replica");
  if (T4.on) t4Close();
  if (T3.on) t3Close();
}

document.addEventListener("click", function (e) {
  if (e.target.closest("#bRW")) {
    rwEnter();
    return;
  }
  var b = e.target.closest("[data-rw]");
  if (!b) return;
  var k = b.getAttribute("data-rw");
  if (k === "exit") rwExit();
  else if (k === "bare") bareSet(true);
  else if (k === "emg") emgAsk();
  else if (k === "search") {
    var on = !document.body.classList.contains("rwfind");
    document.body.classList.toggle("rwfind", on);
    b.classList.toggle("on", on);
    if (on) $("rwq").focus();
  } else if (k === "galaxy") galOpen();
  else if (k === "set") brOpen("set");
  else if (k === "layers" || k === "cams" || k === "events") {
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

// Search from the Replica bar goes through the app's own search.
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

// The logo: one tap switches between the globe and Replica World, five quick taps still open
// the signature (module 25), and holding it opens the sky. A single tap waits 420 ms to be sure
// it is not the start of the five.
var LOGO_SEL = ".brand, #brandov, .rwbrand",
  LOGO = { n: 0, timer: 0, hold: 0, held: false };

function logoToggleWorld() {
  if (ST || T4.st) return; // the logo first leaves the clean screen there (module 10)
  if (RW.on) rwMode(RW.mode === "globe" ? "replica" : "globe");
  else rwEnter();
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
    if (LOGO.n === 1) logoToggleWorld();
    LOGO.n = 0;
  }, 420);
});

setInterval(function () {
  if (!RW.on) return;
  // If the engine was closed some other way, leave the dashboard (after time for it to load).
  if (!(RW.mode === "globe" ? T3.on : T4.on) && Date.now() - RW.t0 > 25000) {
    RW.on = false;
    document.body.classList.remove("rw", "rw-globe", "rw-replica");
    return;
  }
  rwDraw();
}, 1000);
