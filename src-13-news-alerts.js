/**
 * @file News desk and official alerts.
 * RSS and official feeds (FAA, NWS, GDACS, USGS), de-duplication and placement of stories on the
 * map, and the ticker.
 *
 * Module 13 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- News desk: latest headlines for any area, official alerts, and a system-wide broadcast ----------
// Headlines: GDELT (open data) first, Google News RSS as the fallback. Alerts come only from official feeds:
// FAA airspace status, US National Weather Service, GDACS (UN/EU disaster alerts) and USGS. Nothing is invented or summarised.
var NEWS = {
  tab: "here",
  area: null,
  here: [],
  nat: [],
  world: [],
  alerts: [],
  ht: 0,
  at: 0,
  hk: "",
  busy: false,
  bc: null,
  seen: ls("ojos-bc") || {},
  open: false
};
function newsPlace(lat, lon) {
  return getJSON(
    "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=" +
      lat.toFixed(4) +
      "&lon=" +
      lon.toFixed(4),
    12000
  )
    .then(function (j) {
      var a = (j && j.address) || {};
      return {
        lat: lat,
        lon: lon,
        city: a.city || a.town || a.village || a.municipality || a.county || "",
        state: a.state || a.region || "",
        country: a.country || "",
        cc: (a.country_code || "us").toUpperCase()
      };
    })
    .catch(function () {
      return { lat: lat, lon: lon, city: "", state: "", country: "", cc: "US" };
    });
}
function newsRss(x) {
  var d = new DOMParser().parseFromString(x, "text/xml"),
    o = [];
  [].slice.call(d.getElementsByTagName("item"), 0, 40).forEach(function (it) {
    var g = function (n) {
        var e = it.getElementsByTagName(n)[0];
        return e ? e.textContent.trim() : "";
      },
      t = g("title"),
      src = g("source");
    if (src && t.slice(-src.length - 3) === " - " + src) t = t.slice(0, -src.length - 3);
    if (t) o.push({ t: t, u: g("link"), src: src, d: Date.parse(g("pubDate")) || 0 });
  });
  return o;
}
function newsClean(a) {
  var seen = {},
    o = [];
  a.sort(function (x, y) {
    return y.d - x.d;
  }).forEach(function (x) {
    var k = String(x.t || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .slice(0, 60);
    if (!k || seen[k] || !/^https?:/.test(x.u || "")) return;
    seen[k] = 1;
    o.push(x);
  });
  return o.slice(0, 40);
}
function newsQuery(gq, rq) {
  var g =
      "https://api.gdeltproject.org/api/v2/doc/doc?query=" +
      encodeURIComponent(gq + " sourcelang:english") +
      "&mode=artlist&maxrecords=40&format=json&sort=datedesc&timespan=36h",
    r =
      "https://news.google.com/rss/search?q=" +
      encodeURIComponent(rq + " when:2d") +
      "&hl=en-US&gl=US&ceid=US:en";
  var a = getJSON(g, 15000)
      .then(function (j) {
        return ((j && j.articles) || []).map(function (x) {
          var s = String(x.seendate || "");
          return {
            t: String(x.title || "").replace(/\s+([,.:;!?])/g, "$1"),
            u: x.url,
            src: x.domain,
            d:
              Date.UTC(
                +s.slice(0, 4),
                +s.slice(4, 6) - 1,
                +s.slice(6, 8),
                +s.slice(9, 11),
                +s.slice(11, 13)
              ) || 0
          };
        });
      })
      .catch(function () {
        return [];
      }),
    b = getText(r)
      .then(newsRss)
      .catch(function () {
        return [];
      });
  return Promise.all([a, b]).then(function (x) {
    return newsClean(x[0].concat(x[1]));
  });
}
function newsTop(cc) {
  var c = /^[A-Z]{2}$/.test(cc) ? cc : "US";
  return getText("https://news.google.com/rss?hl=en-" + c + "&gl=" + c + "&ceid=" + c + ":en")
    .then(newsRss)
    .then(newsClean)
    .catch(function () {
      return [];
    });
}
function newsWorld() {
  return Promise.all([
    getText("https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en")
      .then(newsRss)
      .catch(function () {
        return [];
      }),
    newsQuery(
      '(breaking OR emergency OR evacuation OR "state of emergency")',
      "breaking news world"
    ).catch(function () {
      return [];
    })
  ]).then(function (x) {
    return newsClean(x[0].concat(x[1]));
  });
}
function newsCentre() {
  if (selected && selected.lat != null) return [selected.lat, selected.lon];
  if (T4.on && T4.v) {
    try {
      var c = T4.v.camera.positionCartographic;
      return [c.latitude / D, c.longitude / D];
    } catch (e) {}
  }
  return [rot.lat, rot.lon];
}
function newsLoad(force) {
  var c = newsCentre(),
    k = c[0].toFixed(1) + "," + c[1].toFixed(1);
  if (NEWS.busy || (!force && k === NEWS.hk && Date.now() - NEWS.ht < 4 * 60000)) return;
  NEWS.busy = true;
  NEWS.hk = k;
  newsDraw();
  newsPlace(c[0], c[1])
    .then(function (p) {
      NEWS.area = p;
      var nm = [p.city, p.state || p.country].filter(Boolean),
        gq = nm.length
          ? nm
              .map(function (x) {
                return '"' + x + '"';
              })
              .join(" ")
          : '"' + (p.country || "world") + '"';
      return Promise.all([
        newsQuery(gq, nm.join(" ") || p.country || "world"),
        newsTop(p.cc),
        newsWorld()
      ]);
    })
    .then(function (r) {
      NEWS.here = r[0];
      NEWS.nat = r[1];
      NEWS.world = r[2];
      NEWS.ht = Date.now();
      newsScan();
    })
    .catch(function () {})
    .then(function () {
      NEWS.busy = false;
      newsDraw();
    });
}
// ----- official alerts -----
function newsFAA() {
  return getText("https://nasstatus.faa.gov/api/airport-status-information")
    .then(function (x) {
      var d = new DOMParser().parseFromString(x, "text/xml"),
        tx = function (n, tag) {
          var e = n.getElementsByTagName(tag)[0];
          return e ? e.textContent.trim() : "";
        },
        gs = [].slice.call(d.getElementsByTagName("Ground_Stop_List")).reduce(function (a, l) {
          return a.concat([].slice.call(l.getElementsByTagName("Program")));
        }, []),
        cl = [].slice.call(d.getElementsByTagName("Airport_Closure_List")).reduce(function (a, l) {
          return a.concat([].slice.call(l.getElementsByTagName("Airport")));
        }, []),
        o = [];
      var ap = gs
          .map(function (p) {
            return tx(p, "ARPT");
          })
          .filter(Boolean),
        why = {};
      gs.forEach(function (p) {
        var r = tx(p, "Reason");
        if (r) why[r] = 1;
      });
      if (ap.length)
        o.push({
          id: "faa-gs-" + ap.slice().sort().join(""),
          lvl: ap.length >= 10 ? 3 : ap.length >= 4 ? 2 : 1,
          t:
            (ap.length >= 10
              ? "Widespread ground stops: flights held at " + ap.length + " US airports"
              : "Ground stop" +
                (ap.length > 1 ? "s" : "") +
                " at " +
                ap.length +
                " US airport" +
                (ap.length > 1 ? "s" : "")) +
            " (" +
            ap.slice(0, 12).join(", ") +
            (ap.length > 12 ? "…" : "") +
            ")",
          sub: Object.keys(why).slice(0, 3).join(" · "),
          src: "FAA",
          u: "https://nasstatus.faa.gov/",
          d: Date.now()
        });
      if (cl.length)
        o.push({
          id: "faa-cl-" + cl.length,
          lvl: cl.length >= 6 ? 2 : 1,
          t:
            cl.length +
            " US airport closure" +
            (cl.length > 1 ? "s" : "") +
            " in effect (" +
            cl
              .slice(0, 10)
              .map(function (p) {
                return tx(p, "ARPT");
              })
              .join(", ") +
            ")",
          sub: "",
          src: "FAA",
          u: "https://nasstatus.faa.gov/",
          d: Date.now()
        });
      return o;
    })
    .catch(function () {
      return [];
    });
}
var NWS_BIG =
  /^(Tsunami Warning|Civil Danger Warning|Civil Emergency Message|Nuclear Power Plant Warning|Radiological Hazard Warning|Hazardous Materials Warning|Shelter In Place Warning|Evacuation Immediate|Extreme Wind Warning)$/;
function newsNWS() {
  return getJSON("https://api.weather.gov/alerts/active?status=actual&severity=Extreme", 20000)
    .then(function (j) {
      var by = {};
      ((j && j.features) || []).forEach(function (f) {
        var p = f.properties || {},
          e = p.event || "Alert";
        (by[e] = by[e] || []).push(p);
      });
      return Object.keys(by).map(function (e) {
        var a = by[e],
          p = a[0],
          big = NWS_BIG.test(e) || (e === "Hurricane Warning" && a.length >= 5);
        return {
          id: "nws-" + e + "-" + a.length,
          lvl: big ? 3 : 2,
          t:
            e +
            (a.length > 1 ? " · " + a.length + " areas" : "") +
            ": " +
            String(p.areaDesc || "")
              .split(";")
              .slice(0, 3)
              .join(", "),
          sub: String(p.headline || "").slice(0, 160),
          src: "US National Weather Service",
          u: "https://www.weather.gov/",
          d: Date.parse(p.sent) || Date.now()
        };
      });
    })
    .catch(function () {
      return [];
    });
}
function newsGDACS() {
  return getText("https://www.gdacs.org/xml/rss.xml")
    .then(function (x) {
      var d = new DOMParser().parseFromString(x, "text/xml"),
        o = [];
      [].slice.call(d.getElementsByTagName("item"), 0, 60).forEach(function (it) {
        var g = function (n) {
            var e = it.getElementsByTagName(n)[0];
            return e ? e.textContent.trim() : "";
          },
          lv = g("gdacs:alertlevel") || g("alertlevel"),
          pt = (g("georss:point") || g("point")).split(/\s+/),
          dt = Date.parse(g("pubDate")) || 0;
        if (!/^(Red|Orange)$/i.test(lv) || Date.now() - dt > 4 * 864e5) return;
        o.push({
          id: "gdacs-" + (g("guid") || g("title")).slice(-40),
          lvl: /red/i.test(lv) ? 3 : 2,
          t: g("title"),
          sub: lv + " alert",
          src: "GDACS",
          u: g("link"),
          d: dt,
          lat: +pt[0],
          lon: +pt[1]
        });
      });
      return o;
    })
    .catch(function () {
      return [];
    });
}
function newsQuakes() {
  return QUAKES.filter(function (q) {
    return q.mag >= 6.5 && Date.now() - q.time < 864e5;
  }).map(function (q) {
    return {
      id: "q-" + q.time,
      lvl: q.mag >= 7 ? 3 : 2,
      t: "Magnitude " + q.mag.toFixed(1) + " earthquake: " + q.n,
      sub: "",
      src: "USGS",
      u: "https://earthquake.usgs.gov/earthquakes/map/",
      d: q.time,
      lat: q.lat,
      lon: q.lon
    };
  });
}
// a headline only reaches the broadcast when at least three different outlets report the same nationwide-scale event
var NEWS_PAT = [
  [
    /\b(nationwide|national) ground stop|all (us |u\.s\. )?flights (are |were |have been )?grounded|grounds all flights|airspace (is |was )?closed\b/i,
    "Flights grounded"
  ],
  [
    /\b(national|nationwide) (state of )?emergency|declares (a )?state of emergency nationwide|martial law\b/i,
    "National emergency"
  ],
  [
    /\bnationwide (power |internet |cell(ular)? |network )?(outage|blackout)\b/i,
    "Nationwide outage"
  ],
  [/\btsunami warning\b/i, "Tsunami warning"]
];
function newsScan() {
  var all = NEWS.nat.concat(NEWS.world),
    o = [];
  NEWS_PAT.forEach(function (p) {
    var hit = all.filter(function (x) {
        return p[0].test(x.t) && Date.now() - x.d < 12 * 36e5;
      }),
      src = {};
    hit.forEach(function (x) {
      src[x.src || x.u.split("/")[2]] = 1;
    });
    if (Object.keys(src).length >= 3)
      o.push({
        id: "news-" + p[1] + "-" + new Date().toISOString().slice(0, 10),
        lvl: 3,
        t: hit[0].t,
        sub: p[1] + " · reported by " + Object.keys(src).slice(0, 4).join(", "),
        src: "News reports",
        u: hit[0].u,
        d: hit[0].d
      });
  });
  NEWS.scan = o;
  newsMerge();
}
function newsMerge() {
  var a = (NEWS.off || []).concat(NEWS.scan || []).concat(newsQuakes());
  a.sort(function (x, y) {
    return y.lvl - x.lvl || y.d - x.d;
  });
  NEWS.alerts = a;
  var now = Date.now(),
    k;
  for (k in NEWS.seen) if (now - NEWS.seen[k] > 3 * 864e5) delete NEWS.seen[k];
  var top =
    a.filter(function (x) {
      return x.lvl >= 3 && !NEWS.seen[x.id];
    })[0] || null;
  if ((top && top.id) !== (NEWS.bc && NEWS.bc.id)) {
    NEWS.bc = top;
    bcDraw();
  }
  if (NEWS.open) newsDraw();
}
function newsAlerts() {
  if (!EMBED_OK || (document.hidden && !SET.bg)) return;
  NEWS.at = Date.now();
  Promise.all([newsFAA(), newsNWS(), newsGDACS()])
    .then(function (r) {
      NEWS.off = r[0].concat(r[1]).concat(r[2]);
      NEWS.aok = true;
      newsMerge();
    })
    .catch(function () {});
}
// ----- Emergency alerts for my location: a full-screen alert, like a phone's own -----
// Official National Weather Service alerts for the phone's position (US). Alerts that call for action
// (the same rule as the Android background check, AlertChecker.java) take over the screen once, with the
// official wording, a tone and vibration. The background check posts them as notifications while the app
// is closed, using the position last seen here.
var AM = {
    seen: ls("ojos-am-seen") || [],
    hist: ls("ojos-am-hist") || [], // alerts shown, newest first, for Settings → Recent alerts
    q: [],
    pos: null,
    at: 0,
    natAt: 0,
    natPos: null
  },
  AM_HIST_MAX = 40,
  AM_EVERY = 3 * 60000,
  AM_ACT =
    /^(tornado warning|flash flood warning|extreme wind warning|evacuation immediate|civil emergency message|civil danger warning|shelter in place warning|law enforcement warning|hazardous materials warning|nuclear power plant warning|radiological hazard warning|fire warning|tsunami warning|hurricane warning|storm surge warning|earthquake warning|child abduction emergency|local area emergency|911 telephone outage emergency|blizzard warning|ice storm warning|severe thunderstorm warning|dust storm warning)$/;

function amOn() {
  return SET.alertMe !== false;
}

// Whether an alert should take over the screen (kept in step with AlertChecker.callsForAction).
function amActs(p) {
  var e = String(p.event || "")
    .trim()
    .toLowerCase();
  if (!e || /test/.test(e)) return false;
  if (AM_ACT.test(e)) return true;
  return (
    /^(extreme|severe)$/i.test(p.severity || "") && /^(immediate|expected)$/i.test(p.urgency || "")
  );
}

// The position to watch: emergency mode's live fix, else a recent fix if location is already allowed.
function amWhere() {
  if (EMG.on && EMG.pos) return Promise.resolve(EMG.pos);
  if (!navigator.geolocation) return Promise.resolve(AM.pos);
  return (
    navigator.permissions
      ? navigator.permissions.query({ name: "geolocation" })
      : Promise.resolve({ state: "prompt" })
  )
    .then(function (st) {
      if (st.state !== "granted" && !AM.ask) return AM.pos;
      AM.ask = false;
      return new Promise(function (res) {
        navigator.geolocation.getCurrentPosition(
          function (p) {
            res({ lat: p.coords.latitude, lon: p.coords.longitude });
          },
          function () {
            res(AM.pos);
          },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60000 }
        );
      });
    })
    .catch(function () {
      return AM.pos;
    });
}

function amCheck() {
  if (!amOn() || !EMBED_OK) return;
  AM.at = Date.now();
  amWhere().then(function (pos) {
    if (pos) AM.pos = pos;
    amNative();
    // The phone first, then each saved place; an alert covering several is shown once.
    var spots = (pos ? [{ lat: pos.lat, lon: pos.lon, n: "" }] : []).concat(amPlaces());
    spots.reduce(function (chain, s) {
      return chain.then(function () {
        return getJSON(
          "https://api.weather.gov/alerts/active?status=actual&point=" +
            s.lat.toFixed(4) +
            "," +
            s.lon.toFixed(4),
          20000
        )
          .then(function (j) {
            ((j && j.features) || []).forEach(function (f) {
              var p = f.properties || {};
              if (!p.id || AM.seen.indexOf(p.id) >= 0) return;
              AM.seen.push(p.id);
              if (amActs(p))
                AM.q.push(
                  Object.assign({ forPlace: s.n, forPhone: s.ph, lat: s.lat, lon: s.lon }, p)
                );
            });
            AM.seen = AM.seen.slice(-300);
            ls("ojos-am-seen", AM.seen);
            amShow();
          })
          .catch(function () {});
      });
    }, Promise.resolve());
  });
}

// The places watched besides the phone: the saved places of Smart alerts (module 03), up to 8.
function amPlaces() {
  return (AL.places || []).slice(0, 8).map(function (p) {
    return { lat: p.lat, lon: p.lon, n: p.name, ph: p.phone || "" };
  });
}

// Hand the places to the Android background check when they change, the phone has moved, or hourly.
function amNative() {
  var p = AM.pos,
    places = (p ? [{ lat: p.lat, lon: p.lon, n: "My location" }] : []).concat(
      amPlaces().map(function (x) {
        return { lat: x.lat, lon: x.lon, n: x.n }; // phone numbers stay in the app
      })
    ),
    key = JSON.stringify(amPlaces()),
    moved = p && (!AM.natPos || hav(p.lat, p.lon, AM.natPos.lat, AM.natPos.lon) > 2);
  if (!moved && key === AM.natKey && Date.now() - AM.natAt < 3600000) return;
  AM.natAt = Date.now();
  AM.natPos = p || AM.natPos;
  AM.natKey = key;
  natCall("setAlertWatch", { on: amOn() && places.length > 0, places: places });
}

// Settings → Emergency alerts → ⇩ OFFLINE: saves the map around a saved place (module 42).
var OFF = { busy: -1 };
function offPlace(i) {
  var p = AL.places[i];
  if (!p || OFF.busy >= 0) return;
  OFF.busy = i;
  brDraw();
  note("Offline map", "Saving the map around " + esc(p.name) + "…");
  offSave(p.lat, p.lon, function (ok, total) {
    OFF.busy = -1;
    if (ok >= total * 0.8) {
      p.off = Date.now();
      alSave();
      note(
        "Offline map",
        "The map around " + esc(p.name) + " is saved. It shows even without signal."
      );
    } else
      note(
        "Offline map",
        "Only part of the map could be saved. Check the connection and try again."
      );
    brDraw();
  });
}

// Settings → Emergency alerts → add a place by address or city, with a name of your own.
function amAdd(q, name, phone) {
  if ((AL.places || []).length >= 8) {
    note("Places", "You can watch up to 8 places. Remove one first.");
    return Promise.resolve();
  }
  return geo1(q)
    .then(function (r) {
      AL.places.push({
        name: String(name || r.name || q)
          .trim()
          .slice(0, 28),
        lat: r.lat,
        lon: r.lon,
        phone: String(phone || "")
          .replace(/[^\d+]/g, "")
          .slice(0, 16)
      });
      alSave();
      AM.natKey = "";
      amCheck();
      brDraw();
    })
    .catch(function () {
      note("Places", "Couldn't find that place. Try an address or a city and state.");
    });
}

document.addEventListener("submit", function (e) {
  if (e.target.id !== "amForm") return;
  e.preventDefault();
  var q = $("amQ").value.trim();
  if (q) amAdd(q, $("amN").value, $("amP").value);
});

function amTone() {
  try {
    var ac = EMG.ac || (EMG.ac = new (window.AudioContext || window.webkitAudioContext)()),
      t = ac.currentTime;
    for (var i = 0; i < 6; i++) {
      var o = ac.createOscillator(),
        g = ac.createGain();
      o.type = "square";
      o.frequency.value = i % 2 ? 1300 : 1050;
      g.gain.setValueAtTime(0.0001, t + i * 0.35);
      g.gain.exponentialRampToValueAtTime(0.35, t + i * 0.35 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.35 + 0.3);
      o.connect(g);
      g.connect(ac.destination);
      o.start(t + i * 0.35);
      o.stop(t + i * 0.35 + 0.32);
    }
  } catch (e) {}
  try {
    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 900]);
  } catch (e) {}
  natCall("vibrate", { ms: 1500 });
}

function amTime(s) {
  var d = Date.parse(s);
  return isNaN(d)
    ? ""
    : new Date(d).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}

// Shows the next alert in the queue; each is shown once.
function amShow() {
  var el = $("alertpop"),
    p = AM.q[0];
  if (!p || (el && el.style.display === "flex")) return;
  if (!el) {
    el = document.createElement("div");
    el.id = "alertpop";
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-modal", "true");
    document.documentElement.appendChild(el);
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-am]");
      if (!b) return;
      var k = b.getAttribute("data-am"),
        cur = AM.q.shift();
      el.style.display = "none";
      var at = cur && cur.lat != null ? cur : AM.pos; // the saved place it is for, else the phone
      if (k === "map" && at) {
        if (typeof RW === "object" && RW.on && RW.mode === "globe" && T3.map)
          T3.map.flyTo({ center: [at.lon, at.lat], zoom: 9 });
        else target = { lon: at.lon, lat: at.lat, z: clampZ((zoom * viewKm()) / 120) };
      }
      setTimeout(amShow, 400);
    });
  }
  var test = !!p.test,
    area = String(p.areaDesc || "")
      .split(";")
      .slice(0, 4)
      .join(", "),
    when = [
      p.onset || p.effective ? "From " + amTime(p.onset || p.effective) : "",
      p.ends || p.expires ? "until " + amTime(p.ends || p.expires) : ""
    ]
      .filter(Boolean)
      .join(" "),
    what = String(p.instruction || "").trim(),
    more = String(p.description || "").trim();
  el.innerHTML =
    '<div class="amcard"><b class="mono">' +
    (test ? "TEST · NOT A REAL ALERT" : "⚠ EMERGENCY ALERT") +
    "</b><h2>" +
    esc(p.event || "Official alert") +
    "</h2>" +
    (p.forPlace ? '<p class="amfor mono">FOR ' + esc(p.forPlace.toUpperCase()) + "</p>" : "") +
    '<p class="amwho mono">' +
    esc((p.senderName || "National Weather Service").toUpperCase()) +
    (when ? " · " + esc(when.toUpperCase()) : "") +
    "</p>" +
    (area ? '<p class="amarea">' + esc(area) + "</p>" : "") +
    (p.headline ? '<p class="amhead">' + esc(p.headline) + "</p>" : "") +
    (what ? '<h4 class="mono">WHAT TO DO</h4><p class="amtext">' + esc(what) + "</p>" : "") +
    (more
      ? '<details><summary class="mono">FULL MESSAGE</summary><p class="amtext">' +
        esc(more) +
        "</p></details>"
      : "") +
    (p.forPhone
      ? '<a class="amsms" href="sms:' +
        esc(p.forPhone.replace(/[^\d+]/g, "")) +
        "?body=" +
        encodeURIComponent(
          "Are you OK? There's a " + (p.event || "warning") + " for your area. Reply when you can."
        ) +
        '">💬 Text ' +
        esc(p.forPlace) +
        ": are you OK?</a>"
      : "") +
    '<div class="ambtn"><button data-am="map">Show on map</button><button data-am="ok" class="amok">I understand</button></div>' +
    '<small class="mono">OFFICIAL TEXT FROM THE ISSUING AGENCY · IN DANGER, CALL ' +
    esc(emgNum((EMG.sit && EMG.sit.cc) || "US").split(" ")[0]) +
    "</small></div>";
  el.style.display = "flex";
  if (!p.again) amTone();
  if (test || p.again) return;
  speak((p.event || "Emergency alert") + ". " + (p.headline || ""));
  amRecord(p);
  // The home-screen widget shows it until it ends.
  natCall("setAlertWidget", {
    event: p.event || "Official alert",
    place: p.forPlace || "",
    until: Date.parse(p.ends || p.expires) || Date.now() + 6 * 3600000
  });
}

// ---------- Recent alerts ----------
function amRecord(p) {
  AM.hist = AM.hist.filter(function (h) {
    return h.id !== p.id;
  });
  AM.hist.unshift({
    id: p.id || "a" + Date.now(),
    t: Date.now(),
    p: {
      event: p.event,
      headline: p.headline,
      instruction: p.instruction,
      areaDesc: p.areaDesc,
      senderName: p.senderName,
      effective: p.effective,
      ends: p.ends || p.expires,
      forPlace: p.forPlace,
      forPhone: p.forPhone,
      lat: p.lat,
      lon: p.lon
    }
  });
  AM.hist = AM.hist.slice(0, AM_HIST_MAX);
  ls("ojos-am-hist", AM.hist);
}

// Alerts the Android background check announced while the app was closed join the history.
function amNativeLog() {
  natCall("getAlertLog").then(function (r) {
    var list = [];
    try {
      list = JSON.parse((r && r.log) || "[]");
    } catch (e) {}
    var have = {};
    AM.hist.forEach(function (h) {
      have[h.id] = 1;
    });
    list.forEach(function (x) {
      if (!x || !x.id || have[x.id]) return;
      AM.hist.push({
        id: x.id,
        t: x.t,
        p: { event: x.event, headline: x.headline, forPlace: x.place }
      });
      if (AM.seen.indexOf(x.id) < 0) AM.seen.push(x.id); // already announced: no second pop-up
    });
    AM.hist.sort(function (a, b) {
      return b.t - a.t;
    });
    AM.hist = AM.hist.slice(0, AM_HIST_MAX);
    ls("ojos-am-hist", AM.hist);
    ls("ojos-am-seen", AM.seen);
  });
}
document.addEventListener("visibilitychange", function () {
  if (!document.hidden) amNativeLog();
});

function amHistHtml() {
  if (!AM.hist.length)
    return '<p class="brhint">No alerts yet. Warnings that reached you show here.</p>';
  return (
    '<div class="amhist">' +
    AM.hist
      .slice(0, 10)
      .map(function (h, i) {
        return (
          '<button data-br="amh-' +
          i +
          '"><b>' +
          esc(h.p.event || "Alert") +
          "</b><span>" +
          esc([h.p.forPlace || "Where you were", ago(h.t)].join(" · ")) +
          "</span></button>"
        );
      })
      .join("") +
    "</div>"
  );
}

// Opens a past alert again, without the tone.
function amAgain(i) {
  var h = AM.hist[i];
  if (!h) return;
  AM.q.unshift(Object.assign({ again: true }, h.p));
  amShow();
}

// Settings → "Test the alert screen".
function amTest() {
  AM.q.unshift({
    test: true,
    event: "Tornado Warning",
    senderName: "NWS (example)",
    areaDesc: "Your county",
    headline: "This is how an emergency alert for your position will look.",
    instruction:
      "When this is real: go to a basement or an interior room on the lowest floor, away from windows."
  });
  amShow();
}

setTimeout(function () {
  amNativeLog();
  amCheck();
  setInterval(function () {
    if (!document.hidden && Date.now() - AM.at > AM_EVERY) amCheck();
  }, 30000);
}, 4000);

// ----- broadcast: one bar across every view (globe, static, 3D, Inspect stays above it) -----
function bcDraw() {
  var el = $("bcast");
  if (!el) {
    el = document.createElement("div");
    el.id = "bcast";
    document.documentElement.appendChild(el);
  }
  var b = NEWS.bc;
  document.body.classList.toggle("bcast", !!b);
  if (!b) {
    el.style.display = "none";
    return;
  }
  if (NEWS.bcN !== b.id) {
    NEWS.bcN = b.id;
    var Pn = notifyPlugin();
    if (Pn && SET.bg && document.hidden) {
      try {
        Pn.schedule({
          notifications: [
            {
              id: Math.floor(Date.now() / 1000) % 2000000000,
              title: "Ojos de Dios · Broadcast",
              body: String(b.t).slice(0, 180)
            }
          ]
        });
      } catch (e) {}
    }
  }
  el.style.display = "flex";
  el.innerHTML =
    '<b class="mono">● BROADCAST</b><span data-bc="open"><em>' +
    esc(b.t) +
    '</em><i class="mono">' +
    esc(b.src) +
    " · " +
    ago(b.d) +
    (b.sub ? " · " + esc(b.sub) : "") +
    '</i></span><button data-bc="x" aria-label="Dismiss">✕</button>';
  try {
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
  } catch (e) {}
}
// ----- panel -----
function newsDraw() {
  var el = $("newsp");
  if (!el || !NEWS.open) return;
  var p = NEWS.area,
    name = p
      ? [p.city, p.state, p.country].filter(Boolean).slice(0, 2).join(", ") || "This area"
      : "…",
    tabs = [
      ["here", "HERE"],
      ["nat", p && p.country ? p.country.toUpperCase().slice(0, 14) : "COUNTRY"],
      ["world", "WORLD"],
      ["alerts", "ALERTS" + (NEWS.alerts.length ? " · " + NEWS.alerts.length : "")],
      ["chat", "LIVE CHATTER"]
    ],
    list = NEWS.tab === "alerts" ? NEWS.alerts : NEWS[NEWS.tab] || [],
    h;
  h =
    '<div class="nh"><div><b class="mono">◆ NEWS DESK</b><h3>' +
    esc(
      NEWS.tab === "here"
        ? name
        : NEWS.tab === "nat"
          ? (p && p.country) || "Country"
          : NEWS.tab === "world"
            ? "World"
            : NEWS.tab === "chat"
              ? "Live chatter"
              : "Official alerts"
    ) +
    '</h3></div><button data-nw="re" aria-label="Refresh">⟳</button><button data-nw="x" aria-label="Close">✕</button></div><div class="nt">' +
    tabs
      .map(function (t) {
        return (
          '<button data-nw="t-' +
          t[0] +
          '" class="' +
          (NEWS.tab === t[0] ? "on" : "") +
          '">' +
          esc(t[1]) +
          "</button>"
        );
      })
      .join("") +
    '</div><div class="nl">';
  if (NEWS.tab === "chat") h += chatHTML();
  else if (NEWS.busy && !list.length) h += '<p class="ne">Loading the latest…</p>';
  else if (!list.length)
    h +=
      '<p class="ne">' +
      (NEWS.tab === "alerts"
        ? NEWS.aok
          ? "No major official alerts right now."
          : "Checking official feeds…"
        : "No recent headlines found for this area. Try zooming to a city, then tap ⟳.") +
      "</p>";
  else if (NEWS.tab === "alerts")
    h += list
      .map(function (a, i) {
        return (
          '<div class="na l' +
          a.lvl +
          '"><b>' +
          esc(a.t) +
          "</b>" +
          (a.sub ? "<span>" + esc(a.sub) + "</span>" : "") +
          '<i class="mono">' +
          esc(a.src) +
          " · " +
          ago(a.d) +
          "</i><div>" +
          (a.lat ? '<button data-nw="go-' + i + '">Show on map</button>' : "") +
          '<a href="' +
          esc(a.u) +
          '" target="_blank" rel="noopener">Source</a></div></div>'
        );
      })
      .join("");
  else
    h += list
      .map(function (x) {
        return (
          '<a class="nr" href="' +
          esc(x.u) +
          '" target="_blank" rel="noopener"><i class="mono">' +
          (x.d ? ago(x.d) : "") +
          (x.src ? " · " + esc(String(x.src).slice(0, 30)) : "") +
          "</i><b>" +
          esc(x.t) +
          "</b></a>"
        );
      })
      .join("");
  h +=
    '</div><div class="nf mono">' +
    (NEWS.tab === "chat"
      ? "UNVERIFIED PUBLIC POSTS · BLUESKY · MASTODON" +
        (KEYS.x ? " · X" : "") +
        " · NOT CHECKED BY ANYONE · REFRESHES EVERY 30 SECONDS"
      : NEWS.tab === "alerts"
        ? "FAA · US NATIONAL WEATHER SERVICE · GDACS · USGS"
        : "HEADLINES VIA GDELT AND GOOGLE NEWS · TAP TO READ AT THE SOURCE") +
    (NEWS.ht && NEWS.tab !== "alerts" && NEWS.tab !== "chat"
      ? " · UPDATED " + ago(NEWS.ht).toUpperCase()
      : "") +
    "</div>";
  var sc0 = el.querySelector(".nl"),
    st0 = sc0 ? sc0.scrollTop : 0,
    typing = document.activeElement && document.activeElement.id === "chatQ";
  if (typing) return;
  el.innerHTML = h;
  var sc1 = el.querySelector(".nl");
  if (sc1 && NEWS.tab === el._tab) sc1.scrollTop = st0;
  el._tab = NEWS.tab;
}
function newsOpen(tab) {
  var el = $("newsp");
  if (!el) {
    el = document.createElement("div");
    el.id = "newsp";
    document.body.appendChild(el);
  }
  NEWS.open = true;
  if (tab) NEWS.tab = tab;
  el.style.display = "flex";
  newsDraw();
  newsLoad(false);
  if (Date.now() - NEWS.at > 2 * 60000) newsAlerts();
}
function newsClose() {
  NEWS.open = false;
  var el = $("newsp");
  if (el) el.style.display = "none";
}
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-bc]"),
    k;
  if (b) {
    k = b.getAttribute("data-bc");
    if (k === "x" && NEWS.bc) {
      NEWS.seen[NEWS.bc.id] = Date.now();
      ls("ojos-bc", NEWS.seen);
      NEWS.bc = null;
      newsMerge();
      bcDraw();
    } else newsOpen("alerts");
    return;
  }
  if (e.target.closest("#bNews")) {
    newsOpen();
    return;
  }
  b = e.target.closest("[data-nw]");
  if (!b) return;
  k = b.getAttribute("data-nw");
  if (k === "x") newsClose();
  else if (k === "re") {
    if (NEWS.tab === "chat") chatLoad(CHAT.q);
    else {
      newsLoad(true);
      newsAlerts();
    }
  } else if (k.indexOf("t-") === 0) {
    NEWS.tab = k.slice(2);
    newsDraw();
    if (NEWS.tab === "chat" && Date.now() - CHAT.t > 30000) chatLoad();
  } else if (k.indexOf("ct-") === 0) {
    chatLoad(k.slice(3));
  } else if (k.indexOf("go-") === 0) {
    var a = NEWS.alerts[+k.slice(3)];
    if (a && a.lat) {
      newsClose();
      if (T4.on && T4.v) {
        T4.h = 0;
        t4Fly(a.lon, a.lat, 60000, 0);
      }
      target = { lon: a.lon, lat: a.lat, z: Math.max(zoom, 5) };
    }
  }
});
setTimeout(newsAlerts, 9000);
setInterval(function () {
  if (Date.now() - NEWS.at > 5 * 60000) newsAlerts();
  else newsMerge();
}, 60000);
// background check of national and world headlines every 10 minutes, so a nationwide event reaches the broadcast even with the panel closed
setInterval(function () {
  if (!EMBED_OK || document.hidden || NEWS.busy || Date.now() - NEWS.ht < 10 * 60000) return;
  var cc = (NEWS.area && NEWS.area.cc) || "US";
  Promise.all([newsTop(cc), newsWorld()])
    .then(function (r) {
      NEWS.nat = r[0];
      NEWS.world = r[1];
      NEWS.ht = Date.now();
      newsScan();
    })
    .catch(function () {});
}, 90000);
