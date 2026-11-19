/**
 * @file The command wall (operations wall): status, live cameras, alerts and headlines on one screen.
 * (Command mode, the status strip and scrolling ticker over the map, was removed in v97.)
 *
 * Module 17 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- The command wall: an operations-room presentation of the same public data ----------
// Purely a look and a layout. Everything shown is public, open-source information.
var OPS = { open: false, tm: 0 };
function cmdState() {
  var a = NEWS.alerts || [],
    l3 = a.filter(function (x) {
      return x.lvl >= 3;
    }).length,
    l2 = a.filter(function (x) {
      return x.lvl === 2;
    }).length;
  return NEWS.bc || l3 ? ["BROADCAST", "s3"] : l2 ? ["ELEVATED", "s2"] : ["NORMAL", "s1"];
}
// operations wall: status, four live cameras, alerts, headlines, chatter and the watchlist on one screen
function opsCams() {
  var o = FAV.map(camByU).filter(function (c) {
      return c && c.live;
    }),
    c = newsCentre(),
    near = [],
    i,
    x;
  if (o.length < 4) {
    for (i = 0; i < visLive.length && near.length < 4000; i++) {
      x = visLive[i];
      if (o.indexOf(x) < 0) near.push([Math.abs(x.lat - c[0]) + Math.abs(x.lon - c[1]), x]);
    }
    near.sort(function (a, b) {
      return a[0] - b[0];
    });
    near.slice(0, 4 - o.length).forEach(function (q) {
      o.push(q[1]);
    });
  }
  return o.slice(0, 4);
}
function opsDraw(full) {
  var el = $("ops");
  if (!el || !OPS.open) return;
  var st = cmdState(),
    al = (NEWS.alerts || []).slice(0, 4),
    hd = (NEWS.here || []).concat(NEWS.nat || []).slice(0, 5),
    ch = (NEWS.chat || []).slice(0, 4);
  if (full) {
    var cams = opsCams();
    OPS.cams = cams;
    el.innerHTML =
      '<div class="nh"><div><b class="mono">◆ OPERATIONS</b><h3>Command wall</h3></div><button data-op="re" aria-label="Refresh">⟳</button><button data-op="x" aria-label="Close">✕</button></div><div class="nl"><div class="opg" id="opstat"></div><h4 class="mono">LIVE FEEDS</h4><div class="opc">' +
      (cams.length
        ? cams
            .map(function (c, i) {
              return (
                '<div class="opt" data-op="cam-' +
                i +
                '"><div class="opm">' +
                media(c, "wimg") +
                '</div><span class="mono">' +
                esc(
                  String(c.n || "CAMERA")
                    .toUpperCase()
                    .slice(0, 30)
                ) +
                "</span></div>"
              );
            })
            .join("")
        : '<p class="bre">No cameras loaded yet.</p>') +
      '</div><div id="opdyn"></div></div><div class="nf mono">OPEN SOURCE · EVERY FEED HERE IS PUBLISHED FOR THE PUBLIC</div>';
    wireMedia(el);
  }
  var s = $("opstat");
  if (s)
    s.innerHTML = [
      ["STATE", st[0], st[1]],
      ["CAMERAS", visLive.length.toLocaleString(), ""],
      ["AIRCRAFT", WL.air ? PLANES.length.toLocaleString() : "OFF", ""],
      ["SHIPS", WL.ship ? SHIPS.length.toLocaleString() : "OFF", ""],
      ["SATELLITES", WL.sat ? SATS.length.toLocaleString() : "OFF", ""],
      ["ALERTS", String((NEWS.alerts || []).length), ""]
    ]
      .map(function (x) {
        return (
          '<div class="ops ' +
          x[2] +
          '"><i class="mono">' +
          x[0] +
          '</i><b class="mono">' +
          x[1] +
          "</b></div>"
        );
      })
      .join("");
  var d = $("opdyn");
  if (d)
    d.innerHTML =
      '<h4 class="mono">ALERTS</h4>' +
      (al.length
        ? al
            .map(function (a) {
              return (
                '<div class="brc l' +
                a.lvl +
                '" data-op="alerts"><b>' +
                esc(a.t) +
                '</b><i class="mono">' +
                esc(a.src) +
                " · " +
                ago(a.d) +
                "</i></div>"
              );
            })
            .join("")
        : '<p class="bre">No active official alerts.</p>') +
      '<h4 class="mono">WATCHLIST</h4>' +
      (WATCH.length
        ? WATCH.map(function (w) {
            return (
              '<div class="brc"><b>' +
              (w.k === "plane" ? "✈ " : "⛴ ") +
              esc(w.n) +
              "</b><span>" +
              esc(watchLine(w, watchFind(w))) +
              "</span></div>"
            );
          }).join("")
        : '<p class="bre">Nothing on the watchlist.</p>') +
      '<h4 class="mono">HEADLINES</h4>' +
      (hd.length
        ? hd
            .map(function (x) {
              return (
                '<a class="brn" href="' +
                esc(x.u) +
                '" target="_blank" rel="noopener"><i class="mono">' +
                (x.d ? ago(x.d) : "") +
                (x.src ? " · " + esc(String(x.src).slice(0, 26)) : "") +
                "</i>" +
                esc(x.t) +
                "</a>"
              );
            })
            .join("")
        : '<p class="bre">Open the News desk once to load headlines.</p>') +
      (ch.length
        ? '<h4 class="mono">LIVE CHATTER · UNVERIFIED</h4>' +
          ch
            .map(function (p) {
              return (
                '<a class="brn" href="' +
                esc(p.u) +
                '" target="_blank" rel="noopener"><i class="mono">(' +
                p.net +
                ") " +
                esc(p.who.slice(0, 30)) +
                " · " +
                ago(p.d) +
                "</i>" +
                esc(p.t.slice(0, 160)) +
                "</a>"
              );
            })
            .join("")
        : "");
}
function opsOpen() {
  var el = $("ops");
  if (!el) {
    el = document.createElement("div");
    el.id = "ops";
    document.body.appendChild(el);
  }
  OPS.open = true;
  el.style.display = "flex";
  opsDraw(true);
  if (!NEWS.ht) newsLoad(false);
  if (Date.now() - NEWS.at > 2 * 60000) newsAlerts();
  clearInterval(OPS.tm);
  OPS.tm = setInterval(function () {
    if (!OPS.open) {
      clearInterval(OPS.tm);
      return;
    }
    OPS.n = (OPS.n || 0) + 1;
    opsDraw(false);
    if (OPS.n % 2 === 0)
      [].forEach.call($("ops").querySelectorAll("img.snap"), function (im) {
        snapRefresh(im);
      });
  }, 2500);
}
function opsClose() {
  OPS.open = false;
  clearInterval(OPS.tm);
  var el = $("ops");
  if (el) {
    el.style.display = "none";
    el.innerHTML = "";
  }
}
document.addEventListener("click", function (e) {
  if (e.target.closest("#bOps")) {
    opsOpen();
    return;
  }
  var b = e.target.closest("[data-op]");
  if (!b) return;
  var k = b.getAttribute("data-op");
  if (k === "x") opsClose();
  else if (k === "re") {
    newsLoad(true);
    newsAlerts();
    opsDraw(true);
  } else if (k === "alerts") {
    opsClose();
    newsOpen("alerts");
  } else if (k.indexOf("cam-") === 0) {
    var c = OPS.cams && OPS.cams[+k.slice(4)];
    if (c && !e.target.closest(".playv")) {
      opsClose();
      select(c);
      target = { lon: c.lon, lat: c.lat, z: Math.max(zoom, 60) };
    }
  }
});
