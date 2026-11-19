/*
 * Moving: everything on the map that moves, in one list, the way Cameras lists cameras. Aircraft, ships,
 * trains, buses and other transit, and satellites, nearest to the middle of the view first, with what each
 * is doing (height, speed, heading, route). A tap flies to it and opens its details; aircraft also get
 * ✈ PILOT for the cockpit view in one tap. The list keeps itself current every few seconds while open, but
 * never redraws under a finger that is scrolling it.
 */
var MV = { open: false, f: "all", t: 0, touched: 0, h: "" };
var MV_MAX = 120;
var MV_KINDS = [
  ["all", "All"],
  ["plane", "✈ Aircraft"],
  ["ship", "⛴ Ships"],
  ["transit", "🚆 Trains & transit"],
  ["sat", "🛰 Satellites"]
];
// Which layer brings in each kind, for the "turn it on" hint.
var MV_LAYER = { plane: "air", ship: "ship", transit: "transit", sat: "sat" };

function mvCentre() {
  try {
    if (T3.on && T3.map) {
      var c = T3.map.getCenter();
      return [c.lat, c.lng];
    }
  } catch (x) {}
  return [rot.lat, rot.lon];
}

// Everything moving, nearest the middle of the view first: [{o, km}].
function mvList(f) {
  var c = mvCentre(),
    src = [];
  if (f === "all" || f === "plane") src = src.concat(PLANES);
  if (f === "all" || f === "ship") src = src.concat(SHIPS);
  if (f === "all" || f === "transit") src = src.concat(TRANSIT);
  if (f === "all" || f === "sat") src = src.concat(SATS);
  return src
    .filter(function (o) {
      return o && isFinite(o.lat) && isFinite(o.lon);
    })
    .map(function (o) {
      if (o.id == null) o.id = o.kind + ":" + o.n; // satellites have no id of their own
      return { o: o, km: hav(c[0], c[1], o.lat, o.lon) };
    })
    .sort(function (a, b) {
      return a.km - b.km;
    })
    .slice(0, MV_MAX);
}

function mvIcon(o) {
  if (o.kind === "plane") return "✈";
  if (o.kind === "ship") return "⛴";
  if (o.kind === "sat") return "🛰";
  return { rail: "🚆", subway: "🚇", tram: "🚊", bus: "🚌", ferry: "⛴" }[o.mode] || "🚍";
}

function mvColour(o) {
  if (o.kind === "plane") return "#7fe3ff";
  if (o.kind === "ship") return "#d9c8ff";
  if (o.kind === "sat") return "#39ff6a";
  return (TR_MODES[o.mode] || TR_MODES.transit)[1];
}

// What it is doing, in a few words.
function mvSub(o) {
  var b = [];
  if (o.kind === "plane") {
    if (o.alt != null) b.push(Math.round(o.alt * 3.281).toLocaleString() + " FT");
    if (o.v != null) b.push(Math.round(o.v * 1.944) + " KT");
    if (o.typ) b.push(o.typ);
  } else if (o.kind === "ship") {
    if (o.sog != null) b.push(Math.round(o.sog) + " KT");
    if (o.dest) b.push("TO " + String(o.dest).toUpperCase().slice(0, 18));
  } else if (o.kind === "sat") {
    if (o.alt != null) b.push(Math.round(o.alt).toLocaleString() + " KM UP");
  } else {
    b.push(String((TR_MODES[o.mode] || TR_MODES.transit)[0]).toUpperCase());
    if (o.spd != null) b.push(Math.round(o.spd * 0.621) + " MPH");
    if (o.dest) b.push(String(o.dest).toUpperCase().slice(0, 24));
  }
  return b.join(" · ");
}

function mvDist(km) {
  var mi = km * 0.621;
  return mi < 0.1
    ? Math.round(mi * 5280) + " FT"
    : (mi < 10 ? mi.toFixed(1) : Math.round(mi).toLocaleString()) + " MI";
}

function mvOpen() {
  var el = $("mvp");
  if (!el) {
    el = document.createElement("div");
    el.id = "mvp";
    el.innerHTML =
      '<div class="mvhead"><b class="mono">MOVING NOW</b><span class="mono" id="mvsub"></span><button data-mv="x" aria-label="Close">✕</button></div>' +
      '<div class="mvchips">' +
      MV_KINDS.map(function (k) {
        return '<button data-mv="f-' + k[0] + '">' + k[1] + "</button>";
      }).join("") +
      '</div><div class="mvlist" id="mvlist"></div>';
    document.body.appendChild(el);
    var lst = el.querySelector(".mvlist");
    ["touchmove", "wheel", "scroll"].forEach(function (k) {
      lst.addEventListener(
        k,
        function () {
          MV.touched = Date.now();
        },
        { passive: true }
      );
    });
  }
  MV.open = true;
  document.body.classList.add("mv-open");
  el.style.display = "flex";
  MV.h = "";
  mvDraw(true);
  clearInterval(MV.t);
  MV.t = setInterval(function () {
    if (MV.open && !document.hidden && Date.now() - MV.touched > 1500) mvDraw();
  }, 3000);
}

function mvClose() {
  MV.open = false;
  clearInterval(MV.t);
  document.body.classList.remove("mv-open");
  var el = $("mvp");
  if (el) el.style.display = "none";
}

function mvDraw(top) {
  var el = $("mvp");
  if (!el || !MV.open) return;
  [].forEach.call(el.querySelectorAll("[data-mv^='f-']"), function (b) {
    b.classList.toggle("on", b.getAttribute("data-mv") === "f-" + MV.f);
  });
  var L = mvList(MV.f),
    lay = MV_LAYER[MV.f],
    hint =
      MV.f === "all"
        ? ["plane", "ship", "transit", "sat"].filter(function (k) {
            return !WLU[MV_LAYER[k]];
          })
        : lay && !WLU[lay]
          ? [MV.f]
          : [],
    h =
      (hint.length
        ? '<div class="mvhint"><span>Turn on to see more:</span>' +
          hint
            .map(function (k) {
              var nm = MV_KINDS.filter(function (x) {
                return x[0] === k;
              })[0][1];
              return '<button data-mv="on-' + k + '">+ ' + nm + "</button>";
            })
            .join("") +
          "</div>"
        : "") +
      (L.length
        ? L.map(function (x) {
            var o = x.o;
            return (
              '<div class="mvrow"><button class="mvgo" data-mv="go-' +
              esc(o.kind) +
              "-" +
              esc(String(o.id)) +
              '"><i style="background:' +
              mvColour(o) +
              '">' +
              mvIcon(o) +
              "</i><span><b>" +
              esc(String(o.n || "Unknown").slice(0, 40)) +
              '</b><em class="mono">' +
              esc(mvSub(o)) +
              '</em></span><small class="mono">' +
              mvDist(x.km) +
              "</small></button>" +
              (o.kind === "plane"
                ? '<button class="mvpilot" data-mv="pilot-' +
                  esc(String(o.id)) +
                  '" aria-label="Pilot view">✈ PILOT</button>'
                : "") +
              "</div>"
            );
          }).join("")
        : '<p class="mvnone">Nothing moving in this list yet. ' +
          (hint.length ? "Turn on a layer above, or move the map." : "Move the map or zoom out.") +
          "</p>");
  $("mvsub").textContent = L.length
    ? L.length + (L.length === MV_MAX ? "+" : "") + " NEAREST THE MIDDLE OF THE MAP"
    : "";
  if (h === MV.h) return;
  MV.h = h;
  var lst = $("mvlist"),
    keep = lst.scrollTop;
  lst.innerHTML = h;
  lst.scrollTop = top ? 0 : keep;
}

function mvFind(kind, id) {
  var a = { plane: PLANES, ship: SHIPS, transit: TRANSIT, sat: SATS }[kind] || [];
  for (var i = 0; i < a.length; i++) if (String(a[i].id) === id) return a[i];
  return null;
}

// Fly to it and open its details.
function mvGo(o) {
  mvClose();
  try {
    if (T3.on && T3.map)
      T3.map.flyTo({
        center: [o.lon, o.lat],
        zoom: { plane: 10.5, ship: 13, sat: 3.5 }[o.kind] || 14,
        duration: 1800
      });
  } catch (x) {}
  select(o);
  if (innerWidth < 1000 && typeof sheetSet === "function" && SHH < 46) sheetSet(46, true);
}

document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-mv]");
  if (!b) return;
  var k = b.getAttribute("data-mv");
  if (k === "x") mvClose();
  else if (k.indexOf("f-") === 0) {
    MV.f = k.slice(2);
    MV.h = "";
    mvDraw(true);
  } else if (k.indexOf("on-") === 0) {
    setLayer(MV_LAYER[k.slice(3)], true);
    note("Moving", "Loading… the list fills in as they arrive.");
    setTimeout(mvDraw, 2500);
  } else if (k.indexOf("go-") === 0) {
    var m = /^go-([a-z]+)-(.*)$/.exec(k),
      o = m && mvFind(m[1], m[2]);
    if (o) mvGo(o);
  } else if (k.indexOf("pilot-") === 0) {
    var p = mvFind("plane", k.slice(6));
    if (!p) return;
    mvClose();
    select(p);
    ckpOpen(p);
  }
});
