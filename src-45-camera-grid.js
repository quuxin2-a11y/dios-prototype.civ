/**
 * @file Camera grid: every camera in a city, state or the area in view, as mini tiles.
 * Type a place (or use what's on the map) and its cameras fill a grid of small live pictures,
 * nearest the centre first, one screenful per page (‹ › or a swipe for the next page). Tap a tile
 * to make it big, tap again to shrink it back; several can be big at once. Big tiles refresh every
 * few seconds and small ones about once a minute, and only the page in view loads anything.
 * Opens from Cameras in the dashboard's dock; its ➤ button opens Drive (cameras along a route).
 * A grid can be saved under its name (☆ SAVE) and comes back with one tap from the row of saved
 * grids, without looking the place up again.
 *
 * Module 44 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

var CG = {
    open: false,
    list: [],
    page: 0,
    place: "",
    big: {},
    box: null,
    q: "",
    saved: ls("ojos-cg-saved") || []
  },
  CG_SAVED_MAX = 12,
  CG_BIG_MS = 4000,
  CG_SMALL_MS = 60000;

// The area to look in: a place's bounding box from OpenStreetMap, or the view.
function cgArea(q) {
  if (!q) return Promise.resolve(cgViewBox());
  return getJSON(
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=" +
      encodeURIComponent(q),
    15000
  ).then(function (j) {
    var r = j && j[0],
      b = r && r.boundingbox && r.boundingbox.map(Number);
    if (!b || b.some(isNaN)) throw new Error("place not found");
    // A little wider than the place itself, so cameras on its edge roads are included.
    var pad = Math.max(0.02, (b[1] - b[0]) * 0.05);
    return {
      s: b[0] - pad,
      n: b[1] + pad,
      w: b[2] - pad,
      e: b[3] + pad,
      lat: +r.lat,
      lon: +r.lon,
      name: String(r.display_name || q)
        .split(",")
        .slice(0, 2)
        .join(",")
    };
  });
}

function cgViewBox() {
  var b;
  if (T3.on && T3.map) {
    var bd = T3.map.getBounds(),
      c = T3.map.getCenter();
    b = {
      s: bd.getSouth(),
      n: bd.getNorth(),
      w: bd.getWest(),
      e: bd.getEast(),
      lat: c.lat,
      lon: c.lng
    };
  } else {
    b = viewBox(0);
    b.lat = rot.lat;
    b.lon = rot.lon;
  }
  b.name = "the area in view";
  // Zoomed out to a whole continent or more: every camera, nearest the centre of the view first.
  if (!(b.n - b.s < 40 && b.e - b.w < 60 && b.e > b.w)) {
    b = {
      s: -90,
      n: 90,
      w: -180,
      e: 180,
      lat: b.lat,
      lon: b.lon,
      name: "the world, nearest the centre first"
    };
  }
  return b;
}

// Cameras inside a box, nearest its centre first.
function cgPick(box) {
  return visLive
    .filter(function (c) {
      return c.lat >= box.s && c.lat <= box.n && c.lon >= box.w && c.lon <= box.e;
    })
    .map(function (c) {
      return [hav(box.lat, box.lon, c.lat, c.lon), c];
    })
    .sort(function (a, b) {
      return a[0] - b[0];
    })
    .map(function (x) {
      return x[1];
    });
}

// ---------- The panel ----------
function cgOpen(q) {
  var el = $("cgp");
  if (!el) {
    el = document.createElement("div");
    el.id = "cgp";
    el.innerHTML =
      '<form class="cghead" id="cgForm"><input id="cgq" type="search" placeholder="City or state" autocomplete="off"><button>Show</button><button type="button" class="cgdrive" data-cg="drive" aria-label="Drive: cameras along a route">➤</button><button type="button" data-cg="x" aria-label="Close">✕</button></form>' +
      '<div class="cgsaved" id="cgsaved"></div><div class="cgsub mono" id="cgsub"></div><div class="cggrid" id="cggrid"></div>' +
      '<div class="cgpager"><button data-cg="prev" aria-label="Previous page">‹</button><span class="mono" id="cgpg"></span><button data-cg="next" aria-label="Next page">›</button></div>';
    cgSwipe(el);
    document.body.appendChild(el);
  }
  CG.open = true;
  document.body.classList.add("cg-open");
  el.style.display = "flex";
  cgLoad(q || "");
}

function cgClose() {
  CG.open = false;
  document.body.classList.remove("cg-open");
  var el = $("cgp");
  if (el) el.style.display = "none";
  var g = $("cggrid");
  if (g) g.innerHTML = ""; // stop every picture loading
}

// q: a place to look up; box: a saved grid's area, used as it is.
function cgLoad(q, box) {
  CG.big = {};
  CG.q = q;
  $("cggrid").innerHTML = "";
  $("cgsub").textContent = q ? "FINDING " + q.toUpperCase() + "…" : "CAMERAS IN VIEW…";
  (box ? Promise.resolve(box) : cgArea(q))
    .then(function (b) {
      CG.box = b;
      CG.place = b.name;
      CG.list = cgPick(b);
      cgPage(0);
      cgSavedDraw();
    })
    .catch(function () {
      $("cgsub").textContent = "COULDN'T FIND THAT PLACE · TRY A CITY OR STATE NAME";
    });
}

function cgSub() {
  $("cgsub").textContent = CG.list.length
    ? CG.list.length.toLocaleString() +
      " CAMERAS · " +
      CG.place.toUpperCase() +
      " · TAP TO ENLARGE, TAP AGAIN TO SHRINK"
    : "NO LIVE CAMERAS IN " + CG.place.toUpperCase();
}

// ---------- Saved grids ----------
// The name a grid is saved under: what was typed, else the place found, else "Area 1", "Area 2"…
function cgSaveName() {
  var n =
    CG.q ||
    (CG.box && !/area in view|the world/.test(CG.box.name) ? CG.box.name.split(",")[0] : "");
  n = String(n || "Area " + (CG.saved.length + 1)).trim();
  return n.charAt(0).toUpperCase() + n.slice(1, 28);
}

function cgSavedDraw() {
  var el = $("cgsaved");
  if (!el) return;
  var name = CG.box ? cgSaveName() : "",
    // Already saved: the same area, under whatever name.
    has = CG.saved.some(function (s) {
      return (
        CG.box &&
        s.box.s === CG.box.s &&
        s.box.n === CG.box.n &&
        s.box.w === CG.box.w &&
        s.box.e === CG.box.e
      );
    });
  el.innerHTML =
    CG.saved
      .map(function (s, i) {
        return (
          '<span class="cgchip' +
          (CG.box && s.box.s === CG.box.s && s.box.w === CG.box.w ? " on" : "") +
          '"><button data-cg="sv-' +
          i +
          '">' +
          esc(s.n) +
          '</button><button data-cg="del-' +
          i +
          '" aria-label="Remove ' +
          esc(s.n) +
          '">✕</button></span>'
        );
      })
      .join("") +
    (CG.box && CG.list.length && !has
      ? '<button class="cgsave mono" data-cg="save">☆ SAVE ' + esc(name.toUpperCase()) + "</button>"
      : "");
  el.style.display = el.innerHTML ? "" : "none";
}

function cgSave() {
  if (!CG.box) return;
  if (CG.saved.length >= CG_SAVED_MAX) {
    note("Camera grid", "You can save up to " + CG_SAVED_MAX + " grids. Remove one first.");
    return;
  }
  var b = CG.box;
  CG.saved.push({
    n: cgSaveName(),
    box: { s: b.s, n: b.n, w: b.w, e: b.e, lat: b.lat, lon: b.lon, name: b.name }
  });
  ls("ojos-cg-saved", CG.saved);
  cgSavedDraw();
}

// Tiles per page: as many as fit on the screen without scrolling (2 across on a phone).
function cgPer() {
  var g = $("cggrid"),
    w = (g && g.clientWidth) || innerWidth,
    h = (g && g.clientHeight) || innerHeight - 170,
    cols = w < 640 ? 2 : w < 1000 ? 3 : 4,
    tileH = ((w - 12 - (cols - 1) * 8) / cols) * 0.625 + 8;
  return cols * Math.max(2, Math.floor(h / tileH));
}

function cgPages() {
  return Math.max(1, Math.ceil(CG.list.length / cgPer()));
}

function cgPage(p) {
  var g = $("cggrid"),
    per = cgPer();
  CG.page = Math.max(0, Math.min(cgPages() - 1, p));
  CG.big = {};
  var from = CG.page * per,
    to = Math.min(CG.list.length, from + per),
    h = "";
  for (var i = from; i < to; i++) {
    var c = CG.list[i];
    h +=
      '<div class="cgt" data-cg="t-' +
      i +
      '"><img alt="" data-u="' +
      esc(c.u) +
      '" data-src="' +
      esc(c.e) +
      '"><span>' +
      esc(c.n || "Camera") +
      "</span></div>";
  }
  g.innerHTML = h; // the previous page's pictures stop loading
  g.scrollTop = 0;
  var n = cgPages();
  $("cgpg").textContent = CG.list.length
    ? "PAGE " + (CG.page + 1) + " OF " + n.toLocaleString()
    : "";
  document.querySelector("#cgp .cgpager").style.visibility = n > 1 ? "" : "hidden";
  document.querySelector("#cgp [data-cg='prev']").disabled = CG.page === 0;
  document.querySelector("#cgp [data-cg='next']").disabled = CG.page >= n - 1;
  cgSub();
  cgWatch();
}

// A sideways swipe on the grid turns the page.
function cgSwipe(el) {
  var x0 = null,
    y0 = 0;
  el.addEventListener(
    "touchstart",
    function (e) {
      if (e.target.closest(".cghead") || e.touches.length !== 1) return (x0 = null);
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
    },
    { passive: true }
  );
  el.addEventListener(
    "touchend",
    function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0,
        dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) cgPage(CG.page + (dx < 0 ? 1 : -1));
    },
    { passive: true }
  );
}

// Pictures load as tiles scroll into view, and stop refreshing when they scroll away.
function cgWatch() {
  if (!("IntersectionObserver" in window)) {
    Array.prototype.forEach.call($("cggrid").querySelectorAll("img:not([src])"), cgShow);
    return;
  }
  if (!CG.io)
    CG.io = new window.IntersectionObserver(
      function (es) {
        es.forEach(function (e) {
          var im = e.target;
          im._vis = e.isIntersecting;
          if (e.isIntersecting && !im.getAttribute("src")) cgShow(im);
        });
      },
      { root: $("cggrid"), rootMargin: "200px" }
    );
  Array.prototype.forEach.call($("cggrid").querySelectorAll("img:not([data-w])"), function (im) {
    im.setAttribute("data-w", "1");
    CG.io.observe(im);
  });
}

function cgShow(im) {
  im._t = Date.now();
  // A camera that isn't answering shows as a plain dark tile with its name, not a broken image.
  im.onerror = function () {
    im.style.visibility = "hidden";
  };
  im.onload = function () {
    im.style.visibility = "";
  };
  var u = im.getAttribute("data-src");
  if (isJ(u)) snapRefresh(im);
  else im.src = u;
}

// Big tiles every few seconds, small ones on screen about once a minute.
setInterval(function () {
  if (!CG.open || document.hidden) return;
  var now = Date.now();
  Array.prototype.forEach.call($("cggrid").querySelectorAll(".cgt img[src]"), function (im) {
    var big = im.parentNode.classList.contains("big");
    if ((big || im._vis) && now - (im._t || 0) > (big ? CG_BIG_MS : CG_SMALL_MS)) {
      im._t = now;
      snapRefresh(im);
    }
  });
}, 1000);

document.addEventListener("submit", function (e) {
  if (e.target.id !== "cgForm") return;
  e.preventDefault();
  var q = $("cgq").value.trim();
  $("cgq").blur();
  cgLoad(q);
});

document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-cg]");
  if (!b) return;
  var k = b.getAttribute("data-cg");
  if (k === "x") cgClose();
  else if (k === "drive") {
    // Drive: the cameras along a route, live as you go (module 04).
    cgClose();
    drvPanel();
  } else if (k === "save") cgSave();
  else if (k.indexOf("sv-") === 0) {
    var sv = CG.saved[+k.slice(3)];
    if (sv) {
      $("cgq").value = sv.n;
      cgLoad(sv.n, sv.box);
    }
  } else if (k.indexOf("del-") === 0) {
    CG.saved.splice(+k.slice(4), 1);
    ls("ojos-cg-saved", CG.saved);
    cgSavedDraw();
  } else if (k === "prev") cgPage(CG.page - 1);
  else if (k === "next") cgPage(CG.page + 1);
  else if (k.indexOf("open-") === 0) {
    var c = CG.list[+k.slice(5)];
    if (!c) return;
    cgClose();
    select(c);
  } else if (k.indexOf("t-") === 0) {
    // Tap: make it big (with a button to open the full viewer); tap again: back to a mini tile.
    var i = +k.slice(2),
      big = b.classList.toggle("big"),
      im = b.querySelector("img");
    CG.big[i] = big;
    var o = b.querySelector(".cgopen");
    if (big && !o)
      b.insertAdjacentHTML(
        "beforeend",
        '<button class="cgopen" data-cg="open-' +
          i +
          '" aria-label="Open this camera">⤢ Open</button><button class="cgopen cgweb" data-cpo="g' +
          i +
          '" aria-label="Show the cameras around this one on the map">📍 Nearby</button>'
      );
    else if (!big && o)
      Array.prototype.forEach.call(b.querySelectorAll(".cgopen"), function (x) {
        x.remove();
      });
    if (big && im) {
      im._t = Date.now();
      snapRefresh(im);
      b.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
});

// ---------- Map pins: the cameras around one, floating over the map ----------
// Tapping a camera on the map (or 📍 Nearby on a camera) fits the map to it and its nearest
// cameras, and each one gets its own live tile floating beside its real spot on the map, joined to
// it by a line. The tapped camera's tile is larger. The tiles follow the map as it moves and push
// each other apart so none overlaps. Tapping a tile makes that camera the centre; tapping the
// centre tile opens it full screen.
var CP = {
    open: false,
    c: null,
    n: ls("ojos-cp-n") || 8,
    items: [],
    pos: [],
    raf: 0,
    auto: false,
    snooze: false,
    big: {}
  },
  CP_AUTO_Z = 12.5, // zoomed in this far on the map, the pins appear by themselves
  CP_AUTO_KM = 30, // or, on the app's own globe, with a view narrower than this
  CP_TOP = 96, // the top bar
  CP_BOTTOM = 96; // the dock

// Screen position (CSS pixels) of a place on whichever map is showing, or null when off the globe.
function cpScreen(lon, lat) {
  if (T3.on && T3.map) {
    var m = T3.map,
      q = m.project([lon, lat]),
      ct = m.getContainer && m.getContainer(),
      box = ct ? ct.getBoundingClientRect() : { left: 0, top: 0 };
    return q ? [q.x + box.left, q.y + box.top] : null;
  }
  var p = proj(lon, lat),
    r = cv.getBoundingClientRect();
  return p && p[2] > 0 ? [p[0] + r.left, p[1] + r.top] : null;
}

// The nearest cameras to c, nearest first.
function cpNear(c, n) {
  var out = [];
  for (var i = 0; i < visLive.length; i++) {
    var o = visLive[i];
    if (o === c || o.u === c.u || !o.e) continue;
    var km = hav(c.lat, c.lon, o.lat, o.lon);
    if (out.length < n || km < out[out.length - 1].km) {
      out.push({ c: o, km: km });
      out.sort(function (a, b) {
        return a.km - b.km;
      });
      if (out.length > n) out.pop();
    }
  }
  return out;
}

// Frames the map on the camera and its neighbours, with room around them for the tiles.
function cpFit() {
  var all = [CP.c].concat(
      CP.items.map(function (x) {
        return x.c;
      })
    ),
    w = 180,
    e = -180,
    s = 90,
    n = -90;
  all.forEach(function (c) {
    w = Math.min(w, c.lon);
    e = Math.max(e, c.lon);
    s = Math.min(s, c.lat);
    n = Math.max(n, c.lat);
  });
  if (T3.on && T3.map && T3.map.fitBounds) {
    T3.map.fitBounds(
      [
        [w, s],
        [e, n]
      ],
      {
        padding: { top: CP_TOP + 70, bottom: CP_BOTTOM + 70, left: 80, right: 80 },
        maxZoom: 15.5,
        duration: 1200
      }
    );
  } else {
    var km = Math.max(2, hav(s, w, n, e));
    spin = false;
    target = { lon: CP.c.lon, lat: CP.c.lat, z: clampZ((zoom * viewKm()) / (km * 2.6)) };
  }
}

// auto: shown because the map is zoomed in (the map is left where it is), rather than for a tapped camera.
function cpOpen(c, auto) {
  if (!c || !c.live) return;
  CP.auto = !!auto;
  var el = $("cpins");
  if (!el) {
    el = document.createElement("div");
    el.id = "cpins";
    el.innerHTML =
      '<svg class="cplines"></svg><div class="cptiles"></div><div class="cphead"><b class="mono" id="cpname"></b><button data-cp="n" class="mono"></button><button data-cp="x" aria-label="Close">✕</button></div>';
    document.body.appendChild(el);
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cp]");
      if (!b) return;
      var k = b.getAttribute("data-cp");
      if (k === "x") {
        // Closed while they came by themselves: they stay away until the next zoom in.
        if (CP.auto) CP.snooze = true;
        cpClose();
      } else if (k === "n") {
        CP.n = CP.n === 8 ? 16 : 8;
        ls("ojos-cp-n", CP.n);
        cpOpen(CP.c, CP.auto);
      } else if (k.indexOf("open-") === 0) {
        // ⤢ on a big tile: that camera full screen.
        var i = +k.slice(5),
          oc = i ? CP.items[i - 1] && CP.items[i - 1].c : CP.c;
        if (!oc) return;
        cpClose();
        select(oc);
        addWall(oc, true);
      } else if (k === "mid" || k.indexOf("t-") === 0) {
        // Tap a tile to enlarge it where it is; tap again to shrink it back.
        var ix = k === "mid" ? 0 : +k.slice(2) + 1;
        CP.big[ix] = !CP.big[ix];
        b.classList.toggle("big", CP.big[ix]);
        var ob = b.querySelector(".cpopen");
        if (CP.big[ix] && !ob)
          b.insertAdjacentHTML(
            "beforeend",
            '<i class="cpopen" data-cp="open-' + ix + '" aria-label="Open full screen">⤢</i>'
          );
        else if (!CP.big[ix] && ob) ob.remove();
        var im = b.querySelector("img");
        if (CP.big[ix] && im) snapRefresh(im);
      }
    });
  }
  CP.c = c;
  CP.open = true;
  CP.items = cpNear(c, CP.n);
  CP.pos = [];
  CP.big = {};
  el.style.display = "block";
  document.body.classList.add("cp-open");
  $("cpname").textContent = (auto ? "CAMERAS HERE · " : "") + String(c.n || "Camera").toUpperCase();
  el.querySelector('[data-cp="n"]').textContent = CP.n === 8 ? "8 → 16" : "16 → 8";
  var tiles =
    cpTile(c, "mid", "mid", "TAP TO ENLARGE") +
    CP.items
      .map(function (x, i) {
        var mi = x.km * 0.621;
        return cpTile(
          x.c,
          "",
          "t-" + i,
          mi < 0.1
            ? Math.round(mi * 5280) + " FT"
            : (mi < 10 ? mi.toFixed(1) : Math.round(mi)) + " MI"
        );
      })
      .join("");
  el.querySelector(".cptiles").innerHTML = tiles;
  Array.prototype.forEach.call(el.querySelectorAll(".cpt img"), function (im) {
    im.onerror = function () {
      im.style.visibility = "hidden";
    };
    im.onload = function () {
      im.style.visibility = "";
    };
    var u = im.getAttribute("data-src");
    if (isJ(u)) snapRefresh(im);
    else im.src = u;
  });
  if (!auto) cpFit();
  cancelAnimationFrame(CP.raf);
  CP.raf = requestAnimationFrame(cpFrame);
}

function cpTile(c, cls, k, sub) {
  return (
    '<button class="cpt ' +
    cls +
    '" data-cp="' +
    k +
    '"><img alt="" referrerpolicy="no-referrer" data-u="' +
    esc(c.u) +
    '" data-src="' +
    esc(c.e) +
    '"><span>' +
    esc(c.n || "Camera") +
    "</span><em>" +
    esc(sub) +
    "</em></button>"
  );
}

function cpClose() {
  CP.open = false;
  cancelAnimationFrame(CP.raf);
  var el = $("cpins");
  if (el) {
    el.style.display = "none";
    el.querySelector(".cptiles").innerHTML = ""; // stop every picture loading
    el.querySelector(".cplines").innerHTML = "";
  }
  document.body.classList.remove("cp-open");
}

// Each frame: anchor every tile beside its camera's spot, then push overlapping tiles apart,
// starting from where they were last frame so they move smoothly with the map.
function cpFrame() {
  if (!CP.open) return;
  CP.raf = requestAnimationFrame(cpFrame);
  var el = $("cpins"),
    W2 = innerWidth,
    H2 = innerHeight,
    nodes = el.querySelectorAll(".cpt"),
    list = [CP.c].concat(
      CP.items.map(function (x) {
        return x.c;
      })
    ),
    a0 = cpScreen(CP.c.lon, CP.c.lat),
    lines = "";
  if (!a0) a0 = [W2 / 2, H2 / 2];
  var P = list.map(function (c, i) {
    var a = cpScreen(c.lon, c.lat),
      big = i === 0,
      w = CP.big[i]
        ? W2 < 520
          ? Math.min(W2 - 24, 300)
          : 380
        : big
          ? W2 < 520
            ? 132
            : 170
          : W2 < 520
            ? 92
            : 120,
      h = Math.round(w * 0.625) + 28,
      prev = CP.pos[i];
    if (!a) return { hide: true };
    var dx = a[0] - a0[0],
      dy = a[1] - a0[1],
      d = Math.hypot(dx, dy) || 1,
      want = big
        ? [a[0], a[1] - h / 2 - 16]
        : [a[0] + (dx / d) * 64, a[1] + (dy / d) * 64 - (i % 2 ? 24 : -24)];
    return {
      a: a,
      w: w,
      h: h,
      x: prev && !prev.hide ? prev.x + (want[0] - prev.x) * 0.35 : want[0],
      y: prev && !prev.hide ? prev.y + (want[1] - prev.y) * 0.35 : want[1]
    };
  });
  for (var it = 0; it < 30; it++)
    for (var i = 0; i < P.length; i++) {
      var A = P[i];
      if (A.hide) continue;
      for (var j = i + 1; j < P.length; j++) {
        var B = P[j];
        if (B.hide) continue;
        var ox = (A.w + B.w) / 2 + 6 - Math.abs(B.x - A.x),
          oy = (A.h + B.h) / 2 + 6 - Math.abs(B.y - A.y);
        if (ox > 0 && oy > 0) {
          var wa = i === 0 ? 0.15 : 0.5; // the centre tile gives way least
          if (ox < oy) {
            var sx = (B.x >= A.x ? 1 : -1) * ox;
            A.x -= sx * wa;
            B.x += sx * (1 - wa);
          } else {
            var sy = (B.y >= A.y ? 1 : -1) * oy;
            A.y -= sy * wa;
            B.y += sy * (1 - wa);
          }
        }
      }
      A.x = Math.max(A.w / 2 + 4, Math.min(W2 - A.w / 2 - 4, A.x));
      A.y = Math.max(CP_TOP + A.h / 2, Math.min(H2 - CP_BOTTOM - A.h / 2, A.y));
    }
  P.forEach(function (p, i) {
    var n = nodes[i];
    if (!n) return;
    if (p.hide) {
      n.style.display = "none";
      return;
    }
    n.style.display = "block";
    n.style.width = p.w + "px";
    n.style.transform =
      "translate(" + Math.round(p.x - p.w / 2) + "px," + Math.round(p.y - p.h / 2) + "px)";
    // The line runs from the tile's nearest edge to the camera's spot.
    var ex = Math.max(p.x - p.w / 2, Math.min(p.x + p.w / 2, p.a[0])),
      ey = Math.max(p.y - p.h / 2, Math.min(p.y + p.h / 2, p.a[1]));
    lines +=
      '<line x1="' +
      ex.toFixed(1) +
      '" y1="' +
      ey.toFixed(1) +
      '" x2="' +
      p.a[0].toFixed(1) +
      '" y2="' +
      p.a[1].toFixed(1) +
      '"' +
      (i ? "" : ' class="mid"') +
      "/>" +
      '<circle cx="' +
      p.a[0].toFixed(1) +
      '" cy="' +
      p.a[1].toFixed(1) +
      '" r="' +
      (i ? 4 : 6) +
      '"' +
      (i ? "" : ' class="mid"') +
      "/>";
  });
  CP.pos = P;
  el.querySelector(".cplines").innerHTML = lines;
}

// ---------- Pins by themselves when zoomed in ----------
function cpZoomedIn() {
  if (T3.on && T3.map) return T3.map.getZoom() >= CP_AUTO_Z;
  return viewKm() < CP_AUTO_KM;
}

// The live camera nearest the middle of the screen, among those on screen, with its distance in pixels.
function cpCentreCam() {
  var b;
  if (T3.on && T3.map && T3.map.getBounds) {
    var bd = T3.map.getBounds();
    b = { s: bd.getSouth(), n: bd.getNorth(), w: bd.getWest(), e: bd.getEast() };
  } else b = viewBox(0);
  var cx = innerWidth / 2,
    cy = innerHeight / 2,
    best = null,
    bd2 = Infinity;
  for (var i = 0; i < visLive.length; i++) {
    var c = visLive[i];
    if (!c.e || c.lat < b.s || c.lat > b.n || c.lon < b.w || c.lon > b.e) continue;
    var p = cpScreen(c.lon, c.lat);
    if (!p || p[1] < CP_TOP || p[1] > innerHeight - CP_BOTTOM) continue;
    var d = Math.hypot(p[0] - cx, p[1] - cy);
    if (d < bd2) {
      bd2 = d;
      best = c;
    }
  }
  return best ? { c: best, d: bd2 } : null;
}

setInterval(function () {
  if (typeof RW !== "object" || !RW.on || document.hidden || SET.cpAuto === false) return;
  if (CP.open && !CP.auto) return; // a tapped camera's pins stay until closed
  if ($("sigfx") && $("sigfx").style.display === "flex") return;
  if (!cpZoomedIn()) {
    CP.snooze = false;
    if (CP.open) cpClose();
    return;
  }
  if (CP.snooze || (CG && CG.open)) return;
  var n = cpCentreCam();
  if (!n) {
    if (CP.open) cpClose();
    return;
  }
  // Move the pins to a new centre camera only when it is clearly nearer the middle, so they don't flicker.
  var cur = CP.open && CP.c ? cpScreen(CP.c.lon, CP.c.lat) : null,
    curD = cur ? Math.hypot(cur[0] - innerWidth / 2, cur[1] - innerHeight / 2) : Infinity;
  // An enlarged tile keeps the pins where they are.
  var anyBig = Object.keys(CP.big).some(function (k) {
    return CP.big[k];
  });
  if (!CP.open || (!anyBig && n.c !== CP.c && n.d < curD * 0.6 - 10)) cpOpen(n.c, true);
}, 800);

// Live: the centre refreshes every few seconds, the rest about every 20.
setInterval(function () {
  if (!CP.open || document.hidden) return;
  var now = Date.now();
  Array.prototype.forEach.call($("cpins").querySelectorAll(".cpt img[src]"), function (im) {
    var mid = im.parentNode.classList.contains("mid") || im.parentNode.classList.contains("big");
    if (now - (im._t || 0) < (mid ? 4000 : 20000)) return;
    im._t = now;
    snapRefresh(im);
  });
}, 1000);

// A camera tapped on the map shows its neighbours as map pins on the dashboard, and the centre tile
// opens it full screen. Anything else tapped opens as before.
function camTap(c) {
  if (c && c.live && typeof RW === "object" && RW.on) cpOpen(c);
  else select(c);
}

// "📍 Nearby" in a camera's details, and on a big tile in the camera grid.
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-cpo]");
  if (!b) return;
  var v = b.getAttribute("data-cpo"),
    c = v === "1" ? selected : CG.list[+v.slice(1)];
  if (c && c.live) {
    if (CG.open) cgClose();
    cpOpen(c);
  }
});
