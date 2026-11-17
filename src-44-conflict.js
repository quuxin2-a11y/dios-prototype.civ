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

// ---------- Military aircraft and drones (public ADS-B) ----------
// Military aircraft that broadcast their position, from adsb.lol's open feed. Large drones such as
// the RQ-4 Global Hawk, MQ-4C Triton and MQ-9 Reaper appear when their transponder is on, which
// is often over international waters and rarely over a combat area itself. No public source
// streams video from military drones.
var MIL_DRONE = /^(GLHK|Q4|Q9|Q1|MQ|RQ|HRON|HERM|TB2|UAV|DRON)/i,
  MIL_DRONE_DESC = /unmanned|global hawk|triton|reaper|predator|heron|hermes|bayraktar|drone/i;

ilDef({
  key: "military",
  label: "Military aircraft & drones",
  color: "#ffb020",
  icon: "✈",
  every: 60000,
  none: "NONE BROADCASTING",
  status: function (d) {
    var n = d.items.filter(function (x) {
      return x.drone;
    }).length;
    return d.items.length
      ? d.items.length.toLocaleString() + (n ? " · " + n + " DRONE" + (n > 1 ? "S" : "") : "")
      : "NONE BROADCASTING";
  },
  load: function (d) {
    return getJSON("https://api.adsb.lol/v2/mil", 20000).then(function (j) {
      return ((j && j.ac) || [])
        .filter(function (a) {
          return a.lat != null && a.lon != null;
        })
        .map(function (a) {
          var drone = MIL_DRONE.test(a.t || "") || MIL_DRONE_DESC.test(a.desc || ""),
            cs = String(a.flight || "").trim();
          return ilItem(d, {
            id: "mil:" + a.hex,
            n: (drone ? "Drone · " : "") + (cs || a.r || a.hex.toUpperCase()),
            label: drone ? cs || "DRONE" : "",
            drone: drone,
            color: drone ? "#ff3b6b" : null,
            lat: num(a.lat),
            lon: num(a.lon),
            size: drone ? 6 : 4,
            tag: drone ? "DRONE" : "MILITARY",
            rows: [
              ["TYPE", a.desc || a.t || "—"],
              ["CALLSIGN", cs || "—"],
              [
                "ALTITUDE",
                a.alt_baro === "ground"
                  ? "On the ground"
                  : a.alt_baro != null
                    ? Math.round(a.alt_baro).toLocaleString() + " ft"
                    : "—"
              ],
              ["SPEED", a.gs != null ? Math.round(a.gs) + " kt" : "—"],
              ["SOURCE", "adsb.lol (public ADS-B)"]
            ]
          });
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
  setLayer("military", true);
  if (IL.conflict && !IL.conflict.items.length) ilLoad(IL.conflict, true);
  CF.open = true;
  cfDraw();
}

function cfClose() {
  CF.open = false;
  var el = $("cfp");
  if (el) el.style.display = "none";
}

// " · 41 MILITARY AIRCRAFT · 2 DRONES" from the public ADS-B layer, when it has loaded.
function cfMilLine() {
  var m = IL.military;
  if (!m || !m.items.length) return "";
  var n = m.items.filter(function (x) {
    return x.drone;
  }).length;
  return (
    " · " +
    m.items.length +
    " MILITARY AIRCRAFT" +
    (n ? " · " + n + " DRONE" + (n > 1 ? "S" : "") : "")
  );
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
      " DO-NOT-TRAVEL COUNTRIES" +
      cfMilLine() +
      '</span><button data-cf="x" aria-label="Close">✕</button></div>' +
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
        '<div class="cfline"><button class="cfrow" data-cf="go-' +
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
        '</em></button><button class="cfcam" data-cf="cam-' +
        i +
        '" aria-label="Live cameras around this place">▦</button></div>'
      );
    })
    .join("");
  h +=
    '</div><p class="cffoot">Machine-coded from news reports by GDELT and not verified. Each report links its source. Shaded countries carry a US "Do not travel" advisory.</p>';
  el.innerHTML = h;
  el.style.display = "flex";
  CF.list = list;
  CF.drawn = all.length + ":" + d.at + ":" + CF.kind + cfMilLine();
}

setInterval(function () {
  if (
    CF.open &&
    IL.conflict &&
    CF.drawn !== IL.conflict.items.length + ":" + IL.conflict.at + ":" + CF.kind + cfMilLine()
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
  } else if (k.indexOf("cam-") === 0) {
    // The public cameras around the place named in the report, in the camera grid (module 45).
    var r = CF.list && CF.list[+k.slice(4)];
    if (!r) return;
    cfClose();
    cgOpen(String(r.n).split(" · ").slice(1).join(", ") || "");
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

// ---------- Organized crime groups ----------
// The best-known criminal groups, placed where they are based, with what public reporting says they
// are known for, and whether the US State Department has designated them a Foreign Terrorist
// Organization. Groups only: no individual leaders or photos, since who leads them changes fast and
// much of it is unproven. Each card links to the group's Wikipedia article for more.
var CRIME_FTO = "https://www.state.gov/foreign-terrorist-organizations";
// [name, lat, lon, where it operates, known for, US FTO designation ("" if none), Wikipedia title]
var CRIME = [
  [
    "Sinaloa Cartel",
    24.8,
    -107.39,
    "Mexico, the US and worldwide",
    "Fentanyl, methamphetamine, cocaine and heroin trafficking; smuggling guns south from the US; money laundering",
    "February 20, 2025",
    "Sinaloa_Cartel"
  ],
  [
    "Jalisco New Generation Cartel (CJNG)",
    20.67,
    -103.35,
    "Mexico, the US and worldwide",
    "Fentanyl, methamphetamine and cocaine trafficking; fuel theft; extortion",
    "February 20, 2025",
    "Jalisco_New_Generation_Cartel"
  ],
  [
    "Gulf Cartel",
    25.87,
    -97.5,
    "Tamaulipas, Mexico",
    "Cocaine and marijuana trafficking; migrant smuggling; extortion",
    "February 20, 2025",
    "Gulf_Cartel"
  ],
  [
    "Cartel del Noreste",
    27.48,
    -99.51,
    "Northeast Mexico",
    "Drug trafficking; migrant smuggling; extortion",
    "February 20, 2025",
    "Cartel_del_Noreste"
  ],
  [
    "La Nueva Familia Michoacana",
    18.35,
    -100.65,
    "Guerrero, Michoacán and the State of Mexico",
    "Methamphetamine; extortion",
    "February 20, 2025",
    "La_Nueva_Familia_Michoacana"
  ],
  [
    "Cárteles Unidos",
    19.09,
    -102.35,
    "Michoacán, Mexico",
    "Methamphetamine; extortion of avocado and lime growers",
    "February 20, 2025",
    "Cárteles_Unidos"
  ],
  [
    "Los Viagras",
    19.0,
    -102.1,
    "Michoacán, Mexico",
    "Extortion; drug trafficking",
    "Designated",
    "Los_Viagras"
  ],
  [
    "Juárez Cartel",
    31.69,
    -106.42,
    "Chihuahua, Mexico",
    "Drug trafficking across the El Paso border",
    "Designated",
    "Juárez_Cartel"
  ],
  [
    "MS-13 (Mara Salvatrucha)",
    13.69,
    -89.19,
    "El Salvador, Honduras, Guatemala and the US",
    "Extortion; drug dealing; violence",
    "February 20, 2025",
    "MS-13"
  ],
  [
    "Barrio 18",
    14.63,
    -90.51,
    "Guatemala, Honduras, El Salvador and the US",
    "Extortion; violence",
    "Designated",
    "18th_Street_gang"
  ],
  [
    "Tren de Aragua",
    10.25,
    -67.6,
    "Venezuela, South America and the US",
    "Human trafficking and migrant smuggling; extortion; drug dealing",
    "February 20, 2025",
    "Tren_de_Aragua"
  ],
  [
    "Cartel de los Soles",
    10.49,
    -66.88,
    "Venezuela",
    "Described by the US government as a cocaine-trafficking network inside Venezuela's state; Venezuela denies it exists",
    "Designated",
    "Cartel_of_the_Suns"
  ],
  [
    "Clan del Golfo",
    8.1,
    -76.73,
    "Colombia",
    "Cocaine production and trafficking; illegal mining",
    "Designated",
    "Gulf_Clan"
  ],
  [
    "Los Choneros",
    -0.95,
    -80.73,
    "Ecuador",
    "Cocaine trafficking through Ecuador's ports; control of prisons; extortion",
    "Designated",
    "Los_Choneros"
  ],
  [
    "Los Lobos",
    -2.19,
    -79.89,
    "Ecuador",
    "Cocaine trafficking; illegal gold mining; extortion",
    "Designated",
    "Los_Lobos_(Ecuador)"
  ],
  [
    "Viv Ansanm",
    18.54,
    -72.34,
    "Port-au-Prince, Haiti",
    "Armed control of neighbourhoods; kidnapping; extortion",
    "Designated",
    "Viv_Ansanm"
  ],
  [
    "Gran Grif",
    19.15,
    -72.69,
    "Artibonite, Haiti",
    "Kidnapping; extortion; attacks on towns",
    "Designated",
    "Gran_Grif"
  ],
  [
    "Primeiro Comando da Capital (PCC)",
    -23.55,
    -46.63,
    "Brazil, South America and Europe",
    "Cocaine trafficking to Europe; control of prisons",
    "",
    "Primeiro_Comando_da_Capital"
  ],
  [
    "Comando Vermelho",
    -22.91,
    -43.2,
    "Rio de Janeiro and the Amazon, Brazil",
    "Drug trafficking; arms; control of favelas",
    "",
    "Comando_Vermelho"
  ],
  [
    "'Ndrangheta",
    38.1,
    16.0,
    "Calabria, Italy, and worldwide",
    "Cocaine import into Europe; money laundering; public contracts",
    "",
    "'Ndrangheta"
  ],
  [
    "Camorra",
    40.85,
    14.27,
    "Naples, Italy",
    "Drug trafficking; extortion; counterfeit goods; illegal waste dumping",
    "",
    "Camorra"
  ],
  [
    "Cosa Nostra (Sicilian Mafia)",
    38.12,
    13.36,
    "Sicily, Italy",
    "Extortion; public contracts; drug trafficking",
    "",
    "Sicilian_Mafia"
  ],
  [
    "Mocro Maffia",
    52.37,
    4.9,
    "Netherlands and Belgium",
    "Cocaine trafficking through Rotterdam and Antwerp",
    "",
    "Mocro_Maffia"
  ],
  [
    "Albanian organized crime",
    41.33,
    19.82,
    "Albania and across Europe",
    "Cocaine and heroin trafficking; cannabis",
    "",
    "Albanian_mafia"
  ],
  [
    "Yamaguchi-gumi",
    34.69,
    135.19,
    "Japan",
    "Japan's largest yakuza group: extortion, gambling, methamphetamine",
    "",
    "Yamaguchi-gumi"
  ],
  [
    "Sun Yee On (triad)",
    22.31,
    114.17,
    "Hong Kong and abroad",
    "Drug trafficking; illegal gambling; money laundering",
    "",
    "Sun_Yee_On"
  ],
  [
    "Black Axe",
    6.45,
    3.39,
    "Nigeria and worldwide",
    "Internet and romance fraud; money laundering",
    "",
    "Black_Axe_(confraternity)"
  ]
];

ilDef({
  key: "crime",
  label: "Organized crime groups",
  color: "#ff5ab4",
  icon: "◈",
  every: 24 * 3600000,
  none: "NONE",
  load: function (d) {
    return Promise.resolve(
      CRIME.map(function (g) {
        return ilItem(d, {
          id: "crime:" + g[6],
          n: g[0],
          label: g[0].replace(/ \(.*\)$/, ""),
          lat: g[1],
          lon: g[2],
          size: g[5] ? 6 : 5,
          color: g[5] ? "#ff3b6b" : "#ff8fcf",
          tag: g[5] ? "US-DESIGNATED TERRORIST ORGANIZATION" : "ORGANIZED CRIME",
          rows: [
            ["OPERATES IN", g[3]],
            ["KNOWN FOR", g[4]],
            [
              "US TERRORIST DESIGNATION",
              g[5]
                ? g[5] === "Designated"
                  ? "Yes, by the State Department"
                  : "Yes, " + g[5]
                : "No"
            ],
            ["SOURCE", "Public reporting summarized; see the links"]
          ],
          links: [
            [
              "About this group (Wikipedia)",
              "https://en.wikipedia.org/wiki/" + encodeURIComponent(g[6])
            ]
          ].concat(g[5] ? [["US Foreign Terrorist Organizations", CRIME_FTO]] : [])
        });
      })
    );
  }
});

// ---------- Leaders: who runs each country, and each US state ----------
// Heads of state and government for every country, and each US state's governor and senators with
// their party, live from Wikidata (community-edited, so it follows elections within days). US states
// are coloured by the governor's party. Names, offices and parties only.
var LEAD_D = "Q29552", // Democratic Party (United States)
  LEAD_R = "Q29468"; // Republican Party (United States)

function leadPoint(wkt) {
  var m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(wkt || "");
  return m ? [+m[2], +m[1]] : null;
}

function leadSparql(q) {
  return getJSON(
    "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q),
    30000
  ).then(function (j) {
    return (j && j.results && j.results.bindings) || [];
  });
}

function leadV(b, k) {
  return (b[k] && b[k].value) || "";
}

function leadQ(b, k) {
  return leadV(b, k).split("/").pop();
}

// D, R or another party's name, from all the parties listed for a person.
function leadParty(ids, names) {
  if (ids.indexOf(LEAD_D) >= 0) return "D";
  if (ids.indexOf(LEAD_R) >= 0) return "R";
  return names[0] || "";
}

function leadWorld(d) {
  return leadSparql(
    'SELECT ?iso ?cLabel ?coord ?hs ?hsLabel ?hg ?hgLabel ?hsoLabel ?hgoLabel WHERE{?c wdt:P31 wd:Q6256;wdt:P297 ?iso. FILTER NOT EXISTS{?c wdt:P576 ?x} OPTIONAL{?c wdt:P36 ?cap. ?cap wdt:P625 ?coord} OPTIONAL{?c wdt:P35 ?hs} OPTIONAL{?c wdt:P6 ?hg} OPTIONAL{?c wdt:P1906 ?hso} OPTIONAL{?c wdt:P1313 ?hgo} SERVICE wikibase:label{bd:serviceParam wikibase:language "en"}}'
  ).then(function (B) {
    var by = {};
    B.forEach(function (b) {
      var k = leadV(b, "iso"),
        c = (by[k] = by[k] || {
          name: leadV(b, "cLabel"),
          at: null,
          hs: {},
          hg: {},
          hso: "",
          hgo: ""
        });
      c.at = c.at || leadPoint(leadV(b, "coord"));
      if (leadV(b, "hsLabel")) c.hs[leadV(b, "hsLabel")] = 1;
      if (leadV(b, "hgLabel")) c.hg[leadV(b, "hgLabel")] = 1;
      c.hso = c.hso || leadV(b, "hsoLabel");
      c.hgo = c.hgo || leadV(b, "hgoLabel");
    });
    return Object.keys(by)
      .filter(function (k) {
        return by[k].at && k !== "US";
      })
      .map(function (k) {
        var c = by[k],
          hs = Object.keys(c.hs).join(", "),
          hg = Object.keys(c.hg).join(", ");
        return ilItem(d, {
          id: "lead:" + k,
          n: c.name + (hs ? " · " + hs : ""),
          label: c.name,
          lat: c.at[0],
          lon: c.at[1],
          size: 4,
          tag: "LEADERS",
          rows: [
            [String(c.hso || "Head of state").toUpperCase(), hs || "—"],
            [
              String(c.hgo || "Head of government").toUpperCase(),
              hg && hg !== hs ? hg : hs ? "The same person" : "—"
            ],
            ["SOURCE", "Wikidata (community-edited)"]
          ],
          links: [
            [
              "More (Wikipedia)",
              "https://en.wikipedia.org/wiki/Politics_of_" +
                encodeURIComponent(c.name.replace(/ /g, "_"))
            ]
          ]
        });
      });
  });
}

function leadUS(d) {
  return leadSparql(
    'SELECT ?s ?sLabel ?coord ?gov ?govLabel ?gp ?gpLabel ?sen ?senLabel ?sp ?spLabel WHERE{?s wdt:P31 wd:Q35657. OPTIONAL{?s wdt:P36 ?cap. ?cap wdt:P625 ?coord} OPTIONAL{?s wdt:P6 ?gov. OPTIONAL{?gov wdt:P102 ?gp}} OPTIONAL{?sen p:P39 ?st. ?st ps:P39 wd:Q4416090; (pq:P768|pq:P1268) ?s. FILTER NOT EXISTS{?st pq:P582 ?e} OPTIONAL{?sen wdt:P102 ?sp}} SERVICE wikibase:label{bd:serviceParam wikibase:language "en"}}'
  ).then(function (B) {
    var by = {};
    B.forEach(function (b) {
      var k = leadQ(b, "s"),
        s = (by[k] = by[k] || {
          name: leadV(b, "sLabel"),
          at: null,
          gov: "",
          gp: [],
          gpn: [],
          sen: {}
        });
      s.at = s.at || leadPoint(leadV(b, "coord"));
      if (leadV(b, "govLabel")) s.gov = leadV(b, "govLabel");
      if (leadQ(b, "gp") && s.gp.indexOf(leadQ(b, "gp")) < 0) {
        s.gp.push(leadQ(b, "gp"));
        s.gpn.push(leadV(b, "gpLabel"));
      }
      var sn = leadV(b, "senLabel");
      if (sn) {
        var x = (s.sen[sn] = s.sen[sn] || { p: [], pn: [] });
        if (leadQ(b, "sp") && x.p.indexOf(leadQ(b, "sp")) < 0) {
          x.p.push(leadQ(b, "sp"));
          x.pn.push(leadV(b, "spLabel"));
        }
      }
    });
    var count = { D: 0, R: 0 };
    var items = Object.keys(by)
      .filter(function (k) {
        return by[k].at;
      })
      .map(function (k) {
        var s = by[k],
          gp = leadParty(s.gp, s.gpn),
          sens = Object.keys(s.sen)
            .slice(0, 2)
            .map(function (n) {
              var p = leadParty(s.sen[n].p, s.sen[n].pn);
              return n + (p ? " (" + p + ")" : "");
            });
        if (gp === "D" || gp === "R") count[gp]++;
        return ilItem(d, {
          id: "lead:us:" + k,
          n: s.name + " · Gov. " + (s.gov || "—") + (gp ? " (" + gp + ")" : ""),
          label: s.name + (gp === "D" || gp === "R" ? " · " + gp : ""),
          lat: s.at[0],
          lon: s.at[1],
          size: 6,
          color: gp === "D" ? "#3b82f6" : gp === "R" ? "#ef4444" : "#a3a3a3",
          tag: gp === "D" ? "DEMOCRATIC GOVERNOR" : gp === "R" ? "REPUBLICAN GOVERNOR" : "GOVERNOR",
          rows: [
            [
              "GOVERNOR",
              (s.gov || "—") +
                (gp ? " (" + (gp === "D" ? "Democrat" : gp === "R" ? "Republican" : gp) + ")" : "")
            ],
            ["US SENATORS", sens.join(" · ") || "—"],
            ["SOURCE", "Wikidata (community-edited)"]
          ],
          links: [
            [
              "More (Wikipedia)",
              "https://en.wikipedia.org/wiki/" + encodeURIComponent(s.name.replace(/ /g, "_"))
            ]
          ]
        });
      });
    LEAD.us = count;
    return items;
  });
}

var LEAD = { us: null };

ilDef({
  key: "leaders",
  label: "Leaders and parties",
  color: "#c9b6ff",
  icon: "★",
  every: 12 * 3600000,
  none: "NOT LOADED",
  status: function (d) {
    var u = LEAD.us;
    return d.items.length
      ? d.items.length + (u ? " · US GOVERNORS " + u.D + " D · " + u.R + " R" : "")
      : "NOT LOADED";
  },
  load: function (d) {
    return Promise.all([
      leadWorld(d).catch(function () {
        return [];
      }),
      leadUS(d).catch(function () {
        return [];
      })
    ]).then(function (r) {
      return r[0].concat(r[1]);
    });
  }
});
