/**
 * @file Camera grid: every camera in a city, state or the area in view, as mini tiles.
 * Type a place (or use what's on the map) and its cameras fill a grid of small live pictures,
 * nearest the centre first. Tap a tile to make it big, tap again to shrink it back; several can
 * be big at once. Big tiles refresh every few seconds, small ones about once a minute while on
 * screen, and pictures load only as they scroll into view, so a city of thousands stays smooth.
 * Opens from Cameras in the dashboard's dock; its ➤ button opens Drive (cameras along a route).
 *
 * Module 44 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

var CG = { open: false, list: [], shown: 0, place: "", big: {} },
  CG_PAGE = 90,
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
      '<div class="cgsub mono" id="cgsub"></div><div class="cggrid" id="cggrid"></div>';
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

function cgLoad(q) {
  CG.big = {};
  $("cggrid").innerHTML = "";
  $("cgsub").textContent = q ? "FINDING " + q.toUpperCase() + "…" : "CAMERAS IN VIEW…";
  cgArea(q)
    .then(function (box) {
      CG.place = box.name;
      CG.list = cgPick(box);
      CG.shown = 0;
      cgMore();
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

function cgMore() {
  var g = $("cggrid"),
    from = CG.shown,
    to = Math.min(CG.list.length, from + CG_PAGE),
    h = "";
  for (var i = from; i < to; i++) {
    var c = CG.list[i];
    h +=
      '<div class="cgt" data-cg="t-' +
      i +
      '"><img alt="" data-src="' +
      esc(c.e) +
      '"><span>' +
      esc(c.n || "Camera") +
      "</span></div>";
  }
  var old = g.querySelector(".cgmore");
  if (old) old.remove();
  g.insertAdjacentHTML("beforeend", h);
  CG.shown = to;
  if (to < CG.list.length)
    g.insertAdjacentHTML(
      "beforeend",
      '<button class="cgmore" data-cg="more">Show ' +
        Math.min(CG_PAGE, CG.list.length - to) +
        " more</button>"
    );
  cgSub();
  cgWatch();
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
  } else if (k === "more") cgMore();
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
          '" aria-label="Open this camera">⤢ Open</button>'
      );
    else if (!big && o) o.remove();
    if (big && im) {
      im._t = Date.now();
      snapRefresh(im);
      b.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
});
