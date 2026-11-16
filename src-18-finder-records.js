/**
 * @file Finder, plans and public records.
 * Flight and vessel finder, the plans directory, and organisation lookups in state and national
 * registers.
 *
 * Module 18 of 39. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Finder, plans directory, records dossier ----------
// Finder: one search across aircraft (flight number, callsign, registration), ships (name, MMSI), satellites, cameras.
var FND = { open: false, q: "", res: [], busy: false, card: null };
function fndLocal(q) {
  var lo = String(q).trim().toLowerCase(),
    k = craftKey(q),
    o = [],
    i,
    a,
    n;
  if (lo.length < 2) return o;
  for (i = 0, n = 0; i < PLANES.length && n < 12; i++) {
    a = PLANES[i];
    var cs = String(a.n || "")
      .replace(/\s/g, "")
      .toUpperCase();
    if (cs && (cs === k || cs.indexOf(k) === 0 || String(a.id).toLowerCase() === lo)) {
      o.push({
        k: "AIRCRAFT",
        t: a.n || a.id,
        s:
          ((a.alt || 0) > 250 && (a.v || 0) > 40 ? "In the air · " : "On the ground · ") +
          Math.round((a.alt || 0) * 3.281).toLocaleString() +
          " ft · " +
          Math.round((a.v || 0) * 1.944) +
          " kt" +
          (a.country ? " · " + a.country : ""),
        o: a
      });
      n++;
    }
  }
  if (lo.length >= 3) {
    for (i = 0, n = 0; i < SHIPS.length && n < 12; i++) {
      a = SHIPS[i];
      if (
        String(a.n || "")
          .toLowerCase()
          .indexOf(lo) >= 0 ||
        String(a.id) === lo
      ) {
        o.push({
          k: "SHIP",
          t: a.n,
          s:
            ((a.sog || 0) > 1 ? "Under way at " + (+a.sog).toFixed(1) + " kn" : "Stopped") +
            " · MMSI " +
            a.id,
          o: a
        });
        n++;
      }
    }
    for (i = 0, n = 0; i < SATS.length && n < 8; i++) {
      a = SATS[i];
      if (
        String(a.n || "")
          .toLowerCase()
          .indexOf(lo) >= 0
      ) {
        o.push({ k: "SATELLITE", t: a.n, s: "Orbit ≈ " + Math.round(a.alt || 0) + " km", o: a });
        n++;
      }
    }
    for (i = 0, n = 0; i < LIVE.length && n < 10; i++) {
      a = LIVE[i];
      if (
        String(a.n || "")
          .toLowerCase()
          .indexOf(lo) >= 0
      ) {
        o.push({ k: "CAMERA", t: a.n, s: [a.r, a.c].filter(Boolean).join(", "), o: a });
        n++;
      }
    }
  }
  return o;
}
function fndADBt(x) {
  return x ? flogADBt(x.scheduledTime || x.scheduledTimeUtc) : 0;
}
function fndRemote(q) {
  var k = craftKey(q),
    raw = String(q).trim().toUpperCase().replace(/\s/g, ""),
    jobs = [];
  FND.card = null;
  FND.kq = k;
  // a registration or hex code: resolve it to the airframe, then look for it among live aircraft
  if (/^[A-Z0-9-]{4,8}$/.test(raw))
    jobs.push(
      getJSON("https://api.adsbdb.com/v0/aircraft/" + encodeURIComponent(raw), 9000)
        .then(function (j) {
          var ac = j && j.response && j.response.aircraft;
          if (!ac || !ac.mode_s) return;
          var hex = String(ac.mode_s).toLowerCase(),
            live = null;
          for (var i = 0; i < PLANES.length; i++)
            if (PLANES[i].id === hex) {
              live = PLANES[i];
              break;
            }
          FND.res.unshift({
            k: "AIRFRAME",
            t: (ac.registration || raw) + " · " + (ac.type || ""),
            s: [ac.registered_owner, live ? "broadcasting now" : "not broadcasting right now"]
              .filter(Boolean)
              .join(" · "),
            o: live,
            ac: ac
          });
        })
        .catch(function () {})
    );
  if (craftLooks(q))
    jobs.push(
      getJSON("https://api.adsb.lol/v2/callsign/" + encodeURIComponent(k), 12000)
        .then(function (j) {
          ((j && j.ac) || [])
            .map(planeFromAc)
            .filter(Boolean)
            .slice(0, 3)
            .forEach(function (pl) {
              var have = null;
              for (var i = 0; i < PLANES.length; i++)
                if (PLANES[i].id === pl.id) {
                  have = PLANES[i];
                  break;
                }
              if (!have) {
                PLANES.push(pl);
                have = pl;
              }
              if (
                !FND.res.some(function (r) {
                  return r.o && r.o.id === have.id;
                })
              )
                FND.res.unshift({
                  k: "AIRCRAFT",
                  t: have.n || have.id,
                  s:
                    "In the air · " +
                    Math.round((have.alt || 0) * 3.281).toLocaleString() +
                    " ft · " +
                    Math.round((have.v || 0) * 1.944) +
                    " kt" +
                    (have.reg ? " · " + have.reg : ""),
                  o: have
                });
            });
        })
        .catch(function () {})
    );
  if (craftLooks(q)) {
    jobs.push(
      getJSON("https://api.adsbdb.com/v0/callsign/" + encodeURIComponent(k), 9000)
        .then(function (j) {
          var fr = j && j.response && j.response.flightroute,
            o = fr && apt(fr.origin),
            d = fr && apt(fr.destination);
          if (o && d) FND.card = { no: k, o: o, d: d, airline: fr.airline && fr.airline.name };
        })
        .catch(function () {})
    );
    if (KEYS.adb)
      jobs.push(
        netGet(
          "https://aerodatabox.p.rapidapi.com/flights/number/" +
            encodeURIComponent(String(q).toUpperCase().replace(/[\s-]/g, "")) +
            "/" +
            new Date(Date.now() - 864e5).toISOString().slice(0, 10) +
            "/" +
            new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) +
            "?withAircraftImage=false&withLocation=false",
          20000,
          { "X-RapidAPI-Key": KEYS.adb, "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com" }
        )
          .then(function (j) {
            if (typeof j === "string") j = JSON.parse(j);
            FND.legs = (Array.isArray(j) ? j : [])
              .map(function (f) {
                var a = f.departure || {},
                  b = f.arrival || {},
                  sd = fndADBt(a),
                  sa = fndADBt(b),
                  rd = flogADBt(a.revisedTime || a.runwayTime),
                  ra = flogADBt(b.revisedTime || b.predictedTime || b.runwayTime);
                return {
                  sd: sd,
                  sa: sa,
                  rd: rd,
                  ra: ra,
                  st: f.status || "",
                  o: (a.airport || {}).iata || "?",
                  d: (b.airport || {}).iata || "?",
                  reg: (f.aircraft || {}).reg || "",
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
            var f = (Array.isArray(j) ? j : []).sort(function (a, b) {
              return (
                Math.abs(fndADBt(a.departure) - Date.now()) -
                Math.abs(fndADBt(b.departure) - Date.now())
              );
            })[0];
            if (!f) return;
            var a = f.departure || {},
              b = f.arrival || {};
            FND.sched = {
              st: f.status || "",
              sd: fndADBt(a),
              sa: fndADBt(b),
              rd: flogADBt(a.revisedTime || a.runwayTime),
              ra: flogADBt(b.revisedTime || b.predictedTime),
              gate: a.gate || "",
              term: a.terminal || "",
              reg: (f.aircraft || {}).reg || "",
              hex: String((f.aircraft || {}).modeS || "").toLowerCase(),
              model: (f.aircraft || {}).model || "",
              on: (a.airport || {}).name || "",
              dn: (b.airport || {}).name || "",
              oc: (a.airport || {}).iata || "",
              dc: (b.airport || {}).iata || ""
            };
          })
          .catch(function () {})
      );
  }
  return Promise.all(jobs);
}
function fndGo(q) {
  q = String(q || "").trim();
  if (!q) return;
  FND.q = q;
  FND.busy = true;
  FND.sched = null;
  FND.legs = null;
  FND.res = fndLocal(q);
  fndDraw();
  if (craftLooks(q) && !WL.air) setLayer("air", true);
  fndRemote(q).then(function () {
    FND.busy = false;
    if (
      FND.sched &&
      FND.sched.hex &&
      !FND.res.some(function (r) {
        return r.o && r.o.id === FND.sched.hex;
      })
    )
      for (var i = 0; i < PLANES.length; i++)
        if (PLANES[i].id === FND.sched.hex) {
          FND.res.unshift({
            k: "AIRCRAFT",
            t: PLANES[i].n || FND.sched.reg,
            s: "The aircraft flying this flight · broadcasting now",
            o: PLANES[i]
          });
          break;
        }
    fndDraw();
  });
  if (craftLooks(q))
    setTimeout(function () {
      if (FND.open && FND.q === q) {
        var l = fndLocal(q);
        if (
          l.length >
          FND.res.filter(function (r) {
            return r.k !== "AIRFRAME";
          }).length
        ) {
          FND.res = l.concat(
            FND.res.filter(function (r) {
              return r.k === "AIRFRAME";
            })
          );
          fndDraw();
        }
      }
    }, 6000);
}
function fndDraw() {
  var el = $("fnd");
  if (!el || !FND.open) return;
  var typing = document.activeElement && document.activeElement.id === "fndQ";
  if (typing && el._q === FND.q && el._n === FND.res.length && el._b === FND.busy) return;
  el._q = FND.q;
  el._n = FND.res.length;
  el._b = FND.busy;
  var h =
    '<div class="nh"><div><b class="mono">◆ FINDER</b><h3>Find anything live</h3></div><button data-fd="x" aria-label="Close">✕</button></div><div class="nl"><form class="chq" id="fndForm"><input id="fndQ" type="search" value="' +
    esc(FND.q) +
    '" placeholder="AA175 · N160AN · Ever Given · ISS · I-35" autocomplete="off" autocapitalize="characters"><button>Find</button></form>';
  if (!FND.q)
    h +=
      '<p class="bre">Search by flight number, callsign, tail number, ship name or MMSI, satellite name, or camera name. Flights are found in the air or on the ground when they are broadcasting.</p>';
  var c = FND.card,
    sc = FND.sched,
    now = Date.now();
  if (c || sc) {
    var late =
      sc && sc.sa && sc.ra
        ? Math.round((sc.ra - sc.sa) / 60000)
        : sc && sc.sd && sc.rd
          ? Math.round((sc.rd - sc.sd) / 60000)
          : null;
    h +=
      '<h4 class="mono">FLIGHT ' +
      esc(craftKey(FND.q)) +
      '</h4><div class="brc"><b>' +
      esc((sc && sc.oc) || (c && c.o.code) || "?") +
      " → " +
      esc((sc && sc.dc) || (c && c.d.code) || "?") +
      (c && c.airline ? " · " + esc(c.airline) : "") +
      "</b><span>" +
      esc(c ? c.o.city + " → " + c.d.city : sc.on + " → " + sc.dn) +
      "</span>" +
      (sc
        ? "<span>" +
          esc(sc.st || "Scheduled") +
          (late != null
            ? ' · <em class="' +
              (late > 14 ? "bad" : "ok") +
              '">' +
              (late > 14 ? late + " min late" : late < -14 ? -late + " min early" : "on time") +
              "</em>"
            : "") +
          "</span><span>Departs " +
          flogT(sc.rd || sc.sd) +
          (sc.term ? " · Terminal " + esc(sc.term) : "") +
          (sc.gate ? " · Gate " + esc(sc.gate) : "") +
          "</span><span>Arrives " +
          flogT(sc.ra || sc.sa) +
          "</span>" +
          (sc.reg
            ? "<span>Aircraft " + esc(sc.reg) + (sc.model ? " · " + esc(sc.model) : "") + "</span>"
            : "")
        : '<span class="brd">Times, gate and delay need an AeroDataBox key (Settings → Manage keys). The route above is from the public route database.</span>') +
      "</div>";
  }
  if (c || sc) {
    var lp = null;
    FND.res.forEach(function (r) {
      if (!lp && r.o && r.o.kind === "plane") lp = r.o;
    });
    var hx = lp ? lp.id : (sc && sc.hex) || "";
    if (lp && c) {
      var fp = flightProgress(lp, c.o, c.d);
      if (fp)
        h +=
          '<div class="brc l1"><b>' +
          ((lp.alt || 0) > 250 && (lp.v || 0) > 40 ? "In the air" : "On the ground") +
          " · " +
          Math.round(fp.pct) +
          "% of the way</b><span>" +
          Math.round(fp.left * 0.621).toLocaleString() +
          " mi to go" +
          (fp.eta ? " · about " + Math.round(fp.eta) + " min left" : "") +
          " · " +
          (fp.xt < Math.max(60, fp.tot * 0.08)
            ? "on its planned course"
            : Math.round(fp.xt * 0.621) + " mi off the direct course") +
          "</span></div>";
    }
    if (hx)
      h +=
        '<div class="brt c1"><button data-fd="log" data-hx="' +
        esc(hx) +
        '">Every flight this aircraft has flown and is scheduled to fly</button></div>';
    if (FND.legs && FND.legs.length)
      h +=
        '<h4 class="mono">EVERY LEG OF ' +
        esc(craftKey(FND.q)) +
        " · YESTERDAY TO +3 DAYS</h4>" +
        FND.legs
          .map(function (l) {
            var past = (l.ra || l.sa) < now,
              cur = (l.rd || l.sd) <= now && !past;
            return (
              '<div class="brc' +
              (cur ? " l1" : "") +
              '"><b>' +
              flogT(l.sd) +
              " · " +
              esc(l.o) +
              " → " +
              esc(l.d) +
              "</b><span>" +
              esc(l.st || "Scheduled") +
              (l.late != null
                ? ' · <em class="' +
                  (l.late > 14 ? "bad" : "ok") +
                  '">' +
                  (l.late > 14
                    ? l.late + " min late"
                    : l.late < -14
                      ? -l.late + " min early"
                      : "on time") +
                  "</em>"
                : "") +
              " · arrives " +
              flogT(l.ra || l.sa) +
              (l.reg ? " · " + esc(l.reg) : "") +
              "</span></div>"
            );
          })
          .join("");
  }
  if (FND.res.length) {
    var last = "";
    h += FND.res
      .map(function (r, i) {
        var hd = r.k !== last ? '<h4 class="mono">' + r.k + "</h4>" : "";
        last = r.k;
        return (
          hd +
          '<div class="brc"><div class="brh"><b>' +
          esc(String(r.t || "").slice(0, 44)) +
          "</b></div><span>" +
          esc(r.s || "") +
          "</span>" +
          (r.o
            ? '<div class="bra"><button data-fd="go-' +
              i +
              '">Show on map</button>' +
              (r.o.kind === "plane"
                ? '<button data-fd="fl-' +
                  i +
                  '">Flight log</button><button data-fd="ck-' +
                  i +
                  '">Cockpit</button>'
                : r.o.kind === "ship"
                  ? '<button data-fd="wt-' +
                    i +
                    '">' +
                    (watchHas(r.o) ? "★ Watching" : "☆ Watch") +
                    "</button>"
                  : '<button data-fd="go-' + i + '">Open</button>') +
              "</div>"
            : "") +
          "</div>"
        );
      })
      .join("");
  } else if (
    FND.q &&
    !FND.busy &&
    !c &&
    !sc &&
    !nativeHttp() &&
    WSTAT.air === "x" &&
    craftLooks(FND.q)
  )
    h +=
      '<p class="bre">Live aircraft positions are available in the Android app. Flight services do not allow web browsers to read them, so the web version can show the route but not the plane.</p>';
  else if (FND.q && !FND.busy && !c && !sc)
    h +=
      '<p class="bre">Nothing live matches “' +
      esc(FND.q) +
      "”. An aircraft only appears while its transponder is on; a ship only while it is in range of a receiver. Turn on the flights, ships or satellites layer and try again.</p>";
  if (FND.busy) h += '<p class="bre">Searching live feeds…</p>';
  h +=
    '</div><div class="nf mono">LIVE POSITIONS: OPENSKY, AIS · ROUTES AND REGISTER: ADSBDB' +
    (KEYS.adb ? " · TIMES: AERODATABOX" : "") +
    "</div>";
  el.innerHTML = h;
}
function fndOpen(q) {
  var el = $("fnd");
  if (!el) {
    el = document.createElement("div");
    el.id = "fnd";
    el.className = "pn";
    document.body.appendChild(el);
  }
  FND.open = true;
  el.style.display = "flex";
  el._q = null;
  fndDraw();
  if (q) fndGo(q);
}
document.addEventListener("submit", function (e) {
  if (e.target && e.target.id === "fndForm") {
    e.preventDefault();
    var v = $("fndQ").value;
    $("fndQ").blur();
    fndGo(v);
  } else if (e.target && e.target.id === "recForm") {
    e.preventDefault();
    var w = $("recQ").value;
    $("recQ").blur();
    recGo(w);
  }
});
document.addEventListener("click", function (e) {
  if (e.target.closest("#bFind")) {
    fndOpen();
    return;
  }
  if (e.target.closest("#bPlans")) {
    plansOpen();
    return;
  }
  if (e.target.closest("#bRec")) {
    recOpen();
    return;
  }
  var b = e.target.closest("[data-fd]");
  if (!b) return;
  var k = b.getAttribute("data-fd"),
    r = FND.res[+k.slice(3)];
  if (k === "x") {
    FND.open = false;
    $("fnd").style.display = "none";
    return;
  }
  if (k === "log") {
    var hx = b.getAttribute("data-hx"),
      pl = null;
    for (var i = 0; i < PLANES.length; i++)
      if (PLANES[i].id === hx) {
        pl = PLANES[i];
        break;
      }
    FND.open = false;
    $("fnd").style.display = "none";
    flogOpen(pl || { kind: "plane", id: hx, n: FND.kq || hx, route: null });
    return;
  }
  if (!r || !r.o) return;
  if (k.indexOf("wt-") === 0) {
    watchToggle(r.o);
    $("fnd")._q = null;
    fndDraw();
    return;
  }
  FND.open = false;
  $("fnd").style.display = "none";
  if (r.o.live) {
    select(r.o);
    target = { lon: r.o.lon, lat: r.o.lat, z: Math.max(zoom, 60) };
  } else craftGo(r.o);
  if (k.indexOf("fl-") === 0) flogOpen(r.o);
  if (k.indexOf("ck-") === 0)
    setTimeout(function () {
      ckpOpen(r.o);
    }, 400);
});
// ----- plans directory: which buildings in view have an indoor floor plan on the public record -----
var PLN = { open: false, list: null, err: "", busy: false, where: "" };
function plansLoad() {
  var c = newsCentre(),
    km =
      T4.on && T4.v
        ? Math.min(12, Math.max(1, T4.v.camera.positionCartographic.height / 900))
        : Math.min(12, Math.max(1, viewKm() / 2)),
    dl = km / 111,
    dn = dl / Math.max(0.2, Math.cos(c[0] * D)),
    bb = [c[0] - dl, c[1] - dn, c[0] + dl, c[1] + dn]
      .map(function (x) {
        return x.toFixed(5);
      })
      .join(",");
  PLN.busy = true;
  PLN.err = "";
  PLN.list = null;
  PLN.km = km;
  plansDraw();
  getJSON(
    "https://overpass-api.de/api/interpreter?data=" +
      encodeURIComponent(
        '[out:json][timeout:25];(way[indoor~"^(room|area|corridor)$"](' +
          bb +
          "););out center 4000;"
      ),
    32000
  )
    .then(function (j) {
      var g = {},
        k = Math.cos(c[0] * D) || 1;
      ((j && j.elements) || []).forEach(function (w) {
        var q = w.center;
        if (!q) return;
        var key = Math.round(q.lat / 0.0012) + "|" + Math.round((q.lon * k) / 0.0012),
          x = (g[key] = g[key] || { lat: 0, lon: 0, n: 0, lv: {}, nm: 0 });
        x.lat += q.lat;
        x.lon += q.lon;
        x.n++;
        var t = w.tags || {};
        if (t.level != null) x.lv[String(t.level).split(/[;,]/)[0]] = 1;
        if (t.name || t.ref) x.nm++;
      });
      var L = Object.keys(g)
        .map(function (key) {
          var x = g[key];
          return {
            lat: x.lat / x.n,
            lon: x.lon / x.n,
            n: x.n,
            lv: Object.keys(x.lv).length || 1,
            nm: x.nm,
            name: ""
          };
        })
        .filter(function (x) {
          return x.n >= 3;
        })
        .sort(function (a, b) {
          return b.n - a.n;
        })
        .slice(0, 40);
      PLN.list = L;
      plansDraw();
      if (!L.length) return;
      return getJSON(
        "https://overpass-api.de/api/interpreter?data=" +
          encodeURIComponent(
            "[out:json][timeout:25];(" +
              L.slice(0, 25)
                .map(function (x) {
                  return (
                    "nwr(around:70," +
                    x.lat.toFixed(5) +
                    "," +
                    x.lon.toFixed(5) +
                    ')[name][~"^(building|amenity|shop|railway|aeroway|public_transport|tourism|office)$"~"."];'
                  );
                })
                .join("") +
              ");out center tags 400;"
          ),
        32000
      )
        .then(function (j2) {
          var els = ((j2 && j2.elements) || [])
            .map(function (e) {
              var q = e.center || e;
              return {
                lat: q.lat,
                lon: q.lon,
                n: e.tags && e.tags.name,
                b: e.tags && e.tags.building ? 0 : 1
              };
            })
            .filter(function (e) {
              return e.n && e.lat;
            });
          L.forEach(function (x) {
            var best = null,
              bd = 1e9;
            els.forEach(function (e) {
              var d = hav(x.lat, x.lon, e.lat, e.lon) + e.b * 0.02;
              if (d < bd) {
                bd = d;
                best = e;
              }
            });
            if (best && bd < 0.12) x.name = best.n;
          });
        })
        .catch(function () {});
    })
    .catch(function () {
      PLN.err = "The map database did not answer. Try again in a minute, or zoom in closer.";
    })
    .then(function () {
      PLN.busy = false;
      plansDraw();
    });
}
function plansDraw() {
  var el = $("plans");
  if (!el || !PLN.open) return;
  var h =
    '<div class="nh"><div><b class="mono">◆ PLANS ON RECORD</b><h3>Buildings with a public floor plan</h3></div><button data-pl="re" aria-label="Search this area">⟳</button><button data-pl="x" aria-label="Close">✕</button></div><div class="nl"><p class="bre">This lists every building in the area you are looking at that has an indoor floor plan in OpenStreetMap, the one open, worldwide record of them. If a building is not here, no public plan exists for it. Searching about ' +
    Math.round((PLN.km || 5) * 2 * 0.621) +
    " miles across.</p>";
  if (PLN.busy && !PLN.list) h += '<p class="bre">Searching the public record…</p>';
  else if (PLN.err) h += '<p class="bre">' + esc(PLN.err) + "</p>";
  else if (PLN.list && !PLN.list.length)
    h +=
      '<div class="brc"><b>None in this area</b><span>No building in view has a public floor plan. They are most common at airports, big stations, shopping centres, universities and hospitals. Move the map to one and tap ⟳.</span></div>';
  else if (PLN.list)
    h +=
      '<h4 class="mono">' +
      PLN.list.length +
      " WITH A PLAN · MOST DETAILED FIRST</h4>" +
      PLN.list
        .map(function (x, i) {
          return (
            '<div class="brc"><b>' +
            esc(x.name || "Unnamed building") +
            "</b><span>" +
            x.n +
            " mapped rooms and corridors · " +
            x.lv +
            " level" +
            (x.lv > 1 ? "s" : "") +
            (x.nm ? " · " + x.nm + " named" : "") +
            '</span><div class="bra"><button data-pl="in-' +
            i +
            '">Inspect the plan</button><button data-pl="go-' +
            i +
            '">Show on map</button></div></div>'
          );
        })
        .join("");
  h +=
    '</div><div class="nf mono">INDOOR MAPS © OPENSTREETMAP CONTRIBUTORS · ARCHITECTS\' DRAWINGS ARE NOT PUBLIC ANYWHERE</div>';
  el.innerHTML = h;
}
function plansOpen() {
  var el = $("plans");
  if (!el) {
    el = document.createElement("div");
    el.id = "plans";
    el.className = "pn";
    document.body.appendChild(el);
  }
  PLN.open = true;
  el.style.display = "flex";
  plansDraw();
  plansLoad();
}
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-pl]");
  if (!b) return;
  var k = b.getAttribute("data-pl"),
    x = PLN.list && PLN.list[+k.slice(3)];
  if (k === "x") {
    PLN.open = false;
    $("plans").style.display = "none";
  } else if (k === "re") plansLoad();
  else if (x) {
    PLN.open = false;
    $("plans").style.display = "none";
    target = { lon: x.lon, lat: x.lat, z: Math.max(zoom, 300) };
    rot.lon = x.lon;
    rot.lat = x.lat;
    if (T4.on && T4.v) {
      T4.h = 0;
      t4Fly(x.lon, x.lat, 500, 0);
    }
    if (k.indexOf("in-") === 0) insBuilding(x.lat, x.lon, 0);
  }
});
// ----- state business registers that publish open data: status, number and formation date straight from the state -----
var REC_REG = {
  TX: {
    n: "Texas Comptroller · franchise tax and Secretary of State status",
    h: "data.texas.gov",
    ds: "9cir-efmm",
    f: "taxpayer_name",
    m: function (r) {
      var sc = {
          A: "Active",
          I: "Inactive",
          F: "Forfeited",
          D: "Dissolved",
          C: "Cancelled",
          W: "Withdrawn",
          M: "Merged"
        },
        rt = {
          A: "Active",
          D: "Forfeited",
          N: "Forfeited",
          I: "Franchise tax involuntarily ended",
          U: "Not established"
        };
      return {
        name: r.taxpayer_name,
        rows: [
          ["State registration", sc[r.sos_status_code] || r.sos_status_code],
          [
            "Right to do business in Texas",
            rt[r.right_to_transact_business_code] || r.right_to_transact_business_code
          ],
          ["State file number", r.secretary_of_state_sos_or_coa_file_number],
          ["Taxpayer number", r.taxpayer_number],
          ["Chartered", String(r.sos_charter_date || "").slice(0, 10)],
          ["Status since", String(r.sos_status_date || "").slice(0, 10)],
          [
            "Address",
            [r.taxpayer_address, r.taxpayer_city, r.taxpayer_state, r.taxpayer_zip]
              .filter(Boolean)
              .join(", ")
          ]
        ],
        id: r.taxpayer_number,
        u:
          "https://comptroller.texas.gov/taxes/franchise/account-status/search/" + r.taxpayer_number
      };
    }
  },
  CO: {
    n: "Colorado Secretary of State",
    h: "data.colorado.gov",
    ds: "4ykn-tg5h",
    f: "entityname",
    m: function (r) {
      return {
        name: r.entityname,
        rows: [
          ["Status", r.entitystatus],
          ["Entity number", r.entityid],
          ["Type", r.entitytype],
          ["Formed", String(r.entityformdate || "").slice(0, 10)],
          ["Formed in", r.jurisdictonofformation],
          [
            "Principal address",
            [r.principaladdress1, r.principalcity, r.principalstate, r.principalzipcode]
              .filter(Boolean)
              .join(", ")
          ],
          [
            "Registered agent",
            r.agentorganizationname ||
              [r.agentfirstname, r.agentmiddlename, r.agentlastname].filter(Boolean).join(" ")
          ]
        ]
      };
    }
  },
  NY: {
    n: "New York Department of State · active corporations",
    h: "data.ny.gov",
    ds: "n9v6-gdp6",
    f: "current_entity_name",
    m: function (r) {
      return {
        name: r.current_entity_name,
        rows: [
          ["Status", "Active (listed on the active register)"],
          ["DOS number", r.dos_id],
          ["Type", r.entity_type],
          ["First filed", String(r.initial_dos_filing_date || "").slice(0, 10)],
          ["County", r.county],
          ["Jurisdiction", r.jurisdiction],
          [
            "Address for legal papers",
            [r.dos_process_address_1, r.dos_process_city, r.dos_process_state, r.dos_process_zip]
              .filter(Boolean)
              .join(", ")
          ],
          ["Chief executive on file", r.chairman_name],
          ["Registered agent", r.registered_agent_name]
        ]
      };
    }
  },
  OR: {
    n: "Oregon Secretary of State · active businesses",
    h: "data.oregon.gov",
    ds: "tckn-sxa6",
    f: "business_name",
    m: function (r) {
      return {
        name: r.business_name,
        rows: [
          ["Status", "Active (listed on the active register)"],
          ["Registry number", r.registry_number],
          ["Type", r.entity_type],
          ["Registered", String(r.registry_date || "").slice(0, 10)],
          ["Jurisdiction", r.jurisdiction],
          [
            String(r.associated_name_type || "Address")
              .toLowerCase()
              .replace(/^./, function (c) {
                return c.toUpperCase();
              }),
            [r.address, r.city, r.state, r.zip].filter(Boolean).join(", ")
          ]
        ],
        u: r.business_details && r.business_details.url
      };
    }
  },
  CT: {
    n: "Connecticut Secretary of the State",
    h: "data.ct.gov",
    ds: "n7gp-d28j",
    f: "name",
    m: function (r) {
      return {
        name: r.name,
        rows: [
          ["Status", r.status],
          ["Account number", r.accountnumber],
          [
            "Registered",
            /^0001/.test(r.date_registration || "")
              ? ""
              : String(r.date_registration || "").slice(0, 10)
          ],
          [
            "Mailing address",
            String(r.mailing_address || "")
              .replace(/(,\s*)+$/, "")
              .replace(/^[,\s]+/, "")
          ]
        ]
      };
    }
  }
};
function recNorm(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(
      /\b(LLC|L L C|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|LP|L P|LLP|PLLC|PC|THE|PLC|OYJ|OY|ASA|AS|AB|SA|SAS|SARL|GMBH|AG|BV|NV|SE|SPA|SRL)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}
function recPickBest(rows, key, want) {
  var w = recNorm(want),
    ex = rows.filter(function (r) {
      return recNorm(r[key]) === w;
    });
  return (ex.length ? ex : rows).slice(0, ex.length ? 2 : 3);
}
function recState(name, d) {
  var core = recNorm(name);
  if (core.length < 3) return Promise.resolve();
  var us = !d.cc || d.cc === "US",
    sts = !us ? [] : d.st && REC_REG[d.st] ? [d.st] : d.st ? [] : Object.keys(REC_REG);
  d.reg = [];
  d.regNone = us && d.st && !REC_REG[d.st];
  var nat = us && d.cc ? Promise.resolve() : recNation(name, d);
  return Promise.all(
    [nat].concat(
      sts.map(function (st) {
        var R = REC_REG[st],
          q =
            "https://" +
            R.h +
            "/resource/" +
            R.ds +
            ".json?$limit=12&$where=" +
            encodeURIComponent(
              "upper(" +
                R.f +
                ") like '" +
                core.replace(/'/g, "''").split(" ").slice(0, 4).join("%") +
                "%'"
            );
        return getJSON(q, 18000)
          .then(function (j) {
            var rows = recPickBest(Array.isArray(j) ? j : [], R.f, name);
            if (st === "OR") {
              var seen = {};
              rows = (Array.isArray(j) ? j : [])
                .filter(function (r) {
                  if (recNorm(r.business_name) !== core && rows.indexOf(r) < 0) return false;
                  if (seen[r.registry_number]) return false;
                  seen[r.registry_number] = 1;
                  return true;
                })
                .slice(0, 3);
            }
            rows.forEach(function (r) {
              var m = R.m(r);
              m.st = st;
              m.src = R.n;
              d.reg.push(m);
            });
            var tx = st === "TX" && rows[0];
            if (st === "OR" && rows[0])
              return Promise.all(
                rows.slice(0, 2).map(function (r0) {
                  return getJSON(
                    "https://" +
                      R.h +
                      "/resource/" +
                      R.ds +
                      ".json?$limit=40&registry_number=" +
                      encodeURIComponent(r0.registry_number),
                    18000
                  )
                    .then(function (k) {
                      var m = d.reg.filter(function (q) {
                          return q.st === "OR" && q.rows[1][1] === r0.registry_number;
                        })[0],
                        seen = {};
                      if (!m) return;
                      (Array.isArray(k) ? k : []).forEach(function (x) {
                        var role = String(x.associated_name_type || "")
                            .toLowerCase()
                            .replace(/^./, function (c) {
                              return c.toUpperCase();
                            }),
                          nm =
                            [x.first_name, x.middle_name, x.last_name, x.suffix]
                              .filter(Boolean)
                              .join(" ") ||
                            x.entity_of_record_name ||
                            "";
                        if (!nm || !role || seen[role + nm]) return;
                        seen[role + nm] = 1;
                        m.rows.push([role, nm]);
                        m.off = true;
                      });
                    })
                    .catch(function () {});
                })
              );
            if (tx && KEYS.txc)
              return netGet(
                "https://api.comptroller.texas.gov/public-data/v1/public/franchise-tax/" +
                  encodeURIComponent(tx.taxpayer_number),
                20000,
                { "x-api-key": KEYS.txc }
              )
                .then(function (k) {
                  if (typeof k === "string") k = JSON.parse(k);
                  var x = k && k.data;
                  if (Array.isArray(x)) x = x[0];
                  if (!x) return;
                  var m = d.reg.filter(function (q) {
                    return q.id === tx.taxpayer_number;
                  })[0];
                  if (!m) return;
                  m.rows.push(
                    ["Registered agent", x.registeredAgentName],
                    [
                      "Registered office",
                      [
                        x.registeredOfficeAddressStreet,
                        x.registeredOfficeAddressCity,
                        x.registeredOfficeAddressState,
                        x.registeredOfficeAddressZip
                      ]
                        .filter(Boolean)
                        .join(", ")
                    ],
                    ["Formed in", x.stateOfFormation],
                    ["Trading as", x.dbaName],
                    ["Report year", x.reportYear]
                  );
                  (x.officerInfo || []).slice(0, 12).forEach(function (o) {
                    m.rows.push([
                      String(o.AGNT_TITL_TX || "Officer")
                        .toLowerCase()
                        .replace(/^./, function (c) {
                          return c.toUpperCase();
                        }),
                      String(o.AGNT_NM || "") + (o.AGNT_ACTV_YR ? " (" + o.AGNT_ACTV_YR + ")" : "")
                    ]);
                  });
                  m.off = true;
                })
                .catch(function () {});
          })
          .catch(function () {
            d.regErr = true;
          });
      })
    )
  );
}
function recStateHTML(d) {
  var h = "";
  (d.reg || []).forEach(function (m) {
    h +=
      "<table><tr><td>Registered name</td><td>" +
      esc(m.name || "") +
      "</td></tr>" +
      m.rows
        .map(function (r) {
          return r[1]
            ? "<tr><td>" + esc(r[0]) + "</td><td>" + esc(String(r[1])) + "</td></tr>"
            : "";
        })
        .join("") +
      '</table><i class="mono">' +
      esc(m.src) +
      (m.u
        ? ' · <a href="' +
          esc(m.u) +
          '" target="_blank" rel="noopener" style="color:inherit">OPEN THE OFFICIAL RECORD</a>'
        : "") +
      "</i>";
  });
  if (d.reg && !d.reg.length && !REC.busy)
    h +=
      '<span class="brd">' +
      (d.needKey
        ? d.needKey
        : d.regNone
          ? "This " +
            (d.cc && d.cc !== "US" ? "country" : "state") +
            " does not publish its business register as open data, so the app cannot read it directly. Use the register button below, or add the OpenCorporates key, which covers about 140 jurisdictions."
          : d.regErr
            ? "The state register did not answer. Try again in a minute."
            : "No entity with this name on the state registers the app can read" +
              (d.st || d.cc
                ? ""
                : " (Texas, Colorado, New York, Oregon, Connecticut, France, Norway, Finland" +
                  (KEYS.ch ? ", United Kingdom" : "") +
                  ")") +
              ". It may be registered under a slightly different legal name.") +
      "</span>";
  else if (d.st === "TX" && d.reg && d.reg.length && !d.reg[0].off)
    h +=
      '<span class="brd">Owners, officers, directors and the registered agent are named in the Comptroller\'s public report. Add the free Texas Comptroller key in Settings → Manage keys to show them here.</span>';
  return h;
}
// ----- national company registers with an open API: France, Norway, Finland, and the United Kingdom with the user's free key -----
function recCap(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/(^|[\s-])\S/g, function (c) {
      return c.toUpperCase();
    });
}
var REC_NAT = {
  FR: {
    n: "France · Registre national des entreprises (INSEE / INPI)",
    go: function (name, d, strict) {
      return getJSON(
        "https://recherche-entreprises.api.gouv.fr/search?per_page=5&q=" + encodeURIComponent(name),
        18000
      ).then(function (j) {
        var L = recPickBest(
          ((j && j.results) || []).map(function (r) {
            r._n = r.nom_raison_sociale || r.nom_complet;
            return r;
          }),
          "_n",
          name
        );
        if (strict)
          L = L.filter(function (r) {
            return recNorm(r._n) === recNorm(name);
          });
        L.slice(0, 2).forEach(function (r) {
          var s = r.siege || {},
            rows = [
              [
                "Status",
                r.etat_administratif === "A"
                  ? "Active"
                  : r.etat_administratif === "C"
                    ? "Ceased"
                    : r.etat_administratif
              ],
              ["SIREN number", r.siren],
              ["Created", r.date_creation],
              [
                "Registered office",
                s.adresse ||
                  [s.numero_voie, s.type_voie, s.libelle_voie, s.code_postal, s.libelle_commune]
                    .filter(Boolean)
                    .join(" ")
              ]
            ];
          (r.dirigeants || []).slice(0, 14).forEach(function (p) {
            var nm =
              p.type_dirigeant === "personne morale"
                ? p.denomination
                : [recCap(p.prenoms), String(p.nom || "").toUpperCase()].filter(Boolean).join(" ");
            if (nm) rows.push([recCap(p.qualite || "Officer").slice(0, 40), nm]);
          });
          d.reg.push({
            name: r.nom_complet || r._n,
            rows: rows,
            src: REC_NAT.FR.n,
            off: (r.dirigeants || []).length > 0,
            u: "https://annuaire-entreprises.data.gouv.fr/entreprise/" + r.siren
          });
        });
      });
    }
  },
  NO: {
    n: "Norway · Enhetsregisteret (Brønnøysund Register Centre)",
    go: function (name, d, strict) {
      return getJSON(
        "https://data.brreg.no/enhetsregisteret/api/enheter?size=5&navn=" +
          encodeURIComponent(name),
        18000
      ).then(function (j) {
        var L = recPickBest((j && j._embedded && j._embedded.enheter) || [], "navn", name);
        if (strict)
          L = L.filter(function (r) {
            return recNorm(r.navn) === recNorm(name);
          });
        return Promise.all(
          L.slice(0, 2).map(function (r) {
            var a = r.forretningsadresse || {},
              m = {
                name: r.navn,
                src: REC_NAT.NO.n,
                u: "https://virksomhet.brreg.no/nb/oppslag/enheter/" + r.organisasjonsnummer,
                rows: [
                  [
                    "Status",
                    r.slettedato
                      ? "Deleted " + r.slettedato
                      : r.konkurs
                        ? "Bankrupt"
                        : r.underAvvikling || r.underTvangsavviklingEllerTvangsopplosning
                          ? "Being wound up"
                          : "Active"
                  ],
                  ["Organisation number", r.organisasjonsnummer],
                  ["Type", r.organisasjonsform && r.organisasjonsform.beskrivelse],
                  ["Founded", r.stiftelsesdato],
                  ["Registered", r.registreringsdatoEnhetsregisteret],
                  [
                    "Address",
                    [(a.adresse || []).join(" "), a.postnummer, a.poststed, a.land]
                      .filter(Boolean)
                      .join(", ")
                  ],
                  ["Business phone", r.telefon || r.mobil],
                  ["Website", r.hjemmeside]
                ]
              };
            d.reg.push(m);
            return getJSON(
              "https://data.brreg.no/enhetsregisteret/api/enheter/" +
                r.organisasjonsnummer +
                "/roller",
              18000
            )
              .then(function (k) {
                ((k && k.rollegrupper) || []).forEach(function (g) {
                  (g.roller || []).forEach(function (x) {
                    if (x.fratraadt || m.rows.length > 26) return;
                    var pn = x.person && x.person.navn,
                      nm = pn
                        ? [pn.fornavn, pn.mellomnavn, pn.etternavn].filter(Boolean).join(" ")
                        : (x.enhet && (x.enhet.navn || []).join(" ")) || "";
                    if (nm) {
                      m.rows.push([
                        (x.type && x.type.beskrivelse) || (g.type && g.type.beskrivelse) || "Role",
                        nm
                      ]);
                      m.off = true;
                    }
                  });
                });
              })
              .catch(function () {});
          })
        );
      });
    }
  },
  FI: {
    n: "Finland · Trade Register (PRH / YTJ open data)",
    go: function (name, d, strict) {
      return getJSON(
        "https://avoindata.prh.fi/opendata-ytj-api/v3/companies?name=" + encodeURIComponent(name),
        18000
      ).then(function (j) {
        var L = ((j && j.companies) || []).map(function (c) {
          var nm =
            (c.names || []).filter(function (x) {
              return !x.endDate;
            })[0] ||
            (c.names || [])[0] ||
            {};
          c._n = nm.name || "";
          return c;
        });
        L = recPickBest(L, "_n", name);
        if (strict)
          L = L.filter(function (r) {
            return recNorm(r._n) === recNorm(name);
          });
        L.slice(0, 2).forEach(function (c) {
          var a = (c.addresses || [])[0] || {},
            po =
              (a.postOffices || []).filter(function (x) {
                return x.languageCode === "1";
              })[0] ||
              (a.postOffices || [])[0] ||
              {},
            f =
              (
                (c.companyForms || []).filter(function (x) {
                  return !x.endDate;
                })[0] || {}
              ).descriptions || [],
            fe = (
              f.filter(function (x) {
                return x.languageCode === "3";
              })[0] ||
              f[0] ||
              {}
            ).description;
          d.reg.push({
            name: c._n,
            src: REC_NAT.FI.n,
            u: "https://tietopalvelu.ytj.fi/yritys/" + (c.businessId || {}).value,
            rows: [
              ["Status", c.endDate ? "Ended " + c.endDate : "On the register"],
              ["Business ID", (c.businessId || {}).value],
              ["Type", fe],
              ["Registered", c.registrationDate || (c.businessId || {}).registrationDate],
              [
                "Address",
                [[a.street, a.buildingNumber].filter(Boolean).join(" "), a.postCode, po.city]
                  .filter(Boolean)
                  .join(", ")
              ],
              ["Website", c.website && c.website.url]
            ]
          });
        });
      });
    }
  },
  GB: {
    n: "United Kingdom · Companies House",
    key: "ch",
    go: function (name, d, strict) {
      var H = { Authorization: "Basic " + btoa(KEYS.ch + ":") },
        B = "https://api.company-information.service.gov.uk",
        get = function (u) {
          return netGet(B + u, 20000, H).then(function (x) {
            return typeof x === "string" ? JSON.parse(x) : x;
          });
        };
      return get("/search/companies?items_per_page=5&q=" + encodeURIComponent(name)).then(
        function (j) {
          var L = recPickBest((j && j.items) || [], "title", name);
          if (strict)
            L = L.filter(function (r) {
              return recNorm(r.title) === recNorm(name);
            });
          return Promise.all(
            L.slice(0, 1).map(function (r) {
              var m = {
                name: r.title,
                src: REC_NAT.GB.n,
                u:
                  "https://find-and-update.company-information.service.gov.uk/company/" +
                  r.company_number,
                rows: [
                  ["Status", recCap(r.company_status)],
                  ["Company number", r.company_number],
                  ["Type", String(r.company_type || "").replace(/-/g, " ")],
                  ["Incorporated", r.date_of_creation],
                  ["Registered office", r.address_snippet]
                ]
              };
              d.reg.push(m);
              return Promise.all([
                get("/company/" + r.company_number + "/persons-with-significant-control")
                  .then(function (k) {
                    ((k && k.items) || []).forEach(function (p) {
                      if (!p.ceased_on && p.name) {
                        m.rows.push(["Owner with significant control", p.name]);
                        m.off = true;
                      }
                    });
                  })
                  .catch(function () {}),
                get("/company/" + r.company_number + "/officers?items_per_page=20")
                  .then(function (k) {
                    ((k && k.items) || []).forEach(function (p) {
                      if (!p.resigned_on && p.name && m.rows.length < 28) {
                        m.rows.push([
                          recCap(String(p.officer_role || "officer").replace(/-/g, " ")),
                          p.name
                        ]);
                        m.off = true;
                      }
                    });
                  })
                  .catch(function () {})
              ]);
            })
          );
        }
      );
    }
  }
};
function recNation(name, d) {
  var cc = d.cc || "",
    L = cc ? (REC_NAT[cc] ? [cc] : []) : Object.keys(REC_NAT);
  L = L.filter(function (k) {
    return !REC_NAT[k].key || KEYS[REC_NAT[k].key];
  });
  if (cc === "GB" && !KEYS.ch)
    d.needKey =
      "Add the free Companies House key in Settings → Manage keys to read the UK register here, including owners with significant control and officers.";
  if (cc && cc !== "US" && !REC_NAT[cc]) d.regNone = true;
  return Promise.all(
    L.map(function (k) {
      return REC_NAT[k].go(name, d, !cc).catch(function () {
        d.regErr = true;
      });
    })
  );
}
// ----- records dossier: who owns a property and what is on the public register about that organisation -----
// Organisations only. A property owned by a private individual is reported as such, without the name.
var REC = { open: false, q: "", busy: false, d: null };
var REC_ORG =
  /\b(LLC|L\.L\.C|INC|CORP|CORPORATION|COMPANY|CO\b|LTD|L\.?P\.?|LLP|PLC|GMBH|S\.?A\.?|PARTNERS(HIP)?|ASSOC|ASSOCIATION|BANK|CHURCH|CITY OF|COUNTY|STATE OF|ISD|DISTRICT|UNIVERSITY|AUTHORITY|HOLDINGS|PROPERTIES|INVESTMENTS|REALTY|FOUNDATION|TRUST\b|REIT|GROUP|USA|UNITED STATES)\b/i;
function recCompany(name, d) {
  var q = String(name).replace(/[,.]/g, " ").replace(/\s+/g, " ").trim(),
    jobs = [recState(name, d)];
  jobs.push(
    getJSON(
      "https://api.gleif.org/api/v1/lei-records?filter[entity.legalName]=" +
        encodeURIComponent(q) +
        "&page[size]=3",
      15000
    )
      .then(function (j) {
        var r = j && j.data && j.data[0];
        if (!r) return;
        var a = r.attributes || {},
          e = a.entity || {},
          ad = e.legalAddress || {},
          hq = e.headquartersAddress || {};
        d.lei = {
          name: (e.legalName || {}).name,
          status: e.status,
          juris: e.jurisdiction,
          form: (e.legalForm || {}).id,
          regNo: e.registeredAs,
          legal: [(ad.addressLines || []).join(" "), ad.city, ad.region, ad.country]
            .filter(Boolean)
            .join(", "),
          hq: [(hq.addressLines || []).join(" "), hq.city, hq.region, hq.country]
            .filter(Boolean)
            .join(", "),
          lei: r.id,
          reg: (a.registration || {}).status,
          upd: (a.registration || {}).lastUpdateDate
        };
      })
      .catch(function () {})
  );
  jobs.push(
    getJSON(
      "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=1&origin=*&search=" +
        encodeURIComponent(q),
      12000
    )
      .then(function (j) {
        var id = j && j.search && j.search[0] && j.search[0].id;
        if (!id) return;
        d.wd = { id: id, label: j.search[0].label, desc: j.search[0].description };
        return getJSON(
          "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=claims&ids=" +
            id,
          12000
        ).then(function (k) {
          var cl = (k && k.entities && k.entities[id] && k.entities[id].claims) || {},
            ids = function (p) {
              return (cl[p] || [])
                .map(function (c) {
                  return (
                    c.mainsnak &&
                    c.mainsnak.datavalue &&
                    c.mainsnak.datavalue.value &&
                    c.mainsnak.datavalue.value.id
                  );
                })
                .filter(Boolean)
                .slice(0, 6);
            },
            str = function (p) {
              var c = (cl[p] || [])[0];
              c = c && c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value;
              return typeof c === "string" ? c : "";
            },
            want = {
              ceo: ids("P169"),
              chair: ids("P488"),
              board: ids("P3320"),
              founder: ids("P112"),
              parent: ids("P749"),
              owner: ids("P127"),
              hq: ids("P159"),
              inst: ids("P31")
            },
            all = [];
          Object.keys(want).forEach(function (x) {
            all = all.concat(want[x]);
          });
          d.wd.phone = str("P1329");
          d.wd.web = str("P856");
          var t = (cl.P571 || [])[0];
          d.wd.founded =
            t && t.mainsnak && t.mainsnak.datavalue
              ? String(t.mainsnak.datavalue.value.time || "").slice(1, 5)
              : "";
          if (!all.length) return;
          return getJSON(
            "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=labels&languages=en&ids=" +
              all.slice(0, 45).join("|"),
            12000
          ).then(function (l) {
            var nm = function (a) {
              return a
                .map(function (x) {
                  return (
                    l.entities &&
                    l.entities[x] &&
                    l.entities[x].labels &&
                    l.entities[x].labels.en &&
                    l.entities[x].labels.en.value
                  );
                })
                .filter(Boolean);
            };
            Object.keys(want).forEach(function (x) {
              d.wd[x] = nm(want[x]);
            });
          });
        });
      })
      .catch(function () {})
  );
  if (KEYS.oc)
    jobs.push(
      getJSON(
        "https://api.opencorporates.com/v0.4/companies/search?q=" +
          encodeURIComponent(q) +
          "&api_token=" +
          encodeURIComponent(KEYS.oc) +
          (d.cc && d.cc !== "US"
            ? "&jurisdiction_code=" + d.cc.toLowerCase()
            : d.st
              ? "&jurisdiction_code=us_" + d.st.toLowerCase()
              : "") +
          "&per_page=3",
        15000
      )
        .then(function (j) {
          var c =
            j &&
            j.results &&
            j.results.companies &&
            j.results.companies[0] &&
            j.results.companies[0].company;
          if (!c) return;
          d.oc = {
            name: c.name,
            no: c.company_number,
            juris: c.jurisdiction_code,
            status: c.current_status,
            inc: c.incorporation_date,
            type: c.company_type,
            addr: c.registered_address_in_full,
            url: c.opencorporates_url,
            inactive: c.inactive
          };
          return getJSON(
            "https://api.opencorporates.com/v0.4/companies/" +
              encodeURIComponent(c.jurisdiction_code) +
              "/" +
              encodeURIComponent(c.company_number) +
              "?api_token=" +
              encodeURIComponent(KEYS.oc),
            15000
          )
            .then(function (k) {
              var co = k && k.results && k.results.company;
              d.oc.off = ((co && co.officers) || [])
                .map(function (o) {
                  o = o.officer || o;
                  return o.end_date || o.inactive
                    ? null
                    : [
                        String(o.position || "officer").replace(/^./, function (x) {
                          return x.toUpperCase();
                        }),
                        o.name
                      ];
                })
                .filter(Boolean)
                .slice(0, 14);
              if (co && co.agent_name) d.oc.agent = co.agent_name;
            })
            .catch(function () {});
        })
        .catch(function () {})
    );
  return Promise.all(jobs);
}
function recGo(q) {
  q = String(q || "").trim();
  if (!q) return;
  REC.q = q;
  REC.busy = true;
  var d = (REC.d = { q: q });
  if (REC.cc) {
    d.cc = REC.cc;
    d.country = REC.country;
    REC.cc = "";
  }
  recDraw();
  var isOrg = REC_ORG.test(q) && !/\d{2,}\s+\w+/.test(q);
  (isOrg
    ? Promise.resolve(null)
    : getJSON(
        "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&extratags=1&limit=1&accept-language=en&q=" +
          encodeURIComponent(q),
        15000
      ).catch(function () {
        return null;
      })
  )
    .then(function (g) {
      var p = g && g[0];
      if (d.cc && !/\d/.test(q)) p = null;
      if (!p) {
        d.org = q;
        return;
      }
      d.addr = p.display_name;
      d.lat = +p.lat;
      d.lon = +p.lon;
      var a = p.address || {},
        x = p.extratags || {};
      d.st = (a["ISO3166-2-lvl4"] || "").split("-")[1] || "";
      d.state = a.state || "";
      d.cc = (a.country_code || "").toUpperCase();
      d.country = a.country || "";
      d.osm = [p.name, x.operator, x.brand].filter(Boolean);
      d.phone = x.phone || x["contact:phone"] || "";
      d.web = x.website || x["contact:website"] || "";
      d.use = p.type && p.type !== "yes" ? p.type : p.category || "";
      if (d.st === "TX")
        return getJSON(
          PARCEL_URL +
            "?f=json&where=1%3D1&geometry=" +
            d.lon.toFixed(6) +
            "%2C" +
            d.lat.toFixed(6) +
            "&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&returnGeometry=false&outFields=prop_id,owner_name,situs_addr,situs_city,situs_zip,county,mkt_value,stat_land_use,year_built,tax_year",
          20000
        )
          .then(function (j) {
            var f = j && j.features && j.features[0];
            if (f) d.par = f.attributes || f.properties;
          })
          .catch(function () {});
    })
    .then(function () {
      if (d.par) {
        var own = String(d.par.owner_name || "").trim(),
          code = String(d.par.stat_land_use || "").toUpperCase();
        d.ownOrg = /^[BFGJLX]/.test(code) || REC_ORG.test(own);
        d.owner = own;
        if (d.ownOrg) d.org = own;
      }
      if (!d.org && d.osm && d.osm.length) d.org = d.osm[d.osm.length > 1 ? 1 : 0];
      if (d.org) return recCompany(d.org, d);
    })
    .catch(function () {})
    .then(function () {
      REC.busy = false;
      recDraw();
    });
}
function recDraw() {
  var el = $("rec");
  if (!el || !REC.open) return;
  if (
    document.activeElement &&
    document.activeElement.id === "recQ" &&
    el._d === REC.d &&
    el._b === REC.busy
  )
    return;
  el._d = REC.d;
  el._b = REC.busy;
  var d = REC.d,
    row = function (k, v) {
      return v ? "<tr><td>" + k + "</td><td>" + esc(String(v)) + "</td></tr>" : "";
    },
    web = function (t, qs) {
      return (
        '<a class="brl" href="https://www.google.com/search?q=' +
        encodeURIComponent(qs) +
        '" target="_blank" rel="noopener">' +
        t +
        "</a>"
      );
    },
    h =
      '<div class="nh"><div><b class="mono">◆ RECORDS</b><h3>Property and company dossier</h3></div><button data-rc="x" aria-label="Close">✕</button></div><div class="nl"><form class="chq" id="recForm"><input id="recQ" type="search" value="' +
      esc(REC.q) +
      '" placeholder="An address, or a company name" autocomplete="off"><button>Look up</button></form>';
  if (!d)
    h +=
      '<p class="bre">Type a street address to see who owns the property and what the public registers say about that organisation, or type a company name directly. Sources are official registers and open data; each line links to where it came from.</p><div class="brt c1"><button data-rc="here">Use the place I am looking at</button></div>';
  else {
    if (REC.busy) h += '<p class="bre">Checking public records…</p>';
    if (d.addr) {
      h +=
        '<h4 class="mono">PROPERTY</h4><div class="brc"><b>' +
        esc(d.addr.split(",").slice(0, 3).join(",")) +
        "</b><table>" +
        row("Use", String(d.use || "").replace(/_/g, " ")) +
        row("On the map as", (d.osm || []).join(" · "));
      if (d.par)
        h +=
          row(
            "Owner on the tax roll",
            d.owner ? (d.ownOrg ? d.owner : "A private individual (name not shown)") : ""
          ) +
          row("County", d.par.county) +
          row(
            "Appraised value",
            d.par.mkt_value ? "$" + Math.round(+d.par.mkt_value).toLocaleString() : ""
          ) +
          row("Year built", +d.par.year_built > 1700 ? d.par.year_built : "") +
          row("Tax year", d.par.tax_year) +
          row("Parcel ID", d.par.prop_id);
      h +=
        "</table>" +
        (d.par
          ? '<i class="mono">TEXAS APPRAISAL DISTRICT RECORDS VIA THE STATE PARCEL MAP</i>'
          : '<span class="brd">' +
            (d.st === "TX"
              ? "No parcel record found at that exact point."
              : "Ownership rolls are kept county by county and have no single open feed outside Texas. Use the county link below.") +
            "</span>") +
        '<div class="bra">' +
        web(
          "County property search",
          (d.par && d.par.county ? d.par.county + " county " : "") +
            (d.state || "") +
            " appraisal district property search " +
            d.addr.split(",")[0]
        ) +
        '<button data-rc="go">Show on map</button></div></div>';
    }
    if (d.org) {
      h += '<h4 class="mono">ORGANISATION</h4><div class="brc"><b>' + esc(d.org) + "</b>";
      var ph = d.phone || (d.wd && d.wd.phone) || "",
        wb = d.web || (d.wd && d.wd.web) || "";
      if (ph || wb)
        h +=
          "<table>" +
          (ph
            ? '<tr><td>Business phone</td><td><a href="tel:' +
              esc(ph.replace(/[^\d+]/g, "")) +
              '" style="color:var(--ac)">' +
              esc(ph) +
              "</a></td></tr>"
            : "") +
          (wb && /^https?:/.test(wb)
            ? '<tr><td>Website</td><td><a href="' +
              esc(wb) +
              '" target="_blank" rel="noopener" style="color:var(--ac)">' +
              esc(
                wb
                  .replace(/^https?:\/\/(www\.)?/, "")
                  .replace(/\/$/, "")
                  .slice(0, 40)
              ) +
              "</a></td></tr>"
            : "") +
          '</table><i class="mono">PUBLISHED BY THE BUSINESS · OPENSTREETMAP / WIKIDATA</i>';
      h += recStateHTML(d);
      if (d.oc) {
        h +=
          "<table>" +
          row("Registered name", d.oc.name) +
          row("Status", d.oc.status || (d.oc.inactive ? "Inactive" : "Active")) +
          row(
            "Registered in",
            String(d.oc.juris || "")
              .toUpperCase()
              .replace("_", " · ")
          ) +
          row("Company number", d.oc.no) +
          row("Formed", d.oc.inc) +
          row("Type", d.oc.type) +
          row("Registered address", d.oc.addr) +
          row("Registered agent", d.oc.agent) +
          (d.oc.off || [])
            .map(function (o) {
              return row(esc(o[0]), o[1]);
            })
            .join("") +
          '</table><i class="mono">STATE COMPANY REGISTER VIA OPENCORPORATES</i>';
      }
      if (d.lei) {
        h +=
          "<table>" +
          row("Legal name", d.lei.name) +
          row("Entity status", d.lei.status) +
          row("Jurisdiction", d.lei.juris) +
          row("Registration number", d.lei.regNo) +
          row("Legal address", d.lei.legal) +
          row("Headquarters", d.lei.hq !== d.lei.legal ? d.lei.hq : "") +
          row("LEI", d.lei.lei) +
          row("Record last updated", String(d.lei.upd || "").slice(0, 10)) +
          '</table><i class="mono">GLOBAL LEGAL ENTITY IDENTIFIER REGISTER (GLEIF)</i>';
      }
      if (d.wd) {
        var w = d.wd;
        if ((w.inst || []).length || w.desc) {
          h +=
            "<table>" +
            row("Known as", w.label + (w.desc ? " — " + w.desc : "")) +
            row("Founded", w.founded) +
            row("Founded by", (w.founder || []).join(", ")) +
            row("Chief executive", (w.ceo || []).join(", ")) +
            row("Chair", (w.chair || []).join(", ")) +
            row("Board members", (w.board || []).join(", ")) +
            row("Parent", (w.parent || []).join(", ")) +
            row("Owned by", (w.owner || []).join(", ")) +
            row("Headquarters", (w.hq || []).join(", ")) +
            '</table><i class="mono">WIKIDATA · MAY BE A DIFFERENT ORGANISATION WITH A SIMILAR NAME · CHECK THE LINK</i>';
        }
      }

      h +=
        '<div class="bra">' +
        web(
          d.cc && d.cc !== "US" ? "Official company register" : "State business register",
          d.cc && d.cc !== "US"
            ? (d.country || "") + " official company register search " + d.org
            : (d.state || "") + " secretary of state business entity search " + d.org
        ) +
        web("Licence status", (d.state || "") + " business license lookup " + d.org) +
        '</div><div class="bra">' +
        web(
          "Business phone",
          d.org + " " + (d.addr ? d.addr.split(",").slice(1, 3).join(" ") : "") + " phone number"
        ) +
        web(
          "Owners and officers",
          d.org + " " + (d.state || "") + " owner officers registered agent"
        ) +
        "</div>" +
        (d.wd
          ? '<div class="bra"><a class="brl" href="https://www.wikidata.org/wiki/' +
            esc(d.wd.id) +
            '" target="_blank" rel="noopener">Wikidata entry</a>' +
            (d.oc && d.oc.url
              ? '<a class="brl" href="' +
                esc(d.oc.url) +
                '" target="_blank" rel="noopener">Register entry</a>'
              : d.lei
                ? '<a class="brl" href="https://search.gleif.org/#/record/' +
                  esc(d.lei.lei) +
                  '" target="_blank" rel="noopener">LEI record</a>'
                : "") +
            "</div>"
          : "") +
        "</div>";
    } else if (!REC.busy && d.owner && !d.ownOrg)
      h +=
        '<div class="brc"><span>This property is owned by a private individual. The app shows organisations only.</span></div>';
    else if (!REC.busy && !d.addr)
      h +=
        '<p class="bre">Nothing found for “' +
        esc(d.q) +
        "”. Try the full street address with city and state.</p>";
  }
  h +=
    '</div><div class="nf mono">PUBLIC REGISTERS ONLY · ORGANISATIONS, NOT PRIVATE INDIVIDUALS · VERIFY AT THE SOURCE BEFORE RELYING ON IT</div>';
  el.innerHTML = h;
}
function recOpen(q) {
  var el = $("rec");
  if (!el) {
    el = document.createElement("div");
    el.id = "rec";
    el.className = "pn";
    document.body.appendChild(el);
  }
  REC.open = true;
  el.style.display = "flex";
  el._d = 0;
  recDraw();
  if (q) recGo(q);
}
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-rc]");
  if (!b) return;
  var k = b.getAttribute("data-rc");
  if (k === "x") {
    REC.open = false;
    $("rec").style.display = "none";
  } else if (k === "go" && REC.d && REC.d.lat) {
    REC.open = false;
    $("rec").style.display = "none";
    target = { lon: REC.d.lon, lat: REC.d.lat, z: Math.max(zoom, 300) };
    rot.lon = REC.d.lon;
    rot.lat = REC.d.lat;
    if (T4.on && T4.v) {
      T4.h = 0;
      t4Fly(REC.d.lon, REC.d.lat, 500, 0);
    }
  } else if (k === "here") {
    var c = newsCentre();
    getJSON(
      "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=en&lat=" +
        c[0].toFixed(5) +
        "&lon=" +
        c[1].toFixed(5),
      12000
    )
      .then(function (j) {
        if (j && j.display_name) recGo(j.display_name);
      })
      .catch(function () {});
  } else if (k === "own") {
    recOpen(b.getAttribute("data-q"));
  }
});
