/**
 * @file Replica World: the whole app in the 3D replica, behind one button.
 * ◆ Replica switches to a full-screen 3D world (module 38) with its own dashboard: a top bar
 * with the brand, live counts, search and the Galaxy button, and a dock for Layers, Cameras,
 * Events, Planes, Ships, Trains and Settings. Layers, settings and selections are the same ones
 * the globe uses, so a change in one world shows in the other.
 *
 * Module 39 of 41. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

var RW = { on: false };

var RW_DOCK = [
  ["layers", "Layers", '<path d="M12 4l9 4.5-9 4.5-9-4.5z"/><path d="M3 13l9 4.5 9-4.5"/>'],
  [
    "cams",
    "Cameras",
    '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10.5l5-2.5v8l-5-2.5"/>'
  ],
  ["events", "Events", '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>'],
  ["air", "Planes", '<path d="M3 13l18-6-6 14-3-6z"/>'],
  ["ship", "Ships", '<path d="M3 15h18l-3 5H6zM12 4v11M12 5l6 6h-6"/>'],
  [
    "transit",
    "Trains",
    '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 21l1.5-4M15 21l-1.5-4"/>'
  ],
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
    c("SEA", SHIPS.length, WL.ship) +
    c("TRN", TRANSIT.length, WL.transit)
  );
}

function rwDraw() {
  var el = $("rwdash");
  if (!el) {
    el = document.createElement("div");
    el.id = "rwdash";
    el.innerHTML =
      '<div class="rwtop">' +
      '<div class="rwbrand"><svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor"><path d="M32 3 61 32 32 61 3 32Z" stroke-width="3.2"/><path d="M32 14 50 32 32 50 14 32Z" stroke-width="2.6" opacity=".8"/></g><circle cx="32" cy="32" r="3.6" fill="currentColor"/></svg><b>REPLICA</b></div>' +
      '<div class="rwcount mono" id="rwcount"></div>' +
      '<button class="rwgal" data-rw="galaxy" aria-label="Galaxy">✦</button>' +
      '<button class="rwx" data-rw="exit" aria-label="Back to the globe">✕</button>' +
      "</div>" +
      '<form class="rwsearch" id="rwForm"><input id="rwq" type="search" placeholder="Search a city, address or place" autocomplete="off"><button>Go</button></form>' +
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
  Array.prototype.forEach.call(el.querySelectorAll(".rwdock button"), function (b) {
    var k = b.getAttribute("data-rw");
    if (k === "air" || k === "ship" || k === "transit") b.classList.toggle("on", !!WL[k]);
  });
}

function rwEnter(opt) {
  if (RW.on) return;
  RW.on = true;
  RW.t0 = Date.now();
  document.body.classList.add("rw");
  rwDraw();
  if (T4.on) repOn();
  else t4Open(Object.assign({ replica: true, quiet: true }, opt));
  document.body.classList.remove("sheet");
}

function rwExit() {
  if (!RW.on) return;
  RW.on = false;
  document.body.classList.remove("rw");
  if (T4.on) t4Close();
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
  else if (k === "galaxy") galOpen();
  else if (k === "set") brOpen("set");
  else if (k === "layers" || k === "cams" || k === "events") {
    var g = document.querySelector(".grid");
    if (document.body.classList.contains("sheet") && g && g.getAttribute("data-tab") === k)
      document.body.classList.remove("sheet");
    else setTab(k);
  } else if (k === "air" || k === "ship" || k === "transit") {
    setLayer(k, !WL[k]);
    rwDraw();
  }
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
});

// The logo: one tap switches between the globe and Replica World, five quick taps still open
// the signature (module 25), and holding it opens the sky. A single tap waits 420 ms to be sure
// it is not the start of the five.
var LOGO_SEL = ".brand, #brandov, .rwbrand",
  LOGO = { n: 0, timer: 0, hold: 0, held: false };

function logoToggleWorld() {
  if (ST || T4.st) return; // the logo first leaves the clean screen there (module 10)
  if (RW.on) rwExit();
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
  // The 3D view's own ✕ also leaves Replica World (after allowing time for the engine to load).
  if (!T4.on && Date.now() - RW.t0 > 25000) {
    RW.on = false;
    document.body.classList.remove("rw");
    return;
  }
  rwDraw();
}, 1000);
