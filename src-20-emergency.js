/**
 * @file Emergency mode.
 * Confirmation, position fix, official alerts and assessment, ranked safe places, cameras nearby
 * and the SOS signal.
 *
 * Module 20 of 29. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- State of Emergency mode ----------
// Everything here comes from public sources: official alerts, weather, earthquakes, open maps. It never replaces the emergency number.
var EMG = {
  on: false,
  pos: null,
  watch: null,
  sit: null,
  busy: false,
  at: 0,
  seen: {},
  dest: null,
  open: false,
  chk: false
};
var EMG_NUM = {
  US: "911",
  CA: "911",
  MX: "911",
  PH: "911",
  AR: "911",
  SA: "911",
  GB: "999",
  HK: "999",
  KE: "999",
  AU: "000",
  NZ: "111",
  CO: "123",
  JP: "110 police · 119 fire and ambulance",
  KR: "112 police · 119 fire and ambulance",
  CN: "110 police · 120 ambulance · 119 fire",
  BR: "190 police · 192 ambulance · 193 fire",
  ZA: "10111 police · 10177 ambulance",
  IL: "100 police · 101 ambulance · 102 fire",
  SG: "999 police · 995 fire and ambulance",
  TH: "191 police · 1669 ambulance",
  AE: "999 police · 998 ambulance · 997 fire",
  EG: "122 police · 123 ambulance",
  CL: "133 police · 131 ambulance · 132 fire"
};
function emgNum(cc) {
  return EMG_NUM[cc] || "112";
}
function compass(b) {
  return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][
    Math.round((((b % 360) + 360) % 360) / 45) % 8
  ];
}
function emgAsk() {
  if (EMG.on) {
    emgOpen();
    return;
  }
  var el = $("emgask");
  if (!el) {
    el = document.createElement("div");
    el.id = "emgask";
    document.documentElement.appendChild(el);
  }
  el.innerHTML =
    '<div><b class="mono">⚠ WARNING</b><h3>You are requesting to enter State of Emergency mode.</h3><p>The map turns red, your live position is tracked on this phone only, and alerts, safe places, cameras and routes around you are brought to the front. Do you wish to continue?</p><div><button data-em="no">Cancel</button><button data-em="yes">Enter</button></div><small>In immediate danger, call your local emergency number first.</small></div>';
  el.style.display = "flex";
}
function emgSet(on) {
  EMG.on = !!on;
  ls("ojos-emg", EMG.on);
  natCall("setEmergencyState", { on: EMG.on });
  natCall("keepScreenOn", { on: EMG.on });
  document.documentElement.classList.toggle("emg", EMG.on);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) {
    if (on) {
      EMG.tc = m.content;
      m.content = "#5a0808";
    } else if (EMG.tc) m.content = EMG.tc;
  }
  lastView = "";
  var b = $("bEmg");
  if (b) {
    b.classList.toggle("on", EMG.on);
    b.textContent = EMG.on ? "⚠ Emergency: ON" : "⚠ Emergency";
  }
  if (on) {
    spin = false;
    try {
      setButtons();
    } catch (e) {}
    if (!WL.quake) setLayer("quake", true);
    if (!WL.event) setLayer("event", true);
    EMG.sit = ls("ojos-emg-sit") || null;
    if (navigator.geolocation && EMG.watch == null)
      EMG.watch = navigator.geolocation.watchPosition(
        emgFix,
        function () {
          EMG.noloc = true;
          emgDraw();
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
      );
    try {
      navigator.wakeLock && navigator.wakeLock.request("screen").catch(function () {});
    } catch (e) {}
    try {
      navigator.getBattery &&
        navigator.getBattery().then(function (bt) {
          EMG.bat = bt;
          emgDraw();
        });
    } catch (e) {}
    speak("State of emergency mode on");
    emgOpen();
    newsAlerts();
  } else {
    if (EMG.watch != null) {
      try {
        navigator.geolocation.clearWatch(EMG.watch);
      } catch (e) {}
    }
    EMG.watch = null;
    EMG.pos = null;
    EMG.first = false;
    emgSig(false);
    EMG.open = false;
    var p = $("emgp");
    if (p) p.style.display = "none";
    try {
      if (T4.v && T4.v.entities.getById("emg-me")) T4.v.entities.removeById("emg-me");
    } catch (e) {}
  }
  emgPill();
}
function emgFix(p) {
  var q = {
      lat: p.coords.latitude,
      lon: p.coords.longitude,
      acc: p.coords.accuracy,
      hdg: p.coords.heading,
      t: Date.now()
    },
    moved = EMG.last ? hav(q.lat, q.lon, EMG.last.lat, EMG.last.lon) : 1e9;
  EMG.pos = q;
  EMG.noloc = false;
  lastView = "";
  if (!EMG.first) {
    EMG.first = true;
    target = { lon: q.lon, lat: q.lat, z: Math.max(zoom, clampZ((zoom * viewKm()) / 40)) };
    rot.lon = q.lon;
    rot.lat = q.lat;
    if (T4.on && T4.v) t4Fly(q.lon, q.lat, 1800, 0);
  }
  try {
    if (T4.on && T4.v && window.Cesium) {
      var C = Cesium,
        en = T4.v.entities.getById("emg-me"),
        ps = C.Cartesian3.fromDegrees(q.lon, q.lat, (T4.gh || 0) + 3);
      if (en) en.position = ps;
      else
        T4.v.entities.add({
          id: "emg-me",
          position: ps,
          point: {
            pixelSize: 16,
            color: C.Color.fromCssColorString("#ff2d2d"),
            outlineColor: C.Color.WHITE,
            outlineWidth: 3,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
    }
  } catch (e) {}
  if (moved > 2 || Date.now() - EMG.at > 3 * 60000) emgLoad();
  else if (EMG.open && !EMG.busy) emgDraw();
}
function drawEmg(P) {
  if (!EMG.on || !EMG.pos) return;
  var q = P(EMG.pos.lon, EMG.pos.lat);
  if (q[2] <= 0) return;
  var k = (performance.now() % 1600) / 1600;
  ctx.strokeStyle = "rgba(255,60,60," + (1 - k).toFixed(2) + ")";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(q[0], q[1], 10 + k * 26, 0, 7);
  ctx.stroke();
  ctx.fillStyle = "#ff2d2d";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(q[0], q[1], 8, 0, 7);
  ctx.fill();
  ctx.stroke();
  lastView = "";
}
function emgNearHaz(lat, lon) {
  var o = [],
    now = Date.now();
  QUAKES.forEach(function (q) {
    var d = hav(lat, lon, q.lat, q.lon);
    if (now - q.time < 2 * 864e5 && ((q.mag >= 3 && d < 150) || (q.mag >= 5.5 && d < 500)))
      o.push({
        n: "Magnitude " + q.mag.toFixed(1) + " earthquake, " + q.n,
        d: d,
        lat: q.lat,
        lon: q.lon,
        lvl: q.mag >= 6 && d < 200 ? 3 : q.mag >= 4.5 ? 2 : 1,
        src: "USGS"
      });
  });
  EVENTS.forEach(function (e) {
    if (!isFinite(e.lat)) return;
    var d = hav(lat, lon, e.lat, e.lon);
    if (d < 400)
      o.push({
        n: (e.catName ? e.catName + ": " : "") + e.n,
        d: d,
        lat: e.lat,
        lon: e.lon,
        lvl: d < 40 ? 3 : d < 150 ? 2 : 1,
        src: "NASA EONET"
      });
  });
  (NEWS.alerts || []).forEach(function (a) {
    if (!isFinite(a.lat) || !isFinite(a.lon)) return;
    var d = hav(lat, lon, a.lat, a.lon);
    if (d < 600)
      o.push({ n: a.t, d: d, lat: a.lat, lon: a.lon, lvl: d < 150 ? a.lvl : 1, src: a.src });
  });
  return o
    .sort(function (a, b) {
      return a.d - b.d;
    })
    .slice(0, 8);
}
function emgLoad() {
  var p = EMG.pos;
  if (!p || EMG.busy) return;
  EMG.busy = true;
  EMG.at = Date.now();
  EMG.last = { lat: p.lat, lon: p.lon };
  var S = { t: Date.now(), lat: p.lat, lon: p.lon, alerts: [], places: [] },
    la = p.lat.toFixed(4),
    lo = p.lon.toFixed(4);
  emgDraw();
  var jobs = [
    getJSON(
      "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=en&lat=" +
        la +
        "&lon=" +
        lo,
      12000
    )
      .then(function (j) {
        var a = (j && j.address) || {};
        S.place = [a.suburb || a.neighbourhood || a.village, a.city || a.town || a.county, a.state]
          .filter(Boolean)
          .slice(0, 2)
          .join(", ");
        S.cc = String(a.country_code || "").toUpperCase();
        S.country = a.country || "";
        var nm = [
            a.county,
            a.state_district,
            a.state,
            a.province,
            a.region,
            a.city,
            a.town,
            a.municipality
          ]
            .filter(Boolean)
            .map(function (x) {
              return String(x).toLowerCase();
            }),
          ma = MA[S.cc]
            ? maLoad(S.cc, p.lat, p.lon, nm)
                .then(function (L) {
                  if (L) {
                    S.ma = L;
                    S.maOk = true;
                  }
                })
                .catch(function () {})
            : Promise.resolve(),
          fx =
            S.cc && !EMG_NUM[S.cc]
              ? ctyFacts(S.cc)
                  .then(function (F) {
                    if (F.em && F.em.length) S.num = F.em.join(" · ");
                  })
                  .catch(function () {})
              : Promise.resolve();
        return Promise.all([ma, fx]);
      })
      .catch(function () {}),
    getJSON("https://api.weather.gov/alerts/active?point=" + la + "," + lo, 15000)
      .then(function (j) {
        S.alerts = ((j && j.features) || [])
          .map(function (f) {
            var q = f.properties || {};
            return {
              id: q.id || q.event,
              ev: q.event,
              sev: q.severity,
              urg: q.urgency,
              head: String(q.headline || "").slice(0, 200),
              ins: String(q.instruction || "")
                .replace(/\s+/g, " ")
                .slice(0, 420),
              ends: Date.parse(q.ends || q.expires) || 0,
              lvl: /Extreme/.test(q.severity) ? 3 : /Severe/.test(q.severity) ? 2 : 1
            };
          })
          .sort(function (a, b) {
            return b.lvl - a.lvl;
          });
        S.nws = true;
      })
      .catch(function () {}),
    getJSON(
      "https://api.open-meteo.com/v1/forecast?latitude=" +
        la +
        "&longitude=" +
        lo +
        "&current=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation,visibility&temperature_unit=fahrenheit&wind_speed_unit=mph&hourly=precipitation_probability&forecast_hours=6",
      15000
    )
      .then(function (j) {
        var c = j && j.current;
        if (c)
          S.wx = {
            t: Math.round(c.temperature_2m),
            w: wxWord(c.weather_code),
            wind: Math.round(c.wind_speed_10m),
            gust: Math.round(c.wind_gusts_10m),
            vis: c.visibility != null ? Math.round(c.visibility / 1609) : null,
            rain: Math.max.apply(null, (j.hourly && j.hourly.precipitation_probability) || [0])
          };
      })
      .catch(function () {}),
    getJSON(
      "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=" +
        la +
        "&longitude=" +
        lo +
        "&current=us_aqi,pm2_5",
      15000
    )
      .then(function (j) {
        var c = j && j.current;
        if (c && c.us_aqi != null) S.aqi = Math.round(c.us_aqi);
      })
      .catch(function () {}),
    getJSON(
      "https://overpass-api.de/api/interpreter?data=" +
        encodeURIComponent(
          "[out:json][timeout:25];(nwr(around:16000," +
            la +
            "," +
            lo +
            ')[amenity~"^(hospital|police|fire_station)$"];nwr(around:16000,' +
            la +
            "," +
            lo +
            ")[emergency=assembly_point];nwr(around:16000," +
            la +
            "," +
            lo +
            ")[social_facility=shelter];nwr(around:6000," +
            la +
            "," +
            lo +
            ')[amenity~"^(pharmacy|fuel|drinking_water)$"];);out center tags 400;'
        ),
      32000
    )
      .then(function (j) {
        S.places = ((j && j.elements) || [])
          .map(function (e) {
            var c = e.center || e,
              t = e.tags || {},
              k =
                t.amenity === "hospital"
                  ? "hospital"
                  : t.amenity === "police"
                    ? "police"
                    : t.amenity === "fire_station"
                      ? "fire"
                      : t.emergency === "assembly_point"
                        ? "assembly"
                        : t.social_facility === "shelter"
                          ? "shelter"
                          : t.amenity === "pharmacy"
                            ? "pharmacy"
                            : t.amenity === "fuel"
                              ? "fuel"
                              : "water";
            if (!isFinite(c.lat)) return null;
            return {
              k: k,
              n: t.name || "",
              lat: c.lat,
              lon: c.lon,
              er: t.emergency === "yes",
              ph: t.phone || t["contact:phone"] || "",
              open: t.opening_hours || "",
              d: hav(p.lat, p.lon, c.lat, c.lon)
            };
          })
          .filter(function (x) {
            return x && (x.n || x.k === "assembly" || x.k === "water" || x.k === "fuel");
          })
          .sort(function (a, b) {
            return a.d - b.d;
          });
        S.osm = true;
      })
      .catch(function () {})
  ];
  Promise.all(jobs).then(function () {
    if (S.ma && S.ma.length)
      S.alerts = S.alerts.concat(S.ma).sort(function (a, b) {
        return b.lvl - a.lvl;
      });
    S.haz = emgNearHaz(p.lat, p.lon);
    var old = EMG.sit;
    if (!S.osm && old && old.places && hav(old.lat, old.lon, p.lat, p.lon) < 5) {
      S.places = old.places;
      S.stale = true;
    }
    if (!S.place && old) {
      S.place = old.place;
      S.cc = old.cc;
      S.num = old.num;
    }
    EMG.sit = S;
    EMG.busy = false;
    emgAssess();
    try {
      ls("ojos-emg-sit", S);
    } catch (e) {}
    S.alerts.forEach(function (a) {
      if (!EMG.seen[a.id]) {
        EMG.seen[a.id] = 1;
        if (a.lvl >= 2) {
          speak(a.ev + " for your location");
          notify("⚠ " + a.ev, a.head);
        }
      }
    });
    emgDraw();
    emgPill();
    if (!NEWS.busy) newsLoad(true);
  });
}
// fixed-rule analyzer: threat level, what to do, and the best reachable place given what is reported right now
function emgAssess() {
  var S = EMG.sit;
  if (!S) return;
  var lvl = 0,
    why = [],
    hz = (S.haz || [])[0],
    a = (S.alerts || [])[0],
    wx = S.wx;
  if (a) {
    lvl = Math.max(lvl, a.lvl);
    why.push(a.ev + " in effect here");
  }
  (S.haz || []).forEach(function (h) {
    if (h.lvl > lvl) lvl = h.lvl;
  });
  if (hz && hz.lvl >= 2)
    why.push(
      hz.n.slice(0, 70) +
        " · " +
        Math.round(hz.d * 0.621) +
        " mi " +
        compass(bearing(S.lat, S.lon, hz.lat, hz.lon))
    );
  if (wx && wx.gust >= 58) {
    lvl = Math.max(lvl, 2);
    why.push("Damaging wind gusts of " + wx.gust + " mph");
  }
  if (S.aqi >= 151) {
    lvl = Math.max(lvl, S.aqi >= 301 ? 3 : 2);
    why.push("Unhealthy air (AQI " + S.aqi + ")");
  }
  if (wx && wx.vis != null && wx.vis < 1) why.push("Visibility under 1 mile");
  var shelterIn =
      a &&
      /tornado|severe thunderstorm|hurricane|extreme wind|blizzard|ice storm|dust storm|shelter in place|civil danger|hazardous materials|air quality/i.test(
        a.ev
      ),
    leave =
      a && /evacuat|flash flood|tsunami|fire|dam|storm surge|volcano/i.test(a.ev + " " + a.ins);
  var act = leave
    ? "Move away now"
    : shelterIn
      ? "Shelter where you are"
      : lvl >= 3
        ? "Be ready to move"
        : lvl === 2
          ? "Stay alert"
          : "No official alert for your position";
  var want =
      leave || !shelterIn
        ? ["shelter", "assembly", "hospital", "fire", "police"]
        : ["hospital", "fire", "police", "shelter", "assembly"],
    hzs = (S.haz || []).filter(function (h) {
      return h.lvl >= 2;
    });
  var C = (S.places || [])
    .filter(function (x) {
      return want.indexOf(x.k) >= 0;
    })
    .map(function (x) {
      var sc = x.d + want.indexOf(x.k) * 1.5,
        rs = [],
        minH = 1e9;
      hzs.forEach(function (h) {
        var d = hav(x.lat, x.lon, h.lat, h.lon),
          mine = h.d;
        if (d < minH) minH = d;
        if (d < mine - 1) {
          sc += Math.min(60, (mine - d) * 3);
          rs.toward = true;
        } else if (d > mine + 1) sc -= Math.min(6, d - mine);
      });
      if (x.k === "hospital" && x.er) sc -= 1;
      rs.push((x.d * 0.621).toFixed(1) + " mi " + compass(bearing(S.lat, S.lon, x.lat, x.lon)));
      if (hzs.length) rs.push(rs.toward ? "closer to the hazard" : "farther from the hazard");
      if (x.er) rs.push("emergency room");
      return { x: x, sc: sc, rs: rs };
    })
    .sort(function (a, b) {
      return a.sc - b.sc;
    });
  S.as = {
    lvl: lvl,
    why: why,
    act: act,
    ins: (a && a.ins) || "",
    best: C.slice(0, 3),
    away: hz && hz.lvl >= 2 ? compass(bearing(hz.lat, hz.lon, S.lat, S.lon)) : ""
  };
}
function emgCams() {
  var p = EMG.pos || EMG.sit;
  if (!p) return [];
  var a = [],
    i,
    c;
  for (i = 0; i < LIVE.length; i++) {
    c = LIVE[i];
    if (DEAD[c.u]) continue;
    var dx = Math.abs(c.lat - p.lat) + Math.abs(c.lon - p.lon);
    if (dx < 0.6) a.push([hav(p.lat, p.lon, c.lat, c.lon), c]);
  }
  a.sort(function (x, y) {
    return x[0] - y[0];
  });
  return a.slice(0, 9);
}
var EMG_K = {
  hospital: "Hospital",
  police: "Police",
  fire: "Fire station",
  shelter: "Shelter",
  assembly: "Assembly point",
  pharmacy: "Pharmacy",
  fuel: "Fuel",
  water: "Drinking water"
};
function emgDraw() {
  var el = $("emgp");
  if (!el || !EMG.open) return;
  if (document.activeElement && /^(emgQ|famN|famP)$/.test(document.activeElement.id)) return;
  var S = EMG.sit,
    A = S && S.as,
    num = (S && S.num) || emgNum(S && S.cc),
    tel = (num.match(/\d+/) || ["112"])[0],
    sc = el.querySelector(".nl"),
    top = sc ? sc.scrollTop : 0,
    h =
      '<div class="nh"><div><b class="mono">⚠ STATE OF EMERGENCY</b><h3>' +
      esc((S && S.place) || "Finding your position…") +
      '</h3></div><button data-em="re" aria-label="Refresh">⟳</button><button data-em="hide" aria-label="Back to the map">▾</button></div><div class="nl">';
  h +=
    '<div class="emc"><a class="emcall" href="tel:' +
    tel +
    '">☎ Call ' +
    esc(tel) +
    "</a><span>Emergency number" +
    (S && S.country ? " in " + esc(S.country) : "") +
    ": " +
    esc(num) +
    "</span></div>";
  if (EMG.noloc)
    h +=
      '<div class="brc l3"><b>Location is off</b><span>Allow location for Ojos de Dios in your phone settings so the map can show where you are.</span></div>';
  if (!navigator.onLine)
    h +=
      '<div class="brc l2"><b>No connection</b><span>Showing the last situation saved on this phone' +
      (S
        ? " at " + new Date(S.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : "") +
      ". Calls and texts may still work.</span></div>";
  if (A) {
    h +=
      '<h4 class="mono">ANALYZER</h4><div class="brc l' +
      Math.max(1, A.lvl) +
      '"><b>' +
      esc(A.act) +
      "</b>" +
      (A.why.length
        ? "<span>" + A.why.map(esc).join(" · ") + "</span>"
        : "<span>No hazard is reported near you right now.</span>") +
      (A.ins ? '<span class="emi">Official instruction: ' + esc(A.ins) + "</span>" : "") +
      (A.away
        ? '<span>Direction away from the nearest hazard: <b class="emb">' + A.away + "</b></span>"
        : "") +
      '<i class="mono">SCORED FROM LIVE PUBLIC DATA BY FIXED RULES · NOT A PREDICTION · FOLLOW OFFICIAL ORDERS FIRST</i></div>';
    if (A.best.length)
      h +=
        '<h4 class="mono">BEST PLACES TO GO</h4>' +
        A.best
          .map(function (c, i) {
            return (
              '<div class="brc' +
              (i ? "" : " l1") +
              '"><b>' +
              (i ? "" : "★ ") +
              esc(c.x.n || EMG_K[c.x.k]) +
              "</b><span>" +
              EMG_K[c.x.k] +
              " · " +
              c.rs.map(esc).join(" · ") +
              '</span><div class="bra"><button data-em="rt-' +
              i +
              '">Safe route</button>' +
              (c.x.ph
                ? '<a class="brl" href="tel:' + esc(c.x.ph.replace(/[^\d+]/g, "")) + '">Call</a>'
                : '<button data-em="sh-' + i + '">Show on map</button>') +
              "</div></div>"
            );
          })
          .join("");
  } else if (EMG.busy || !S)
    h += '<p class="bre">Reading alerts, weather and safe places around you…</p>';
  h +=
    '<div class="brt"><button data-em="cams">▦ Cameras around me</button><button data-em="share">➤ Share my location</button><button data-em="sig" class="' +
    (EMG.sig ? "on" : "") +
    '">' +
    (EMG.sig ? "■ Stop signal" : "✺ SOS signal") +
    '</button><button data-em="news">◉ News here</button></div>' +
    (S && S.cc
      ? '<div class="brt c1"><button data-cy="emg" data-cc="' +
        esc(S.cc) +
        '">◍ Country file: advisory, numbers, leaders</button></div>'
      : "");
  h += famHTML();
  h +=
    '<h4 class="mono">WHERE ARE YOU TRYING TO GO?</h4><form class="chq" id="emgForm"><input id="emgQ" type="search" placeholder="Address or place" value="' +
    esc(EMG.dq || "") +
    '" autocomplete="off"><button>Check</button></form>';
  if (EMG.dest) {
    var d = EMG.dest;
    h +=
      '<div class="brc l' +
      (d.alerts && d.alerts.length ? Math.max(1, d.alerts[0].lvl) : 1) +
      '"><b>' +
      esc(d.name) +
      "</b><span>" +
      (d.busy
        ? "Checking…"
        : (d.alerts && d.alerts.length
            ? d.alerts
                .slice(0, 3)
                .map(function (a) {
                  return esc(a.ev);
                })
                .join(" · ")
            : d.nws
              ? "No official alert there"
              : "No alert feed covers that place") +
          (d.wx ? " · " + esc(d.wx) : "") +
          (d.haz && d.haz[0]
            ? " · " +
              esc(d.haz[0].n.slice(0, 50)) +
              " " +
              Math.round(d.haz[0].d * 0.621) +
              " mi away"
            : "")) +
      '</span><div class="bra"><button data-em="dr">Safe route there</button><button data-em="dm">Show on map</button></div></div>';
  }
  if (S) {
    if (S.alerts.length)
      h +=
        '<h4 class="mono">OFFICIAL ALERTS FOR YOUR POSITION</h4>' +
        S.alerts
          .slice(0, 6)
          .map(function (a) {
            return (
              '<div class="brc l' +
              a.lvl +
              '"><b>' +
              esc(a.ev) +
              "</b><span>" +
              esc(a.head) +
              "</span>" +
              '<i class="mono">' +
              (a.ends ? "UNTIL " + esc(flogT(a.ends)) + " · " : "") +
              esc(a.src || "US NATIONAL WEATHER SERVICE") +
              "</i>" +
              "</div>"
            );
          })
          .join("");
    else
      h +=
        '<h4 class="mono">OFFICIAL ALERTS FOR YOUR POSITION</h4><p class="bre">' +
        ((S.nws && S.cc === "US") || S.maOk
          ? "None in effect."
          : S.cc === "US" || MA[S.cc]
            ? "The alert service did not answer."
            : "Official position alerts cover the United States and 38 European countries. Worldwide disaster alerts are listed under Nearby below.") +
        "</p>";
    if (S.haz && S.haz.length)
      h +=
        '<h4 class="mono">NEARBY</h4>' +
        S.haz
          .map(function (x) {
            return (
              '<div class="brc l' +
              x.lvl +
              '"><b>' +
              esc(x.n.slice(0, 90)) +
              "</b><span>" +
              Math.round(x.d * 0.621) +
              " mi " +
              compass(bearing(S.lat, S.lon, x.lat, x.lon)) +
              ' of you</span><i class="mono">' +
              esc(x.src || "") +
              "</i></div>"
            );
          })
          .join("");
    h +=
      '<h4 class="mono">CONDITIONS</h4><div class="brc"><span>' +
      (S.wx
        ? S.wx.t +
          "°F " +
          esc(S.wx.w) +
          " · wind " +
          S.wx.wind +
          " mph, gusts " +
          S.wx.gust +
          (S.wx.vis != null ? " · visibility " + S.wx.vis + " mi" : "") +
          " · rain chance next 6 h " +
          S.wx.rain +
          "%"
        : "Weather did not load") +
      (S.aqi != null
        ? " · air quality " +
          S.aqi +
          (S.aqi > 150 ? " (unhealthy)" : S.aqi > 100 ? " (poor)" : " (fine)")
        : "") +
      "</span>" +
      (EMG.bat
        ? "<span>Phone battery " +
          Math.round(EMG.bat.level * 100) +
          "%" +
          (EMG.bat.level < 0.25 && !EMG.bat.charging
            ? " · low: dim the screen and close other apps"
            : "") +
          "</span>"
        : "") +
      (EMG.pos
        ? '<i class="mono">YOUR POSITION ' +
          EMG.pos.lat.toFixed(5) +
          ", " +
          EMG.pos.lon.toFixed(5) +
          " · ±" +
          Math.round(EMG.pos.acc || 0) +
          " M</i>"
        : "") +
      "</div>";
    var grp = {};
    (S.places || []).forEach(function (x) {
      (grp[x.k] = grp[x.k] || []).push(x);
    });
    var ks = [
      "hospital",
      "shelter",
      "assembly",
      "fire",
      "police",
      "pharmacy",
      "fuel",
      "water"
    ].filter(function (k) {
      return grp[k];
    });
    if (ks.length)
      h +=
        '<h4 class="mono">AROUND YOU' +
        (S.stale ? " · SAVED EARLIER" : "") +
        '</h4><div class="brc"><table>' +
        ks
          .map(function (k) {
            var x = grp[k][0];
            return (
              '<tr data-em="pl-' +
              S.places.indexOf(x) +
              '"><td>' +
              EMG_K[k] +
              "</td><td>" +
              esc((x.n || "Unnamed").slice(0, 34)) +
              " · " +
              (x.d * 0.621).toFixed(1) +
              " mi " +
              compass(bearing(S.lat, S.lon, x.lat, x.lon)) +
              (grp[k].length > 1 ? " · +" + (grp[k].length - 1) : "") +
              "</td></tr>"
            );
          })
          .join("") +
        '</table><i class="mono">TAP A ROW FOR A SAFE ROUTE · © OPENSTREETMAP CONTRIBUTORS</i></div>';
    var hd = (NEWS.here || []).slice(0, 4);
    if (hd.length)
      h +=
        '<h4 class="mono">LATEST NEWS HERE</h4>' +
        hd
          .map(function (n) {
            return (
              '<a class="brc emn" href="' +
              esc(n.u) +
              '" target="_blank" rel="noopener"><b>' +
              esc(n.t) +
              '</b><i class="mono">' +
              esc(n.src || "") +
              "</i></a>"
            );
          })
          .join("");
  }
  h +=
    '<h4 class="mono">RADIO</h4><div class="brc"><span>Public-safety radio that is broadcast in the clear is streamed by volunteers. Many agencies now encrypt theirs, so coverage depends on where you are. NOAA Weather Radio is the official 24-hour hazard broadcast in the US.</span><div class="bra"><a class="brl" href="https://www.broadcastify.com/listen/" target="_blank" rel="noopener">Scanner feeds</a><a class="brl" href="https://openmhz.com/systems" target="_blank" rel="noopener">Radio archive</a></div><div class="bra"><a class="brl" href="https://www.weather.gov/nwr/" target="_blank" rel="noopener">NOAA Weather Radio</a><a class="brl" href="https://www.google.com/search?q=' +
    encodeURIComponent(((S && S.place) || "") + " fire police scanner live feed") +
    '" target="_blank" rel="noopener">Find my area</a></div></div>';
  h +=
    '<h4 class="mono">CHECKLIST</h4><div class="brc"><span>' +
    (EMG.chk
      ? "Water, 1 gallon per person per day · Medicines and prescriptions · Phone, charger, power bank · IDs and key documents in a bag · Cash · Flashlight · First-aid kit · Sturdy shoes, warm layer · Full fuel tank · Tell one person outside the area where you are going · Text, do not call, when networks are busy"
      : "What to grab and do before you move.") +
    '</span><div class="bra"><button data-em="chk">' +
    (EMG.chk ? "Hide" : "Show checklist") +
    '</button><button data-em="off">Exit emergency mode</button></div></div>';
  h +=
    '</div><div class="nf mono">PUBLIC SOURCES: NWS · USGS · NASA EONET · GDACS · OPEN-METEO · OPENSTREETMAP · YOUR POSITION STAYS ON THIS PHONE</div>';
  el.innerHTML = h;
  var s2 = el.querySelector(".nl");
  if (s2) s2.scrollTop = top;
}
function emgOpen() {
  var el = $("emgp");
  if (!el) {
    el = document.createElement("div");
    el.id = "emgp";
    el.className = "pn";
    document.body.appendChild(el);
  }
  EMG.open = true;
  el.style.display = "flex";
  emgDraw();
  if (EMG.pos && Date.now() - EMG.at > 60000) emgLoad();
}
function emgPill() {
  var el = $("emgpill");
  if (!el) {
    el = document.createElement("button");
    el.id = "emgpill";
    document.documentElement.appendChild(el);
    el.onclick = function () {
      emgOpen();
    };
  }
  el.style.display = EMG.on && !EMG.open ? "block" : "none";
  var A = EMG.sit && EMG.sit.as;
  el.textContent = "⚠ " + (A ? A.act : "State of emergency") + " · open";
}
// SOS: the screen flashes ... --- ... with a tone, so the phone can be seen and heard
function emgSig(on) {
  EMG.sig = !!on;
  clearTimeout(EMG.sigT);
  var el = $("emgsig");
  if (!on) {
    if (el) el.style.display = "none";
    try {
      EMG.osc && EMG.osc.stop();
    } catch (e) {}
    EMG.osc = null;
    return;
  }
  if (!el) {
    el = document.createElement("div");
    el.id = "emgsig";
    el.innerHTML = "<span>SOS · tap to stop</span>";
    el.onclick = function () {
      emgSig(false);
      emgDraw();
    };
    document.documentElement.appendChild(el);
  }
  el.style.display = "flex";
  var pat = [1, 1, 1, 3, 3, 3, 1, 1, 1],
    i = 0,
    ac = null,
    g = null;
  try {
    ac = EMG.ac || (EMG.ac = new (window.AudioContext || window.webkitAudioContext)());
    var o = ac.createOscillator();
    g = ac.createGain();
    o.frequency.value = 2800;
    g.gain.value = 0;
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    EMG.osc = o;
  } catch (e) {}
  (function step() {
    if (!EMG.sig) return;
    var u = 220,
      len = pat[i % 9] * u;
    el.classList.add("lit");
    if (g) g.gain.value = 0.6;
    natCall("vibrate", { ms: len });
    EMG.sigT = setTimeout(function () {
      el.classList.remove("lit");
      if (g) g.gain.value = 0;
      i++;
      EMG.sigT = setTimeout(step, i % 9 === 0 ? u * 7 : u);
    }, len);
  })();
}
function emgDest(q) {
  q = String(q || "").trim();
  if (!q) return;
  EMG.dq = q;
  var d = (EMG.dest = { name: q, busy: true });
  emgDraw();
  geo1(q)
    .then(function (g) {
      d.lat = g.lat;
      d.lon = g.lon;
      d.name = g.name || q;
      d.haz = emgNearHaz(g.lat, g.lon);
      return Promise.all([
        getJSON(
          "https://api.weather.gov/alerts/active?point=" +
            g.lat.toFixed(4) +
            "," +
            g.lon.toFixed(4),
          15000
        )
          .then(function (j) {
            d.nws = true;
            d.alerts = ((j && j.features) || [])
              .map(function (f) {
                var q2 = f.properties || {};
                return {
                  ev: q2.event,
                  lvl: /Extreme/.test(q2.severity) ? 3 : /Severe/.test(q2.severity) ? 2 : 1
                };
              })
              .sort(function (a, b) {
                return b.lvl - a.lvl;
              });
          })
          .catch(function () {}),
        getJSON(
          "https://api.open-meteo.com/v1/forecast?latitude=" +
            g.lat.toFixed(3) +
            "&longitude=" +
            g.lon.toFixed(3) +
            "&current=temperature_2m,weather_code&temperature_unit=fahrenheit",
          15000
        )
          .then(function (j) {
            var c = j && j.current;
            if (c) d.wx = Math.round(c.temperature_2m) + "°F " + wxWord(c.weather_code);
          })
          .catch(function () {})
      ]);
    })
    .catch(function () {
      d.name = "Couldn't find “" + q + "”";
    })
    .then(function () {
      d.busy = false;
      emgDraw();
    });
}
function emgRoute(lat, lon, name) {
  DRV.pref = "safe";
  ls("ojos-drvp", "safe");
  EMG.open = false;
  $("emgp").style.display = "none";
  emgPill();
  if (T4.on)
    try {
      t4Close();
    } catch (e) {}
  EMG.rn = name || "Safe place";
  drvGo(
    EMG.pos ? EMG.pos.lat.toFixed(6) + "," + EMG.pos.lon.toFixed(6) : "",
    lat.toFixed(6) + "," + lon.toFixed(6),
    true
  );
}
function emgShow(lat, lon) {
  EMG.open = false;
  $("emgp").style.display = "none";
  emgPill();
  target = { lon: lon, lat: lat, z: Math.max(zoom, 200) };
  rot.lon = lon;
  rot.lat = lat;
  if (T4.on && T4.v) {
    T4.h = 0;
    t4Fly(lon, lat, 700, 0);
  }
}
document.addEventListener("submit", function (e) {
  if (e.target && e.target.id === "emgForm") {
    e.preventDefault();
    var v = $("emgQ").value;
    $("emgQ").blur();
    emgDest(v);
  }
});
document.addEventListener("click", function (e) {
  if (e.target.closest("#bEmg")) {
    if (EMG.on) emgOpen();
    else emgAsk();
    return;
  }
  var b = e.target.closest("[data-em]");
  if (!b) return;
  var k = b.getAttribute("data-em"),
    S = EMG.sit,
    i = +k.slice(3);
  if (k === "no") $("emgask").style.display = "none";
  else if (k === "yes") {
    $("emgask").style.display = "none";
    emgSet(true);
  } else if (k === "off") emgSet(false);
  else if (k === "hide") {
    EMG.open = false;
    $("emgp").style.display = "none";
    emgPill();
  } else if (k === "re") {
    EMG.at = 0;
    if (EMG.pos) emgLoad();
    newsAlerts();
  } else if (k === "chk") {
    EMG.chk = !EMG.chk;
    emgDraw();
  } else if (k === "sig") {
    emgSig(!EMG.sig);
    emgDraw();
  } else if (k === "news") {
    newsOpen("here");
  } else if (k === "cams") {
    var cs = emgCams();
    if (!cs.length) {
      note("Emergency", "No live public camera within about 40 miles of you.");
      return;
    }
    wall = cs.map(function (x) {
      return x[1].u;
    });
    updWallBtn();
    layout = cs.length <= 1 ? 1 : cs.length <= 2 ? 2 : cs.length <= 4 ? 4 : cs.length <= 6 ? 6 : 9;
    openWall();
  } else if (k === "share") {
    var p = EMG.pos;
    if (!p) {
      note("Emergency", "Waiting for your position.");
      return;
    }
    var tx =
      "My live position: https://maps.google.com/?q=" +
      p.lat.toFixed(5) +
      "," +
      p.lon.toFixed(5) +
      " (" +
      new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
      ")";
    if (navigator.share) navigator.share({ text: tx }).catch(function () {});
    else location.href = "sms:?body=" + encodeURIComponent(tx);
  } else if (k.indexOf("rt-") === 0 && S && S.as.best[i])
    emgRoute(S.as.best[i].x.lat, S.as.best[i].x.lon, S.as.best[i].x.n);
  else if (k.indexOf("sh-") === 0 && S && S.as.best[i])
    emgShow(S.as.best[i].x.lat, S.as.best[i].x.lon);
  else if (k.indexOf("pl-") === 0 && S && S.places[i])
    emgRoute(S.places[i].lat, S.places[i].lon, S.places[i].n);
  else if (k === "dr" && EMG.dest && EMG.dest.lat != null)
    emgRoute(EMG.dest.lat, EMG.dest.lon, EMG.dest.name);
  else if (k === "dm" && EMG.dest && EMG.dest.lat != null) emgShow(EMG.dest.lat, EMG.dest.lon);
});
window.addEventListener("online", function () {
  if (EMG.on) {
    EMG.at = 0;
    if (EMG.pos) emgLoad();
  }
});
window.addEventListener("offline", function () {
  if (EMG.on) emgDraw();
});
setInterval(function () {
  if (EMG.on && EMG.pos && !document.hidden && Date.now() - EMG.at > 3 * 60000) emgLoad();
}, 30000);
setTimeout(function () {
  if (ls("ojos-emg")) emgSet(true);
}, 1500);
setInterval(function () {
  if (T4.on && T4.ready && !document.hidden) t4Pts();
}, 1500);
