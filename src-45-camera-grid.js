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
          '" aria-label="Open this camera">⤢ Open</button><button class="cgopen cgweb" data-cwo="g' +
          i +
          '" aria-label="Camera web around this camera">🕸 Web</button>'
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

// ---------- Web view: one camera and its nearest neighbours, spread out around it ----------
// The chosen camera sits in the middle; its 10 or 20 nearest cameras spread out around it, each
// in its own live tile, joined to it by a line and placed in the direction it really lies (north
// up), with its distance. Tapping a tile makes it the middle of a new web; tapping the middle
// opens it full screen. Positions come from a short, fixed relaxation, so tiles never overlap.
var CW = { open: false, c: null, n: ls("ojos-cw-n") || 10, items: [] },
  CW_TW = 92, // tile width on a phone, in CSS pixels; height follows 16:10 plus the label
  CW_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function cwBearing(a, b) {
  var y = Math.sin((b.lon - a.lon) * D) * Math.cos(b.lat * D),
    x =
      Math.cos(a.lat * D) * Math.sin(b.lat * D) -
      Math.sin(a.lat * D) * Math.cos(b.lat * D) * Math.cos((b.lon - a.lon) * D);
  return (Math.atan2(y, x) / D + 360) % 360;
}

// The nearest cameras to c, nearest first, with their distance (km) and bearing (degrees).
function cwNear(c, n) {
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
  out.forEach(function (x) {
    x.deg = cwBearing(c, x.c);
  });
  return out;
}

// Screen positions: each tile starts out in its true direction, nearer cameras closer in, then
// tiles push each other apart until none overlap, staying inside the free part of the screen.
function cwLayout(items, w, h, top, bottom) {
  var tw = w < 520 ? CW_TW : 124,
    th = Math.round(tw * 0.625) + 16,
    cw = tw * 1.7,
    ch = Math.round(cw * 0.625) + 18,
    cx = w / 2,
    cy = top + (h - top - bottom) / 2,
    rx = w / 2 - tw / 2 - 6,
    ry = (h - top - bottom) / 2 - th / 2 - 6,
    n = items.length,
    two = n > 12,
    // Even slots around the middle, in the cameras' true compass order, turned so each slot sits
    // as near as it can to its camera's real direction; with many cameras, alternate slots step out.
    order = items
      .map(function (x, i) {
        return i;
      })
      .sort(function (a, b) {
        return items[a].deg - items[b].deg;
      }),
    turn = 0,
    pos = [];
  order.forEach(function (idx, k) {
    var d = items[idx].deg - (k * 360) / n;
    turn += Math.atan2(Math.sin(d * D), Math.cos(d * D));
  });
  turn = turn / Math.max(1, n) / D;
  order.forEach(function (idx, k) {
    var ang = ((k * 360) / n + turn) * D,
      out = two && k % 2 === 1,
      fx = two ? (out ? 1 : 0.82) : 0.9,
      fy = two ? (out ? 1 : 0.62) : 0.75;
    pos[idx] = { x: cx + Math.sin(ang) * rx * fx, y: cy - Math.cos(ang) * ry * fy };
  });
  var clamp = function (p) {
    p.x = Math.max(tw / 2 + 4, Math.min(w - tw / 2 - 4, p.x));
    p.y = Math.max(top + th / 2 + 4, Math.min(h - bottom - th / 2 - 4, p.y));
  };
  pos.forEach(clamp);
  for (var it = 0; it < 300; it++) {
    for (var i = 0; i < pos.length; i++) {
      var a = pos[i];
      // Keep clear of the middle tile.
      var dx = a.x - cx,
        dy = a.y - cy,
        ox = (tw + cw) / 2 + 8 - Math.abs(dx),
        oy = (th + ch) / 2 + 8 - Math.abs(dy);
      if (ox > 0 && oy > 0) {
        if (ox < oy) a.x += (dx < 0 ? -1 : 1) * ox;
        else a.y += (dy < 0 ? -1 : 1) * oy;
      }
      for (var j = i + 1; j < pos.length; j++) {
        var b = pos[j];
        dx = b.x - a.x;
        dy = b.y - a.y;
        ox = tw + 6 - Math.abs(dx);
        oy = th + 6 - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          if (ox < oy) {
            var sx = ((dx < 0 ? -1 : 1) * ox) / 2;
            a.x -= sx;
            b.x += sx;
          } else {
            var sy = ((dy < 0 ? -1 : 1) * oy) / 2;
            a.y -= sy;
            b.y += sy;
          }
        }
      }
      clamp(a);
    }
  }
  return { tiles: pos, tw: tw, th: th, cx: cx, cy: cy, cw: cw, ch: ch };
}

function cwKm(km) {
  var mi = km * 0.621;
  return mi < 0.1
    ? Math.round(mi * 5280) + " FT"
    : (mi < 10 ? mi.toFixed(1) : Math.round(mi)) + " MI";
}

function cwOpen(c) {
  if (!c || !c.live) return;
  var el = $("cwp");
  if (!el) {
    el = document.createElement("div");
    el.id = "cwp";
    document.body.appendChild(el);
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cw]");
      if (!b) return;
      var k = b.getAttribute("data-cw");
      if (k === "x") cwClose();
      else if (k === "n") {
        CW.n = CW.n === 10 ? 20 : 10;
        ls("ojos-cw-n", CW.n);
        cwDraw();
      } else if (k === "mid") {
        cwClose();
        select(CW.c);
        addWall(CW.c, true);
      } else if (k.indexOf("t-") === 0) {
        var nx = CW.items[+k.slice(2)];
        if (nx) {
          CW.c = nx.c;
          cwDraw();
        }
      }
    });
  }
  CW.c = c;
  CW.open = true;
  el.style.display = "block";
  document.body.classList.add("cw-open");
  cwDraw();
}

function cwClose() {
  CW.open = false;
  var el = $("cwp");
  if (el) {
    el.style.display = "none";
    el.innerHTML = ""; // stop every picture loading
  }
  document.body.classList.remove("cw-open");
}

function cwTile(c, cls, k, x, y, w, sub) {
  return (
    '<button class="cwt ' +
    cls +
    '" data-cw="' +
    k +
    '" style="left:' +
    Math.round(x - w / 2) +
    "px;top:" +
    Math.round(y) +
    "px;width:" +
    Math.round(w) +
    'px"><img alt="" referrerpolicy="no-referrer" data-u="' +
    esc(c.u) +
    '" data-src="' +
    esc(c.e) +
    '"><span>' +
    esc(c.n || "Camera") +
    "</span>" +
    (sub ? "<em>" + sub + "</em>" : "") +
    "</button>"
  );
}

function cwDraw() {
  var el = $("cwp"),
    c = CW.c;
  if (!el || !c) return;
  var w = el.clientWidth || innerWidth,
    h = el.clientHeight || innerHeight,
    top = 64,
    bottom = 18;
  CW.items = cwNear(c, CW.n);
  var L = cwLayout(CW.items, w, h, top, bottom),
    th = L.th,
    lines = "",
    tiles = "";
  CW.items.forEach(function (x, i) {
    var p = L.tiles[i];
    lines +=
      '<line x1="' +
      L.cx +
      '" y1="' +
      L.cy +
      '" x2="' +
      p.x.toFixed(1) +
      '" y2="' +
      p.y.toFixed(1) +
      '"/>';
    tiles += cwTile(
      x.c,
      "",
      "t-" + i,
      p.x,
      p.y - th / 2,
      L.tw,
      cwKm(x.km) + " " + CW_DIRS[Math.round(x.deg / 45) % 8]
    );
  });
  el.innerHTML =
    '<div class="cwhead"><b class="mono">CAMERA WEB · ' +
    esc(
      String(c.n || "")
        .toUpperCase()
        .slice(0, 30)
    ) +
    '</b><button data-cw="n" class="mono">' +
    (CW.n === 10 ? "10 → 20" : "20 → 10") +
    '</button><button data-cw="x" aria-label="Close">✕</button></div>' +
    '<svg class="cwlines" width="' +
    w +
    '" height="' +
    h +
    '">' +
    lines +
    "</svg>" +
    tiles +
    cwTile(
      c,
      "mid",
      "mid",
      L.cx,
      L.cy - L.ch / 2,
      L.cw,
      "TAP TO OPEN · TAP ANY TILE TO MOVE THE WEB"
    ) +
    (CW.items.length ? "" : '<p class="cwnone">No other live camera near this one.</p>');
  Array.prototype.forEach.call(el.querySelectorAll("img[data-src]"), function (im) {
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
}

// Live: the middle refreshes every few seconds, the rest about every 20.
setInterval(function () {
  if (!CW.open || document.hidden) return;
  var now = Date.now();
  Array.prototype.forEach.call($("cwp").querySelectorAll(".cwt img[src]"), function (im) {
    var mid = im.parentNode.classList.contains("mid");
    if (now - (im._t || 0) < (mid ? 4000 : 20000)) return;
    im._t = now;
    snapRefresh(im);
  });
}, 1000);

window.addEventListener("resize", function () {
  if (CW.open) setTimeout(cwDraw, 80);
});

// "🕸 Web" in a camera's details, and on a big tile in the camera grid.
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-cwo]");
  if (!b) return;
  var v = b.getAttribute("data-cwo"),
    c = v === "1" ? selected : CG.list[+v.slice(1)];
  if (c && c.live) {
    if (CG.open) cgClose();
    cwOpen(c);
  }
});
