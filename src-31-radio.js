/**
 * @file Radio layers.
 * Internet radio stations that publish their location (Radio Browser), played in the app, and
 * NOAA Weather Radio transmitters with their frequencies and coverage (National Weather Service).
 * Air traffic audio is offered as a link to LiveATC from aircraft details (module 10).
 *
 * Module 31 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Internet radio stations (Radio Browser) ----------
var RB_HOSTS = ["de1", "fi1", "de2"];

// Try each public Radio Browser server in turn.
function rbGet(path) {
  var i = 0;
  var next = function () {
    var h = RB_HOSTS[i++];
    if (!h) return Promise.reject(new Error("no server"));
    return getJSON("https://" + h + ".api.radio-browser.info" + path, 15000).catch(next);
  };
  return next();
}

// Only https streams play inside the app, so others are left out.
function rbItems(d, list) {
  var seen = {};
  return (list || []).reduce(function (out, s) {
    var url = safeUrl(s.url_resolved || s.url || "");
    if (!/^https:\/\//.test(url) || seen[s.stationuuid] || s.lastcheckok === 0) return out;
    seen[s.stationuuid] = 1;
    var tags = String(s.tags || "")
      .split(",")
      .filter(Boolean)
      .slice(0, 4)
      .join(", ");
    var home = safeUrl(s.homepage || "");
    out.push(
      ilItem(d, {
        id: "radio:" + s.stationuuid,
        n: String(s.name || "Radio station").trim(),
        label: String(s.name || "")
          .trim()
          .slice(0, 22),
        lat: num(s.geo_lat),
        lon: num(s.geo_long),
        size: 4,
        tag: "Radio · " + (s.codec || "stream") + (s.bitrate ? " " + s.bitrate + "k" : ""),
        audio: url,
        links: /^https?:\/\//.test(home) ? [["Station website", home]] : null,
        rows: [
          ["GENRE", tags || "—"],
          ["LANGUAGE", s.language || "—"],
          ["PLACE", [s.state, s.countrycode].filter(Boolean).join(", ") || "—"],
          ["SOURCE", "Radio Browser (community directory)"]
        ]
      })
    );
    return out;
  }, []);
}

ilDef({
  key: "radio",
  label: "Radio stations",
  color: "#ff6ad5",
  icon: "📻",
  every: 30 * 60000,
  maxKm: 1500,
  drawKm: 1500,
  byArea: true,
  none: "NONE LISTED HERE",
  load: function (d, b) {
    var c = gdCentre(b),
      km = Math.min(750, Math.max(25, hav(b.s, b.w, b.n, b.e) / 2));
    return rbGet(
      "/json/stations/search?has_geo_info=true&hidebroken=true&order=clickcount&reverse=true&limit=400" +
        "&geo_lat=" +
        c[0].toFixed(3) +
        "&geo_long=" +
        c[1].toFixed(3) +
        "&geo_distance=" +
        Math.round(km * 1000)
    ).then(function (list) {
      return rbItems(d, list);
    });
  }
});

// ---------- NOAA Weather Radio transmitters (National Weather Service) ----------
// The NWS station listing is a script of parallel arrays, one entry per county served.
function nwrParse(text) {
  var A = {},
    re = /^\s*([A-Z]+)\[(\d+)\]\s*=\s*"([^"]*)";/gm,
    m;
  while ((m = re.exec(text))) (A[m[1]] = A[m[1]] || [])[+m[2]] = m[3];
  var by = {},
    calls = A.CALLSIGN || [];
  for (var i = 0; i < calls.length; i++) {
    var cs = calls[i],
      lat = num((A.LAT || [])[i]),
      lon = num((A.LON || [])[i]);
    if (!cs || lat == null || lon == null) continue;
    var s = by[cs];
    if (!s)
      s = by[cs] = {
        call: cs,
        site: (A.SITENAME || [])[i] || cs,
        state: (A.SITESTATE || [])[i] || "",
        freq: (A.FREQ || [])[i] || "",
        pwr: (A.PWR || [])[i] || "",
        status: (A.STATUS || [])[i] || "",
        wfo: String((A.WFO || [])[i] || "").replace("|", ", "),
        lat: lat,
        lon: lon,
        counties: []
      };
    var co = (A.COUNTY || [])[i];
    if (co && s.counties.indexOf(co) < 0) s.counties.push(co);
  }
  return Object.keys(by).map(function (k) {
    return by[k];
  });
}

ilDef({
  key: "nwr",
  label: "NOAA Weather Radio",
  color: "#4cc3ff",
  icon: "📶",
  every: 24 * 3600000,
  drawKm: 3000,
  load: function (d) {
    return netGet("https://www.weather.gov/source/nwr/JS/CCL.js", 40000, null, true).then(
      function (t) {
        return nwrParse(t).map(function (s) {
          var ok = /normal/i.test(s.status);
          return ilItem(d, {
            id: "nwr:" + s.call,
            n: s.site + (s.state ? ", " + s.state : "") + " · " + s.freq + " MHz",
            label: s.freq,
            lat: s.lat,
            lon: s.lon,
            color: ok ? "#4cc3ff" : "#ff4d5e",
            size: ok ? 4 : 6,
            big: !ok,
            tag: s.call + " · " + (ok ? "On the air" : tfWords(s.status)),
            rows: [
              ["FREQUENCY", s.freq + " MHz (tune a weather radio here)"],
              ["CALL SIGN", s.call],
              ["STATUS", tfWords(s.status) || "—"],
              ["POWER", s.pwr ? s.pwr + " W" : "—"],
              ["PROGRAMMED BY", s.wfo ? "NWS " + s.wfo : "—"],
              [
                "COUNTIES",
                s.counties.slice(0, 8).join(", ") +
                  (s.counties.length > 8 ? " and " + (s.counties.length - 8) + " more" : "")
              ],
              ["SOURCE", "National Weather Service"]
            ]
          });
        });
      }
    );
  }
});

// ---------- Radio player: one station at a time, kept playing across the app ----------
// A small bar above the dock shows what is on and stops it. The audio element is made once, so
// redrawing a panel never cuts the sound.
var RDO = {
    audio: null,
    id: "",
    name: "",
    near: null,
    nearAt: 0,
    nearPos: null,
    busy: false,
    nwr: null,
    wx: null
  },
  RDO_NEWS = /news|talk|public|npr|emergency|weather|information|community|local/i;

function rdoPlay(id, url, name) {
  if (!RDO.audio) {
    RDO.audio = new window.Audio();
    RDO.audio.preload = "none";
    RDO.audio.addEventListener("error", function () {
      if (!RDO.id) return;
      note("Radio", RDO.name + " isn't answering right now. Try another station.");
      rdoStop();
    });
  }
  RDO.id = id;
  RDO.name = name;
  RDO.audio.src = url;
  var p = RDO.audio.play();
  if (p && p.catch) p.catch(function () {}); // the error listener reports a station that fails
  rdoBar();
}

function rdoStop() {
  RDO.id = "";
  if (RDO.audio) {
    RDO.audio.pause();
    RDO.audio.removeAttribute("src");
    RDO.audio.load();
  }
  rdoBar();
  if (typeof emgDraw === "function") emgDraw();
}

function rdoBar() {
  var el = $("radiobar");
  if (!el) {
    el = document.createElement("div");
    el.id = "radiobar";
    el.innerHTML =
      '<span class="radiodot"></span><b class="mono" id="radioname"></b><button aria-label="Stop the radio">■ STOP</button>';
    el.querySelector("button").onclick = rdoStop;
    document.body.appendChild(el);
  }
  $("radioname").textContent = RDO.name ? "LIVE · " + RDO.name.toUpperCase() : "";
  el.style.display = RDO.id ? "flex" : "none";
  document.body.classList.toggle("radioon", !!RDO.id); // lifts "See in 3D" above the bar
}

// Stations near a position, news and talk first, nearest first within each. Asked again once the
// person has moved about 20 km or after half an hour.
function rdoNear(lat, lon) {
  var fresh =
    RDO.near &&
    RDO.nearPos &&
    Date.now() - RDO.nearAt < 1800000 &&
    hav(lat, lon, RDO.nearPos[0], RDO.nearPos[1]) < 20;
  if (fresh || RDO.busy) return;
  RDO.busy = true;
  var ask = function (km) {
    return rbGet(
      "/json/stations/search?has_geo_info=true&hidebroken=true&order=clickcount&reverse=true&limit=120" +
        "&geo_lat=" +
        lat.toFixed(3) +
        "&geo_long=" +
        lon.toFixed(3) +
        "&geo_distance=" +
        km * 1000
    ).then(function (list) {
      return rbItems({ key: "radio" }, list);
    });
  };
  ask(150)
    .then(function (l) {
      return l.length >= 4 ? l : ask(500);
    })
    .then(function (l) {
      l.forEach(function (x) {
        x.km = hav(lat, lon, x.lat, x.lon);
        x.newsy = RDO_NEWS.test(x.n + " " + ((x.rows && x.rows[0] && x.rows[0][1]) || ""));
      });
      l.sort(function (a, b) {
        return b.newsy - a.newsy || a.km - b.km;
      });
      RDO.near = l.slice(0, 8);
      RDO.nearAt = Date.now();
      RDO.nearPos = [lat, lon];
    })
    .catch(function () {
      RDO.near = RDO.near || [];
    })
    .then(function () {
      RDO.busy = false;
      if (typeof emgDraw === "function") emgDraw();
    });
  // The nearest NOAA Weather Radio transmitter, for a battery or car radio (US only).
  if (!RDO.nwr)
    netGet("https://www.weather.gov/source/nwr/JS/CCL.js", 40000, null, true)
      .then(function (t) {
        RDO.nwr = nwrParse(t);
        if (typeof emgDraw === "function") emgDraw();
      })
      .catch(function () {});
}

// What NOAA Weather Radio is reading for this place, as the National Weather Service's own text: its
// active alerts, then the forecast. The broadcast is a computer voice reading these same products, so
// this is the exact wording rather than a transcription. Fetched again after ten minutes.
function rdoWx(lat, lon) {
  var w = RDO.wx;
  if (w && (w.busy || (Date.now() - w.at < 600000 && hav(lat, lon, w.lat, w.lon) < 10))) return;
  w = RDO.wx = {
    busy: true,
    at: Date.now(),
    lat: lat,
    lon: lon,
    alerts: (w && w.alerts) || [],
    fc: (w && w.fc) || []
  };
  var pt = lat.toFixed(4) + "," + lon.toFixed(4);
  Promise.all([
    getJSON("https://api.weather.gov/alerts/active?status=actual&point=" + pt, 20000)
      .then(function (j) {
        w.alerts = ((j && j.features) || [])
          .map(function (f) {
            return f.properties || {};
          })
          .filter(function (p) {
            return p.event && !/test/i.test(p.event);
          });
      })
      .catch(function () {}),
    getJSON("https://api.weather.gov/points/" + pt, 20000)
      .then(function (j) {
        var u = j && j.properties && j.properties.forecast;
        return /^https:\/\/api\.weather\.gov\//.test(u || "") ? getJSON(u, 20000) : null;
      })
      .then(function (j) {
        if (j && j.properties) w.fc = (j.properties.periods || []).slice(0, 3);
      })
      .catch(function () {})
  ]).then(function () {
    w.busy = false;
    w.ok = true;
    if (typeof emgDraw === "function") emgDraw();
  });
}

function rdoWxHtml() {
  var w = RDO.wx;
  if (!w || (!w.ok && !w.alerts.length && !w.fc.length)) return "";
  var h =
    '<div class="rptext"><b class="mono">WHAT THE WEATHER RADIO IS READING · NWS TEXT</b>' +
    w.alerts
      .slice(0, 4)
      .map(function (p) {
        return (
          '<div class="rpalert"><em>' +
          esc(p.event) +
          "</em><p>" +
          esc(p.headline || "") +
          "</p>" +
          (p.description
            ? "<details><summary>Full message</summary><p>" + esc(p.description) + "</p></details>"
            : "") +
          "</div>"
        );
      })
      .join("") +
    w.fc
      .map(function (f) {
        return (
          "<p><i>" +
          esc(f.name || "") +
          ":</i> " +
          esc(f.detailedForecast || f.shortForecast || "") +
          "</p>"
        );
      })
      .join("");
  if (!w.alerts.length && !w.fc.length)
    h += "<p>No National Weather Service text for this spot right now.</p>";
  return h + "</div>";
}

function rdoNwrNear(lat, lon) {
  var best = null,
    bk = 160; // a transmitter reaches about 40 miles; beyond 100 it's no help
  (RDO.nwr || []).forEach(function (s) {
    var k = hav(lat, lon, s.lat, s.lon);
    if (k < bk && /normal/i.test(s.status)) {
      bk = k;
      best = s;
    }
  });
  return best;
}

// The RADIO section of emergency mode: live local stations that play right here, and the
// weather-radio frequency to tune.
function rdoEmgHtml(pos) {
  if (!pos) return '<div class="brc"><span>Waiting for your position.</span></div>';
  rdoNear(pos.lat, pos.lon);
  var h = "",
    w = rdoNwrNear(pos.lat, pos.lon);
  if (w)
    h +=
      '<div class="brc"><span><b>NOAA Weather Radio ' +
      esc(w.freq) +
      " MHz</b> · " +
      esc(w.site) +
      ". Official hazard warnings around the clock: tune any weather or emergency radio here, it works when phones and internet don't.</span></div>";
  if (w || (pos.lat > 17 && pos.lat < 72 && pos.lon < -64)) {
    rdoWx(pos.lat, pos.lon); // US and territories, where the National Weather Service publishes
    h += rdoWxHtml();
  }
  if (!RDO.near) return h + '<div class="brc"><span>Finding live stations near you…</span></div>';
  if (!RDO.near.length)
    return (
      h + '<div class="brc"><span>No live station near you lists a stream we can play.</span></div>'
    );
  return (
    h +
    '<div class="rplist">' +
    RDO.near
      .map(function (x, i) {
        var on = RDO.id === x.id;
        return (
          '<button class="rprow' +
          (on ? " on" : "") +
          '" data-em="rp-' +
          i +
          '"><i>' +
          (on ? "■" : "▶") +
          "</i><span><b>" +
          esc(x.n) +
          "</b><em>" +
          (x.newsy ? "NEWS · " : "") +
          Math.round(x.km * 0.621) +
          " MI" +
          "</em></span></button>"
        );
      })
      .join("") +
    "</div>"
  );
}

// LiveATC listing for an airport code (used from aircraft details).
function liveAtcUrl(code) {
  code = String(code || "").toUpperCase();
  return /^[A-Z0-9]{3,4}$/.test(code)
    ? "https://www.liveatc.net/search/?icao=" + encodeURIComponent(code)
    : "";
}
