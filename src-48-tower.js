/*
 * Tower: one screen per airport with what the tower and pilots are reporting, all from free public sources.
 *
 *   ATIS        the airport's recorded broadcast, as the FAA's Digital ATIS text (datis.clowd.io, US airports
 *               with D-ATIS); the phone reads it aloud with play/pause
 *   FAA status  ground stops, ground delays, arrival/departure delays and closures (nasstatus.faa.gov)
 *   Weather     latest observation and forecast (aviationweather.gov METAR and TAF)
 *   Pilots      pilot reports within 100 nm in the last 3 hours (aviationweather.gov PIREP)
 *   Board       arrivals and departures (AeroDataBox, only with the user's own key)
 *   Nearby      live aircraft already on the map within 40 km; a tap rings and selects one
 *
 * Opened with ✈ TOWER in an aircraft's details, for its departure and arrival airports.
 */
var TOW = { ap: null, seq: 0, atis: "", talking: false, heard: false };
var TOW_ABC =
  "Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu".split(
    " "
  );
var TOW_SAY = [
  [/\bRWYS?\b/g, "runway"],
  [/\bAPCH\b|\bAPP\b/g, "approach"],
  [/\bDEP\b/g, "departure"],
  [/\bARR\b/g, "arrival"],
  [/\bVIS\b/g, "visibility"],
  [/\bCLSD\b/g, "closed"],
  [/\bTWY\b/g, "taxiway"],
  [/\bNOTAMS?\b/g, "notices"],
  [/\bWX\b/g, "weather"],
  [/\bBKN\b/g, "broken"],
  [/\bOVC\b/g, "overcast"],
  [/\bSCT\b/g, "scattered"],
  [/\bFEW\b/g, "few"],
  [/\bCLR\b|\bSKC\b/g, "clear"],
  [/\bTEMP\b/g, "temperature"],
  [/\bALSTG\b|\bALTM\b/g, "altimeter"],
  [/\bADZ\b|\bADVS\b/g, "advise"],
  [/\bINFO\b/g, "information"],
  [/\bINST\b/g, "instrument"],
  [/\bILS\b/g, "I L S"],
  [/\bRNAV\b/g, "R nav"],
  [/\bSM\b/g, "statute miles"]
];

// Readable, speakable ATIS: "RWY 18L" becomes "runway 18 left", "INFO A" becomes "information Alfa", and so on.
function towSpeech(t) {
  var s = String(t || "").toUpperCase();
  s = s.replace(/\bINFO(?:RMATION)? ([A-Z])\b/g, function (x, l) {
    return "INFO " + TOW_ABC[l.charCodeAt(0) - 65];
  });
  s = s.replace(/\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/g, function (x, d, v, g) {
    return (
      "wind " +
      (d === "VRB" ? "variable" : d.split("").join(" ")) +
      " at " +
      +v +
      (g ? " gusting " + +g : "") +
      " knots"
    );
  });
  s = s.replace(/\bA(\d{2})(\d{2})\b/g, "altimeter $1 point $2");
  s = s.replace(/\b(\d{2})(\d{2})Z\b/g, "$1 $2 zulu");
  s = s.replace(/\b(\d{1,2})([LRC])\b/g, function (x, n, side) {
    return n + " " + { L: "left", R: "right", C: "center" }[side];
  });
  s = s.replace(/\bM(\d{2})\b/g, "minus $1");
  TOW_SAY.forEach(function (r) {
    s = s.replace(r[0], r[1]);
  });
  return s
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

// The FAA's three-letter code for an airport (KAUS → AUS), which the FAA status service uses.
function towFaa(ap) {
  if (ap.iata && /^[A-Z]{3}$/.test(ap.iata)) return ap.iata;
  return /^K[A-Z]{3}$/.test(ap.icao) ? ap.icao.slice(1) : "";
}

// What the FAA reports for one airport, from the national airspace status XML.
function towFaaStatus(xml, code) {
  var doc = new DOMParser().parseFromString(String(xml || ""), "text/xml"),
    out = [];
  if (!code) return out;
  [].forEach.call(doc.getElementsByTagName("ARPT"), function (a) {
    if ((a.textContent || "").trim().toUpperCase() !== code) return;
    var item = a.parentNode,
      type = item,
      bits = [];
    while (type && type.nodeName !== "Delay_type") type = type.parentNode;
    var name = type && type.getElementsByTagName("Name")[0];
    [].forEach.call(item.getElementsByTagName("*"), function (n) {
      if (n.children.length || n.nodeName === "ARPT") return;
      var v = (n.textContent || "").trim();
      if (v) bits.push(n.nodeName.replace(/_/g, " ") + ": " + v);
    });
    out.push({ type: name ? name.textContent.trim() : "Delay", text: bits.join(" · ") });
  });
  return out;
}

function towOpen(ap) {
  if (!ap) return;
  if (!ap.icao && /^[A-Z]{3}$/.test(ap.iata || "") && ap.lat > 18 && ap.lat < 72 && ap.lon < -60)
    ap.icao = "K" + ap.iata;
  TOW.ap = ap;
  TOW.atis = "";
  towStop();
  var seq = ++TOW.seq,
    el = rdShell(),
    id = ap.icao || ap.iata || ap.code;
  RD.stack = [];
  el.innerHTML =
    '<div class="pgvbar"><div><b>✈ TOWER · ' +
    esc(id) +
    '</b><span class="mono">' +
    esc(String(ap.name || ap.city || "").toUpperCase()) +
    '</span></div><button class="ghost" data-pgv="x" aria-label="Close">✕</button></div><div class="pgvbody" id="pgvb">' +
    ["atis", "faa", "wx", "pirep", "board", "near"]
      .map(function (k) {
        return (
          '<article class="pgvcard towc" id="tow-' +
          k +
          '"><div class="pgvload"><i></i></div></article>'
        );
      })
      .join("") +
    '<p class="towfoot mono">FROM THE FAA, AVIATIONWEATHER.GOV, D-ATIS (DATIS.CLOWD.IO)' +
    (KEYS.adb ? " AND AERODATABOX" : "") +
    " · FOR INTEREST ONLY, NOT FOR FLIGHT PLANNING</p></div>";
  var put = function (k, html) {
      if (seq === TOW.seq && $("tow-" + k)) $("tow-" + k).innerHTML = html;
    },
    head = function (tag, title) {
      return '<span class="tag mono">' + tag + "</span><h3>" + title + "</h3>";
    },
    awc = "https://aviationweather.gov/api/data/";

  // ATIS
  if (!ap.icao) put("atis", head("ATIS", "Tower broadcast") + "<p>No airport code to look up.</p>");
  else
    netGet("https://datis.clowd.io/api/" + ap.icao, 15000)
      .then(function (j) {
        var L = (Array.isArray(j) ? j : []).filter(function (x) {
          return x && x.datis;
        });
        if (!L.length) throw new Error("none");
        TOW.atis = L.map(function (x) {
          return x.datis;
        }).join(" ... ");
        put(
          "atis",
          head("ATIS", "Tower broadcast") +
            L.map(function (x) {
              return (
                '<div class="towatis"><b class="towlet">' +
                esc(x.code || "?") +
                '</b><div><span class="mono">' +
                esc(
                  (x.type === "arr"
                    ? "ARRIVALS"
                    : x.type === "dep"
                      ? "DEPARTURES"
                      : "ARRIVALS AND DEPARTURES") +
                    " · INFORMATION " +
                    (TOW_ABC[(x.code || "A").charCodeAt(0) - 65] || "").toUpperCase()
                ) +
                "</span><p>" +
                esc(x.datis) +
                "</p></div></div>"
              );
            }).join("") +
            '<button class="open towplay" data-tow="play">▶ LISTEN</button>'
        );
      })
      .catch(function () {
        put(
          "atis",
          head("ATIS", "Tower broadcast") +
            "<p>" +
            esc(ap.icao) +
            " has no digital ATIS. The FAA publishes it in text for about 75 larger US airports.</p>"
        );
      });

  // FAA status
  var fc = towFaa(ap);
  if (!fc)
    put(
      "faa",
      head("FAA", "Airport status") + "<p>The FAA reports status for US airports only.</p>"
    );
  else
    netGet("https://nasstatus.faa.gov/api/airport-status-information", 15000, null, true)
      .then(function (x) {
        var L = towFaaStatus(x, fc);
        put(
          "faa",
          head("FAA", "Airport status") +
            (L.length
              ? L.map(function (d) {
                  return (
                    '<div class="towwarn"><b>' +
                    esc(d.type) +
                    "</b><p>" +
                    esc(d.text) +
                    "</p></div>"
                  );
                }).join("")
              : '<p class="towok">● No delays, ground stops or closures reported for ' +
                esc(fc) +
                ".</p>")
        );
      })
      .catch(function () {
        put("faa", head("FAA", "Airport status") + "<p>The FAA status service did not answer.</p>");
      });

  // Weather
  if (ap.icao)
    Promise.all([
      netGet(awc + "metar?ids=" + ap.icao + "&format=json", 15000).catch(function () {
        return [];
      }),
      netGet(awc + "taf?ids=" + ap.icao + "&format=json", 15000).catch(function () {
        return [];
      })
    ]).then(function (r) {
      var m = (r[0] || [])[0],
        t = (r[1] || [])[0];
      if (!m && !t) {
        put(
          "wx",
          head("WEATHER", "At the field") + "<p>No current report for " + esc(ap.icao) + ".</p>"
        );
        return;
      }
      var cat = m && m.fltCat ? String(m.fltCat) : "";
      put(
        "wx",
        head("WEATHER", "At the field") +
          (m
            ? '<div class="towkv">' +
              (cat
                ? '<span>CONDITIONS</span><b class="towcat ' +
                  esc(cat.toLowerCase()) +
                  '">' +
                  esc(cat) +
                  "</b>"
                : "") +
              (m.wspd != null
                ? "<span>WIND</span><b>" +
                  (m.wdir === "VRB" ? "Variable" : esc(m.wdir) + "°") +
                  " at " +
                  esc(m.wspd) +
                  " kt" +
                  (m.wgst ? ", gusts " + esc(m.wgst) : "") +
                  "</b>"
                : "") +
              (m.visib != null ? "<span>VISIBILITY</span><b>" + esc(m.visib) + " mi</b>" : "") +
              (m.temp != null
                ? "<span>TEMPERATURE</span><b>" +
                  Math.round((m.temp * 9) / 5 + 32) +
                  "°F (" +
                  Math.round(m.temp) +
                  "°C)</b>"
                : "") +
              '</div><p class="towraw mono">' +
              esc(m.rawOb || "") +
              "</p>"
            : "") +
          (t && t.rawTAF ? '<p class="towraw mono">FORECAST · ' + esc(t.rawTAF) + "</p>" : "")
      );
    });
  else put("wx", head("WEATHER", "At the field") + "<p>No airport code to look up.</p>");

  // Pilot reports
  if (ap.icao)
    netGet(awc + "pirep?id=" + ap.icao + "&distance=100&age=3&format=json", 15000)
      .then(function (L) {
        L = (Array.isArray(L) ? L : []).slice(0, 12);
        put(
          "pirep",
          head("PILOTS", "Pilot reports nearby") +
            (L.length
              ? L.map(function (p) {
                  var urgent = /UUA|URGENT/i.test((p.airepType || "") + " " + (p.rawOb || "")),
                    tm = p.obsTime ? new Date(p.obsTime * 1000) : null;
                  return (
                    '<div class="towrep' +
                    (urgent ? " urgent" : "") +
                    '"><span class="mono">' +
                    (urgent ? "URGENT · " : "") +
                    (tm ? tm.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "") +
                    '</span><p class="mono">' +
                    esc(p.rawOb || "") +
                    "</p></div>"
                  );
                }).join("")
              : "<p>No pilot reports within 100 nautical miles in the last 3 hours.</p>")
        );
      })
      .catch(function () {
        put(
          "pirep",
          head("PILOTS", "Pilot reports nearby") + "<p>The pilot report service did not answer.</p>"
        );
      });

  // Arrivals and departures
  towBoard(ap, seq, head);

  // Aircraft nearby
  var near = PLANES.map(function (p) {
    return { p: p, km: hav(ap.lat, ap.lon, p.lat, p.lon) };
  })
    .filter(function (x) {
      return x.km <= 40;
    })
    .sort(function (a, b) {
      return a.km - b.km;
    })
    .slice(0, 10);
  put(
    "near",
    head("LIVE", "Aircraft around the airport") +
      (near.length
        ? near
            .map(function (x) {
              return (
                '<button class="towair" data-towp="' +
                esc(x.p.id) +
                '"><b>' +
                esc(x.p.n) +
                '</b><span class="mono">' +
                (x.p.alt ? Math.round(x.p.alt * 3.281).toLocaleString() + " FT · " : "") +
                Math.round(x.km * 0.621) +
                " MI</span></button>"
              );
            })
            .join("")
        : "<p>No aircraft on the map within 25 miles right now. Turn on the Aircraft layer and look at this area to load them.</p>")
  );
}

function towBoard(ap, seq, head) {
  var put = function (html) {
    if (seq === TOW.seq && $("tow-board"))
      $("tow-board").innerHTML = head("BOARD", "Arrivals and departures") + html;
  };
  if (!KEYS.adb) {
    put(
      "<p>Add your AeroDataBox key under Layers → Sources &amp; keys to see this airport's arrivals and departures.</p>"
    );
    return;
  }
  if (!ap.icao) {
    put("<p>No airport code to look up.</p>");
    return;
  }
  netGet(
    "https://aerodatabox.p.rapidapi.com/flights/airports/icao/" +
      ap.icao +
      "?offsetMinutes=-60&durationMinutes=360&withLeg=true&direction=Both&withCancelled=true&withCodeshared=false&withCargo=false&withPrivate=false",
    20000,
    { "X-RapidAPI-Key": KEYS.adb, "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com" }
  )
    .then(function (j) {
      var row = function (f, dir) {
        var m = f.movement || {},
          when =
            (m.revisedTime && m.revisedTime.local) ||
            (m.scheduledTime && m.scheduledTime.local) ||
            "",
          hm = /(\d{2}:\d{2})/.exec(when),
          late =
            m.revisedTime &&
            m.scheduledTime &&
            m.revisedTime.local &&
            m.revisedTime.local !== m.scheduledTime.local;
        return (
          '<div class="towrow"><b class="mono">' +
          esc(hm ? hm[1] : "--:--") +
          "</b><div><b>" +
          esc(f.number || "") +
          " " +
          (dir === "dep" ? "to " : "from ") +
          esc((m.airport && (m.airport.municipalityName || m.airport.name)) || "") +
          '</b><span class="mono">' +
          esc(
            [
              f.airline && f.airline.name,
              m.terminal && "T" + m.terminal,
              m.gate && "GATE " + m.gate
            ]
              .filter(Boolean)
              .join(" · ")
          ) +
          '</span></div><em class="mono' +
          (/cancel/i.test(f.status || "") ? " bad" : late ? " late" : "") +
          '">' +
          esc(String(f.status || "").toUpperCase()) +
          "</em></div>"
        );
      };
      var arr = (j.arrivals || []).slice(0, 12),
        dep = (j.departures || []).slice(0, 12);
      put(
        (arr.length
          ? "<h4>ARRIVALS</h4>" +
            arr
              .map(function (f) {
                return row(f, "arr");
              })
              .join("")
          : "") +
          (dep.length
            ? "<h4>DEPARTURES</h4>" +
              dep
                .map(function (f) {
                  return row(f, "dep");
                })
                .join("")
            : "") || "<p>No flights listed in the next six hours.</p>"
      );
    })
    .catch(function () {
      put("<p>The flight board did not answer. Check your AeroDataBox key.</p>");
    });
}

// ----- reading the ATIS aloud: the phone's own voice in the app, the browser's voice elsewhere -----
function towListen() {
  if (!TOW.heard) {
    TOW.heard = true;
    var p = natv();
    if (p && p.addListener)
      try {
        p.addListener("speechDone", towDone);
      } catch (x) {}
  }
}
function towSay() {
  if (!TOW.atis) return;
  towListen();
  TOW.talking = true;
  towBtn();
  var text = towSpeech(TOW.atis);
  if (natv()) natCall("speak", { text: text });
  else if (window.speechSynthesis) {
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.onend = towDone;
    u.onerror = towDone;
    speechSynthesis.speak(u);
  } else towDone();
}
function towStop() {
  if (!TOW.talking) return;
  if (natv()) natCall("stopSpeaking");
  else if (window.speechSynthesis) speechSynthesis.cancel();
  towDone();
}
function towDone() {
  TOW.talking = false;
  towBtn();
}
function towBtn() {
  var b = document.querySelector("[data-tow='play']");
  if (b) b.textContent = TOW.talking ? "❚❚ PAUSE" : "▶ LISTEN";
}

document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-tower]");
  if (b) {
    var r = selected && selected.kind === "plane" && selected.route,
      a = r && r[b.getAttribute("data-tower")];
    if (a)
      towOpen({
        icao: a.icao,
        iata: a.iata,
        code: a.code,
        name: a.name,
        city: a.city,
        lat: a.lat,
        lon: a.lon
      });
    return;
  }
  if (e.target.closest("[data-tow='play']")) {
    if (TOW.talking) towStop();
    else towSay();
    return;
  }
  var t = e.target.closest("[data-towp]");
  if (t) {
    var id = t.getAttribute("data-towp"),
      p = PLANES.filter(function (x) {
        return x.id === id;
      })[0];
    towStop();
    closePage();
    if (p) select(p);
  }
});
