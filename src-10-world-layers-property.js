/**
 * @file World layers, toasts and property records.
 * Day/night terminator, aircraft, earthquakes, events and storms, notifications, entity dossiers
 * and the property view.
 *
 * Module 10 of 44. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ================= OJOS DE DIOS: world layers =================
var WL = ls("ojos-layers") || {
  air: false,
  sat: false,
  quake: true,
  event: true,
  night: true,
  tiles: true
};
if (WL.img === undefined) WL.img = true;
if (WL.parcel === undefined) WL.parcel = true;
if (WL.bldg === undefined) WL.bldg = true;
if (WL.labels === undefined) WL.labels = true;
if (WL.ship === undefined) WL.ship = false;
if (WL.dots === undefined) WL.dots = true;
if (WL.radar === undefined) WL.radar = false;
var PLANES = [],
  SATREC = [],
  SATS = [],
  QUAKES = [],
  EVENTS = [],
  WSTAT = {},
  curP = null,
  SUN = { lon: 0, lat: 0, sd: 0, cd: 1 };
function sunUpd() {
  var d = new Date(),
    st = Date.UTC(d.getUTCFullYear(), 0, 0),
    n = Math.floor((d - st) / 864e5),
    dec = -23.44 * Math.cos(((2 * Math.PI) / 365) * (n + 10)),
    h = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  SUN = { lon: -(h - 12) * 15, lat: dec, sd: Math.sin(dec * D), cd: Math.cos(dec * D) };
}
function sunCos(lon, lat) {
  return SUN.sd * Math.sin(lat * D) + SUN.cd * Math.cos(lat * D) * Math.cos((lon - SUN.lon) * D);
}
sunUpd();
setInterval(sunUpd, 30000);
function projAlt(lon, lat, alt) {
  var l = (lon - rot.lon) * D,
    p = lat * D,
    p0 = rot.lat * D,
    cp = Math.cos(p),
    x = cp * Math.sin(l),
    y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * cp * Math.cos(l),
    z = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * cp * Math.cos(l),
    f = 1 + alt / 6371,
    R = radius();
  var vis = z > 0 || Math.sqrt(x * x + y * y) * f > 1;
  return [W / 2 + R * x * f, CY() - R * y * f, vis ? (z > 0 ? 1 : 0.45) : -1];
}
var EVCOL = { wildfires: "#ff8a1f", severeStorms: "#c58bff", volcanoes: "#ff3b3b" };
function drawWorld(t, P) {
  var i, p, e;
  if (WL.night && mode === "3d") {
    p = P(SUN.lon, SUN.lat);
    if (p[2] > 0) {
      ctx.fillStyle = "#ffe14d";
      ctx.shadowColor = "#ffe14d";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 5, 0, 7);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
  if (pin && pin.bbox) {
    var bx = pin.bbox,
      ed = [];
    for (var k = 0; k <= 20; k++) ed.push([bx.w + ((bx.e - bx.w) * k) / 20, bx.s]);
    for (k = 0; k <= 20; k++) ed.push([bx.e, bx.s + ((bx.n - bx.s) * k) / 20]);
    for (k = 0; k <= 20; k++) ed.push([bx.e - ((bx.e - bx.w) * k) / 20, bx.n]);
    for (k = 0; k <= 20; k++) ed.push([bx.w, bx.n - ((bx.n - bx.s) * k) / 20]);
    pline(P, ed, "#ff5d8f", [5, 5], 1.6);
  }
  deepLayers(t, P);
  drawRange(t, P);
  drawFootprint(t, P);
  drawRoute(t, P);
  drawWeb(t, P);
  drawTransit(t, P);
  drawInfoLayers(t, P);
  if (WL.ship && SHIPS.length) {
    ctx.fillStyle = "#d9c8ff";
    ctx.strokeStyle = "rgba(2,8,14,.8)";
    ctx.lineWidth = 1;
    var big = zoom > 40;
    for (i = 0; i < SHIPS.length; i++) {
      e = SHIPS[i];
      if (!focusHas(e.lat, e.lon)) continue;
      p = P(e.lon, e.lat);
      if (p[2] <= 0 || p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) continue;
      if (big && e.cog != null && e.cog < 360) {
        var ca = e.cog * D;
        ctx.save();
        ctx.translate(p[0], p[1]);
        ctx.rotate(ca);
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(4, 5);
        ctx.lineTo(-4, 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else ctx.fillRect(p[0] - 1.6, p[1] - 1.6, 3.2, 3.2);
      screenPts.push([p[0], p[1], e]);
    }
  }
  if (WL.air) {
    ctx.fillStyle = "#7fe3ff";
    ctx.globalAlpha = 0.85;
    for (i = 0; i < PLANES.length; i++) {
      e = PLANES[i];
      if (!focusHas(e.lat, e.lon)) continue;
      p = P(e.lon, e.lat);
      if (p[2] <= 0 || p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) continue;
      ctx.fillRect(p[0] - 1.2, p[1] - 1.2, 2.4, 2.4);
      screenPts.push([p[0], p[1], e]);
    }
    ctx.globalAlpha = 1;
  }
  if (WL.sat) {
    for (i = 0; i < SATS.length; i++) {
      e = SATS[i];
      p = mode === "3d" ? projAlt(e.lon, e.lat, e.alt) : P(e.lon, e.lat);
      if (p[2] <= 0) continue;
      if (e.iss) {
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p[0], p[1], 3.5, 0, 7);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = "700 10px 'JetBrains Mono',monospace";
        ctx.fillText("ISS", p[0] + 7, p[1] + 3);
      } else {
        ctx.globalAlpha = p[2] < 1 ? 0.4 : 0.8;
        ctx.fillStyle = "#39ff6a";
        ctx.fillRect(p[0] - 0.9, p[1] - 0.9, 1.8, 1.8);
        ctx.globalAlpha = 1;
      }
      screenPts.push([p[0], p[1], e]);
    }
  }
  if (WL.event) {
    for (i = 0; i < EVENTS.length; i++) {
      e = EVENTS[i];
      p = P(e.lon, e.lat);
      if (p[2] <= 0) continue;
      if (p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > H + 10) continue;
      ctx.drawImage(spr(EVCOL[e.cat] || "#4cc3ff", "t"), p[0] - 14, p[1] - 14, 28, 28);
      screenPts.push([p[0], p[1], e]);
    }
  }
  if (WL.quake) {
    for (i = 0; i < QUAKES.length; i++) {
      e = QUAKES[i];
      p = P(e.lon, e.lat);
      if (p[2] <= 0 || p[0] < -40 || p[0] > W + 40 || p[1] < -40 || p[1] > H + 40) continue;
      var r = 2 + e.mag * 1.5,
        ph = (t * 0.6 + i * 0.21) % 1;
      ctx.strokeStyle = "#ff5533";
      ctx.lineWidth = 1.3;
      ctx.globalAlpha = 1 - ph;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r + ph * r * 1.6, 0, 7);
      ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r * 0.55, 0, 7);
      ctx.stroke();
      ctx.globalAlpha = 1;
      screenPts.push([p[0], p[1], e]);
    }
  }
  // lines from the tile dock to each camera it is showing
  if (ftSel.length && FTS.geo) {
    var g = FTS.geo;
    for (i = 0; i < ftSel.length; i++) {
      p = P(ftSel[i].lon, ftSel[i].lat);
      if (p[2] <= 0) continue;
      var tx = g.x + (i % g.cols) * (g.tw + 6) + g.tw / 2,
        ty = g.y + g.hh + Math.floor(i / g.cols) * (g.th + 6) + g.th / 2;
      ctx.strokeStyle = "rgba(94,230,255,0.75)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.fillStyle = "#5ee6ff";
      ctx.beginPath();
      ctx.arc(p[0], p[1], 4, 0, 7);
      ctx.fill();
    }
  }
}
var ftSel = [],
  ftKey = "",
  FTS = ls("ojos-ft") || {};
FTS.n = FTS.n || 2;
FTS.size = FTS.size == null ? 1 : FTS.size;
function ftLayout() {
  var box = $("ftiles");
  if (!box) return;
  var sw = cv.parentNode.clientWidth,
    sh = cv.parentNode.clientHeight,
    tw = Math.min([132, 184, 250, 340][FTS.size], sw - 24),
    cols = Math.max(1, Math.min(FTS.n, Math.floor((sw - 16) / (tw + 6)) || 1)),
    th = Math.round(tw * 0.6) + 18;
  var w = cols * (tw + 6) + 6,
    x = FTS.x == null ? 8 : FTS.x,
    y = FTS.y == null ? topInset() + 6 : FTS.y;
  x = Math.max(0, Math.min(sw - w, x));
  y = Math.max(0, Math.min(sh - 60, y));
  box.style.width = w + "px";
  box.style.transform = "translate(" + x + "px," + y + "px)";
  box.style.setProperty("--tw", tw + "px");
  var gg = box.querySelector(".ftg");
  if (gg) {
    gg.style.maxHeight = Math.max(80, sh - y - 52) + "px";
    gg.style.overflowY = "auto";
  }
  FTS.geo = { x: x + 6, y: y, hh: 38, tw: tw, th: th, cols: cols };
}
function ftBuild(force) {
  var box = $("ftiles");
  if (!box) return;
  if (!WL.tiles || !EMBED_OK || zoom < 2 || T3.on || T4.on || $("wall").style.display === "flex") {
    if (ftKey || box.firstChild) {
      ftSel = [];
      ftKey = "";
      box.innerHTML = "";
      box.style.display = "none";
    }
    return;
  }
  var cx = W / 2,
    cy = H / 2,
    pool = [],
    j;
  for (j = 0; j < VNUM; j++) {
    var c0 = VC[j];
    if (c0 === selected) continue;
    pool.push([(VX[j] - cx) * (VX[j] - cx) + (VY[j] - cy) * (VY[j] - cy), c0]);
  }
  pool.sort(function (a, b) {
    return a[0] - b[0];
  });
  var c = pool.slice(0, FTS.n).map(function (x) {
    return x[1];
  });
  var k =
    c
      .map(function (x) {
        return x.u;
      })
      .join("|") +
    "#" +
    FTS.n +
    "#" +
    FTS.size;
  if (k === ftKey && !force) return;
  ftKey = k;
  ftSel = c;
  box.style.display = c.length ? "block" : "none";
  box.innerHTML =
    '<div class="fth"><span>⠿ Nearby</span><button data-ft="less" aria-label="Fewer">−</button><b>' +
    FTS.n +
    '</b><button data-ft="more" aria-label="More">+</button><button data-ft="size" aria-label="Size">' +
    ["S", "M", "L", "XL"][FTS.size] +
    '</button><button data-ft="hide" aria-label="Hide">✕</button></div><div class="ftg">' +
    c
      .map(function (x) {
        return (
          '<div class="ft" data-fl="' +
          LIVE.indexOf(x) +
          '"><img class="snap" referrerpolicy="no-referrer" data-u="' +
          esc(x.u) +
          '" data-src="' +
          esc(x.e) +
          '" src="' +
          esc(x.e) +
          '" alt=""><span>' +
          esc(x.n) +
          "</span></div>"
        );
      })
      .join("") +
    "</div>";
  ftLayout();
}
setInterval(function () {
  ftBuild(false);
}, 2500);
document.addEventListener(
  "click",
  function (e) {
    var b = e.target.closest("[data-ft]");
    if (!b) return;
    e.stopPropagation();
    var k = b.getAttribute("data-ft");
    if (k === "less") FTS.n = Math.max(1, FTS.n - 1);
    else if (k === "more") FTS.n = Math.min(9, FTS.n + 1);
    else if (k === "size") FTS.size = (FTS.size + 1) % 4;
    else if (k === "hide") {
      setLayer("tiles", false);
      note("Camera tiles", "Hidden. Turn them back on under Layers → Floating camera tiles.");
      return;
    }
    ls("ojos-ft", { n: FTS.n, size: FTS.size, x: FTS.x, y: FTS.y });
    ftBuild(true);
  },
  true
);
(function () {
  var box = $("ftiles"),
    d = null;
  if (!box) return;
  box.addEventListener("pointerdown", function (e) {
    if (!e.target.closest(".fth") || e.target.closest("button")) return;
    var g = FTS.geo || { x: 14, y: topInset() + 6 };
    d = { px: e.clientX, py: e.clientY, x: g.x - 6, y: g.y };
    box.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  box.addEventListener("pointermove", function (e) {
    if (!d) return;
    FTS.x = d.x + e.clientX - d.px;
    FTS.y = d.y + e.clientY - d.py;
    ftLayout();
  });
  var up = function () {
    if (d) {
      d = null;
      ls("ojos-ft", { n: FTS.n, size: FTS.size, x: FTS.x, y: FTS.y });
    }
  };
  box.addEventListener("pointerup", up);
  box.addEventListener("pointercancel", up);
  window.addEventListener("resize", function () {
    setTimeout(ftLayout, 60);
  });
})();
document.addEventListener("click", function (e) {
  var f = e.target.closest(".ft");
  if (f) {
    var c = LIVE[+f.getAttribute("data-fl")];
    if (c) select(c);
  }
});
// Toast text may carry <b> and <br>; it is rebuilt node by node, so no other markup can reach the page.
function richText(el, html) {
  var ent = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" },
    un = function (x) {
      return x.replace(/&(amp|lt|gt|quot|#39);/g, function (m) {
        return ent[m];
      });
    },
    cur = el;
  String(html == null ? "" : html)
    .split(/(<br\s*\/?>|<b>|<\/b>)/i)
    .forEach(function (p) {
      if (!p) return;
      var q = p.toLowerCase();
      if (/^<br/.test(q)) cur.appendChild(document.createElement("br"));
      else if (q === "<b>") {
        var b = document.createElement("b");
        el.appendChild(b);
        cur = b;
      } else if (q === "</b>") cur = el;
      else cur.appendChild(document.createTextNode(un(p)));
    });
}
function note(title, html, fn) {
  var t = document.createElement("div");
  t.className = "toast";
  var hb = document.createElement("b");
  hb.className = "mono";
  hb.textContent = "◉ " + String(title).toUpperCase();
  var sp = document.createElement("span");
  richText(sp, html);
  t.appendChild(hb);
  t.appendChild(sp);
  t.onclick = function () {
    if (fn) fn();
    t.remove();
  };
  $("toasts").appendChild(t);
  setTimeout(function () {
    t.classList.add("out");
    setTimeout(function () {
      t.remove();
    }, 400);
  }, 9000);
  while ($("toasts").children.length > 1) $("toasts").firstChild.remove();
}
function camsNear(e, km) {
  var n = 0;
  for (var i = 0; i < LIVE.length; i++) if (hav(e.lat, e.lon, LIVE[i].lat, LIVE[i].lon) <= km) n++;
  return n;
}
function sceneToast(e) {
  var n = camsNear(e, 160);
  note(
    "Eyes on scene",
    "<b>" +
      esc(e.n) +
      "</b><br>" +
      (n
        ? n + " live camera" + (n > 1 ? "s" : "") + " within 100 mi — tap to look"
        : "tap for details"),
    function () {
      select(e);
    }
  );
}
// Playable audio and outside links for info items, and air traffic audio links for aircraft.
function entExtras(e) {
  var links = [];
  if (e.kind === "info" && e.links) links = e.links.slice();
  if (e.kind === "plane" && e.route && e.route.o && typeof liveAtcUrl === "function") {
    [e.route.o.code, e.route.d.code].forEach(function (c) {
      var u = liveAtcUrl(c);
      if (u) links.push(["Air traffic audio near " + c + " · LiveATC", u]);
    });
  }
  var au = e.kind === "info" && e.audio ? safeUrl(e.audio) : "",
    im = e.kind === "info" && e.img ? safeUrl(e.img) : "";
  return (
    (/^https:\/\//.test(im)
      ? '<div class="acts"><img alt="" loading="lazy" style="width:100%;max-height:220px;object-fit:cover;border-radius:8px" src="' +
        esc(im) +
        '"></div>'
      : "") +
    (/^https:\/\//.test(au)
      ? '<div class="acts"><audio controls preload="none" style="width:100%" src="' +
        esc(au) +
        '"></audio></div>'
      : "") +
    links
      .map(function (l) {
        var u = safeUrl(l[1]);
        return /^https?:\/\//.test(u)
          ? '<div class="acts"><a class="open" target="_blank" rel="noopener" href="' +
              esc(u) +
              '">↗ ' +
              esc(l[0]).toUpperCase() +
              "</a></div>"
          : "";
      })
      .join("")
  );
}

function entDossier(e) {
  if (e.kind === "parcel") {
    propDossier(e);
    return;
  }
  var rows = [],
    tag,
    col2;
  var isP = e.kind === "plane";
  if (isP) {
    tag = "AIRCRAFT · LIVE";
    col2 = "#7fe3ff";
    rows = [
      ["CALLSIGN", e.n],
      ["REGISTERED", e.country || "—"],
      ["ALTITUDE", e.alt != null ? Math.round(e.alt * 3.281).toLocaleString() + " ft" : "—"],
      ["SPEED", e.v != null ? Math.round(e.v * 1.944) + " kt" : "—"],
      ["HEADING", e.trk != null ? Math.round(e.trk) + "°" : "—"]
    ];
  }
  if (isP) {
    var R = e.route;
    if (R && R.o) {
      var left = hav(e.lat, e.lon, R.d.lat, R.d.lon),
        tot = hav(R.o.lat, R.o.lon, R.d.lat, R.d.lon),
        ok = routeOK(e);
      if (R.airline) rows.splice(1, 0, ["AIRLINE", R.airline]);
      rows.push(["FROM", R.o.code + " · " + R.o.city], ["TO", R.d.code + " · " + R.d.city]);
      if (ok) {
        rows.push([
          "REMAINING",
          Math.round(left * 0.621).toLocaleString() +
            " mi of " +
            Math.round(tot * 0.621).toLocaleString()
        ]);
        if (e.v > 30)
          rows.push([
            "EST. ARRIVAL",
            new Date(Date.now() + (left / (e.v * 3.6)) * 36e5).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit"
            }) + " (at current speed)"
          ]);
      } else
        rows.push([
          "NOTE",
          "Heading doesn't match this listed route, so the path shown follows its current heading"
        ]);
    } else
      rows.push([
        "ROUTE",
        R === null
          ? "Looking up route…"
          : "No published route for this callsign — path projected from heading"
      ]);
  }
  if (isP) {
    // Aircraft rows were built above.
  } else if (e.kind === "sat") {
    tag = "SATELLITE · IN ORBIT";
    col2 = "#39ff6a";
    rows = [
      ["NAME", e.n],
      ["ALTITUDE", Math.round(e.alt).toLocaleString() + " km"],
      ["OVER", e.lat.toFixed(2) + ", " + e.lon.toFixed(2)]
    ];
  } else if (e.kind === "ship") {
    tag = "VESSEL · AIS";
    col2 = "#d9c8ff";
    rows = [
      ["NAME", e.n],
      ["MMSI", String(e.id)],
      ["SPEED", e.sog != null && e.sog < 102 ? (+e.sog).toFixed(1) + " kt" : "—"],
      ["COURSE", e.cog != null && e.cog < 360 ? Math.round(e.cog) + "°" : "—"],
      ["LAST REPORT", ago(e.at)],
      ["SOURCE", e.src]
    ];
  } else if (e.kind === "info") {
    tag = e.tag;
    col2 = e.color;
    rows = ilRows(e);
  } else if (e.kind === "transit") {
    tag = trTag(e);
    col2 = e.color;
    rows = trRows(e);
  } else if (e.kind === "quake") {
    tag = "EARTHQUAKE";
    col2 = "#ff5533";
    rows = [
      ["MAGNITUDE", "M" + e.mag.toFixed(1)],
      ["DEPTH", Math.round(e.depth) + " km"],
      ["TIME", new Date(e.time).toLocaleString()]
    ];
  } else {
    tag = (e.catName || "NATURAL EVENT").toUpperCase();
    col2 = EVCOL[e.cat] || "#4cc3ff";
    rows = [
      ["TYPE", e.catName || e.cat],
      ["REPORTED", e.date ? new Date(e.date).toLocaleDateString() : "—"]
    ];
  }
  var n = EMBED_OK ? camsNear(e, 160) : 0;
  $("detail").innerHTML =
    '<h4>TARGET DOSSIER</h4><span class="tag mono" style="color:' +
    okColor(col2) +
    ";border-color:" +
    okColor(col2) +
    '">' +
    esc(tag) +
    "</span><h3>" +
    esc(e.n) +
    '</h3><div class="kv">' +
    rows
      .map(function (r) {
        return "<span>" + esc(r[0]) + "</span><b>" + esc(r[1]) + "</b>";
      })
      .join("") +
    "<span>COORDS</span><b>" +
    (+e.lat).toFixed(3) +
    ", " +
    (+e.lon).toFixed(3) +
    '</b></div><div class="wx mono" id="wx"></div>' +
    entExtras(e) +
    (e.kind === "plane" || e.kind === "ship"
      ? '<div class="acts"><button class="open" data-wt="1">' +
        (watchHas(e)
          ? "★ WATCHING · TAP TO STOP"
          : "☆ WATCH THIS " + (e.kind === "plane" ? "AIRCRAFT" : "SHIP")) +
        "</button></div>"
      : "") +
    (e.kind === "plane"
      ? '<div class="acts"><button class="open" data-fg="open">◆ FLIGHT LOG · HISTORY, SCHEDULE, ON TIME</button></div>'
      : "") +
    (e.kind === "plane"
      ? '<div class="acts"><button class="open" data-ckp="1">◉ COCKPIT VIEW · REAL WORLD, LIVE WEATHER</button></div>'
      : "") +
    (e.kind === "plane" || e.kind === "ship" || e.kind === "sat"
      ? '<div class="acts"><button class="open" data-insp="obj">◆ INSPECT THIS ' +
        (e.kind === "plane" ? "AIRCRAFT" : e.kind === "ship" ? "VESSEL" : "SATELLITE") +
        "</button></div>"
      : "") +
    '<div class="acts"><button class="open" data-w="scene">◉ EYES ON SCENE' +
    (n ? " · " + n + " CAMS" : "") +
    '</button></div><p class="note2">Eyes on Scene finds the live cameras nearest this ' +
    (e.kind === "plane"
      ? "aircraft"
      : e.kind === "transit"
        ? "vehicle"
        : e.kind === "ship"
          ? "vessel"
          : e.kind === "sat"
            ? "satellite's ground point"
            : "event") +
    ".</p>";
  wx(e.lat, e.lon);
}
// --- loaders
function loadQuakes() {
  getJSON("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson")
    .then(function (j) {
      var seen = {},
        first = !QUAKES.length;
      QUAKES.forEach(function (q) {
        seen[q.id] = 1;
      });
      QUAKES = (j.features || [])
        .filter(function (f) {
          return f.geometry && f.properties && f.properties.mag != null;
        })
        .map(function (f) {
          var pr = f.properties,
            g = f.geometry.coordinates;
          return {
            kind: "quake",
            id: f.id,
            n: "M" + (+pr.mag).toFixed(1) + " · " + (pr.place || "Earthquake"),
            mag: +pr.mag,
            lon: g[0],
            lat: g[1],
            depth: g[2] || 0,
            time: pr.time
          };
        });
      var big = QUAKES.filter(function (q) {
        return first ? q.mag >= 5.5 && Date.now() - q.time < 6 * 36e5 : !seen[q.id] && q.mag >= 5;
      }).sort(function (a, b) {
        return b.mag - a.mag;
      })[0];
      if (big && !AL.on) sceneToast(big);
      WSTAT.quake = "ok";
      alCheck();
      wstat();
    })
    .catch(function () {
      WSTAT.quake = "x";
      wstat();
    });
}
function loadEvents() {
  getJSON("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=20&limit=400", 30000)
    .then(function (j) {
      EVENTS = (j.events || [])
        .map(function (ev) {
          var c = (ev.categories || [])[0] || {},
            g = (ev.geometry || [])[ev.geometry.length - 1];
          if (!g || g.type !== "Point" || c.id === "seaLakeIce") return null;
          return {
            kind: "event",
            n: ev.title,
            cat: c.id,
            catName: c.title,
            lon: g.coordinates[0],
            lat: g.coordinates[1],
            date: g.date
          };
        })
        .filter(Boolean);
      WSTAT.event = "ok";
      alCheck();
      wstat();
    })
    .catch(function () {
      WSTAT.event = "x";
      wstat();
    });
}
var planeT = 0;
// ----- aircraft: OpenSky first (whole world); if it does not answer, community ADS-B networks for the area in view -----
var PL_ALT = ["https://api.adsb.lol/v2/point/", "https://opendata.adsb.fi/api/v3/lat/"],
  PL_REG = null;
function planeFromAc(a) {
  if (!a || a.lat == null || a.lon == null || a.alt_baro === "ground" || !a.hex) return null;
  var c = String(a.category || ""),
    cat = /^A[1-7]$/.test(c) ? +c.charAt(1) + 1 : 0;
  return {
    kind: "plane",
    id: String(a.hex).replace(/^~/, "").toLowerCase(),
    n: String(a.flight || "").trim() || String(a.r || a.hex).toUpperCase(),
    country: "",
    lon: +a.lon,
    lat: +a.lat,
    alt: (typeof a.alt_baro === "number" ? a.alt_baro : a.alt_geom || 0) * 0.3048,
    v: (a.gs || 0) * 0.5144,
    trk: a.track != null ? a.track : a.true_heading || 0,
    cat: cat,
    reg: a.r || "",
    typ: a.t || ""
  };
}
function planesNear(lat, lon, i) {
  i = i || 0;
  if (i >= PL_ALT.length) return Promise.reject(new Error("no aircraft source answered"));
  var u =
    i === 0
      ? PL_ALT[0] + lat.toFixed(3) + "/" + lon.toFixed(3) + "/250"
      : PL_ALT[1] + lat.toFixed(3) + "/lon/" + lon.toFixed(3) + "/dist/250";
  return getJSON(u, 12000)
    .then(function (j) {
      if (!j || !Array.isArray(j.ac)) throw new Error("bad answer");
      return j.ac.map(planeFromAc).filter(Boolean);
    })
    .catch(function () {
      return planesNear(lat, lon, i + 1);
    });
}
function planesKeep(L) {
  var sel = selected && selected.kind === "plane" ? selected.id : null;
  PLANES = L;
  if (sel) {
    var m = PLANES.filter(function (x) {
      return x.id === sel;
    })[0];
    if (m) {
      m.route = selected.route;
      m.track = selected.track;
      selected = m;
    } else if (CKP.on && CKP.id === sel) {
      PLANES.push(selected);
    }
  }
}
function loadPlanes() {
  planeT = Date.now();
  var c = newsCentre(),
    near = function () {
      return planesNear(c[0], c[1]).then(function (L) {
        PL_REG = { lat: c[0], lon: c[1], t: Date.now() };
        planesKeep(L);
        WSTAT.air = "ok";
        wstat();
      });
    };
  (!nativeHttp() || (PL_REG && Date.now() - (PL_REG.sky || 0) < 30 * 60000)
    ? Promise.reject(new Error("skip"))
    : getJSON("https://opensky-network.org/api/states/all?extended=1", 40000).then(function (j) {
        if (!j || !j.states || !j.states.length) throw new Error("empty");
        planesKeep(
          j.states
            .filter(function (a) {
              return a[5] != null && a[6] != null && !a[8];
            })
            .slice(0, 6000)
            .map(function (a) {
              return {
                kind: "plane",
                id: a[0],
                n: (a[1] || "").trim() || a[0].toUpperCase(),
                country: a[2],
                lon: a[5],
                lat: a[6],
                alt: a[7],
                v: a[9],
                trk: a[10],
                cat: a[17] || 0
              };
            })
        );
        PL_REG = null;
        WSTAT.air = "ok";
        wstat();
      })
  )
    .catch(function () {
      var sky = (PL_REG && PL_REG.sky) || Date.now();
      return near().then(function () {
        PL_REG.sky = sky;
      });
    })
    .catch(function () {
      WSTAT.air = "x";
      wstat();
    });
}
setInterval(function () {
  // dead-reckon aircraft between updates
  for (var i = 0; i < PLANES.length; i++) {
    var a = PLANES[i];
    if (a.v == null || a.trk == null) continue;
    var d = a.v / 1000 / 111.2;
    a.lat += d * Math.cos(a.trk * D);
    a.lon += (d * Math.sin(a.trk * D)) / Math.max(0.2, Math.cos(a.lat * D));
  }
  if (WL.air && EMBED_OK && !document.hidden) {
    var age = Date.now() - planeT;
    if (age > 5 * 60000) loadPlanes();
    else if (PL_REG && age > 15000) {
      var pc = newsCentre();
      if (age > 60000 || hav(pc[0], pc[1], PL_REG.lat, PL_REG.lon) > 220) loadPlanes();
    }
  }
}, 1000);
function getText(u) {
  return netGet(u, 40000, null, true);
}
function loadSats() {
  (window.satellite
    ? Promise.resolve()
    : loadScript("https://cdn.jsdelivr.net/npm/satellite.js@4.1.4/dist/satellite.min.js")
  )
    .then(function () {
      return Promise.all(
        ["stations", "visual", "starlink"].map(function (g) {
          return getText(
            "https://celestrak.org/NORAD/elements/gp.php?GROUP=" + g + "&FORMAT=tle"
          ).catch(function () {
            return "";
          });
        })
      );
    })
    .then(function (txts) {
      var seen = {};
      SATREC = [];
      txts.forEach(function (tx, gi) {
        var L = tx.split(/\r?\n/),
          cnt = 0;
        for (var i = 0; i + 2 < L.length && cnt < (gi === 2 ? 1400 : 400); i += 3) {
          var nm = L[i].trim();
          if (!nm || seen[nm] || L[i + 1].charAt(0) !== "1") continue;
          seen[nm] = 1;
          try {
            SATREC.push({
              rec: satellite.twoline2satrec(L[i + 1], L[i + 2]),
              ent: {
                kind: "sat",
                n: nm,
                lon: 0,
                lat: 0,
                alt: 400,
                iss: /^ISS \(ZARYA\)/.test(nm)
              }
            });
            cnt++;
          } catch (e) {}
        }
      });
      satStep();
      WSTAT.sat = SATS.length ? "ok" : "x";
      wstat();
    })
    .catch(function () {
      WSTAT.sat = "x";
      wstat();
    });
}
function satStep() {
  if (!SATREC.length || !window.satellite) return;
  var now = new Date(),
    g = satellite.gstime(now),
    out = [];
  for (var i = 0; i < SATREC.length; i++) {
    try {
      var pv = satellite.propagate(SATREC[i].rec, now);
      if (!pv || !pv.position) continue;
      var gd = satellite.eciToGeodetic(pv.position, g),
        e = SATREC[i].ent;
      e.lon = ((gd.longitude / D + 540) % 360) - 180;
      e.lat = gd.latitude / D;
      e.alt = gd.height;
      if (isFinite(e.lat) && isFinite(e.lon)) out.push(e);
    } catch (x) {}
  }
  SATS = out;
}
setInterval(function () {
  if (WL.sat && !document.hidden) satStep();
}, 3000);
setInterval(function () {
  if (!EMBED_OK || document.hidden) return;
  if (WL.quake) loadQuakes();
}, 5 * 60000);
var WLDEF = [
  [
    "parcel",
    "Texas property records",
    "#ffd36b",
    function () {
      return PARCELS.length;
    },
    null
  ],
  [
    "bldg",
    "3D buildings",
    "#5ee6ff",
    function () {
      return BLDG.length;
    },
    null
  ],
  ["img", "Satellite imagery", "#8fd3ff", null, null],
  ["labels", "Borders & place names", "#dff6ff", null, null],
  [
    "air",
    "Aircraft",
    "#7fe3ff",
    function () {
      return PLANES.length;
    },
    loadPlanes
  ],
  [
    "sat",
    "Satellites",
    "#39ff6a",
    function () {
      return SATS.length;
    },
    loadSats
  ],
  ["dots", "Every camera as a dot (no grouping)", "#46c8ff", null, null],
  [
    "ship",
    "Ships (AIS)",
    "#d9c8ff",
    function () {
      return SHIPS.length;
    },
    loadShips
  ],
  [
    "radar",
    "Weather radar",
    "#4aa3ff",
    function () {
      return RAD.n;
    },
    loadRadar
  ],
  [
    "quake",
    "Earthquakes · 24h",
    "#ff5533",
    function () {
      return QUAKES.length;
    },
    loadQuakes
  ],
  [
    "event",
    "Fires · Storms · Volcanoes",
    "#ff8a1f",
    function () {
      return EVENTS.length;
    },
    loadEvents
  ],
  ["night", "Day / Night", "#ffe14d", null, null],
  ["tiles", "Floating camera tiles", "#39ff6a", null, null]
];
function wstat() {
  var el = $("wlayers");
  if (!el) return;
  var lastGroup = null;
  el.innerHTML = WLDEF.map(function (w) {
    var grp = (typeof WL_GROUP === "object" && WL_GROUP && WL_GROUP[w[0]]) || "Map and live",
      head = grp !== lastGroup ? '<div class="wlg">' + esc(grp) + "</div>" : "";
    lastGroup = grp;
    var n = w[3] ? w[3]() : null,
      st = WSTAT[w[0]];
    var txt =
      w[0] === "transit"
        ? trStatus()
        : ilStatus(w[0]) != null
          ? ilStatus(w[0])
          : w[0] === "air" && !nativeHttp() && st === "x"
            ? "ANDROID APP ONLY"
            : w[0] === "radar"
              ? !EMBED_OK
                ? "APP"
                : !WL.radar
                  ? ""
                  : !gl || !WL.img
                    ? "NEEDS IMAGERY"
                    : RAD.shown
                      ? "LIVE · " + ago(RAD.time * 1000)
                      : st === "x"
                        ? "OFFLINE"
                        : "LOADING…"
              : w[0] === "ship" && WL.ship && EMBED_OK && n
                ? n.toLocaleString() +
                  (KEYS.ais
                    ? AIS.state === "live"
                      ? " · WORLD"
                      : " · " + (AIS.state || "").toUpperCase().slice(0, 14)
                    : " · FINLAND ONLY")
                : w[0] === "img"
                  ? !EMBED_OK
                    ? "APP"
                    : satOK()
                      ? "LIVE"
                      : glTried && !gl
                        ? "NOT SUPPORTED"
                        : WL.img
                          ? "LOADING…"
                          : ""
                  : n == null
                    ? ""
                    : !EMBED_OK
                      ? "APP"
                      : n
                        ? n.toLocaleString()
                        : st === "x"
                          ? "OFFLINE"
                          : WL[w[0]]
                            ? "…"
                            : "";
    return (
      head +
      '<button class="cat' +
      (WL[w[0]] ? "" : " off") +
      '" data-wl="' +
      w[0] +
      '"><div class="l"><span><i style="background:' +
      w[2] +
      '"></i>' +
      w[1] +
      '</span><span class="mono"' +
      (st === "x" && !n ? ' style="color:#ff5d8f"' : "") +
      ">" +
      esc(txt) +
      "</span></div></button>"
    );
  }).join("");
  var IC = {
      parcel: "$",
      bldg: "🏢",
      img: "🌍",
      labels: "Aa",
      air: "✈",
      sat: "🛰",
      quake: "◎",
      event: "🔥",
      night: "◐",
      tiles: "▣",
      transit: "🚌"
    },
    ir = $("irail");
  if (ir)
    ir.innerHTML = WLDEF.map(function (w) {
      var n = w[3] ? w[3]() : 0;
      return (
        '<button class="' +
        (WL[w[0]] ? "on" : "") +
        '" data-wl="' +
        w[0] +
        '" title="' +
        w[1] +
        '">' +
        (IC[w[0]] || (IL && IL[w[0]] && IL[w[0]].icon) || "•") +
        (n ? "<small>" + (n > 999 ? Math.round(n / 100) / 10 + "k" : n) + "</small>" : "") +
        "</button>"
      );
    }).join("");
  var hs = function (id, n) {
    var x = $(id);
    if (x) x.textContent = n ? n.toLocaleString() : "—";
  };
  hs("hCam", LIVE.length);
  hs("hAir", PLANES.length);
  hs("hSat", SATS.length);
  hs("hEv", QUAKES.length + EVENTS.length);
  if (document.querySelector(".grid[data-tab=events]")) feed();
  var tot = PLANES.length + SATS.length + QUAKES.length + EVENTS.length + LIVE.length;
  var k = $("kSrc");
  if (k) k.textContent = tot.toLocaleString();
}
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-wl]");
  if (!b) return;
  var k = b.getAttribute("data-wl");
  WL[k] = !WL[k];
  ls("ojos-layers", WL);
  if (k === "labels") {
    patchA = null;
    patchP = null;
    lastView = "";
  }
  var d = WLDEF.filter(function (w) {
    return w[0] === k;
  })[0];
  if (WL[k] && d[4] && EMBED_OK && !d[3]()) d[4]();
  wstat();
});
if (EMBED_OK)
  WLDEF.forEach(function (w) {
    if (WL[w[0]] && w[4])
      try {
        w[4]();
      } catch (e) {}
  });
// --- flight route + projected path
function gc(a, b, n) {
  var p1 = a[1] * D,
    l1 = a[0] * D,
    p2 = b[1] * D,
    l2 = b[0] * D,
    d =
      2 *
      Math.asin(
        Math.sqrt(
          Math.pow(Math.sin((p2 - p1) / 2), 2) +
            Math.cos(p1) * Math.cos(p2) * Math.pow(Math.sin((l2 - l1) / 2), 2)
        )
      );
  if (d < 1e-6) return [a, b];
  var out = [];
  for (var i = 0; i <= n; i++) {
    var f = i / n,
      A = Math.sin((1 - f) * d) / Math.sin(d),
      B = Math.sin(f * d) / Math.sin(d),
      x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2),
      y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2),
      z = A * Math.sin(p1) + B * Math.sin(p2);
    out.push([Math.atan2(y, x) / D, Math.atan2(z, Math.sqrt(x * x + y * y)) / D]);
  }
  return out;
}
function bearing(la1, lo1, la2, lo2) {
  var y = Math.sin((lo2 - lo1) * D) * Math.cos(la2 * D),
    x =
      Math.cos(la1 * D) * Math.sin(la2 * D) -
      Math.sin(la1 * D) * Math.cos(la2 * D) * Math.cos((lo2 - lo1) * D);
  return (Math.atan2(y, x) / D + 360) % 360;
}
function routeOK(e) {
  var R = e.route;
  if (!R || !R.d) return false;
  if (e.trk == null) return true;
  if (hav(e.lat, e.lon, R.d.lat, R.d.lon) < 120) return true;
  var df = Math.abs(((bearing(e.lat, e.lon, R.d.lat, R.d.lon) - e.trk + 540) % 360) - 180);
  return df < 75;
}
function apt(a) {
  return a && isFinite(a.latitude) && isFinite(a.longitude)
    ? {
        code: a.iata_code || a.icao_code || "?",
        city: a.municipality || a.name || "",
        name: a.name || "",
        lat: +a.latitude,
        lon: +a.longitude
      }
    : null;
}
function loadRoute(e) {
  if (e.route !== undefined) return;
  e.route = null;
  var cs = (e.n || "").replace(/\s/g, "").toUpperCase();
  function done() {
    if (selected === e || (selected && selected.id === e.id)) {
      selected.route = e.route;
      selected.track = e.track;
      entDossier(selected);
    }
  }
  if (!EMBED_OK || !/^[A-Z]{2,3}[0-9][A-Z0-9]{0,5}$/.test(cs)) {
    e.route = false;
    done();
  } else
    getJSON("https://api.adsbdb.com/v0/callsign/" + cs, 15000)
      .then(function (j) {
        var fr = j && j.response && j.response.flightroute,
          o = fr && apt(fr.origin),
          d = fr && apt(fr.destination);
        e.route = o && d ? { o: o, d: d, airline: fr.airline && fr.airline.name } : false;
        done();
      })
      .catch(function () {
        e.route = false;
        done();
      });
  if (EMBED_OK)
    getJSON("https://opensky-network.org/api/tracks/all?icao24=" + e.id + "&time=0", 15000)
      .then(function (j) {
        var pts = ((j && j.path) || [])
          .filter(function (x) {
            return x[1] != null && x[2] != null;
          })
          .map(function (x) {
            return [x[2], x[1], x[3]];
          });
        if (pts.length > 1) {
          e.track = pts;
          done();
        }
      })
      .catch(function () {});
}
function pline(P, pts, col2, dash, w) {
  ctx.strokeStyle = col2;
  ctx.lineWidth = w || 1.6;
  ctx.setLineDash(dash || []);
  ctx.beginPath();
  var pen = false;
  for (var i = 0; i < pts.length; i++) {
    var q = P(pts[i][0], pts[i][1]);
    if (q[2] > 0) {
      pen ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
      pen = true;
    } else pen = false;
  }
  ctx.stroke();
  ctx.setLineDash([]);
}
function aptMark(P, a, col2) {
  var q = P(a.lon, a.lat);
  if (q[2] <= 0) return;
  ctx.strokeStyle = col2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(q[0], q[1], 5, 0, 7);
  ctx.stroke();
  ctx.font = "700 11px 'JetBrains Mono',monospace";
  var tw = ctx.measureText(a.code).width;
  ctx.fillStyle = "rgba(8,17,26,0.85)";
  ctx.fillRect(q[0] + 8, q[1] - 8, tw + 8, 16);
  ctx.fillStyle = col2;
  ctx.fillText(a.code, q[0] + 12, q[1] + 4);
}
function drawRoute(t, P) {
  var e = selected;
  if (!e || e.kind !== "plane") return;
  var R = e.route,
    here = [e.lon, e.lat],
    ok = routeOK(e);
  if (e.track && e.track.length > 1)
    pline(P, e.track.concat([here]), "rgba(127,227,255,0.9)", null, 2);
  else if (R && R.o && ok)
    pline(P, gc([R.o.lon, R.o.lat], here, 48), "rgba(127,227,255,0.55)", null, 1.6);
  ctx.lineDashOffset = -t * 14;
  if (R && R.d && ok) pline(P, gc(here, [R.d.lon, R.d.lat], 64), "#ffcf5a", [7, 6], 2);
  else if (e.trk != null && e.v) {
    var km = Math.min(1200, e.v * 3.6 * 0.75);
    pline(P, gc(here, dest(e.lat, e.lon, e.trk, km), 32), "#ffcf5a", [3, 6], 2);
  }
  ctx.lineDashOffset = 0;
  if (R && R.o) {
    aptMark(P, R.o, "#7fe3ff");
    if (ok) aptMark(P, R.d, "#ffcf5a");
  }
}

// ================= close-range layers: Texas property records + 3D buildings =================
var PARCELS = [],
  BLDG = [],
  pFetch = { key: "", busy: false, box: null },
  bFetch = { key: "", busy: false, box: null },
  deepMove = 0,
  deepKey = "";
var PARCEL_URL =
  "https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer/0/query";
var LANDUSE = {
  A: "Single-family residential",
  B: "Multifamily residential",
  C: "Vacant lot",
  D: "Agricultural / acreage",
  E: "Rural land & improvements",
  F: "Commercial / industrial",
  G: "Oil, gas & minerals",
  J: "Utilities",
  L: "Business personal property",
  M: "Mobile home",
  O: "Residential inventory",
  X: "Exempt (government, religious, nonprofit)"
};
function unproj(x, y) {
  var R = radius(),
    px = (x - W / 2) / R,
    py = (CY() - y) / R,
    d = px * px + py * py;
  if (d > 1) return null;
  var z = Math.sqrt(1 - d),
    p0 = rot.lat * D,
    s0 = Math.sin(p0),
    c0 = Math.cos(p0);
  return [
    rot.lon + Math.atan2(px, z * c0 - py * s0) / D,
    Math.asin(Math.max(-1, Math.min(1, py * c0 + z * s0))) / D
  ];
}
function viewBox(pad) {
  var R = radius(),
    dLa = (H / 2 / R / D) * (1 + pad),
    dLo = (W / 2 / R / D / Math.max(0.15, Math.cos(rot.lat * D))) * (1 + pad);
  return { w: rot.lon - dLo, e: rot.lon + dLo, s: rot.lat - dLa, n: rot.lat + dLa };
}
function viewKm() {
  return (W / radius()) * 6371;
}
function inBox(b) {
  return (
    b &&
    rot.lon > b.w &&
    rot.lon < b.e &&
    rot.lat > b.s &&
    rot.lat < b.n &&
    viewBox(0).w >= b.w &&
    viewBox(0).e <= b.e &&
    viewBox(0).s >= b.s &&
    viewBox(0).n <= b.n
  );
}
function rings(g) {
  if (!g) return [];
  if (g.type === "Polygon") return g.coordinates;
  if (g.type === "MultiPolygon") {
    var o = [];
    g.coordinates.forEach(function (p) {
      p.forEach(function (r) {
        o.push(r);
      });
    });
    return o;
  }
  return [];
}
function loadParcels() {
  if (pFetch.busy) return;
  var b = viewBox(0.35);
  pFetch.busy = true;
  getJSON(
    PARCEL_URL +
      "?f=geojson&where=1%3D1&geometry=" +
      [b.w, b.s, b.e, b.n]
        .map(function (v) {
          return v.toFixed(6);
        })
        .join("%2C") +
      "&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outSR=4326&geometryPrecision=6&resultRecordCount=900&outFields=prop_id,owner_name,situs_addr,situs_city,situs_zip,county,land_value,imp_value,mkt_value,stat_land_use,loc_land_use,year_built,tax_year,legal_area,gis_area",
    25000
  )
    .then(function (j) {
      PARCELS = (j.features || [])
        .map(function (f) {
          var rs = rings(f.geometry);
          if (!rs.length) return null;
          var x0 = 1e9,
            x1 = -1e9,
            y0 = 1e9,
            y1 = -1e9;
          rs[0].forEach(function (q) {
            x0 = Math.min(x0, q[0]);
            x1 = Math.max(x1, q[0]);
            y0 = Math.min(y0, q[1]);
            y1 = Math.max(y1, q[1]);
          });
          return { r: rs, bb: [x0, y0, x1, y1], p: f.properties || {} };
        })
        .filter(Boolean);
      pFetch.box = b;
      WSTAT.parcel = "ok";
      wstat();
    })
    .catch(function () {
      WSTAT.parcel = "x";
      pFetch.box = b;
      wstat();
    })
    .then(function () {
      pFetch.busy = false;
    });
}
function loadBldg() {
  if (bFetch.busy) return;
  var b = viewBox(0.3);
  bFetch.busy = true;
  getJSON(
    "https://overpass-api.de/api/interpreter?data=" +
      encodeURIComponent(
        '[out:json][timeout:20];way["building"](' +
          [b.s, b.w, b.n, b.e]
            .map(function (v) {
              return v.toFixed(5);
            })
            .join(",") +
          ");out geom 900;"
      ),
    25000
  )
    .then(function (j) {
      BLDG = (j.elements || [])
        .map(function (el) {
          if (!el.geometry || el.geometry.length < 3) return null;
          var tg = el.tags || {},
            h =
              parseFloat(tg.height) ||
              (parseFloat(tg["building:levels"]) || 0) * 3.3 ||
              (/house|residential|detached|garage|shed/.test(tg.building || "") ? 6 : 9);
          var la = 0;
          var pts = el.geometry.map(function (q) {
            la += q.lat;
            return [q.lon, q.lat];
          });
          return { pts: pts, h: Math.min(450, h), la: la / pts.length, name: tg.name || "" };
        })
        .filter(Boolean)
        .sort(function (a, b2) {
          return b2.la - a.la;
        });
      bFetch.box = b;
      WSTAT.bldg = "ok";
      wstat();
    })
    .catch(function () {
      WSTAT.bldg = "x";
      bFetch.box = b;
      wstat();
    })
    .then(function () {
      bFetch.busy = false;
    });
}
function inTexas() {
  return rot.lon > -106.8 && rot.lon < -93.4 && rot.lat > 25.7 && rot.lat < 36.6;
}
function deepLayers(t, P) {
  if (mode !== "3d" || !EMBED_OK) return;
  var km = viewKm(),
    now = performance.now(),
    k = rot.lon.toFixed(5) + rot.lat.toFixed(5) + radius().toFixed(0);
  if (k !== deepKey) {
    deepKey = k;
    deepMove = now;
  }
  var settled = now - deepMove > 700,
    i,
    j,
    q;
  if (WL.parcel && km < 4.5 && inTexas()) {
    if (settled && !inBox(pFetch.box)) loadParcels();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,211,107,0.8)";
    for (i = 0; i < PARCELS.length; i++) {
      var pc = PARCELS[i];
      ctx.beginPath();
      for (var r = 0; r < pc.r.length; r++) {
        var rg = pc.r[r];
        for (j = 0; j < rg.length; j++) {
          q = P(rg[j][0], rg[j][1]);
          j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
        }
        ctx.closePath();
      }
      if (selected && selected.pc === pc) {
        ctx.fillStyle = "rgba(255,211,107,0.28)";
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.lineWidth = 1;
      } else ctx.stroke();
    }
  }
  if (WL.bldg && km < 2.4) {
    if (settled && !inBox(bFetch.box)) loadBldg();
    var ppm = radius() / 6371000,
      tilt = 0.85;
    for (i = 0; i < BLDG.length; i++) {
      var b = BLDG[i],
        off = b.h * ppm * tilt,
        base = b.pts.map(function (pt) {
          return P(pt[0], pt[1]);
        });
      if (base[0][0] < -200 || base[0][0] > W + 200 || base[0][1] < -200 || base[0][1] > H + 400)
        continue;
      ctx.fillStyle = "rgba(94,230,255,0.16)";
      ctx.strokeStyle = "rgba(94,230,255,0.55)";
      ctx.lineWidth = 0.8;
      for (j = 0; j < base.length - 1; j++) {
        ctx.beginPath();
        ctx.moveTo(base[j][0], base[j][1]);
        ctx.lineTo(base[j + 1][0], base[j + 1][1]);
        ctx.lineTo(base[j + 1][0], base[j + 1][1] - off);
        ctx.lineTo(base[j][0], base[j][1] - off);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      for (j = 0; j < base.length; j++) {
        j ? ctx.lineTo(base[j][0], base[j][1] - off) : ctx.moveTo(base[j][0], base[j][1] - off);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(94,230,255,0.22)";
      ctx.fill();
      ctx.strokeStyle = "rgba(223,246,255,0.9)";
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
  }
}
function pip(pt, ring) {
  var x = pt[0],
    y = pt[1],
    ins = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var xi = ring[i][0],
      yi = ring[i][1],
      xj = ring[j][0],
      yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function propHit(e) {
  if (mode !== "3d" || !WL.parcel || !PARCELS.length || viewKm() > 4.5) return;
  var r = cv.getBoundingClientRect(),
    ll = unproj(e.clientX - r.left, e.clientY - r.top);
  if (!ll) return;
  for (var i = 0; i < PARCELS.length; i++) {
    var pc = PARCELS[i];
    if (ll[0] < pc.bb[0] || ll[0] > pc.bb[2] || ll[1] < pc.bb[1] || ll[1] > pc.bb[3]) continue;
    if (pip(ll, pc.r[0])) {
      var a = pc.p,
        nm = (a.situs_addr || "").trim() || "Parcel " + (a.prop_id || "");
      select({
        kind: "parcel",
        n: nm,
        lon: (pc.bb[0] + pc.bb[2]) / 2,
        lat: (pc.bb[1] + pc.bb[3]) / 2,
        pc: pc
      });
      return;
    }
  }
}
function money(v) {
  v = +v;
  return isFinite(v) && v > 0 ? "$" + Math.round(v).toLocaleString() : "—";
}
function propDossier(e) {
  var a = e.pc.p,
    code = String(a.stat_land_use || "")
      .trim()
      .toUpperCase(),
    cat = LANDUSE[code.charAt(0)] || "Not classified",
    own = String(a.owner_name || "").trim();
  var org =
    /^[BFGJLX]/.test(code) ||
    /\b(LLC|L\.L\.C|INC|CORP|CORPORATION|COMPANY|LTD|L\.?P\.?|LLP|PARTNERS(HIP)?|ASSOC|ASSOCIATION|BANK|CHURCH|CITY OF|COUNTY|STATE OF|ISD|DISTRICT|UNIVERSITY|AUTHORITY|HOLDINGS|PROPERTIES|INVESTMENTS|REALTY|FOUNDATION|USA|UNITED STATES)\b/i.test(
      own
    );
  var mk = +a.mkt_value,
    rows = [
      ["ADDRESS", [a.situs_addr, a.situs_city, a.situs_zip].filter(Boolean).join(", ") || "—"],
      ["COUNTY", a.county || "—"],
      ["LAND USE", cat + (code ? " (" + code + ")" : "")],
      ["OWNER", own ? (org ? own : "Private individual — not shown") : "—"],
      ["MARKET VALUE", money(a.mkt_value)],
      ["LAND VALUE", money(a.land_value)],
      ["IMPROVEMENTS", money(a.imp_value)],
      ["YEAR BUILT", a.year_built && +a.year_built > 1700 ? a.year_built : "—"],
      ["TAX YEAR", a.tax_year || "—"],
      [
        "AREA",
        a.legal_area
          ? (+a.legal_area).toLocaleString() + " (legal)"
          : a.gis_area
            ? (+a.gis_area).toFixed(2) + " (GIS)"
            : "—"
      ],
      ["PARCEL ID", a.prop_id || "—"]
    ];
  if (isFinite(mk) && mk > 0)
    rows.splice(7, 0, [
      "EST. ANNUAL TAX",
      money(mk * 0.016) + " – " + money(mk * 0.024) + " (typical Texas rates, before exemptions)"
    ]);
  $("detail").innerHTML =
    '<h4>PROPERTY RECORD</h4><span class="tag mono" style="color:#ffd36b;border-color:#ffd36b">TEXAS APPRAISAL DATA</span><h3>' +
    esc(e.n) +
    '</h3><div class="wx mono" id="wx"></div><div class="kv">' +
    rows
      .map(function (r) {
        return "<span>" + esc(r[0]) + "</span><b>" + esc(r[1]) + "</b>";
      })
      .join("") +
    "</div>" +
    '<div class="acts"><button class="open" data-sv="' +
    +e.lat +
    "," +
    +e.lon +
    '">◉ STREET VIEW</button><button class="ghost" data-w="scene">Cameras nearby</button></div>' +
    (org && own
      ? '<div class="acts"><button class="ghost" data-rc="own" data-q="' +
        esc(own) +
        '">◆ Company records for the owner</button></div>'
      : "") +
    '<p class="note2">Source: Texas Geographic Information Office, from county appraisal districts. Values are appraisals, not sale prices. The exact tax bill is on the county appraisal district\'s site.</p>';
  wx(e.lat, e.lon);
}

// ---------- 3D view (MapLibre GL): tilt, rotate, terrain, 3D buildings, cameras as lights, camera picture draped on the ground ----------
// A separate view layered over the globe. If the map library can't load, the globe simply stays.
var T3 = {
  map: null,
  on: false,
  ready: false,
  terr: true,
  dark: ls("ojos-t3dark") !== false,
  p: null,
  n: -1,
  fpKey: "",
  fpT: 0,
  rt: null,
  busy: false,
  wk: ""
};
function t3Load() {
  if (window.maplibregl) return Promise.resolve();
  if (T3.p) return T3.p;
  var l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.0/dist/maplibre-gl.css";
  document.head.appendChild(l);
  T3.p = loadScript("https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.0/dist/maplibre-gl.js").then(
    function () {
      if (!window.maplibregl) throw new Error("library missing");
    }
  );
  T3.p.catch(function () {
    T3.p = null;
  });
  return T3.p;
}
function t3ZoomFor(lat, vkm) {
  return Math.max(
    1,
    Math.min(
      19.5,
      Math.log((78271.517 * Math.cos(lat * D) * Math.max(W, 320)) / (vkm * 1000)) / Math.LN2
    )
  );
}
function t3Style() {
  if (T3.ops) return opsStyle();
  var E = "https://server.arcgisonline.com/ArcGIS/rest/services/";
  return {
    version: 8,
    light: { anchor: "viewport", color: "#ffffff", intensity: 0.42, position: [1.4, 210, 32] },
    sources: {
      sat: {
        type: "raster",
        tiles: [E + "World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Imagery © Esri, Maxar, Earthstar Geographics"
      },
      lab: {
        type: "raster",
        tiles: [E + "Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 19
      },
      dem: {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 14,
        encoding: "terrarium",
        attribution: "Terrain: Mapzen, AWS"
      },
      omt: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        attribution: "© OpenStreetMap · OpenFreeMap"
      }
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#05080c" } },
      {
        id: "sat",
        type: "raster",
        source: "sat",
        paint: {
          "raster-brightness-max": T3.dark ? 0.5 : 1,
          "raster-saturation": T3.dark ? -0.45 : 0,
          "raster-contrast": T3.dark ? 0.12 : 0
        }
      },
      {
        id: "lab",
        type: "raster",
        source: "lab",
        layout: { visibility: WL.labels ? "visible" : "none" }
      },
      {
        id: "bld",
        type: "fill-extrusion",
        source: "omt",
        "source-layer": "building",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "render_height"], 8],
            0,
            "#aeb8c4",
            40,
            "#c9d2dc",
            150,
            "#e4e9ef",
            400,
            "#f4f6f9"
          ],
          "fill-extrusion-vertical-gradient": true,
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.84
        }
      }
    ]
  };
}
function t3CamData() {
  var f = [],
    i,
    c;
  for (i = 0; i < visLive.length; i++) {
    c = visLive[i];
    f.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      properties: {
        i: LIVE.indexOf(c),
        k: c.t === "hazard" ? 1 : c.t === "nature" ? 2 : c.v ? 3 : 0
      }
    });
  }
  return { type: "FeatureCollection", features: f };
}
function t3Cams() {
  var m = T3.map;
  if (!m || !T3.ready) return;
  if (T3.n === visLive.length) return;
  T3.n = visLive.length;
  var idx = {},
    i;
  for (i = 0; i < LIVE.length; i++) idx[LIVE[i].u] = i;
  var f = [],
    c;
  for (i = 0; i < visLive.length; i++) {
    c = visLive[i];
    f.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lon, c.lat] },
      properties: { i: idx[c.u], k: c.t === "hazard" ? 1 : c.t === "nature" ? 2 : c.v ? 3 : 0 }
    });
  }
  var d = { type: "FeatureCollection", features: f },
    s = m.getSource("cams");
  if (s) s.setData(d);
  else {
    m.addSource("cams", { type: "geojson", data: d });
    var col = ["match", ["get", "k"], 1, "#ff9a3c", 2, "#6effaa", 3, "#c8f2ff", "#46c8ff"];
    m.addLayer({
      id: "camglow",
      type: "circle",
      source: "cams",
      paint: {
        "circle-color": col,
        "circle-blur": 0.85,
        "circle-opacity": 0.75,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 2.5, 8, 6, 13, 11, 17, 18],
        "circle-pitch-alignment": "map"
      }
    });
    m.addLayer({
      id: "cams",
      type: "circle",
      source: "cams",
      paint: {
        "circle-color": "#ffffff",
        "circle-stroke-color": col,
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 2, 0.6, 12, 1.6],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 0.9, 8, 2, 13, 3.6, 17, 6]
      }
    });
    m.on("click", "cams", function (e) {
      var ft = e.features && e.features[0],
        c2 = ft && LIVE[ft.properties.i];
      if (c2) {
        select(c2);
        target = null;
        m.easeTo({
          center: [c2.lon, c2.lat],
          zoom: Math.max(m.getZoom(), 15.5),
          pitch: Math.max(m.getPitch(), 55),
          duration: 1400
        });
      }
    });
    m.on("click", "camglow", function (e) {
      if (m.queryRenderedFeatures(e.point, { layers: ["cams"] }).length) return;
      var ft = e.features && e.features[0],
        c2 = ft && LIVE[ft.properties.i];
      if (c2) {
        select(c2);
        target = null;
        m.easeTo({
          center: [c2.lon, c2.lat],
          zoom: Math.max(m.getZoom(), 15.5),
          pitch: Math.max(m.getPitch(), 55),
          duration: 1400
        });
      }
    });
  }
}
// newest frame of the selected camera as a picture the map can drape
function t3Frame(c) {
  var v = document.querySelector("#detail .camview video");
  if (v && v.readyState >= 2 && v.videoWidth) {
    try {
      var cn = T3.cn || (T3.cn = document.createElement("canvas"));
      cn.width = Math.min(960, v.videoWidth);
      cn.height = Math.round((cn.width * v.videoHeight) / v.videoWidth);
      cn.getContext("2d").drawImage(v, 0, 0, cn.width, cn.height);
      return Promise.resolve(cn.toDataURL("image/jpeg", 0.8));
    } catch (e) {}
  }
  if (isJ(c.e)) return jimg(c.e);
  var n = nativeHttp();
  if (n)
    return n
      .get({
        url: c.e + (c.e.indexOf("?") < 0 ? "?" : "&") + "_t=" + Date.now(),
        responseType: "blob"
      })
      .then(function (r) {
        if (!r || r.status >= 400 || typeof r.data !== "string" || r.data.length < 300) throw 0;
        return "data:image/jpeg;base64," + r.data.replace(/\s/g, "");
      })
      .catch(function () {
        return c.e;
      });
  return Promise.resolve(c.e);
}
function t3Foot() {
  var m = T3.map;
  if (!m || !T3.ready || T3.busy) return;
  var c = selected && selected.live && FPON ? selected : null,
    rm = function () {
      ["fp", "fpline"].forEach(function (id) {
        if (m.getLayer(id)) m.removeLayer(id);
      });
      ["fp", "fpo"].forEach(function (id) {
        if (m.getSource(id)) m.removeSource(id);
      });
      T3.fpKey = "";
    };
  if (!c) {
    if (T3.fpKey) rm();
    return;
  }
  var q = fpQuad(c),
    key = c.u + "|" + camHdg(c),
    now = Date.now(),
    fresh = key !== T3.fpKey;
  if (!fresh && now - T3.fpT < (c.v || isJ(c.e) ? 2500 : 6000)) return;
  T3.fpT = now;
  T3.busy = true;
  t3Frame(c)
    .then(function (url) {
      if (!T3.on || selected !== c) return;
      if (fresh && T3.fpKey) rm();
      var ring = {
        type: "Feature",
        geometry: { type: "LineString", coordinates: [q[0], q[1], q[2], q[3], q[0]] }
      };
      if (!m.getSource("fp")) {
        m.addSource("fp", { type: "image", url: url, coordinates: q });
        m.addLayer(
          {
            id: "fp",
            type: "raster",
            source: "fp",
            paint: { "raster-opacity": 0.94, "raster-fade-duration": 0 }
          },
          m.getLayer("camglow") ? "camglow" : undefined
        );
        m.addSource("fpo", { type: "geojson", data: ring });
        m.addLayer({
          id: "fpline",
          type: "line",
          source: "fpo",
          paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [2, 1.6] }
        });
      } else {
        m.getSource("fp").updateImage({ url: url, coordinates: q });
        m.getSource("fpo").setData(ring);
      }
      T3.fpKey = key;
    })
    .catch(function () {})
    .then(function () {
      T3.busy = false;
    });
}
function t3Route() {
  var m = T3.map;
  if (!m || !T3.ready) return;
  var R = DRV.R;
  if (R !== T3.rt) {
    T3.rt = R;
    var d = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: R
          ? R.pts.map(function (p) {
              return [p[1], p[0]];
            })
          : []
      }
    };
    if (m.getSource("route")) m.getSource("route").setData(d);
    else {
      m.addSource("route", { type: "geojson", data: d });
      m.addLayer(
        {
          id: "routeC",
          type: "line",
          source: "route",
          paint: { "line-color": "#02080e", "line-width": 8, "line-opacity": 0.8 },
          layout: { "line-cap": "round", "line-join": "round" }
        },
        m.getLayer("camglow") ? "camglow" : undefined
      );
      m.addLayer(
        {
          id: "route",
          type: "line",
          source: "route",
          paint: { "line-color": "#4aa8ff", "line-width": 4.5 },
          layout: { "line-cap": "round", "line-join": "round" }
        },
        m.getLayer("camglow") ? "camglow" : undefined
      );
    }
  }
  var p = DRV.pos,
    pd = {
      type: "FeatureCollection",
      features: p
        ? [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [p.lon, p.lat] },
              properties: {}
            }
          ]
        : []
    };
  if (m.getSource("me")) m.getSource("me").setData(pd);
  else {
    m.addSource("me", { type: "geojson", data: pd });
    m.addLayer({
      id: "me",
      type: "circle",
      source: "me",
      paint: {
        "circle-radius": 9,
        "circle-color": "#4aa8ff",
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 3
      }
    });
  }
  if (p && DRV.watch != null && performance.now() - lastInteract > 8000)
    m.easeTo({
      center: [p.lon, p.lat],
      zoom: Math.max(m.getZoom(), 16),
      pitch: 62,
      bearing: p.hdg != null && !isNaN(p.hdg) ? p.hdg : m.getBearing(),
      duration: 900
    });
}
// opt.ops opens the dark globe (module 42) instead of the satellite 3D view: its own style,
// from space, without terrain; opt.lon, opt.lat and opt.zoom place it.
function t3Open(opt) {
  opt = opt && opt.target ? {} : opt || {};
  var box = $("tilt"),
    ops = !!opt.ops;
  if (!box || T3.on) return;
  if (T4.on) t4Close();
  if (T3.map && !!T3.ops !== ops) {
    // The two styles share one map engine; switching rebuilds the map so every layer is fresh.
    try {
      T3.map.remove();
    } catch (e) {}
    T3.map = null;
    T3.ready = false;
  }
  T3.ops = ops;
  var btn = $("b3dv") || {};
  if (!ops) btn.textContent = "Loading 3D…";
  t3Load()
    .then(function () {
      T3.on = true;
      document.body.classList.add("tilt");
      btn.textContent = "⛰ 3D view";
      if (!ops && btn.classList) btn.classList.add("on");
      if ($("ftiles")) $("ftiles").style.display = "none";
      if (!T3.map) {
        var m;
        try {
          m = T3.map = new maplibregl.Map({
            container: "t3map",
            style: t3Style(),
            center: [opt.lon == null ? rot.lon : opt.lon, opt.lat == null ? rot.lat : opt.lat],
            zoom: ops ? opt.zoom || 1.7 : t3ZoomFor(rot.lat, viewKm()),
            pitch: ops ? 0 : 58,
            bearing: 0,
            maxPitch: 80,
            attributionControl: false,
            dragRotate: true,
            touchPitch: true
          });
        } catch (e) {
          t3Close();
          note("3D view", "This phone couldn't start the 3D map.");
          return;
        }
        try {
          if (!ops)
            m.addControl(
              new maplibregl.NavigationControl({ visualizePitch: true }),
              "bottom-right"
            );
          m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
        } catch (e) {}
        m.on("error", function () {});
        m.on("pointerdown", function () {
          lastInteract = performance.now();
        });
        m.on("dragstart", function () {
          lastInteract = performance.now();
        });
        m.on("load", function () {
          T3.ready = true;
          T3.n = -1;
          try {
            m.setProjection({ type: "globe" });
          } catch (e) {}
          try {
            if (T3.terr && !T3.ops) m.setTerrain({ source: "dem", exaggeration: 1.25 });
          } catch (e) {}
          t3Cams();
          t3World();
          t3Info();
          t3Route();
          t3Foot();
          if (!T3.ops) ls("ojos-view", "3d");
        });
      } else {
        T3.map.resize();
        if (!ops) T3.map.jumpTo({ center: [rot.lon, rot.lat], zoom: t3ZoomFor(rot.lat, viewKm()) });
        else if (opt.lon != null)
          T3.map.jumpTo({
            center: [opt.lon, opt.lat],
            zoom: opt.zoom || T3.map.getZoom(),
            pitch: 0
          });
        T3.n = -1;
        t3Cams();
      }
      if (!ops && !ls("ojos-t3tip")) {
        ls("ojos-t3tip", 1);
        note(
          "3D view",
          "Drag to move. Two fingers up or down to tilt, twist to rotate. Tap a light to open that camera."
        );
      }
    })
    .catch(function () {
      btn.textContent = "⛰ 3D view";
      if (ops) {
        if (opt.fail) opt.fail();
        return;
      }
      note(
        "3D view",
        "Couldn't load the 3D map. Check your connection and try again; the globe still works."
      );
    });
}
// aircraft, ships, earthquakes and events as points in the 3D view
function t3World() {
  var m = T3.map;
  if (!m || !T3.ready) return;
  var k = [
    WL.air ? PLANES.length : 0,
    WL.ship ? SHIPS.length : 0,
    WL.quake ? QUAKES.length : 0,
    WL.event ? EVENTS.length : 0,
    Math.floor(Date.now() / 15000)
  ].join("_");
  if (k === T3.wk) return;
  T3.wk = k;
  var f = [],
    add = function (arr, kind, max) {
      for (var i = 0; i < arr.length && i < max; i++) {
        var e = arr[i];
        if (e.lat == null || e.lon == null) continue;
        f.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [e.lon, e.lat] },
          properties: { k: kind, i: i }
        });
      }
    };
  if (WL.air) add(PLANES, "p", 9000);
  if (WL.ship) add(SHIPS, "s", 7000);
  if (WL.quake) add(QUAKES, "q", 500);
  if (WL.event) add(EVENTS, "e", 1500);
  var d = { type: "FeatureCollection", features: f };
  if (m.getSource("world")) m.getSource("world").setData(d);
  else {
    m.addSource("world", { type: "geojson", data: d });
    m.addLayer({
      id: "world",
      type: "circle",
      source: "world",
      paint: {
        "circle-color": [
          "match",
          ["get", "k"],
          "p",
          "#ffe27a",
          "s",
          "#d9c8ff",
          "q",
          "#ff5533",
          "e",
          "#ff8a1f",
          "#fff"
        ],
        "circle-radius": ["match", ["get", "k"], "q", 6, "e", 5, 3],
        "circle-stroke-color": "#02080e",
        "circle-stroke-width": 1
      }
    });
    m.on("click", "world", function (e) {
      var ft = e.features && e.features[0];
      if (!ft) return;
      var a = { p: PLANES, s: SHIPS, q: QUAKES, e: EVENTS }[ft.properties.k],
        o = a && a[ft.properties.i];
      if (o) {
        select(o);
        target = null;
        var pk = ft.properties.k;
        if (pk === "p" || pk === "s") {
          T3.mt = 0;
          m.flyTo({
            center: [o.lon, o.lat],
            zoom: pk === "p" ? 11.5 : 14.5,
            pitch: 72,
            bearing: (pk === "p" ? o.trk : o.cog) || 0,
            duration: 2200
          });
        }
      }
    });
  }
}
// simple solid 3D models for aircraft and ships near the view: built from shapes, flown at their real altitude and heading
function t3Models() {
  var m = T3.map;
  if (!m || !T3.ready) return;
  var z = m.getZoom(),
    f = [],
    now = Date.now();
  if (now - (T3.mt || 0) < 1800) return;
  T3.mt = now;
  if (z >= 7.5) {
    var bd = m.getBounds(),
      w = bd.getWest(),
      e = bd.getEast(),
      so = bd.getSouth(),
      no = bd.getNorth(),
      S = Math.max(1, Math.min(500, Math.pow(2, 14.5 - z))),
      c = m.getCenter();
    var part = function (o, h, pts, base, top, col) {
      var k = Math.cos(o.lat * D),
        ch = Math.cos(h * D),
        sh = Math.sin(h * D),
        ring = pts.map(function (p) {
          var x = p[0] * S,
            y = p[1] * S,
            ea = x * ch + y * sh,
            nn = -x * sh + y * ch;
          return [o.lon + ea / (111320 * k), o.lat + nn / 110540];
        });
      ring.push(ring[0]);
      f.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: { b: base, h: top, c: col }
      });
    };
    var near = function (arr, max) {
      return arr
        .filter(function (o) {
          return o.lat != null && o.lon >= w && o.lon <= e && o.lat >= so && o.lat <= no;
        })
        .map(function (o) {
          return [(o.lon - c.lng) * (o.lon - c.lng) + (o.lat - c.lat) * (o.lat - c.lat), o];
        })
        .sort(function (a, b) {
          return a[0] - b[0];
        })
        .slice(0, max)
        .map(function (x) {
          return x[1];
        });
    };
    if (WL.air)
      near(PLANES, 40).forEach(function (p) {
        var h = p.trk || 0,
          a = Math.max(300, p.alt || 9000),
          mir = function (q) {
            return q
              .map(function (v) {
                return [-v[0], v[1]];
              })
              .reverse();
          },
          wing = [
            [3, 14],
            [32, -4],
            [32, -10],
            [3, 2]
          ],
          tail = [
            [2, -24],
            [12, -30],
            [12, -34],
            [2, -30]
          ];
        part(
          p,
          h,
          [
            [-3, -30],
            [3, -30],
            [3.6, 20],
            [0, 34],
            [-3.6, 20]
          ],
          a,
          a + 7 * S,
          "#f1f4f8"
        );
        part(p, h, wing, a + 2 * S, a + 3.6 * S, "#c9d3de");
        part(p, h, mir(wing), a + 2 * S, a + 3.6 * S, "#c9d3de");
        part(p, h, tail, a + 4 * S, a + 5.2 * S, "#c9d3de");
        part(p, h, mir(tail), a + 4 * S, a + 5.2 * S, "#c9d3de");
        part(
          p,
          h,
          [
            [-0.7, -31],
            [0.7, -31],
            [0.7, -19],
            [-0.7, -19]
          ],
          a + 6 * S,
          a + 17 * S,
          "#5ee6ff"
        );
        part(
          p,
          h,
          [
            [-9, -9],
            [9, -9],
            [9, 9],
            [-9, 9]
          ],
          0,
          0.4,
          "#0a1420"
        );
      });
    if (WL.ship)
      near(SHIPS, 40).forEach(function (q) {
        var h = q.cog != null && q.cog < 360 ? q.cog : 0;
        part(
          q,
          h,
          [
            [-9, -60],
            [9, -60],
            [10, 35],
            [0, 62],
            [-10, 35]
          ],
          0,
          9 * S,
          "#6f7c8c"
        );
        part(
          q,
          h,
          [
            [-7, -52],
            [7, -52],
            [7, -30],
            [-7, -30]
          ],
          9 * S,
          26 * S,
          "#eef2f6"
        );
        part(
          q,
          h,
          [
            [-6, -22],
            [6, -22],
            [6, 30],
            [-6, 30]
          ],
          9 * S,
          14 * S,
          "#b0563c"
        );
      });
  }
  var d = { type: "FeatureCollection", features: f };
  if (m.getSource("models")) m.getSource("models").setData(d);
  else {
    m.addSource("models", { type: "geojson", data: d });
    m.addLayer({
      id: "models",
      type: "fill-extrusion",
      source: "models",
      paint: {
        "fill-extrusion-color": ["get", "c"],
        "fill-extrusion-base": ["get", "b"],
        "fill-extrusion-height": ["get", "h"],
        "fill-extrusion-opacity": 0.96
      }
    });
  }
}
function t3Close() {
  if (!T3.on) return;
  T3.on = false;
  ls("ojos-view", "globe");
  document.body.classList.remove("tilt");
  var b = $("b3dv");
  if (b) b.classList.remove("on");
  var m = T3.map;
  if (m) {
    try {
      var c = m.getCenter(),
        z = m.getZoom(),
        nv = (Math.max(W, 320) * 78271.517 * Math.cos(c.lat * D)) / Math.pow(2, z) / 1000,
        ov = viewKm();
      rot.lon = c.lng;
      rot.lat = Math.max(-85, Math.min(85, c.lat));
      zoom = clampZ((zoom * ov) / nv);
    } catch (e) {}
  }
  target = null;
  setTimeout(resize, 40);
}
setInterval(function () {
  if (!T3.on || !T3.map || !T3.ready || document.hidden) return;
  var m = T3.map;
  if (target) {
    var vk = (viewKm() * zoom) / target.z;
    m.flyTo({
      center: [target.lon, target.lat],
      zoom: t3ZoomFor(target.lat, vk),
      duration: 1800
    });
    rot.lon = target.lon;
    rot.lat = target.lat;
    zoom = target.z;
    target = null;
  }
  t3Cams();
  t3World();
  t3Info();
  t3Models();
  t3Route();
  t3Foot();
}, 700);
document.addEventListener("click", function (e) {
  if (e.target.closest("#b3dv")) {
    T3.on ? t3Close() : t3Open({});
    return;
  }
  var b = e.target.closest("[data-t3]");
  if (!b || !T3.map) return;
  var k = b.getAttribute("data-t3"),
    m = T3.map;
  if (k === "up") m.easeTo({ pitch: Math.min(80, m.getPitch() + 15), duration: 400 });
  else if (k === "dn") m.easeTo({ pitch: Math.max(0, m.getPitch() - 15), duration: 400 });
  else if (k === "l") m.easeTo({ bearing: m.getBearing() - 30, duration: 400 });
  else if (k === "r") m.easeTo({ bearing: m.getBearing() + 30, duration: 400 });
  else if (k === "n") m.easeTo({ bearing: 0, pitch: 0, duration: 600 });
  else if (k === "terr") {
    T3.terr = !T3.terr;
    try {
      m.setTerrain(T3.terr ? { source: "dem", exaggeration: 1.25 } : null);
    } catch (er) {}
    b.classList.toggle("on", T3.terr);
  } else if (k === "dark") {
    T3.dark = !T3.dark;
    ls("ojos-t3dark", T3.dark);
    try {
      m.setPaintProperty("sat", "raster-brightness-max", T3.dark ? 0.5 : 1);
      m.setPaintProperty("sat", "raster-saturation", T3.dark ? -0.45 : 0);
      m.setPaintProperty("sat", "raster-contrast", T3.dark ? 0.12 : 0);
    } catch (er) {}
    b.classList.toggle("on", T3.dark);
  } else if (k === "x") t3Close();
});
// ---- "Layers & filters" rail: everything on the map with live counts; tap a row to show or hide it
if (ls("ojos-lf46") !== true) {
  ls("ojos-lf46", true);
  if (window.innerWidth < 700) ls("ojos-lf", false);
} // phones start with the rail folded so the globe sits centred
var LF = { open: ls("ojos-lf") !== false };
// clean view: the map fills the screen with only the brand and the layers rail, like a control-room wall
var ST2D = false; // true while the dark flat version is asked for from the Layers rail
function staticSet(on) {
  ST = !!on;
  ls("ojos-static", ST);
  document.body.classList.toggle("static", ST);
  var b = $("bStatic");
  if (b) {
    b.classList.toggle("on", ST);
    b.textContent = ST ? "◼ Exit dark view" : "◼ Static 3D view";
  }
  if (ST && kG3() && !ST2D) {
    ST = false;
    ls("ojos-static", false);
    document.body.classList.remove("static");
    if (b) {
      b.classList.add("on");
      b.textContent = "◼ Exit static 3D";
    }
    LF.open = false;
    ls("ojos-lf", false);
    cleanSet(true);
    T4.st = true;
    t4Open();
    return;
  }
  if (!ST && T4.st) {
    T4.st = false;
    if (T4.on) t4Close();
    cleanSet(false);
    return;
  }
  if (ST) {
    if (T4.on) t4Close();
    if (T3.on) t3Close();
    spin = false;
    try {
      setButtons();
    } catch (e) {}
    if (!WL.dots) setLayer("dots", true);
    var bd = $("bDots");
    if (bd) bd.classList.add("on");
    LF.open = false;
    ls("ojos-lf", false);
    cleanSet(true);
  } else cleanSet(false);
  tileDirty = true;
  lastView = "";
  lastInteract = performance.now();
}
function cleanSet(on) {
  document.body.classList.toggle("clean", !!on);
  ls("ojos-clean", !!on);
  if (on) document.body.classList.remove("sheet");
  setTimeout(resize, 40);
  setTimeout(lfDraw, 60);
}
document.addEventListener("click", function (e) {
  if (e.target.closest("#bStatic")) {
    ST2D = false;
    staticSet(!(ST || T4.st));
    return;
  }
  if (e.target.closest("#brandov")) {
    if (ST || T4.st) staticSet(false);
    else cleanSet(false);
  }
});
function lfDraw() {
  var el = $("lfrail");
  if (!el) return;
  if (W >= 1000 && !T3.on && !WL.dots) {
    /* desktop keeps its side panel */
  }
  var vid = 0,
    i;
  for (i = 0; i < visLive.length; i++) if (visLive[i].v) vid++;
  var cnt = function (k) {
      var d = WLDEF.filter(function (w) {
        return w[0] === k;
      })[0];
      try {
        return d && d[3] ? d[3]() : 0;
      } catch (e) {
        return 0;
      }
    },
    row = function (key, ic, col, n, lab, on) {
      return (
        '<button class="lfr' +
        (on ? " on" : "") +
        '" data-lf="' +
        key +
        '"><i style="color:' +
        col +
        '">' +
        ic +
        "</i><span><b>" +
        (typeof n === "number" ? n.toLocaleString() : n) +
        "</b><em>" +
        lab +
        "</em></span></button>"
      );
    };
  if (LF.hid) {
    var hh = '<button class="lfmini" data-lf="_unhide" aria-label="Show layers">☰</button>';
    if (el._h !== hh) {
      el._h = hh;
      el.innerHTML = hh;
    }
    return;
  }
  var h =
    '<button class="lfh" data-lf="_toggle"><b>☰ Layers</b><em>' +
    (LF.open ? "Everything on the map" : "") +
    "</em></button>";
  if (LF.open)
    h +=
      row("dots", "◉", "#46c8ff", visLive.length, "cameras", !!WL.dots) +
      row("_video", "▶", "#c8f2ff", vid, "live video", false) +
      row("air", "✈", "#ffe27a", WL.air ? cnt("air") : "off", "flights", !!WL.air) +
      row("ship", "⛴", "#d9c8ff", WL.ship ? cnt("ship") : "off", "ships", !!WL.ship) +
      row(
        "transit",
        "🚌",
        "#ffd84a",
        WL.transit ? cnt("transit") : "off",
        "transit",
        !!WL.transit
      ) +
      row("sat", "✦", "#b4ffb0", WL.sat ? cnt("sat") : "off", "satellites", !!WL.sat) +
      row("quake", "◎", "#ff5533", WL.quake ? cnt("quake") : "off", "earthquakes", !!WL.quake) +
      row("event", "▲", "#ff8a1f", WL.event ? cnt("event") : "off", "fires · storms", !!WL.event) +
      row("radar", "☂", "#4aa3ff", WL.radar ? "on" : "off", "weather radar", !!WL.radar) +
      row("_alerts", "🔔", "#ffb040", AL.log.length, "alerts", false) +
      row("_news", "◆", "#ff6b7d", NEWS.alerts.length || "live", "news desk", false) +
      '<div class="lft two"><button data-lf="_hideall" class="' +
      (LF.saved ? "on" : "") +
      '">' +
      (LF.saved ? "ALL ON" : "ALL OFF") +
      '</button><button data-lf="_hide">HIDE</button></div>' +
      '<div class="lft"><button data-lf="_st" class="' +
      (ST ? "on" : "") +
      '">DARK</button><button data-lf="_3d" class="' +
      (T3.on || T4.on ? "on" : "") +
      '">3D</button><button data-lf="_search" aria-label="Search">⌕</button><button data-lf="_drive" aria-label="Drive">➤</button><button data-lf="_set" aria-label="All settings">⚙</button><button data-lf="_clean" aria-label="Clean view" class="' +
      (document.body.classList.contains("clean") ? "on" : "") +
      '">⛶</button></div>';
  if (el._h !== h) {
    el._h = h;
    el.innerHTML = h;
  }
}
setInterval(lfDraw, 1500);
setTimeout(lfDraw, 300);
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-lf]");
  if (!b) return;
  var k = b.getAttribute("data-lf");
  if (k === "_news") {
    newsOpen();
    return;
  }
  if (k === "_hide") {
    railSet(false);
    note(
      "Layers panel hidden",
      "It is off the map now. Bring it back any time: ⌂ Briefing → Options → Show the Layers panel. Your layers are still in the Layers tab at the bottom.",
      function () {
        railSet(true);
      }
    );
    return;
  }
  if (k === "_unhide") {
    LF.hid = false;
    LF.open = true;
    lfDraw();
    return;
  }
  if (k === "_hideall") {
    var keys = ["dots", "air", "ship", "transit", "sat", "quake", "event", "radar"];
    if (LF.saved) {
      LF.saved.forEach(function (x) {
        setLayer(x, true);
      });
      LF.saved = null;
    } else {
      LF.saved = keys.filter(function (x) {
        return !!WL[x];
      });
      LF.saved.forEach(function (x) {
        setLayer(x, false);
      });
    }
    lastView = "";
    lfDraw();
    return;
  }
  if (k === "_st") {
    ST2D = true;
    staticSet(!ST);
    ST2D = false;
  } else if (k === "_toggle") {
    LF.open = !LF.open;
    ls("ojos-lf", LF.open);
  } else if (k === "_3d") {
    if (T4.on) t4Close();
    else if (T3.on) t3Close();
    else if (kG3()) t4Open();
    else t3Open();
  } else if (k === "_search") {
    $("addr").focus();
  } else if (k === "_drive") {
    drvPanel();
  } else if (k === "_set") {
    brOpen("set");
  } else if (k === "_clean") {
    cleanSet(!document.body.classList.contains("clean"));
  } else if (k === "_alerts") {
    setTab("events");
  } else if (k === "_video") {
    note(
      "Live video",
      b.querySelector("b").textContent +
        " cameras in view of the filters have a live stream. They glow brighter in the All cameras view."
    );
  } else if (k === "dots") {
    setLayer("dots", !WL.dots);
    if (WL.dots) {
      spin = false;
      setButtons();
    }
    var bd = $("bDots");
    if (bd) bd.classList.toggle("on", !!WL.dots);
  } else setLayer(k, !WL[k]);
  lfDraw();
});
