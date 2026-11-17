/**
 * @file Camera grid: every camera in a city, state or the area in view, as mini tiles.
 * Type a place (or use what's on the map) and its cameras fill a grid of small live pictures,
 * nearest the centre first, one screenful per page (‹ › or a swipe for the next page). Tap a tile
 * to make it big, tap again to shrink it back; several can be big at once. Big tiles refresh every
 * few seconds and small ones about once a minute, and only the page in view loads anything.
 * Opens from Cameras in the dashboard's dock; its ➤ button opens Drive (cameras along a route).
 *
 * Module 44 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

var CG = { open: false, list: [], page: 0, place: "", big: {} },
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
      '<div class="cgsub mono" id="cgsub"></div><div class="cggrid" id="cggrid"></div>' +
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

function cgLoad(q) {
  CG.big = {};
  $("cggrid").innerHTML = "";
  $("cgsub").textContent = q ? "FINDING " + q.toUpperCase() + "…" : "CAMERAS IN VIEW…";
  cgArea(q)
    .then(function (box) {
      CG.place = box.name;
      CG.list = cgPick(box);
      cgPage(0);
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
      '"><img alt="" data-src="' +
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
