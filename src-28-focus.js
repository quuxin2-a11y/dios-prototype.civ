/**
 * @file Focus mode.
 * Pick one or more US states, countries or city areas. They are lit and raised on the map,
 * everything else is dimmed, and cameras, layers and data outside them pause so the focus area
 * stays smooth. Boundaries come from public TopoJSON (us-atlas, world-atlas) and are loaded once.
 *
 * Module 28 of 39. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Focus mode ----------
var FOC = {
  areas: [],
  box: null,
  mask: null,
  states: null,
  countries: null,
  loading: null,
  msg: ""
};

var FOC_SRC = {
  states: "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json",
  countries: "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"
};

var US_ABBR = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  PR: "Puerto Rico"
};

// ----- TopoJSON -----
// Decodes one GeometryCollection into features {name, rings: [[lon, lat]...][], box}.
// Rings are made continuous across the antimeridian so they can be filled and tested.
function topoFeatures(topo, objName) {
  var tf = topo.transform,
    arcs = topo.arcs.map(function (a) {
      var x = 0,
        y = 0;
      return a.map(function (p) {
        if (!tf) return [p[0], p[1]];
        x += p[0];
        y += p[1];
        return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]];
      });
    });
  var ring = function (ix) {
    var out = [];
    ix.forEach(function (i) {
      var a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      for (var k = 0; k < a.length; k++) if (k || !out.length) out.push(a[k]);
    });
    for (var k = 1; k < out.length; k++) {
      var d = out[k][0] - out[k - 1][0];
      if (d > 180) out[k] = [out[k][0] - 360, out[k][1]];
      else if (d < -180) out[k] = [out[k][0] + 360, out[k][1]];
    }
    return out;
  };
  var obj = topo.objects[objName];
  return ((obj && obj.geometries) || [])
    .map(function (g) {
      var polys = g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : [],
        rings = [];
      polys.forEach(function (pg) {
        pg.forEach(function (r) {
          rings.push(ring(r));
        });
      });
      return {
        id: g.id != null ? String(g.id) : "",
        name: (g.properties && g.properties.name) || "",
        rings: rings,
        box: ringsBox(rings)
      };
    })
    .filter(function (f) {
      return f.rings.length && f.name;
    });
}

function ringsBox(rings) {
  var b = { w: Infinity, e: -Infinity, s: Infinity, n: -Infinity };
  rings.forEach(function (r) {
    r.forEach(function (p) {
      if (p[0] < b.w) b.w = p[0];
      if (p[0] > b.e) b.e = p[0];
      if (p[1] < b.s) b.s = p[1];
      if (p[1] > b.n) b.n = p[1];
    });
  });
  return b;
}

// A circle of radius km around a point, as a ring.
function focCircle(lat, lon, km) {
  var r = [],
    dLat = km / 110.57,
    dLon = km / (111.32 * Math.max(0.2, Math.cos(lat * D)));
  for (var i = 0; i <= 48; i++) {
    var a = (i / 48) * Math.PI * 2;
    r.push([lon + Math.cos(a) * dLon, lat + Math.sin(a) * dLat]);
  }
  return r;
}

function focLoad() {
  if (FOC.states && FOC.countries) return Promise.resolve();
  if (FOC.loading) return FOC.loading;
  FOC.loading = Promise.all([getJSON(FOC_SRC.states, 30000), getJSON(FOC_SRC.countries, 40000)])
    .then(function (r) {
      FOC.states = topoFeatures(r[0], "states");
      FOC.countries = topoFeatures(r[1], "countries");
    })
    .catch(function (e) {
      FOC.loading = null;
      throw e;
    });
  return FOC.loading;
}

// ----- the focus mask: a small raster of the chosen areas, for fast point tests -----
function focRebuild() {
  if (!FOC.areas.length) {
    FOC.box = null;
    FOC.mask = null;
  } else {
    var b = { w: Infinity, e: -Infinity, s: Infinity, n: -Infinity };
    FOC.areas.forEach(function (a) {
      b.w = Math.min(b.w, a.box.w);
      b.e = Math.max(b.e, a.box.e);
      b.s = Math.min(b.s, a.box.s);
      b.n = Math.max(b.n, a.box.n);
    });
    FOC.box = b;
    var cw = Math.max(64, Math.min(1024, Math.round((b.e - b.w) * 40))),
      ch = Math.max(64, Math.min(1024, Math.round((b.n - b.s) * 40))),
      cv = document.createElement("canvas");
    cv.width = cw;
    cv.height = ch;
    var g = cv.getContext("2d"),
      sx = cw / (b.e - b.w || 1),
      sy = ch / (b.n - b.s || 1);
    g.fillStyle = "#fff";
    g.beginPath();
    FOC.areas.forEach(function (a) {
      a.rings.forEach(function (r) {
        r.forEach(function (p, i) {
          var x = (p[0] - b.w) * sx,
            y = (b.n - p[1]) * sy;
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        });
        g.closePath();
      });
    });
    g.fill("evenodd");
    var px = g.getImageData(0, 0, cw, ch).data,
      m = new Uint8Array(cw * ch);
    for (var i = 0; i < m.length; i++) m[i] = px[i * 4 + 3] > 0 ? 1 : 0;
    FOC.mask = { w: cw, h: ch, sx: sx, sy: sy, a: m };
  }
  try {
    localStorage.setItem(
      "ojos-focus",
      JSON.stringify(
        FOC.areas.map(function (a) {
          return { type: a.type, name: a.name, lat: a.lat, lon: a.lon, km: a.km };
        })
      )
    );
  } catch (e) {}
  render();
  wstat();
  lastView = "";
}

function focusBox() {
  return FOC && FOC.box ? FOC.box : null;
}

// True when no focus is set, or the point lies inside a focus area.
function focusHas(lat, lon) {
  if (!FOC || !FOC.mask) return true;
  var b = FOC.box,
    m = FOC.mask;
  if (lat < b.s || lat > b.n) return false;
  for (var k = -1; k <= 1; k++) {
    var x = lon + k * 360;
    if (x < b.w || x > b.e) continue;
    var cx = Math.min(m.w - 1, Math.floor((x - b.w) * m.sx)),
      cy = Math.min(m.h - 1, Math.floor((b.n - lat) * m.sy));
    if (m.a[cy * m.w + cx]) return true;
  }
  return false;
}

// ----- choosing areas -----
function focFind(q) {
  q = String(q || "").trim();
  if (!q) return null;
  var lq = q.toLowerCase(),
    ab = US_ABBR[q.toUpperCase()],
    hit = function (list, type) {
      var f = (list || []).filter(function (x) {
        return x.name.toLowerCase() === lq || (ab && x.name === ab);
      })[0];
      return f ? { type: type, name: f.name, rings: f.rings, box: f.box } : null;
    };
  var r = hit(FOC.states, "state") || hit(FOC.countries, "country");
  if (r) return r;
  var c = GAZ.filter(function (g) {
    return String(g[0]).toLowerCase() === lq;
  })[0];
  if (c) return focCity(c[0], c[1], c[2], 35);
  return null;
}

function focCity(name, lat, lon, km) {
  var ring = focCircle(lat, lon, km);
  return {
    type: "city",
    name: name,
    lat: lat,
    lon: lon,
    km: km,
    rings: [ring],
    box: ringsBox([ring])
  };
}

function pointInRings(rings, lat, lon) {
  var inside = false;
  rings.forEach(function (r) {
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
      var xi = r[i][0],
        yi = r[i][1],
        xj = r[j][0],
        yj = r[j][1];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
  });
  return inside;
}

// The area at the centre of the view: a city area when zoomed in, otherwise the state or country.
function focHere() {
  var lat = rot.lat,
    lon = rot.lon,
    km = viewKm();
  if (km < 200) {
    var near = null,
      best = Infinity;
    GAZ.forEach(function (g) {
      var dd = hav(lat, lon, g[1], g[2]);
      if (dd < best) {
        best = dd;
        near = g;
      }
    });
    var name = near && best < 40 ? near[0] : "This area";
    return focCity(name, lat, lon, Math.max(5, Math.round(km * 0.45)));
  }
  var find = function (list, type) {
    var f = (list || []).filter(function (x) {
      return (
        lat >= x.box.s &&
        lat <= x.box.n &&
        (pointInRings(x.rings, lat, lon) ||
          pointInRings(x.rings, lat, lon + 360) ||
          pointInRings(x.rings, lat, lon - 360))
      );
    })[0];
    return f ? { type: type, name: f.name, rings: f.rings, box: f.box } : null;
  };
  return find(FOC.states, "state") || find(FOC.countries, "country");
}

function focAdd(a) {
  if (!a) return false;
  if (
    FOC.areas.some(function (x) {
      return x.name === a.name && x.type === a.type;
    })
  )
    return true;
  FOC.areas.push(a);
  focRebuild();
  return true;
}

function focRemove(i) {
  FOC.areas.splice(i, 1);
  focRebuild();
}

function focClear() {
  FOC.areas = [];
  focRebuild();
}

function focRestore() {
  var saved = null;
  try {
    saved = JSON.parse(localStorage.getItem("ojos-focus") || "null");
  } catch (e) {}
  if (!saved || !saved.length) return;
  focLoad()
    .then(function () {
      saved.forEach(function (s) {
        var a = s.type === "city" ? focCity(s.name, s.lat, s.lon, s.km) : focFind(s.name);
        if (a && a.type === s.type) FOC.areas.push(a);
      });
      focRebuild();
    })
    .catch(function () {});
}

// ----- drawing: dim everything outside, light and raise the focus areas -----
function focPath(P, a) {
  a.rings.forEach(function (r) {
    var started = false;
    for (var i = 0; i < r.length; i++) {
      var p = P(r[i][0], r[i][1]);
      if (p[2] <= 0) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(p[0], p[1]);
        started = true;
      } else ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
  });
}

function drawFocus(P) {
  if (!FOC || !FOC.areas.length) return;
  ctx.save();
  // Darken the world outside the focus areas.
  ctx.beginPath();
  ctx.rect(-10, -10, W + 20, H + 20);
  FOC.areas.forEach(function (a) {
    focPath(P, a);
  });
  ctx.fillStyle = "rgba(1,4,8,.74)";
  ctx.fill("evenodd");
  // Raise the focus areas: a drop shadow, a soft light inside, a glowing rim and a highlight.
  FOC.areas.forEach(function (a) {
    ctx.beginPath();
    focPath(P, a);
    ctx.shadowColor = "rgba(0,0,0,.95)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 7;
    ctx.strokeStyle = "rgba(0,0,0,.9)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = "rgba(63,224,208,.07)";
    ctx.fill("evenodd");
    ctx.shadowColor = "rgba(63,224,208,.85)";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "#3fe0d0";
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.translate(0, -1);
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.translate(0, 1);
  });
  ctx.restore();
  // Items outside the focus cannot be tapped.
  screenPts = screenPts.filter(function (s) {
    var o = s[2];
    return !o || o.lat == null || focusHas(o.lat, o.lon);
  });
}

// ----- panel -----
function focOpen() {
  var el = $("focus");
  if (!el) {
    el = document.createElement("div");
    el.id = "focus";
    el.className = "pn";
    document.body.appendChild(el);
  }
  el.style.display = "flex";
  FOC.msg = FOC.states ? "" : "Loading state and country outlines…";
  focDraw();
  focLoad()
    .then(function () {
      FOC.msg = "";
      focDraw();
    })
    .catch(function () {
      FOC.msg = "Could not load outlines. Check the connection and try again.";
      focDraw();
    });
}

function focClose() {
  var el = $("focus");
  if (el) el.style.display = "none";
}

function focDraw() {
  var el = $("focus");
  if (!el || el.style.display === "none") return;
  if (document.activeElement && document.activeElement.id === "focQ") return;
  var h =
    '<div class="nh"><div><b class="mono">◎ FOCUS</b><h3>' +
    (FOC.areas.length
      ? FOC.areas.length + " area" + (FOC.areas.length > 1 ? "s" : "")
      : "Whole world") +
    '</h3></div><button data-fo="x" aria-label="Close">✕</button></div><div class="nl">' +
    '<form class="chq" id="focForm"><input id="focQ" type="search" placeholder="State, country or city" autocomplete="off"><button>Add</button></form>' +
    '<div class="brt"><button data-fo="here">⌖ Focus on what I\'m looking at</button>' +
    (FOC.areas.length ? '<button data-fo="clear">Clear focus</button>' : "") +
    "</div>";
  if (FOC.msg) h += '<p class="bre">' + esc(FOC.msg) + "</p>";
  if (FOC.areas.length)
    h +=
      '<h4 class="mono">FOCUSED</h4>' +
      FOC.areas
        .map(function (a, i) {
          return (
            '<div class="brc"><b>' +
            esc(a.name) +
            '</b><em class="mono">' +
            esc(a.type.toUpperCase()) +
            '</em><button class="mini" data-fo="rm" data-i="' +
            i +
            '" aria-label="Remove">✕</button></div>'
          );
        })
        .join("");
  h +=
    '<p class="bre">The chosen areas light up and everything else dims. Cameras, layers and data outside them pause, so the area you care about runs smoothly. Add as many states, countries or cities as you like.</p></div>';
  el.innerHTML = h;
}

document.addEventListener("submit", function (e) {
  if (!e.target || e.target.id !== "focForm") return;
  e.preventDefault();
  var q = $("focQ").value;
  $("focQ").blur();
  focLoad()
    .then(function () {
      var a = focFind(q);
      FOC.msg = a ? "" : "No state, country or city called “" + q + "” on the built-in lists.";
      focAdd(a);
      focDraw();
    })
    .catch(function () {
      FOC.msg = "Could not load outlines. Check the connection and try again.";
      focDraw();
    });
});

document.addEventListener("click", function (e) {
  if (e.target.closest("#bFocus")) {
    focOpen();
    return;
  }
  var b = e.target.closest("[data-fo]");
  if (!b) return;
  var k = b.getAttribute("data-fo");
  if (k === "x") focClose();
  else if (k === "clear") {
    focClear();
    focDraw();
  } else if (k === "rm") {
    focRemove(+b.getAttribute("data-i"));
    focDraw();
  } else if (k === "here") {
    focLoad()
      .then(function () {
        var a = focHere();
        FOC.msg = a ? "" : "Nothing found at the centre of the map. Move over land and try again.";
        if (focAdd(a)) focClose();
        else focDraw();
      })
      .catch(function () {
        FOC.msg = "Could not load outlines. Check the connection and try again.";
        focDraw();
      });
  }
});

if (EMBED_OK) setTimeout(focRestore, 1200);
