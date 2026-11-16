/**
 * @file Warnings outside the US, offline pack, family check-in and system check.
 * MeteoAlarm warnings, offline tile packs, check-in messages, the error log and the source health
 * check.
 *
 * Module 22 of 38. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Warnings outside the US, offline pack, family check-in, system check ----------
// Official weather warnings for Europe, from each national weather service through MeteoAlarm.
var MA = {
  AT: "austria",
  BE: "belgium",
  BA: "bosnia-herzegovina",
  BG: "bulgaria",
  HR: "croatia",
  CY: "cyprus",
  CZ: "czechia",
  DK: "denmark",
  EE: "estonia",
  FI: "finland",
  FR: "france",
  DE: "germany",
  GR: "greece",
  HU: "hungary",
  IS: "iceland",
  IE: "ireland",
  IL: "israel",
  IT: "italy",
  LV: "latvia",
  LT: "lithuania",
  LU: "luxembourg",
  MT: "malta",
  MD: "moldova",
  ME: "montenegro",
  NL: "netherlands",
  MK: "republic-of-north-macedonia",
  NO: "norway",
  PL: "poland",
  PT: "portugal",
  RO: "romania",
  RS: "serbia",
  SK: "slovakia",
  SI: "slovenia",
  ES: "spain",
  SE: "sweden",
  CH: "switzerland",
  GB: "united-kingdom",
  UA: "ukraine"
};
function maMatch(w, lat, lon, names) {
  var now = Date.now(),
    al = w && w.alert,
    infos = (al && al.info) || [],
    inf = null,
    i;
  for (i = 0; i < infos.length; i++)
    if (/^en/i.test(infos[i].language || "")) {
      inf = infos[i];
      break;
    }
  inf = inf || infos[0];
  if (!inf) return null;
  var lvl = /Extreme/i.test(inf.severity)
    ? 3
    : /Severe/i.test(inf.severity)
      ? 2
      : /Moderate/i.test(inf.severity)
        ? 1
        : 0;
  if (!lvl) return null;
  var ex = Date.parse(inf.expires) || 0,
    on = Date.parse(inf.onset || inf.effective) || 0;
  if (ex && ex < now) return null;
  if (on && on > now + 36 * 36e5) return null;
  var hit = false,
    area = "";
  (inf.area || []).forEach(function (a) {
    if (hit) return;
    var d = String(a.areaDesc || "").toLowerCase();
    (a.polygon || []).forEach(function (pg) {
      var ring = String(pg)
        .trim()
        .split(/\s+/)
        .map(function (p) {
          var q = p.split(",");
          return [+q[1], +q[0]];
        });
      if (ring.length > 2 && pip([lon, lat], ring)) hit = true;
    });
    if (!hit && d)
      for (var j = 0; j < names.length; j++) {
        var n = names[j];
        if (n.length > 3 && (d === n || d.indexOf(n) >= 0 || (n.indexOf(d) >= 0 && d.length > 3))) {
          hit = true;
          break;
        }
      }
    if (hit) area = a.areaDesc || "";
  });
  if (!hit) return null;
  return {
    id: al.identifier || w.uuid,
    ev: String(inf.event || inf.headline || "Weather warning").slice(0, 80),
    sev: inf.severity,
    head:
      String(inf.headline || inf.description || "")
        .replace(/\s+/g, " ")
        .slice(0, 200) + (area ? " · " + area : ""),
    ins: String(inf.instruction || "")
      .replace(/\s+/g, " ")
      .slice(0, 420),
    ends: ex,
    lvl: lvl,
    src: "METEOALARM · NATIONAL WEATHER SERVICE"
  };
}
function maLoad(cc, lat, lon, names) {
  var slug = MA[cc];
  if (!slug) return Promise.resolve(null);
  return getJSON("https://feeds.meteoalarm.org/api/v1/warnings/feeds-" + slug, 30000).then(
    function (j) {
      var o = [],
        seen = {};
      ((j && j.warnings) || []).forEach(function (w) {
        var m = null;
        try {
          m = maMatch(w, lat, lon, names);
        } catch (e) {}
        if (m && !seen[m.ev + m.ends]) {
          seen[m.ev + m.ends] = 1;
          o.push(m);
        }
      });
      return o
        .sort(function (a, b) {
          return b.lvl - a.lvl;
        })
        .slice(0, 8);
    }
  );
}
// ----- offline pack: keep the map and safe places for an area on the phone -----
var PACK = { busy: false, done: 0, tot: 0 };
function packTiles(lat, lon) {
  var o = [],
    seen = {},
    add = function (z, span) {
      var n = Math.pow(2, z),
        tx = function (l) {
          return Math.floor(((l + 180) / 360) * n);
        },
        ty = function (l) {
          var r = l * D;
          return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
        },
        x0 = tx(lon - span),
        x1 = tx(lon + span),
        y0 = ty(Math.min(85, lat + span)),
        y1 = ty(Math.max(-85, lat - span));
      for (var x = x0; x <= x1; x++)
        for (var y = y0; y <= y1; y++) {
          var k = z + "/" + y + "/" + (((x % n) + n) % n);
          if (!seen[k] && y >= 0 && y < n) {
            seen[k] = 1;
            o.push(k);
          }
        }
    };
  add(3, 180);
  add(5, 12);
  add(7, 3);
  add(9, 1);
  add(11, 0.35);
  add(12, 0.2);
  add(13, 0.12);
  add(14, 0.06);
  add(15, 0.03);
  return o;
}
function packSave(lat, lon, name) {
  if (PACK.busy) return;
  if (!("caches" in window)) {
    note(
      "Offline pack",
      "This phone's web view cannot store map tiles. Safe places and numbers are still saved."
    );
    return;
  }
  var L = packTiles(lat, lon),
    urls = [];
  L.forEach(function (k) {
    urls.push(IMG_SRC[SRC_I] + k);
    if (+k.split("/")[0] >= 9) urls.push(ROAD_SRC + k);
  });
  PACK.busy = true;
  PACK.done = 0;
  PACK.tot = urls.length;
  PACK.fail = 0;
  emgDraw();
  caches
    .open("ojos-tiles")
    .then(function (c) {
      var i = 0,
        run = function () {
          if (i >= urls.length) return Promise.resolve();
          var u = urls[i++];
          return c
            .match(u)
            .then(function (m) {
              if (m) return;
              return fetch(u, { mode: "cors" }).then(function (r) {
                if (r.ok) return c.put(u, r);
                PACK.fail++;
              });
            })
            .catch(function () {
              PACK.fail++;
            })
            .then(function () {
              PACK.done++;
              if (PACK.done % 12 === 0 && EMG.open) emgDraw();
              return run();
            });
        };
      return Promise.all([run(), run(), run(), run(), run(), run()]);
    })
    .catch(function () {
      PACK.fail = PACK.tot;
    })
    .then(function () {
      PACK.busy = false;
      var ok = PACK.fail < PACK.tot * 0.5;
      if (ok)
        ls("ojos-pack", {
          lat: lat,
          lon: lon,
          name: name || "",
          t: Date.now(),
          n: PACK.tot - PACK.fail
        });
      note(
        "Offline pack",
        ok
          ? "Saved " +
              (PACK.tot - PACK.fail) +
              " map tiles for " +
              (name || "this area") +
              ". They show when there is no signal."
          : "The map tiles could not be saved. Check the connection and try again."
      );
      emgDraw();
    });
}
// ----- family check-in: one tap opens a ready text to the people you chose. Numbers stay on this phone. -----
function famList() {
  return (SET.fam || []).filter(function (x) {
    return x && x.p;
  });
}
function famSend(kind) {
  var L = famList(),
    p = EMG.pos,
    S = EMG.sit;
  if (!L.length) {
    note("Check-in", "Add at least one contact first.");
    return;
  }
  var where = p ? " https://maps.google.com/?q=" + p.lat.toFixed(5) + "," + p.lon.toFixed(5) : "",
    tx =
      (kind === "help" ? "I need help." : "I am safe.") +
      (S && S.place ? " I am in " + S.place + "." : "") +
      where +
      " (" +
      new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
      ")";
  location.href =
    "sms:" +
    L.map(function (x) {
      return x.p.replace(/[^\d+]/g, "");
    }).join(",") +
    "?body=" +
    encodeURIComponent(tx);
}
function famHTML() {
  var L = famList(),
    h = '<h4 class="mono">FAMILY CHECK-IN</h4><div class="brc">';
  if (L.length)
    h +=
      '<div class="bra"><button data-fm="safe">✓ I am safe</button><button data-fm="help">! I need help</button></div><span>Opens a text to ' +
      L.map(function (x) {
        return esc(x.n || x.p);
      }).join(", ") +
      " with your position. You press send.</span>";
  else
    h +=
      "<span>Add the people who should hear from you. One tap then opens a ready text with your position.</span>";
  if (EMG.famEdit)
    h +=
      L.map(function (x, i) {
        return (
          '<div class="brh"><span style="flex:1">' +
          esc(x.n || "") +
          " · " +
          esc(x.p) +
          '</span><button class="mini" data-fm="rm-' +
          i +
          '">Remove</button></div>'
        );
      }).join("") +
      '<form class="chq" id="famForm"><input id="famN" placeholder="Name" autocomplete="off" style="flex:.8"><input id="famP" type="tel" placeholder="Phone" autocomplete="off"><button>Add</button></form>';
  return (
    h +
    '<div class="bra"><button data-fm="edit">' +
    (EMG.famEdit ? "Done" : "Edit contacts") +
    '</button><button data-fm="pack"' +
    (PACK.busy ? " disabled" : "") +
    ">" +
    (PACK.busy ? "Saving " + PACK.done + " / " + PACK.tot : "⇩ Save this area offline") +
    "</button></div>" +
    (function () {
      var k = ls("ojos-pack");
      return k
        ? '<i class="mono">OFFLINE PACK: ' +
            esc(k.name || "AREA") +
            " · " +
            k.n +
            " TILES · " +
            new Date(k.t).toLocaleDateString() +
            "</i>"
        : "";
    })() +
    "</div>"
  );
}
document.addEventListener("submit", function (e) {
  if (e.target && e.target.id === "famForm") {
    e.preventDefault();
    var n = $("famN").value.trim(),
      p = $("famP").value.trim();
    if (p.replace(/\D/g, "").length < 5) {
      note("Check-in", "Enter a phone number.");
      return;
    }
    SET.fam = famList()
      .concat([{ n: n.slice(0, 30), p: p.slice(0, 24) }])
      .slice(0, 8);
    setSave();
    document.activeElement && document.activeElement.blur();
    emgDraw();
  }
});
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-fm]");
  if (!b) return;
  var k = b.getAttribute("data-fm");
  if (k === "safe" || k === "help") famSend(k);
  else if (k === "edit") {
    EMG.famEdit = !EMG.famEdit;
    emgDraw();
  } else if (k.indexOf("rm-") === 0) {
    var L = famList();
    L.splice(+k.slice(3), 1);
    SET.fam = L;
    setSave();
    emgDraw();
  } else if (k === "pack") {
    var p = EMG.pos || EMG.sit;
    if (!p) {
      note("Offline pack", "Waiting for your position.");
      return;
    }
    packSave(p.lat, p.lon, EMG.sit && EMG.sit.place);
  }
});
// ----- system check: is every public source answering, and has anything gone wrong? Used for day-to-day testing. -----
var ERRS = ls("ojos-errs") || [];
function errLog(m) {
  try {
    m = String(m || "").slice(0, 180);
    if (!m || /ResizeObserver|Script error\.?$/.test(m)) return;
    var last = ERRS[ERRS.length - 1];
    if (last && last.m === m) {
      last.n = (last.n || 1) + 1;
      last.t = Date.now();
    } else ERRS.push({ m: m, t: Date.now(), n: 1 });
    if (ERRS.length > 30) ERRS = ERRS.slice(-30);
    ls("ojos-errs", ERRS);
  } catch (e) {}
}
window.addEventListener("error", function (e) {
  if (e && e.message) errLog(e.message + (e.lineno ? " @" + e.lineno : ""));
});
window.addEventListener("unhandledrejection", function (e) {
  var r = e && e.reason;
  errLog("Promise: " + ((r && r.message) || r));
});
var CHK = { open: false, busy: false, res: [] };
var CHK_SRC = [
  [
    "Aircraft positions",
    "https://opensky-network.org/api/states/all?lamin=30&lamax=30.5&lomin=-98&lomax=-97.5"
  ],
  ["Aircraft register and routes", "https://api.adsbdb.com/v0/callsign/AAL1"],
  ["Earthquakes", "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"],
  ["US weather alerts", "https://api.weather.gov/alerts/active?point=30.27,-97.74"],
  ["Europe weather warnings", "https://feeds.meteoalarm.org/api/v1/warnings/feeds-luxembourg"],
  [
    "Weather",
    "https://api.open-meteo.com/v1/forecast?latitude=30&longitude=-97&current=temperature_2m"
  ],
  [
    "Air quality",
    "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=30&longitude=-97&current=us_aqi"
  ],
  ["Place search", "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=Austin"],
  [
    "Map database (safe places, plans)",
    "https://overpass-api.de/api/interpreter?data=" +
      encodeURIComponent("[out:json][timeout:10];node(1);out;")
  ],
  [
    "Routing",
    "https://router.project-osrm.org/route/v1/driving/-97.74,30.27;-97.73,30.28?overview=false"
  ],
  [
    "News",
    "https://api.gdeltproject.org/api/v2/doc/doc?query=weather&mode=artlist&maxrecords=1&format=json"
  ],
  ["Public posts", "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=weather&limit=1"],
  ["Texas business register", "https://data.texas.gov/resource/9cir-efmm.json?$limit=1"],
  ["Global company identifiers", "https://api.gleif.org/api/v1/lei-records?page[size]=1"],
  [
    "Country facts",
    "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=1&origin=*&search=Texas"
  ],
  [
    "World Bank",
    "https://api.worldbank.org/v2/country/US/indicator/SP.POP.TOTL?format=json&mrnev=1"
  ]
];
function chkRun() {
  if (CHK.busy) return;
  CHK.busy = true;
  CHK.at = Date.now();
  CHK.res = CHK_SRC.map(function (s) {
    return { n: s[0], st: 0 };
  });
  chkDraw();
  Promise.all(
    CHK_SRC.map(function (s, i) {
      var t0 = performance.now();
      return netGet(s[1], 20000, null, true)
        .then(function (x) {
          CHK.res[i].st = x != null && String(x).length > 1 ? 1 : 2;
          CHK.res[i].ms = Math.round(performance.now() - t0);
        })
        .catch(function () {
          CHK.res[i].st = 2;
        })
        .then(chkDraw);
    })
  ).then(function () {
    CHK.busy = false;
    chkDraw();
  });
}
function chkText() {
  var ok = CHK.res.filter(function (r) {
      return r.st === 1;
    }).length,
    keys = Object.keys(KEYS).filter(function (k) {
      return KEYS[k];
    }),
    L = [
      "Ojos de Dios v64 system check · " + new Date().toLocaleString(),
      "Sources answering: " + ok + " of " + CHK.res.length
    ];
  CHK.res.forEach(function (r) {
    L.push(
      (r.st === 1 ? "OK   " : r.st === 2 ? "FAIL " : "...  ") +
        r.n +
        (r.ms ? " · " + r.ms + " ms" : "")
    );
  });
  L.push(
    "Cameras loaded: " + LIVE.length,
    "Keys added (names only): " + (keys.join(", ") || "none"),
    "Screen: " + innerWidth + "×" + innerHeight + " @" + (window.devicePixelRatio || 1),
    "Device: " + navigator.userAgent.replace(/^.*?\(([^)]*)\).*$/, "$1").slice(0, 80),
    "Errors recorded: " + ERRS.length
  );
  ERRS.slice(-12).forEach(function (e) {
    L.push("  " + new Date(e.t).toLocaleString() + (e.n > 1 ? " ×" + e.n : "") + " · " + e.m);
  });
  return L.join("\n");
}
function chkDraw() {
  var el = $("chk");
  if (!el || !CHK.open) return;
  var ok = CHK.res.filter(function (r) {
      return r.st === 1;
    }).length,
    bad = CHK.res.filter(function (r) {
      return r.st === 2;
    }).length,
    h =
      '<div class="nh"><div><b class="mono">◆ SYSTEM CHECK</b><h3>' +
      (CHK.busy
        ? "Checking…"
        : CHK.res.length
          ? ok + " of " + CHK.res.length + " sources answering"
          : "Check every source") +
      '</h3></div><button data-ck="run" aria-label="Run again">⟳</button><button data-ck="x" aria-label="Close">✕</button></div><div class="nl"><p class="bre">Run this when something looks wrong. It asks each public source for one small answer and lists any errors the app recorded. Share the report to get it fixed. It contains no location, no key values and nothing you searched.</p>';
  if (CHK.res.length)
    h +=
      '<div class="brc"><table>' +
      CHK.res
        .map(function (r) {
          return (
            '<tr><td style="width:66%">' +
            esc(r.n) +
            '</td><td><em class="' +
            (r.st === 1 ? "ok" : r.st === 2 ? "bad" : "") +
            '">' +
            (r.st === 1
              ? "OK" + (r.ms ? " · " + r.ms + " ms" : "")
              : r.st === 2
                ? "No answer"
                : "…") +
            "</em></td></tr>"
          );
        })
        .join("") +
      "</table>" +
      (bad && !CHK.busy
        ? '<span class="brd">A source that does not answer is usually busy or briefly down. Try again in a few minutes before reporting it.</span>'
        : "") +
      "</div>";
  h +=
    '<h4 class="mono">ERRORS RECORDED ON THIS PHONE</h4>' +
    (ERRS.length
      ? '<div class="brc">' +
        ERRS.slice(-12)
          .reverse()
          .map(function (e) {
            return (
              "<span>" +
              esc(
                new Date(e.t).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit"
                })
              ) +
              (e.n > 1 ? " ×" + e.n : "") +
              " · " +
              esc(e.m) +
              "</span>"
            );
          })
          .join("") +
        "</div>"
      : '<p class="bre">None.</p>');
  h +=
    '<div class="brt"><button data-ck="share">➤ Share the report</button><button data-ck="clr">Clear errors</button></div><h4 class="mono">DAILY TEST</h4><div class="brc"><span>1 · Search a place, open a camera · 2 · Finder: a flight number · 3 · Drive: a route with each choice · 4 · Records: an address · 5 · Country file · 6 · Emergency mode on, then off · 7 · Photoreal 3D and Inspect · 8 · News and alerts</span></div></div><div class="nf mono">v64 · NOTHING LEAVES THIS PHONE UNLESS YOU SHARE THE REPORT</div>';
  el.innerHTML = h;
}
function chkOpen() {
  var el = $("chk");
  if (!el) {
    el = document.createElement("div");
    el.id = "chk";
    el.className = "pn";
    document.body.appendChild(el);
  }
  CHK.open = true;
  el.style.display = "flex";
  chkDraw();
  if (!CHK.res.length || Date.now() - (CHK.at || 0) > 120000) chkRun();
}
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-ck]");
  if (!b) return;
  var k = b.getAttribute("data-ck");
  if (k === "x") {
    CHK.open = false;
    $("chk").style.display = "none";
  } else if (k === "run") chkRun();
  else if (k === "clr") {
    ERRS = [];
    ls("ojos-errs", ERRS);
    chkDraw();
  } else if (k === "open") {
    try {
      brClose();
    } catch (e2) {}
    chkOpen();
  } else if (k === "share") {
    var tx = chkText();
    if (navigator.share)
      navigator.share({ title: "Ojos de Dios system check", text: tx }).catch(function () {});
    else if (navigator.clipboard)
      navigator.clipboard.writeText(tx).then(function () {
        note("System check", "Report copied.");
      });
  }
});
try {
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol))
    navigator.serviceWorker.register("sw.js").catch(function () {});
} catch (e) {}
