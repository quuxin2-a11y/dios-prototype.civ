/**
 * @file Briefing, watchlist, notifications and replay.
 * Settings, the daily briefing, watched aircraft and ships with alerts, and time replay.
 *
 * Module 15 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Briefing, watchlist, notifications, replay, first-run guide, display settings, share card ----------
var WATCH = ls("ojos-watch") || [],
  SET = ls("ojos-set") || {},
  BR = { open: false, c: {} },
  IMG_ALT = null;
var STYLES = {
  sat: ["Satellite", null],
  street: [
    "Streets",
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/"
  ],
  light: [
    "Light",
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/"
  ],
  dark: [
    "Dark",
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/"
  ]
};
function setSave() {
  ls("ojos-set", SET);
}
function styleSet(k, quiet) {
  if (!STYLES[k]) k = "sat";
  SET.style = k;
  setSave();
  if (typeof earthKey === "function" && earthKey()) {
    if (!quiet) brDraw();
    return;
  }
  imgSource(STYLES[k][1], 19, k === "light" || k === "street" ? "#cfd6da" : "#08182a");
  if (!quiet) brDraw();
}
// Switch the globe's imagery to another tile source and reload it.
function imgSource(src, maxZ, fill) {
  IMG_ALT = src;
  IMG_MAXZ = maxZ || 19;
  try {
    TILES = {};
    TN = 0;
    baseN = 0;
    patchA = null;
    patchP = null;
    if (baseCv) {
      var g = baseCv.getContext("2d");
      g.fillStyle = fill || "#08182a";
      g.fillRect(0, 0, baseCv.width, baseCv.height);
      baseTick.dirty = true;
    }
    tileDirty = true;
    lastView = "";
    lastInteract = performance.now();
  } catch (e) {}
}
function railSet(on) {
  SET.rail = !!on;
  setSave();
  document.body.classList.toggle("norail", !on);
}
function textSet(n) {
  SET.tx = n;
  setSave();
  document.body.classList.toggle("tx1", n === 1);
  document.body.classList.toggle("tx2", n === 2);
}
// ----- notifications: a toast always; a phone notification too when the app is in the background and the plugin is present -----
function notifyPlugin() {
  try {
    return (
      (window.Capacitor &&
        Capacitor.isNativePlatform &&
        Capacitor.isNativePlatform() &&
        Capacitor.Plugins &&
        Capacitor.Plugins.LocalNotifications) ||
      null
    );
  } catch (e) {
    return null;
  }
}
function notify(title, body, fn) {
  note(title, esc(body), fn);
  var P = notifyPlugin();
  if (P && SET.bg && document.hidden) {
    try {
      P.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() / 1000) % 2000000000,
            title: "Ojos de Dios · " + title,
            body: String(body).slice(0, 180)
          }
        ]
      });
    } catch (e) {}
  }
}
function notifyAsk() {
  var P = notifyPlugin();
  if (!P) {
    note(
      "Notifications",
      "This build has no notification support yet. Update the workflow file, rebuild and reinstall."
    );
    return;
  }
  P.requestPermissions()
    .then(function (r) {
      SET.bg = r && r.display === "granted";
      setSave();
      brDraw();
      if (!SET.bg)
        note(
          "Notifications",
          "Android did not grant permission. Allow notifications for Ojos de Dios in system settings."
        );
    })
    .catch(function () {});
}
// ----- watchlist: specific aircraft and ships -----
function watchHas(e) {
  return WATCH.some(function (w) {
    return w.k === e.kind && String(w.id) === String(e.id);
  });
}
function watchToggle(e) {
  if (!e || (e.kind !== "plane" && e.kind !== "ship")) return;
  if (watchHas(e))
    WATCH = WATCH.filter(function (w) {
      return !(w.k === e.kind && String(w.id) === String(e.id));
    });
  else {
    WATCH.push({ k: e.kind, id: e.id, n: e.n || String(e.id), s: "" });
    setLayer(e.kind === "plane" ? "air" : "ship", true);
    note(
      "Watching",
      esc(e.n || e.id) +
        " is on your watchlist. It appears in the Briefing, and you are told when its status changes."
    );
  }
  ls("ojos-watch", WATCH);
  if (selected === e) entDossier(e);
  brDraw();
}
function watchFind(w) {
  if (w.k === "plane") {
    for (var i = 0; i < PLANES.length; i++) if (PLANES[i].id === w.id) return PLANES[i];
    return null;
  }
  return SHIPM.get(String(w.id)) || null;
}
function watchState(w, o) {
  if (w.k === "plane") {
    if (!o) return WL.air && PLANES.length ? "gone" : "";
    return (o.alt || 0) > 250 && (o.v || 0) > 40 ? "air" : "ground";
  }
  if (!o) return "";
  return (o.sog || 0) > 1 ? "moving" : "stopped";
}
function watchLine(w, o) {
  if (!o)
    return w.k === "plane"
      ? WL.air
        ? "Not in the air right now, or out of coverage"
        : "Turn on the flights layer to track it"
      : WL.ship
        ? "No position received yet"
        : "Turn on the ships layer to track it";
  if (w.k === "plane") {
    var t =
        Math.round((o.alt || 0) * 3.281).toLocaleString() +
        " ft · " +
        Math.round((o.v || 0) * 1.944) +
        " kt",
      R = o.route;
    if (R && R.o && R.d) {
      var g = flightProgress(o, R.o, R.d);
      t =
        R.o.code +
        " → " +
        R.d.code +
        " · " +
        g.pct.toFixed(0) +
        "% · " +
        {
          on: "on course",
          near: "slightly off route",
          off: "well off route",
          arriving: "arriving",
          departing: "departing"
        }[g.st] +
        " · " +
        t;
    }
    return t;
  }
  return (
    ((o.sog || 0) > 1 ? "Under way at " + (+o.sog).toFixed(1) + " kn" : "Stopped") +
    (o.cog != null && o.cog < 360 ? " · course " + Math.round(o.cog) + "°" : "")
  );
}
function watchTick() {
  if (!WATCH.length) return;
  var ch = false;
  WATCH.forEach(function (w) {
    var o = watchFind(w),
      s = watchState(w, o);
    if (o && o.n && w.n !== o.n) {
      w.n = o.n;
      ch = true;
    }
    if (o && w.k === "plane" && o.route === undefined) loadRoute(o);
    if (s && w.s && s !== w.s) {
      var go = function () {
        var x = watchFind(w);
        if (x) {
          select(x);
          target = { lon: x.lon, lat: x.lat, z: Math.max(zoom, 6) };
        }
      };
      if (w.k === "plane")
        notify(
          "Watchlist",
          w.n +
            (s === "air"
              ? " is airborne."
              : s === "ground"
                ? " is on the ground."
                : " has landed or left coverage."),
          go
        );
      else notify("Watchlist", w.n + (s === "moving" ? " is under way." : " has stopped."), go);
    }
    if (o && w.k === "plane" && o.route && o.route.o) {
      var g = flightProgress(o, o.route.o, o.route.d);
      if (g.st === "off" && !w.off) {
        w.off = 1;
        ch = true;
        notify(
          "Watchlist",
          w.n + " is well off its direct route (" + Math.round(g.xt * 0.621) + " mi)."
        );
      } else if (g.st !== "off" && w.off) {
        w.off = 0;
        ch = true;
      }
    }
    if (s && s !== w.s) {
      w.s = s;
      ch = true;
    }
  });
  if (ch) ls("ojos-watch", WATCH);
  if (BR.open) brDraw();
}
setInterval(watchTick, 45000);
// ----- briefing -----
function brPlace(p) {
  var k = p.name + "|" + p.lat.toFixed(2),
    c = (BR.c[k] = BR.c[k] || { t: 0 });
  if (Date.now() - c.t < 10 * 60000) return c;
  c.t = Date.now();
  getJSON(
    "https://api.open-meteo.com/v1/forecast?latitude=" +
      p.lat.toFixed(3) +
      "&longitude=" +
      p.lon.toFixed(3) +
      "&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph",
    15000
  )
    .then(function (j) {
      c.wx = j && j.current;
      brDraw();
    })
    .catch(function () {});
  newsPlace(p.lat, p.lon)
    .then(function (a) {
      var nm = [a.city, a.state || a.country].filter(Boolean);
      return newsQuery(
        nm.length
          ? nm
              .map(function (x) {
                return '"' + x + '"';
              })
              .join(" ")
          : '"' + p.name + '"',
        nm.join(" ") || p.name
      );
    })
    .then(function (n) {
      c.news = n.slice(0, 3);
      brDraw();
    })
    .catch(function () {
      c.news = [];
    });
  return c;
}
function brCams(p) {
  var o = [],
    i,
    c,
    d;
  for (i = 0; i < LIVE.length; i++) {
    c = LIVE[i];
    if (Math.abs(c.lat - p.lat) > 0.5 || Math.abs(c.lon - p.lon) > 0.7) continue;
    d = hav(p.lat, p.lon, c.lat, c.lon);
    if (d <= 40) o.push([d, c]);
  }
  o.sort(function (a, b) {
    return a[0] - b[0];
  });
  return o;
}
function brDraw() {
  var el = $("brief");
  if (!el || !BR.open) return;
  var now = new Date(),
    al = NEWS.alerts.slice(0, 3),
    h,
    pl = AL.places;
  h =
    '<div class="nh"><div><b class="mono">◆ BRIEFING</b><h3>' +
    now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) +
    '</h3></div><button data-br="x" aria-label="Close">✕</button></div><div class="nl">';
  if (al.length)
    h +=
      '<h4 class="mono">RIGHT NOW</h4>' +
      al
        .map(function (a) {
          return (
            '<div class="brc l' +
            a.lvl +
            '" data-br="alerts"><b>' +
            esc(a.t) +
            '</b><i class="mono">' +
            esc(a.src) +
            " · " +
            ago(a.d) +
            "</i></div>"
          );
        })
        .join("");
  h += '<h4 class="mono">WATCHLIST</h4>';
  if (!WATCH.length)
    h +=
      '<p class="bre">Tap any aircraft or ship, then ☆ Watch, and it shows up here with its live status.</p>';
  else
    h += WATCH.map(function (w, i) {
      var o = watchFind(w);
      return (
        '<div class="brc"><div class="brh"><b>' +
        (w.k === "plane" ? "✈ " : "⛴ ") +
        esc(w.n) +
        '</b><button data-br="wx-' +
        i +
        '" aria-label="Remove">✕</button></div><span>' +
        esc(watchLine(w, o)) +
        "</span>" +
        (o
          ? '<div class="bra"><button data-br="wg-' +
            i +
            '">Show</button>' +
            (w.k === "plane" ? '<button data-br="wf-' + i + '">Flight log</button>' : "") +
            "</div>"
          : "") +
        "</div>"
      );
    }).join("");
  h += '<h4 class="mono">MY PLACES</h4>';
  if (!pl.length)
    h +=
      '<p class="bre">Save a place to get its weather, cameras and headlines here every time you open the app.</p>';
  else
    h += pl
      .map(function (p, i) {
        var c = brPlace(p),
          cams = brCams(p),
          w = c.wx;
        return (
          '<div class="brc"><div class="brh"><b>' +
          esc(p.name) +
          '</b><button data-br="px-' +
          i +
          '" aria-label="Remove">✕</button></div>' +
          "<span>" +
          (w
            ? Math.round(w.temperature_2m) +
              "°F · " +
              esc(WXN[w.weather_code] || "—") +
              " · wind " +
              Math.round(w.wind_speed_10m) +
              " mph"
            : "Weather loading…") +
          " · " +
          cams.length +
          " camera" +
          (cams.length === 1 ? "" : "s") +
          " within 25 mi</span>" +
          (cams.length
            ? '<div class="brk">' +
              cams
                .slice(0, 3)
                .map(function (q) {
                  return (
                    '<button data-br="cam-' +
                    LIVE.indexOf(q[1]) +
                    '">▸ ' +
                    esc(String(q[1].n || "Camera").slice(0, 34)) +
                    "</button>"
                  );
                })
                .join("") +
              "</div>"
            : "") +
          (c.news
            ? c.news.length
              ? c.news
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
              : '<span class="brd">No recent headlines.</span>'
            : '<span class="brd">Headlines loading…</span>') +
          '<div class="bra"><button data-br="pg-' +
          i +
          '">Go there</button><button data-br="pn-' +
          i +
          '">All news</button></div></div>'
        );
      })
      .join("");
  h += '<button class="brbig" data-br="add">＋ Save the area I am looking at</button>';
  h +=
    '<h4 class="mono">TOOLS</h4><div class="brt"><button data-br="news">◆ News desk</button><button data-br="replay">⏪ Replay</button><button data-br="share">⇪ Share view</button><button data-br="set">⚙ Settings</button><button data-br="ops">▦ Command wall</button><button data-br="cmd" class="' +
    (SET.cmd ? "on" : "") +
    '">' +
    (SET.cmd ? "● " : "○ ") +
    "Command mode</button></div>";
  if (BR.mode === "set") {
    var kn = [
      ["gmaps", "Google Maps"],
      ["windy", "Windy"],
      ["ais", "AISStream"],
      ["adb", "AeroDataBox"],
      ["oc", "OpenCorporates"],
      ["txc", "Texas Comptroller"],
      ["ch", "Companies House"],
      ["x", "X"]
    ];
    h =
      '<div class="nh"><div><b class="mono">◆ SETTINGS</b><h3>Ojos de Dios</h3></div><button data-br="x" aria-label="Close">✕</button></div><div class="nl"><h4 class="mono">KEYS</h4><div class="brc"><span>' +
      kn
        .map(function (q) {
          return (KEYS[q[0]] ? "● " : "○ ") + q[1];
        })
        .join("  ·  ") +
      '</span><div class="bra"><button data-br="keys">Manage keys</button><button data-br="guide">? Guide</button></div></div>';
  }
  if (BR.mode !== "set") {
    h +=
      '</div><div class="nf mono">WEATHER: OPEN-METEO · HEADLINES: GDELT, GOOGLE NEWS · ALERTS: OFFICIAL FEEDS</div>';
    var scb = el.querySelector(".nl"),
      stb = scb ? scb.scrollTop : 0;
    el.innerHTML = h;
    scb = el.querySelector(".nl");
    if (scb) scb.scrollTop = stb;
    return;
  }
  h +=
    '<h4 class="mono">MAP STYLE</h4><div class="brt">' +
    Object.keys(STYLES)
      .map(function (k) {
        return (
          '<button data-br="st-' +
          k +
          '" class="' +
          ((SET.style || "sat") === k ? "on" : "") +
          '">' +
          STYLES[k][0] +
          "</button>"
        );
      })
      .join("") +
    "</div>";
  // How the map is drawn: for phones whose graphics chip flickers with one of them.
  h +=
    '<h4 class="mono">EMERGENCY ALERTS</h4><div class="brt c1"><button data-br="am" class="' +
    (amOn() ? "on" : "") +
    '">' +
    (amOn() ? "● " : "○ ") +
    'Alerts for my location</button><button data-br="amtest">Test the alert screen</button></div><p class="brhint">Official National Weather Service warnings for where you are (US) take over the screen with a tone, and arrive as notifications while the app is closed. Your phone\'s own Wireless Emergency Alerts still come from your carrier.</p>' +
    '<h4 class="mono">PLACES I CARE ABOUT</h4><div class="amplaces">' +
    AL.places
      .map(function (p, i) {
        var busy = OFF.busy === i;
        return (
          "<span>" +
          esc(p.name) +
          (p.phone ? ' <i title="Has a phone number">💬</i>' : "") +
          '<button data-br="ampk-' +
          i +
          '" aria-label="Save the map of ' +
          esc(p.name) +
          ' for use without signal" class="' +
          (p.off ? "done" : "") +
          '">' +
          (busy ? "…" : p.off ? "✓ OFFLINE" : "⇩ OFFLINE") +
          '</button><button data-br="amrm-' +
          i +
          '" aria-label="Stop watching ' +
          esc(p.name) +
          '">✕</button></span>'
        );
      })
      .join("") +
    '</div><form class="amform" id="amForm"><input id="amQ" type="search" placeholder="Address or city" autocomplete="off"><input id="amN" type="text" placeholder="Name: Home, Mom…" autocomplete="off" maxlength="28"><input id="amP" type="tel" placeholder="Their phone (optional)" autocomplete="off" maxlength="20"><button>Add</button></form><p class="brhint">Warnings for these places reach you wherever you are, up to 8 places. With a phone number, the warning offers a ready text: are you OK? ⇩ OFFLINE saves the map around a place so it still shows without signal. Numbers stay on this phone.</p>' +
    '<h4 class="mono">RECENT ALERTS</h4>' +
    amHistHtml() +
    '<h4 class="mono">CAMERAS</h4><div class="brt c1"><button data-br="cpauto" class="' +
    (SET.cpAuto !== false ? "on" : "") +
    '">' +
    (SET.cpAuto !== false ? "● " : "○ ") +
    'Camera tiles when zoomed in</button></div><p class="brhint">Zoom into a city and the nearest live cameras appear as tiles beside their spots on the map. Drag a tile to move it.</p>' +
    '<h4 class="mono">LAYERS</h4><div class="brt c1"><button data-br="zoomlayers" class="' +
    (SET.zoomLayers !== false ? "on" : "") +
    '">' +
    (SET.zoomLayers !== false ? "● " : "○ ") +
    'Layers follow the zoom</button></div><p class="brhint">Layers you switch on show only where they are useful: close-up ones like bikes, pharmacies and buildings when zoomed in, worldwide ones like satellites, economy and country facts when zoomed out. Double-tap a layer to show only it, at any zoom.</p>' +
    '<h4 class="mono">DISPLAY</h4><div class="brt c3">' +
    [
      ["globe", "Globe"],
      ["hybrid", "Smooth globe"],
      ["flat", "Flat map"]
    ]
      .map(function (o) {
        return (
          '<button data-br="dp-' +
          o[0] +
          '" class="' +
          (displayMode() === o[0] ? "on" : "") +
          '">' +
          o[1] +
          "</button>"
        );
      })
      .join("") +
    '</div><p class="brhint">If the globe flickers or shows lines on your phone, choose Smooth globe: a round globe from space that turns into the flat map as you zoom in. Your data and layers stay the same.</p>';
  h +=
    '<h4 class="mono">TESTING</h4><div class="brt c1"><button data-ck="open">◆ System check and error report</button></div><h4 class="mono">SPEED</h4><div class="brt c3">' +
    ["Smooth", "Balanced", "Sharp"]
      .map(function (n, i) {
        return (
          '<button data-br="pf-' +
          i +
          '" class="' +
          ((SET.perf == null ? 1 : SET.perf) === i ? "on" : "") +
          '">' +
          n +
          "</button>"
        );
      })
      .join("") +
    '</div><h4 class="mono">INSPECT</h4><div class="brt"><button data-br="rl-1" class="' +
    (SET.real !== false ? "on" : "") +
    '">Records only</button><button data-br="rl-0" class="' +
    (SET.real === false ? "on" : "") +
    '">Full zoom to atom</button></div><h4 class="mono">TEXT SIZE</h4><div class="brt c3">' +
    ["Standard", "Large", "Largest"]
      .map(function (n, i) {
        return (
          '<button data-br="tx-' +
          i +
          '" class="' +
          ((SET.tx || 0) === i ? "on" : "") +
          '">' +
          n +
          "</button>"
        );
      })
      .join("") +
    "</div>";
  h +=
    '<h4 class="mono">OPTIONS</h4><div class="brt c1"><button data-br="bg" class="' +
    (SET.bg ? "on" : "") +
    '">' +
    (SET.bg ? "● " : "○ ") +
    'Notify me in the background</button><button data-br="auto" class="' +
    (SET.brief !== false ? "on" : "") +
    '">' +
    (SET.brief !== false ? "● " : "○ ") +
    'Open this at launch</button><button data-br="cmd" class="' +
    (SET.cmd ? "on" : "") +
    '">' +
    (SET.cmd ? "● " : "○ ") +
    'Command mode (status strip, live ticker, start-up sequence)</button><button data-br="rail" class="' +
    (SET.rail !== false ? "on" : "") +
    '">' +
    (SET.rail !== false ? "● " : "○ ") +
    "Show the Layers panel on the map</button></div>";
  h +=
    '<h4 class="mono">DATA</h4><div class="brt"><button data-br="report">Live report (PDF)</button><button data-br="clearbc">Reset dismissed alerts</button></div><h4 class="mono">ABOUT</h4><div class="brc"><span>Version ' +
    APP_V +
    ' · © 2026 Mark Joseph</span><div class="bra"><a class="brl" href="https://github.com/quuxin2-a11y/dios-prototype.civ/blob/main/PRIVACY.md" target="_blank" rel="noopener">Privacy</a><a class="brl" href="https://github.com/quuxin2-a11y/dios-prototype.civ/blob/main/THIRD-PARTY.md" target="_blank" rel="noopener">Sources and credits</a></div></div>';
  h += '</div><div class="nf mono">EVERYTHING HERE STAYS ON THIS DEVICE</div>';
  var sc = el.querySelector(".nl"),
    st = sc ? sc.scrollTop : 0;
  el.innerHTML = h;
  sc = el.querySelector(".nl");
  if (sc) sc.scrollTop = st;
}
function brOpen(mode) {
  BR.mode = mode || "brief";
  var el = $("brief");
  if (!el) {
    el = document.createElement("div");
    el.id = "brief";
    document.body.appendChild(el);
  }
  BR.open = true;
  el.style.display = "flex";
  brDraw();
  if (Date.now() - NEWS.at > 2 * 60000) newsAlerts();
}
function brClose() {
  BR.open = false;
  var el = $("brief");
  if (el) el.style.display = "none";
}
document.addEventListener("click", function (e) {
  if (e.target.closest("#bBrief")) {
    brOpen();
    return;
  }
  if (e.target.closest("#bSet")) {
    brOpen("set");
    return;
  }
  if (e.target.closest("#bShare")) {
    shareCard();
    return;
  }
  var w = e.target.closest("[data-wt]");
  if (w) {
    watchToggle(selected);
    return;
  }
  var b = e.target.closest("[data-br]");
  if (!b) return;
  var k = b.getAttribute("data-br"),
    i = +k.slice(k.indexOf("-") + 1),
    p;
  if (k === "x") brClose();
  else if (k === "alerts") {
    brClose();
    newsOpen("alerts");
  } else if (k === "news") {
    brClose();
    newsOpen();
  } else if (k === "replay") {
    brClose();
    rpOpen();
  } else if (k === "share") {
    brClose();
    setTimeout(shareCard, 250);
  } else if (k === "guide") {
    brClose();
    onbOpen();
  } else if (k === "set") {
    BR.mode = "set";
    brDraw();
    var sx = $("brief").querySelector(".nl");
    if (sx) sx.scrollTop = 0;
  } else if (k === "keys") {
    brClose();
    openKeys();
  } else if (k === "report") {
    brClose();
    liveReport();
  } else if (k === "clearbc") {
    NEWS.seen = {};
    ls("ojos-bc", {});
    newsMerge();
    note("Alerts", "Dismissed broadcasts will show again if they are still active.");
  } else if (k === "am") {
    SET.alertMe = !amOn();
    setSave();
    brDraw();
    AM.natAt = 0;
    if (SET.alertMe) {
      AM.ask = true; // turning it on is the moment to ask for location
      amCheck();
    } else natCall("setAlertWatch", { on: false, places: [] });
  } else if (k === "zoomlayers") {
    SET.zoomLayers = SET.zoomLayers === false;
    setSave();
    wlZoomCheck();
    brDraw();
  } else if (k === "cpauto") {
    SET.cpAuto = SET.cpAuto === false;
    setSave();
    if (!SET.cpAuto && CP.open && CP.auto) cpClose();
    brDraw();
  } else if (k.indexOf("amh-") === 0) {
    brClose();
    amAgain(+k.slice(4));
  } else if (k.indexOf("ampk-") === 0) {
    offPlace(+k.slice(5));
  } else if (k.indexOf("amrm-") === 0) {
    AL.places.splice(+k.slice(5), 1);
    alSave();
    AM.natKey = "";
    amNative();
    brDraw();
  } else if (k === "amtest") {
    brClose();
    amTest();
  } else if (k === "bg") {
    if (SET.bg) {
      SET.bg = false;
      setSave();
      brDraw();
    } else notifyAsk();
  } else if (k === "auto") {
    SET.brief = SET.brief === false;
    setSave();
    brDraw();
  } else if (k.indexOf("dp-") === 0) {
    // Close Settings so the new drawing can be judged straight away.
    brClose();
    displaySet(k.slice(3));
  } else if (k === "rail") {
    railSet(SET.rail === false);
    brDraw();
  } else if (k === "cmd") {
    brClose();
    cmdSet(!SET.cmd);
  } else if (k === "ops") {
    brClose();
    opsOpen();
  } else if (k.indexOf("st-") === 0) styleSet(k.slice(3));
  else if (k.indexOf("tx-") === 0) {
    textSet(i);
    brDraw();
  } else if (k.indexOf("pf-") === 0) {
    perfSet(+k.slice(3));
    brDraw();
  } else if (k.indexOf("rl-") === 0) {
    SET.real = k === "rl-1";
    setSave();
    brDraw();
  } else if (k.indexOf("wx-") === 0) {
    WATCH.splice(i, 1);
    ls("ojos-watch", WATCH);
    brDraw();
  } else if (k.indexOf("wg-") === 0 || k.indexOf("wf-") === 0) {
    var o = watchFind(WATCH[i]);
    if (o) {
      brClose();
      select(o);
      target = { lon: o.lon, lat: o.lat, z: Math.max(zoom, 6) };
      if (k.charAt(1) === "f") flogOpen(o);
    }
  } else if (k.indexOf("px-") === 0) {
    AL.places.splice(i, 1);
    alSave();
    brDraw();
  } else if (k.indexOf("pg-") === 0 || k.indexOf("pn-") === 0) {
    p = AL.places[i];
    if (p) {
      brClose();
      selected = null;
      target = { lon: p.lon, lat: p.lat, z: Math.max(zoom, 40) };
      rot.lon = p.lon;
      rot.lat = p.lat;
      if (T4.on && T4.v) {
        T4.h = 0;
        t4Fly(p.lon, p.lat, 2500, 0);
      }
      if (k.charAt(1) === "n")
        setTimeout(function () {
          newsOpen("here");
          newsLoad(true);
        }, 500);
    }
  } else if (k.indexOf("cam-") === 0) {
    var c = LIVE[i];
    if (c) {
      brClose();
      select(c);
      target = { lon: c.lon, lat: c.lat, z: Math.max(zoom, 60) };
    }
  } else if (k === "add") {
    var ctr = newsCentre();
    b.textContent = "Saving…";
    newsPlace(ctr[0], ctr[1]).then(function (a) {
      var nm =
        [a.city, a.state || a.country].filter(Boolean).join(", ") ||
        ctr[0].toFixed(2) + ", " + ctr[1].toFixed(2);
      if (
        !AL.places.some(function (x) {
          return x.name === nm;
        })
      ) {
        AL.places.push({ name: nm, lat: ctr[0], lon: ctr[1] });
        alSave();
      }
      brDraw();
    });
  }
});
// ----- replay: scrub back through the aircraft and ship positions recorded since the app was opened, and radar frames -----
var RP = { snaps: [], on: false, i: 0, live: null, pl: null, sh: null };
function rpRecord() {
  if (RP.on || document.hidden) return;
  var np = WL.air ? Math.min(PLANES.length, 5000) : 0,
    ns = WL.ship ? Math.min(SHIPS.length, 3000) : 0;
  if (!np && !ns) return;
  var s = {
      t: Date.now(),
      pi: [],
      pn: [],
      pf: new Float32Array(np * 5),
      si: [],
      sn: [],
      sf: new Float32Array(ns * 4)
    },
    i,
    a;
  for (i = 0; i < np; i++) {
    a = PLANES[i];
    s.pi.push(a.id);
    s.pn.push(a.n);
    s.pf[i * 5] = a.lon;
    s.pf[i * 5 + 1] = a.lat;
    s.pf[i * 5 + 2] = a.trk || 0;
    s.pf[i * 5 + 3] = a.alt || 0;
    s.pf[i * 5 + 4] = a.v || 0;
  }
  for (i = 0; i < ns; i++) {
    a = SHIPS[i];
    s.si.push(a.id);
    s.sn.push(a.n);
    s.sf[i * 4] = a.lon;
    s.sf[i * 4 + 1] = a.lat;
    s.sf[i * 4 + 2] = a.cog || 0;
    s.sf[i * 4 + 3] = a.sog || 0;
  }
  RP.snaps.push(s);
  if (RP.snaps.length > 60) RP.snaps.shift();
}
setInterval(rpRecord, 60000);
setTimeout(rpRecord, 20000);
function rpShow(i) {
  var s = RP.snaps[i];
  if (!s) return;
  RP.i = i;
  var k,
    pl = [],
    sh = [];
  for (k = 0; k < s.pi.length; k++)
    pl.push({
      kind: "plane",
      id: s.pi[k],
      n: s.pn[k],
      lon: s.pf[k * 5],
      lat: s.pf[k * 5 + 1],
      trk: s.pf[k * 5 + 2],
      alt: s.pf[k * 5 + 3],
      v: 0,
      spd: s.pf[k * 5 + 4],
      route: false
    });
  for (k = 0; k < s.si.length; k++)
    sh.push({
      kind: "ship",
      id: s.si[k],
      n: s.sn[k],
      lon: s.sf[k * 4],
      lat: s.sf[k * 4 + 1],
      cog: s.sf[k * 4 + 2],
      sog: s.sf[k * 4 + 3]
    });
  RP.pl = pl;
  RP.sh = sh;
  PLANES = pl;
  SHIPS = sh;
  try {
    if (RAD.past && WL.radar) {
      var f =
        RAD.past
          .filter(function (x) {
            return x.time * 1000 <= s.t + 5 * 60000;
          })
          .pop() || RAD.past[0];
      if (f && f.path !== RAD.path) {
        RAD.path = f.path;
        RAD.time = f.time;
        RAD.tiles = {};
        RAD.q = [];
        RAD.n = 0;
        RAD.P = null;
        if (RAD.cv) {
          RAD.cv.getContext("2d").clearRect(0, 0, RAD.cv.width, RAD.cv.height);
          RAD.dirty = true;
        }
      }
    }
  } catch (e) {}
  lastView = "";
  lastInteract = performance.now();
  var el = $("rpt");
  if (el)
    el.textContent =
      new Date(s.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
      " · " +
      Math.max(0, Math.round((Date.now() - s.t) / 60000)) +
      " min ago";
}
function rpOpen() {
  rpRecord();
  if (RP.snaps.length < 2) {
    note(
      "Replay",
      "Replay shows what the app has recorded since you opened it, one frame a minute. Turn on flights or ships, leave it running a few minutes, then come back."
    );
    return;
  }
  var el = $("rpbar");
  if (!el) {
    el = document.createElement("div");
    el.id = "rpbar";
    document.body.appendChild(el);
  }
  RP.on = true;
  RP.live = { p: PLANES, s: SHIPS };
  document.body.classList.add("replay");
  el.innerHTML =
    '<b class="mono">⏪ REPLAY</b><input type="range" id="rpr" min="0" max="' +
    (RP.snaps.length - 1) +
    '" value="' +
    (RP.snaps.length - 1) +
    '" step="1"><span id="rpt" class="mono"></span><button data-rp="play" aria-label="Play">▶</button><button data-rp="x">LIVE</button>';
  el.style.display = "flex";
  $("rpr").addEventListener("input", function () {
    rpStop();
    rpShow(+this.value);
  });
  rpShow(RP.snaps.length - 1);
}
function rpStop() {
  if (RP.tm) {
    clearInterval(RP.tm);
    RP.tm = 0;
  }
}
function rpClose() {
  rpStop();
  if (!RP.on) return;
  RP.on = false;
  document.body.classList.remove("replay");
  var el = $("rpbar");
  if (el) el.style.display = "none";
  if (RP.live) {
    PLANES = RP.live.p;
    SHIPS = Array.from(SHIPM.values());
  }
  RP.live = null;
  if (WL.radar)
    try {
      RAD.path = "";
      loadRadar();
    } catch (e) {}
  lastView = "";
  lastInteract = performance.now();
}
setInterval(function () {
  if (!RP.on) return;
  if (PLANES !== RP.pl) {
    RP.live.p = PLANES;
    PLANES = RP.pl;
  }
  if (SHIPS !== RP.sh) {
    RP.live.s = SHIPS;
    SHIPS = RP.sh;
  }
}, 400);
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-rp]");
  if (!b) return;
  if (b.getAttribute("data-rp") === "x") {
    rpClose();
    return;
  }
  if (RP.tm) {
    rpStop();
    return;
  }
  var r = $("rpr");
  if (+r.value >= RP.snaps.length - 1) r.value = 0;
  RP.tm = setInterval(function () {
    var v = +r.value + 1;
    if (v > RP.snaps.length - 1) {
      rpStop();
      return;
    }
    r.value = v;
    rpShow(v);
  }, 700);
  rpShow(+r.value);
});
// ----- first-run guide -----
var ONB = [
  [
    "SEE",
    "Every public camera, live",
    "More than fifty thousand cameras that agencies publish for the public, on one globe. Add flights, ships, satellites, weather radar and earthquakes from the Layers panel."
  ],
  [
    "KNOW",
    "What is happening, and where",
    "The News desk gives the latest headlines for whatever you are looking at. A red Broadcast bar appears when something nationwide happens. Tap a plane for its Flight log."
  ],
  [
    "EXPLORE",
    "Go down to street level",
    "Static 3D view opens real 3D cities. Inspect takes a building, plane, ship or satellite apart. Save places and aircraft to your Briefing."
  ],
  [
    "SET UP",
    "Two keys unlock the rest",
    "A Google Maps key turns on Street View and 3D cities. A free Windy key adds tens of thousands more webcams. Both stay on this device."
  ]
];
function onbDraw(i) {
  var el = $("onb"),
    s = ONB[i],
    last = i === ONB.length - 1;
  el.innerHTML =
    '<div class="onc"><svg class="omark" viewBox="0 0 48 48" width="54" height="54"><path d="M24 3 45 24 24 45 3 24Z" fill="none" stroke="#3fe0d0" stroke-width="2"/><path d="M24 12 36 24 24 36 12 24Z" fill="none" stroke="#3fe0d0" stroke-width="2"/><path d="M24 19 29 24 24 29 19 24Z" fill="#3fe0d0"/></svg><b class="mono">' +
    s[0] +
    "</b><h2>" +
    s[1] +
    "</h2><p>" +
    s[2] +
    '</p><div class="ond">' +
    ONB.map(function (x, k) {
      return '<i class="' + (k === i ? "on" : "") + '"></i>';
    }).join("") +
    '</div><div class="ona">' +
    (last
      ? '<button data-ob="keys">Add keys</button><button data-ob="done" class="pri">Start</button>'
      : '<button data-ob="done">Skip</button><button data-ob="n-' +
        (i + 1) +
        '" class="pri">Next</button>') +
    "</div></div>";
}
function onbOpen() {
  var el = $("onb");
  if (!el) {
    el = document.createElement("div");
    el.id = "onb";
    document.body.appendChild(el);
  }
  el.style.display = "flex";
  onbDraw(0);
}
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-ob]");
  if (!b) return;
  var k = b.getAttribute("data-ob");
  if (k.indexOf("n-") === 0) {
    onbDraw(+k.slice(2));
    return;
  }
  ls("ojos-onb", true);
  $("onb").style.display = "none";
  if (k === "keys") openKeys();
});
// ----- share card: the current view with the brand, a caption and the time -----
function shareCard() {
  lastView = "";
  lastInteract = performance.now();
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      var W2 = 1080,
        H2 = 1350,
        cv = document.createElement("canvas");
      cv.width = W2;
      cv.height = H2;
      var g = cv.getContext("2d"),
        srcs = [],
        credit = "Imagery © Esri, Maxar";
      try {
        if (T4.on && T4.v) {
          T4.v.render();
          srcs = [T4.v.canvas];
          credit = "3D imagery © Google";
        } else
          srcs = [$("gl"), document.querySelector("#map canvas") || $("map")].filter(function (c) {
            return c && c.width && c.getContext;
          });
      } catch (e) {}
      g.fillStyle = "#05080c";
      g.fillRect(0, 0, W2, H2);
      var ok = false;
      srcs.forEach(function (c) {
        try {
          var sc = Math.max(W2 / c.width, H2 / c.height),
            w = c.width * sc,
            h = c.height * sc;
          g.drawImage(c, (W2 - w) / 2, (H2 - h) / 2, w, h);
          ok = true;
        } catch (e) {}
      });
      var gr = g.createLinearGradient(0, 0, 0, H2);
      gr.addColorStop(0, "rgba(3,7,11,.82)");
      gr.addColorStop(0.2, "rgba(3,7,11,0)");
      gr.addColorStop(0.72, "rgba(3,7,11,0)");
      gr.addColorStop(1, "rgba(3,7,11,.92)");
      g.fillStyle = gr;
      g.fillRect(0, 0, W2, H2);
      g.strokeStyle = "#3fe0d0";
      g.lineWidth = 4;
      var dm = function (r) {
        g.beginPath();
        g.moveTo(96, 96 - r);
        g.lineTo(96 + r, 96);
        g.lineTo(96, 96 + r);
        g.lineTo(96 - r, 96);
        g.closePath();
      };
      dm(44);
      g.stroke();
      dm(26);
      g.stroke();
      dm(10);
      g.fillStyle = "#3fe0d0";
      g.fill();
      g.fillStyle = "#fff";
      g.font = "600 40px Inter,system-ui,sans-serif";
      g.textBaseline = "middle";
      var x = 168,
        tx = "OJOS DE DIOS".split("");
      tx.forEach(function (ch) {
        g.fillText(ch, x, 84);
        x += g.measureText(ch).width + 13;
      });
      g.fillStyle = "#3fe0d0";
      g.font = "500 24px ui-monospace,Menlo,monospace";
      g.fillText("Eyes open. Always.", 168, 128);
      var cap =
          selected && selected.n
            ? String(selected.n)
            : NEWS.area
              ? [NEWS.area.city, NEWS.area.state || NEWS.area.country].filter(Boolean).join(", ")
              : "",
        when = new Date().toLocaleString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit"
        });
      g.fillStyle = "#3fe0d0";
      g.fillRect(64, H2 - 208, 52, 4);
      g.fillStyle = "#fff";
      g.font = "600 50px Inter,system-ui,sans-serif";
      var line = cap || "Live view";
      while (g.measureText(line).width > W2 - 128 && line.length > 8) line = line.slice(0, -2);
      if (line !== (cap || "Live view")) line += "…";
      g.fillText(line, 64, H2 - 150);
      g.fillStyle = "rgba(255,255,255,.72)";
      g.font = "500 26px ui-monospace,Menlo,monospace";
      g.fillText(when.toUpperCase(), 64, H2 - 96);
      g.fillStyle = "rgba(255,255,255,.5)";
      g.font = "400 20px Inter,system-ui,sans-serif";
      g.fillText(credit, 64, H2 - 48);
      var url;
      try {
        url = cv.toDataURL("image/jpeg", 0.9);
      } catch (e) {
        note("Share", "This view could not be captured. Try the globe or Photoreal 3D.");
        return;
      }
      if (!ok) {
        note("Share", "Nothing to capture yet. Wait for the map to load and try again.");
        return;
      }
      var name =
          "ojos-de-dios-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-") + ".jpg",
        P = null;
      try {
        P =
          window.Capacitor &&
          Capacitor.isNativePlatform &&
          Capacitor.isNativePlatform() &&
          Capacitor.Plugins;
      } catch (e) {}
      if (P && P.Filesystem && P.Share) {
        P.Filesystem.writeFile({ path: name, data: url.split(",")[1], directory: "CACHE" })
          .then(function (w) {
            return P.Share.share({
              title: "Ojos de Dios",
              dialogTitle: "Share this view",
              files: [w.uri]
            });
          })
          .catch(function (e) {
            if (!/cancel/i.test(String(e && e.message)))
              note("Share", "Could not open the share sheet.");
          });
        return;
      }
      try {
        var a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        note("Share", "Saved " + name);
      } catch (e) {}
    });
  });
}
// ----- start-up -----
if (SET.rail === false) document.body.classList.add("norail");
if (SET.style && SET.style !== "sat") styleSet(SET.style, true);
if (SET.tx) textSet(SET.tx);
setTimeout(function () {
  if (ls("ojos-onb") !== true) onbOpen();
  else if (SET.brief !== false && (AL.places.length || WATCH.length)) brOpen();
}, 2600);
