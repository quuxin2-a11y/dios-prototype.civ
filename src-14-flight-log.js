/**
 * @file Flight log.
 * Progress, schedule and recent history for a selected aircraft.
 *
 * Module 14 of 37. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Flight log: where this airframe has been, what it is doing now, and (with a key) what it is scheduled to do ----------
// Past legs: OpenSky Network (free). Schedule and delays: AeroDataBox, only if the user adds their own key. On-course check is our own maths.
function flightProgress(p, o, d) {
  // great-circle progress and cross-track distance, in km and degrees
  var R = 6371,
    tot = hav(o.lat, o.lon, d.lat, d.lon),
    fromO = hav(o.lat, o.lon, p.lat, p.lon),
    left = hav(p.lat, p.lon, d.lat, d.lon),
    brg = function (a, b, c, e) {
      var y = Math.sin((e - b) * D) * Math.cos(c * D),
        x =
          Math.cos(a * D) * Math.sin(c * D) -
          Math.sin(a * D) * Math.cos(c * D) * Math.cos((e - b) * D);
      return (Math.atan2(y, x) / D + 360) % 360;
    },
    b13 = brg(o.lat, o.lon, p.lat, p.lon),
    b12 = brg(o.lat, o.lon, d.lat, d.lon),
    xt = Math.abs(
      Math.asin(Math.max(-1, Math.min(1, Math.sin(fromO / R) * Math.sin((b13 - b12) * D)))) * R
    ),
    toD = brg(p.lat, p.lon, d.lat, d.lon),
    off = p.trk != null ? Math.abs(((p.trk - toD + 540) % 360) - 180) : 0,
    pct = tot > 1 ? Math.max(0, Math.min(100, (1 - left / tot) * 100)) : 0,
    eta = p.v > 30 ? (left / (p.v * 3.6)) * 60 : null,
    lim = Math.max(60, tot * 0.08),
    st;
  if (left < 50) st = "arriving";
  else if (fromO < 40) st = "departing";
  else if (xt <= lim && off <= 50) st = "on";
  else if (xt <= lim * 2.2 && off <= 75) st = "near";
  else st = "off";
  return { tot: tot, left: left, xt: xt, off: off, pct: pct, eta: eta, st: st };
}
var FLOG = { p: null, hist: null, sched: null, herr: "", serr: "", ac: null, open: false };
function flogT(ms) {
  return ms
    ? new Date(ms).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })
    : "—";
}
function flogDur(s) {
  var m = Math.round(s / 60);
  return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m";
}
function flogADBt(x) {
  if (!x) return 0;
  var u = x.utc || x.Utc || x;
  return typeof u === "string" ? Date.parse(u.replace(" ", "T").replace(/Z?$/, "Z")) || 0 : 0;
}
function flogLoad(p) {
  FLOG.hist = null;
  FLOG.sched = null;
  FLOG.herr = "";
  FLOG.serr = "";
  FLOG.ac = null;
  var now = Math.floor(Date.now() / 1000);
  getJSON(
    "https://opensky-network.org/api/flights/aircraft?icao24=" +
      encodeURIComponent(p.id) +
      "&begin=" +
      (now - 12 * 86400) +
      "&end=" +
      now,
    25000
  )
    .then(function (j) {
      FLOG.hist = (Array.isArray(j) ? j : [])
        .map(function (f) {
          return {
            cs: String(f.callsign || "").trim(),
            o: f.estDepartureAirport || "",
            d: f.estArrivalAirport || "",
            t0: f.firstSeen * 1000,
            t1: f.lastSeen * 1000
          };
        })
        .sort(function (a, b) {
          return b.t0 - a.t0;
        })
        .slice(0, 40);
    })
    .catch(function (e) {
      FLOG.hist = [];
      FLOG.herr = "OpenSky did not answer (it limits anonymous requests). Try again later.";
    })
    .then(flogDraw);
  getJSON("https://api.adsbdb.com/v0/aircraft/" + encodeURIComponent(p.id), 9000)
    .then(function (j) {
      FLOG.ac = (j && j.response && j.response.aircraft) || null;
    })
    .catch(function () {})
    .then(function () {
      flogDraw();
      if (!KEYS.adb) {
        FLOG.sched = [];
        return;
      }
      var reg = FLOG.ac && FLOG.ac.registration,
        d0 = new Date(Date.now() - 864e5).toISOString().slice(0, 10),
        d1 = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10),
        u =
          "https://aerodatabox.p.rapidapi.com/flights/" +
          (reg ? "reg/" + encodeURIComponent(reg) : "icao24/" + encodeURIComponent(p.id)) +
          "/" +
          d0 +
          "/" +
          d1 +
          "?withAircraftImage=false&withLocation=false";
      return netGet(u, 25000, {
        "X-RapidAPI-Key": KEYS.adb,
        "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com"
      })
        .then(function (j) {
          if (typeof j === "string") {
            try {
              j = JSON.parse(j);
            } catch (e) {
              j = [];
            }
          }
          FLOG.sched = (Array.isArray(j) ? j : [])
            .map(function (f) {
              var a = f.departure || {},
                b = f.arrival || {},
                sd = flogADBt(a.scheduledTime || a.scheduledTimeUtc),
                sa = flogADBt(b.scheduledTime || b.scheduledTimeUtc),
                ra = flogADBt(b.revisedTime || b.predictedTime || b.runwayTime || b.actualTimeUtc),
                rd = flogADBt(a.revisedTime || a.runwayTime || a.actualTimeUtc);
              return {
                no: f.number || "",
                st: f.status || "",
                o: (a.airport || {}).iata || (a.airport || {}).icao || "?",
                on: (a.airport || {}).name || "",
                d: (b.airport || {}).iata || (b.airport || {}).icao || "?",
                dn: (b.airport || {}).name || "",
                sd: sd,
                sa: sa,
                ra: ra,
                rd: rd,
                late:
                  sa && ra
                    ? Math.round((ra - sa) / 60000)
                    : sd && rd
                      ? Math.round((rd - sd) / 60000)
                      : null
              };
            })
            .filter(function (x) {
              return x.sd || x.sa;
            })
            .sort(function (x, y) {
              return (x.sd || x.sa) - (y.sd || y.sa);
            });
        })
        .catch(function () {
          FLOG.sched = [];
          FLOG.serr =
            "The schedule service did not answer. Check the AeroDataBox key and its plan.";
        });
    })
    .then(flogDraw);
}
function flogDraw() {
  var el = $("flog");
  if (!el || !FLOG.open) return;
  var p =
      selected && selected.kind === "plane" && FLOG.p && selected.id === FLOG.p.id
        ? selected
        : FLOG.p,
    ac = FLOG.ac,
    R = p.route,
    h,
    now = Date.now();
  h =
    '<div class="nh"><div><b class="mono">◆ FLIGHT LOG</b><h3>' +
    esc(p.n || "Aircraft") +
    (ac && ac.registration ? " · " + esc(ac.registration) : "") +
    '</h3></div><button data-fg="re" aria-label="Refresh">⟳</button><button data-fg="x" aria-label="Close">✕</button></div><div class="nl">';
  if (ac)
    h +=
      '<p class="fgm mono">' +
      esc([ac.type, ac.registered_owner].filter(Boolean).join(" · ")) +
      "</p>";
  // now
  h += '<h4 class="mono">THIS FLIGHT</h4>';
  if (R && R.o && R.d) {
    var g = flightProgress(p, R.o, R.d),
      lab = {
        on: ["ON COURSE", "ok"],
        near: ["SLIGHTLY OFF THE DIRECT ROUTE", "warn"],
        off: ["WELL OFF THE DIRECT ROUTE", "bad"],
        arriving: ["ARRIVING", "ok"],
        departing: ["DEPARTING", "ok"]
      }[g.st],
      cur = (FLOG.sched || []).filter(function (x) {
        return (
          x.sd &&
          x.sd < now + 36e5 &&
          (!x.sa || x.sa > now - 2 * 36e5) &&
          (x.o === R.o.code || x.d === R.d.code)
        );
      })[0];
    h +=
      '<div class="fgc"><div class="fgr"><b>' +
      esc(R.o.code) +
      '</b><span><i style="width:' +
      g.pct.toFixed(0) +
      '%"></i></span><b>' +
      esc(R.d.code) +
      "</b></div><p>" +
      esc(R.o.city) +
      " → " +
      esc(R.d.city) +
      (R.airline ? " · " + esc(R.airline) : "") +
      "</p>" +
      '<div class="fgs ' +
      lab[1] +
      '">' +
      lab[0] +
      "</div><table>" +
      "<tr><td>Progress</td><td>" +
      g.pct.toFixed(0) +
      "% · " +
      Math.round(g.left * 0.621).toLocaleString() +
      " mi to go</td></tr>" +
      "<tr><td>Off direct line</td><td>" +
      Math.round(g.xt * 0.621) +
      " mi" +
      (p.trk != null ? " · heading " + Math.round(g.off) + "° off the destination" : "") +
      "</td></tr>" +
      (g.eta != null
        ? "<tr><td>Arrival at this speed</td><td>" +
          new Date(now + g.eta * 60000).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit"
          }) +
          " (" +
          flogDur(g.eta * 60) +
          ")</td></tr>"
        : "") +
      (cur && cur.sa
        ? "<tr><td>Scheduled arrival</td><td>" +
          flogT(cur.sa) +
          "</td></tr><tr><td>Against schedule</td><td>" +
          (g.eta != null
            ? (function () {
                var dl = Math.round((now + g.eta * 60000 - cur.sa) / 60000);
                return dl > 14
                  ? '<b class="bad">' + dl + " min late</b>"
                  : dl < -14
                    ? '<b class="ok">' + -dl + " min early</b>"
                    : '<b class="ok">on time</b>';
              })()
            : esc(cur.st)) +
          "</td></tr>"
        : "") +
      "</table>" +
      (g.st === "near" || g.st === "off"
        ? '<p class="fgn">Airliners rarely fly the straight line: weather, winds and air traffic control move them. Well off the line with a heading away from the destination can mean holding or a diversion.</p>'
        : "") +
      "</div>";
  } else
    h +=
      '<p class="ne" style="padding:14px 0">' +
      (R === false
        ? "No published route for this callsign (private, cargo and military flights often have none)."
        : "Looking up the route…") +
      "</p>";
  // schedule
  h += '<h4 class="mono">SCHEDULED FOR THIS AIRCRAFT</h4>';
  if (!KEYS.adb)
    h +=
      '<div class="fgc"><p>Airlines do not publish which aircraft flies which flight for free. To see this aircraft\'s upcoming flights and delays, add an AeroDataBox key under Layers → Sources &amp; keys.</p><button data-fg="keys">Add key</button></div>';
  else if (FLOG.sched === null)
    h += '<p class="ne" style="padding:14px 0">Loading the schedule…</p>';
  else if (FLOG.serr) h += '<p class="ne" style="padding:14px 0">' + esc(FLOG.serr) + "</p>";
  else if (!FLOG.sched.length)
    h +=
      '<p class="ne" style="padding:14px 0">Nothing scheduled for this aircraft in the next two days.</p>';
  else
    h += FLOG.sched
      .map(function (x) {
        var up = x.sd > now,
          cls = x.late == null ? "" : x.late > 14 ? "bad" : "ok";
        return (
          '<div class="fgl"><i class="mono">' +
          flogT(x.sd) +
          (up ? " · UPCOMING" : "") +
          "</i><b>" +
          esc(x.no) +
          " · " +
          esc(x.o) +
          " → " +
          esc(x.d) +
          "</b><span>" +
          esc(x.st || "") +
          (x.late != null
            ? ' · <em class="' +
              cls +
              '">' +
              (x.late > 14
                ? x.late + " min late"
                : x.late < -14
                  ? -x.late + " min early"
                  : "on time") +
              "</em>"
            : "") +
          (x.sa ? " · arrives " + flogT(x.sa) : "") +
          "</span></div>"
        );
      })
      .join("");
  // history
  h += '<h4 class="mono">WHERE IT HAS BEEN · LAST 12 DAYS</h4>';
  if (FLOG.hist === null) h += '<p class="ne" style="padding:14px 0">Loading…</p>';
  else if (FLOG.herr) h += '<p class="ne" style="padding:14px 0">' + esc(FLOG.herr) + "</p>";
  else if (!FLOG.hist.length)
    h +=
      '<p class="ne" style="padding:14px 0">No completed flights on record for this aircraft in that period.</p>';
  else {
    var legs = FLOG.hist,
      cnt = {};
    legs.forEach(function (f) {
      if (f.o && f.d) {
        var k = f.o + " → " + f.d;
        cnt[k] = (cnt[k] || 0) + 1;
      }
    });
    var top = Object.keys(cnt)
        .sort(function (a, b) {
          return cnt[b] - cnt[a];
        })
        .slice(0, 3),
      air = legs.reduce(function (a, f) {
        return a + (f.t1 - f.t0) / 1000;
      }, 0);
    h +=
      '<p class="fgm mono">' +
      legs.length +
      " FLIGHTS · " +
      flogDur(air) +
      " IN THE AIR" +
      (top.length
        ? " · MOST FLOWN: " +
          esc(
            top
              .map(function (k) {
                return k + " ×" + cnt[k];
              })
              .join(", ")
          )
        : "") +
      "</p>" +
      legs
        .map(function (f) {
          return (
            '<div class="fgl"><i class="mono">' +
            flogT(f.t0) +
            "</i><b>" +
            esc(f.cs || "—") +
            " · " +
            esc(f.o || "?") +
            " → " +
            esc(f.d || "?") +
            "</b><span>" +
            flogDur((f.t1 - f.t0) / 1000) +
            " in the air · landed " +
            flogT(f.t1) +
            "</span></div>"
          );
        })
        .join("");
  }
  h +=
    '</div><div class="nf mono">PAST FLIGHTS: OPENSKY NETWORK (AIRPORTS ARE ESTIMATES) · REGISTER: ADSBDB' +
    (KEYS.adb ? " · SCHEDULE: AERODATABOX" : "") +
    "</div>";
  el.innerHTML = h;
}
function flogOpen(p) {
  if (!p || p.kind !== "plane") return;
  var el = $("flog");
  if (!el) {
    el = document.createElement("div");
    el.id = "flog";
    el.className = "newsp";
    document.body.appendChild(el);
  }
  FLOG.p = p;
  FLOG.open = true;
  el.style.display = "flex";
  if (p.route === undefined) loadRoute(p);
  flogLoad(p);
  flogDraw();
}
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-fg]");
  if (!b) return;
  var k = b.getAttribute("data-fg");
  if (k === "x") {
    FLOG.open = false;
    $("flog").style.display = "none";
  } else if (k === "re" && FLOG.p) (flogLoad(FLOG.p), flogDraw());
  else if (k === "keys") {
    FLOG.open = false;
    $("flog").style.display = "none";
    openKeys();
  } else if (k === "open") flogOpen(selected);
});
setInterval(function () {
  if (FLOG.open) flogDraw();
}, 5000);
