/**
 * @file Route choices.
 * Alternative routes from OSRM, scored against reported hazards and camera coverage.
 *
 * Module 19 of 30. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Drive: route choices (fastest, fewest cameras, back roads, safest) ----------
if (!DRV.pref) DRV.pref = ls("ojos-drvp") || "fast";
var DRV_P = [
  ["fast", "Fastest"],
  ["nocam", "Fewest cameras"],
  ["back", "Back roads"],
  ["safe", "Safest"]
];
function osrmParse(r, src) {
  var steps = [];
  (r.legs || []).forEach(function (l) {
    (l.steps || []).forEach(function (s) {
      var m = s.maneuver || {};
      if (m.location)
        steps.push({ lat: m.location[1], lon: m.location[0], t: stepText(m, s.name) });
    });
  });
  return {
    pts: r.geometry.coordinates.map(function (c) {
      return [c[1], c[0]];
    }),
    m: r.distance,
    s: r.duration,
    steps: steps,
    src: src || "OpenStreetMap routing"
  };
}
function osrmMany(a, b, extra, src) {
  return getJSON(
    "https://router.project-osrm.org/route/v1/driving/" +
      a.lon.toFixed(6) +
      "," +
      a.lat.toFixed(6) +
      ";" +
      b.lon.toFixed(6) +
      "," +
      b.lat.toFixed(6) +
      "?overview=full&geometries=geojson&steps=true" +
      extra,
    30000
  )
    .then(function (j) {
      return ((j && j.routes) || []).map(function (r) {
        return osrmParse(r, src);
      });
    })
    .catch(function () {
      return [];
    });
}
// everything currently reported that a road trip should stay clear of
function hazList() {
  var o = [],
    now = Date.now();
  QUAKES.forEach(function (q) {
    if (q.mag >= 4.5 && now - q.time < 2 * 864e5)
      o.push({
        lat: q.lat,
        lon: q.lon,
        n: "M" + q.mag.toFixed(1) + " earthquake",
        r: q.mag >= 6 ? 120 : 50
      });
  });
  EVENTS.forEach(function (e) {
    if (isFinite(e.lat)) o.push({ lat: e.lat, lon: e.lon, n: e.n || e.catName || "Event", r: 40 });
  });
  (NEWS.alerts || []).forEach(function (a) {
    if (isFinite(a.lat) && isFinite(a.lon))
      o.push({ lat: a.lat, lon: a.lon, n: a.t, r: a.lvl >= 3 ? 150 : 80 });
  });
  return o;
}
function routeRisk(R, H) {
  var s = 0,
    near = null,
    p = R.pts,
    st = Math.max(1, Math.floor(p.length / 300));
  H.forEach(function (h) {
    var best = 1e9;
    for (var i = 0; i < p.length; i += st) {
      var d = hav(h.lat, h.lon, p[i][0], p[i][1]);
      if (d < best) best = d;
    }
    if (best < h.r) {
      s += (h.r - best) / h.r;
      if (!near || best < near.d) near = { d: best, n: h.n };
    }
  });
  R.hz = s;
  R.hzNear = near;
  return s;
}
function routeCams(R) {
  var n = 0,
    seen = {};
  for (var i = 0; i < LIVE.length; i++) {
    var c = LIVE[i];
    if (DEAD[c.u] || seen[c.u]) continue;
    var nr = drvNear(R, c.lat, c.lon);
    if (nr && nr.d <= 350) {
      seen[c.u] = 1;
      n++;
    }
  }
  R.nc = n;
  return n;
}
function drvPickFrom(L, pref) {
  if (!L || !L.length) return null;
  var minS = Math.min.apply(
      null,
      L.map(function (r) {
        return r.s;
      })
    ),
    ok = L.filter(function (r) {
      return r.s <= minS * 2.5;
    }),
    by = function (f) {
      return ok.slice().sort(f)[0];
    };
  if (pref === "nocam")
    return by(function (a, b) {
      return a.nc - b.nc || a.s - b.s;
    });
  if (pref === "back")
    return by(function (a, b) {
      return (b.back ? 1 : 0) - (a.back ? 1 : 0) || a.m / a.s - b.m / b.s;
    });
  if (pref === "safe")
    return by(function (a, b) {
      return a.hz - b.hz || a.s - b.s;
    });
  return by(function (a, b) {
    return a.s - b.s;
  });
}
function drvAlts(a, b) {
  return Promise.all([
    routeGoogle(a, b)
      .then(function (R) {
        return [R];
      })
      .catch(function () {
        return [];
      }),
    osrmMany(a, b, "&alternatives=3"),
    osrmMany(a, b, "&exclude=motorway", "OpenStreetMap routing, no motorways").then(function (L) {
      L.forEach(function (R) {
        R.back = true;
      });
      return L;
    })
  ]).then(function (r) {
    if (EMG.rn) {
      b.name = EMG.rn;
      a.name = "My location";
      EMG.rn = null;
    }
    var L = [],
      H = hazList();
    r[0].concat(r[1], r[2]).forEach(function (R) {
      if (R.pts.length < 2) return;
      if (
        L.some(function (x) {
          return (
            Math.abs(x.m - R.m) < Math.max(150, x.m * 0.01) &&
            !!x.back === !!R.back &&
            x.src === R.src
          );
        })
      )
        return;
      R.a = a;
      R.b = b;
      drvIndex(R);
      routeCams(R);
      routeRisk(R, H);
      L.push(R);
    });
    if (!L.length) throw new Error("No driving route found between those places");
    DRV.alts = L;
    return drvPickFrom(L, DRV.pref);
  });
}
function drvApply(R) {
  if (!R) return;
  DRV.R = R;
  DRV.at = 0;
  DRV.wallOff = 0;
  DRV.said = {};
  drvScan();
  lastView = "";
  if (document.querySelector("#drvForm")) drvPanel();
  if (!R.wx) drvWx();
}
function drvPrefHTML() {
  var L = DRV.alts || [],
    h =
      '<div class="drvp">' +
      DRV_P.map(function (p) {
        return (
          '<button type="button" data-dp="' +
          p[0] +
          '" class="' +
          (DRV.pref === p[0] ? "on" : "") +
          '">' +
          p[1] +
          "</button>"
        );
      }).join("") +
      "</div>";
  if (DRV.R && L.length > 1)
    h +=
      '<p class="note2">' +
      L.length +
      " routes compared. This one: " +
      fmtT(DRV.R.s) +
      ", " +
      DRV.R.nc +
      " camera" +
      (DRV.R.nc === 1 ? "" : "s") +
      (DRV.R.hzNear
        ? ", passes " +
          Math.round(DRV.R.hzNear.d * 0.621) +
          " mi from " +
          esc(String(DRV.R.hzNear.n).slice(0, 50))
        : DRV.pref === "safe"
          ? ", no hazard reported on any route, so the quickest is the safest"
          : ", clear of reported hazards") +
      ". " +
      DRV_P.filter(function (p) {
        return p[0] !== DRV.pref;
      })
        .map(function (p) {
          var r = drvPickFrom(L, p[0]);
          return r && r !== DRV.R ? p[1] + ": " + fmtT(r.s) + ", " + r.nc + " cameras" : "";
        })
        .filter(Boolean)
        .join(" · ") +
      "</p>";
  else if (DRV.R && DRV.pref !== "fast")
    h +=
      '<p class="note2">Only one route exists between these places, so every choice gives the same road.</p>';
  return h;
}
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-dp]");
  if (!b) return;
  DRV.pref = b.getAttribute("data-dp");
  ls("ojos-drvp", DRV.pref);
  if (DRV.alts && DRV.R) drvApply(drvPickFrom(DRV.alts, DRV.pref));
  else drvPanel();
});
