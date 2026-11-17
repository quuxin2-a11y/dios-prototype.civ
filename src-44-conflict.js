/**
 * @file Conflict monitor: strikes, shelling and clashes reported in the news, and war zones.
 * The "Conflict reports" layer comes from the shared data feed (conflict.py reads GDELT's event
 * files every 20 minutes): drone strikes, air strikes, shelling, bombings and clashes from the
 * last 24 hours, placed at the town or city named in the report. They are machine-coded from news
 * and unverified, and every item says so and links its source. Countries under a US "Do not
 * travel" (Level 4) advisory are shaded as war and danger zones on the dark globe.
 * The Conflict button in the dock switches both on and opens the list of reports.
 *
 * Module 43 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

var CF = { open: false, kind: "", key: "" };

ilDef({
  key: "conflict",
  label: "Conflict reports (24 h)",
  color: "#ff3b6b",
  icon: "✹",
  every: 20 * 60000,
  none: "NO REPORTS",
  status: function (d) {
    return d.items.length ? d.items.length.toLocaleString() + " · UNVERIFIED" : "NO REPORTS";
  },
  load: function (d) {
    return getJSON(feedUrl("layers.json"), 20000).then(function (f) {
      var l = f && f.layers && f.layers.conflict;
      if (!l || !Array.isArray(l.items)) throw new Error("not in the data feed yet");
      return l.items.map(function (x) {
        return ilItem(d, x);
      });
    });
  }
});

// ---------- War zones: countries under a Level 4 advisory, shaded on the dark globe ----------
// State Department names that differ from the boundary data's names.
var CF_ALIAS = {
  burma: "myanmar",
  "democratic republic of the congo": "dem rep congo",
  "congo democratic republic of the": "dem rep congo",
  "central african republic": "central african rep",
  "south sudan": "s sudan",
  "north korea democratic peoples republic of korea": "north korea",
  "bosnia and herzegovina": "bosnia and herz"
};

function cfNorm(s) {
  s = String(s || "")
    .toLowerCase()
    .replace(/\btravel advisory\b/, "")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return CF_ALIAS[s] || s;
}

// Country outlines for every Level 4 advisory, as a GeoJSON collection.
function cfZones() {
  var adv = (IL.advisory && IL.advisory.items) || [],
    want = {};
  adv.forEach(function (e) {
    if (e.big) want[cfNorm(e.n)] = 1;
  });
  var f = (FOC.countries || [])
    .filter(function (c) {
      return want[cfNorm(c.name)];
    })
    .map(function (c) {
      return {
        type: "Feature",
        geometry: {
          type: "MultiPolygon",
          coordinates: c.rings.map(function (r) {
            return [r];
          })
        },
        properties: { n: c.name }
      };
    });
  return { type: "FeatureCollection", features: f };
}

function cfZonesTick() {
  var m = T3.map,
    on = !!(WL.conflict && WL.advisory);
  if (!m || !T3.ready || !T3.ops) return;
  if (on && !FOC.countries) {
    focLoad().catch(function () {});
    return;
  }
  var key = on ? IL.advisory.items.length + ":" + IL.advisory.at : "off";
  if (key === CF.key && m.getSource("zones")) return;
  CF.key = key;
  var d = on ? cfZones() : { type: "FeatureCollection", features: [] };
  if (m.getSource("zones")) m.getSource("zones").setData(d);
  else {
    m.addSource("zones", { type: "geojson", data: d });
    var under = m.getLayer("infoshape") ? "infoshape" : undefined;
    m.addLayer(
      {
        id: "zones",
        type: "fill",
        source: "zones",
        paint: { "fill-color": "#ff2d2d", "fill-opacity": 0.1 }
      },
      under
    );
    m.addLayer(
      {
        id: "zones-edge",
        type: "line",
        source: "zones",
        paint: {
          "line-color": "#ff4d4d",
          "line-width": 1.2,
          "line-opacity": 0.8,
          "line-dasharray": [2, 2]
        }
      },
      under
    );
  }
}
setInterval(cfZonesTick, 2000);

// ---------- The Conflict panel ----------
function cfToggle() {
  if (CF.open) {
    cfClose();
    return;
  }
  setLayer("conflict", true);
  setLayer("advisory", true);
  if (IL.conflict && !IL.conflict.items.length) ilLoad(IL.conflict, true);
  CF.open = true;
  cfDraw();
}

function cfClose() {
  CF.open = false;
  var el = $("cfp");
  if (el) el.style.display = "none";
}

function cfItems() {
  return ((IL.conflict && IL.conflict.items) || [])
    .filter(function (e) {
      return !CF.kind || String(e.n).indexOf(CF.kind) === 0;
    })
    .sort(function (a, b) {
      return (b.t || 0) - (a.t || 0);
    });
}

function cfDraw() {
  if (!CF.open) return;
  var el = $("cfp");
  if (!el) {
    el = document.createElement("div");
    el.id = "cfp";
    document.body.appendChild(el);
  }
  var d = IL.conflict || { items: [] },
    all = d.items,
    kinds = {},
    lvl4 = ((IL.advisory && IL.advisory.items) || []).filter(function (e) {
      return e.big;
    }).length;
  all.forEach(function (e) {
    var k = String(e.n).split(" · ")[0];
    kinds[k] = (kinds[k] || 0) + 1;
  });
  var list = cfItems().slice(0, 300),
    h =
      '<div class="cfhead"><b class="mono">CONFLICT · LAST 24 H</b><span class="mono">' +
      all.length.toLocaleString() +
      " UNVERIFIED REPORTS · " +
      lvl4 +
      ' DO-NOT-TRAVEL COUNTRIES</span><button data-cf="x" aria-label="Close">✕</button></div>' +
      '<div class="cfchips"><button data-cf="k-" class="' +
      (CF.kind ? "" : "on") +
      '">All</button>' +
      Object.keys(kinds)
        .sort(function (a, b) {
          return kinds[b] - kinds[a];
        })
        .map(function (k) {
          return (
            '<button data-cf="k-' +
            esc(k) +
            '" class="' +
            (CF.kind === k ? "on" : "") +
            '">' +
            esc(k) +
            " <i>" +
            kinds[k] +
            "</i></button>"
          );
        })
        .join("") +
      '</div><div class="cflist">';
  if (!all.length)
    h +=
      '<p class="cfnone">' +
      (d.busy
        ? "Loading reports…"
        : "No reports yet. They come from the app's data feed, which updates every 20 minutes once it is set up.") +
      "</p>";
  h += list
    .map(function (e, i) {
      var parts = String(e.n).split(" · ");
      return (
        '<button class="cfrow" data-cf="go-' +
        i +
        '"><span class="cfk" style="color:' +
        okColor(e.color) +
        ";border-color:" +
        okColor(e.color) +
        '">' +
        esc(parts[0].toUpperCase()) +
        "</span><b>" +
        esc(parts.slice(1).join(" · ") || "—") +
        "</b><em>" +
        (e.t ? ago(e.t) : "") +
        "</em></button>"
      );
    })
    .join("");
  h +=
    '</div><p class="cffoot">Machine-coded from news reports by GDELT and not verified. Each report links its source. Shaded countries carry a US "Do not travel" advisory.</p>';
  el.innerHTML = h;
  el.style.display = "flex";
  CF.list = list;
  CF.drawn = all.length + ":" + d.at + ":" + CF.kind;
}

setInterval(function () {
  if (
    CF.open &&
    IL.conflict &&
    CF.drawn !== IL.conflict.items.length + ":" + IL.conflict.at + ":" + CF.kind
  )
    cfDraw();
}, 2000);

document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-cf]");
  if (!b) return;
  var k = b.getAttribute("data-cf");
  if (k === "x") cfClose();
  else if (k.indexOf("k-") === 0) {
    CF.kind = k.slice(2);
    cfDraw();
  } else if (k.indexOf("go-") === 0) {
    var it = CF.list && CF.list[+k.slice(3)];
    if (!it) return;
    cfClose();
    if (RW.on && RW.mode === "globe" && T3.map)
      T3.map.flyTo({ center: [it.lon, it.lat], zoom: 9, duration: 1500 });
    else if (T4.on && T4.v) t4Fly(it.lon, it.lat, 20000, 0);
    else target = { lon: it.lon, lat: it.lat, z: clampZ((zoom * viewKm()) / 300) };
    select(it);
  }
});
