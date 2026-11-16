/**
 * @file Radio layers.
 * Internet radio stations that publish their location (Radio Browser), played in the app, and
 * NOAA Weather Radio transmitters with their frequencies and coverage (National Weather Service).
 * Air traffic audio is offered as a link to LiveATC from aircraft details (module 10).
 *
 * Module 31 of 36. Modules share one scope: build.py concatenates them in order
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

// LiveATC listing for an airport code (used from aircraft details).
function liveAtcUrl(code) {
  code = String(code || "").toUpperCase();
  return /^[A-Z0-9]{3,4}$/.test(code)
    ? "https://www.liveatc.net/search/?icao=" + encodeURIComponent(code)
    : "";
}
