/**
 * @file Energy, geology, climate, culture, area facts and farming layers.
 * Power plants and fuel stations (OpenStreetMap); volcanoes (Smithsonian GVP) with current US
 * alert levels (USGS); the US Drought Monitor and a live temperature grid (Open-Meteo); museums,
 * historic sites and UNESCO World Heritage sites (OpenStreetMap); populated places (Wikidata);
 * and country facts and farming indicators (World Bank). Built on the info-layer framework.
 *
 * Module 35 of 39. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Energy (OpenStreetMap) ----------
var PLANT_COLORS = {
  solar: "#ffd84a",
  wind: "#7fe3ff",
  hydro: "#4c8dff",
  nuclear: "#c58bff",
  gas: "#ff9a2e",
  coal: "#9a8478",
  oil: "#a0522d",
  biomass: "#7fd36b",
  geothermal: "#ff6a5e",
  battery: "#39ff6a"
};

function plantOutput(v) {
  var m = /^([\d.]+)\s*(GW|MW|kW|W)?/i.exec(String(v || ""));
  if (!m) return "—";
  var n = parseFloat(m[1]),
    u = (m[2] || "MW").toUpperCase();
  var mw = u === "GW" ? n * 1000 : u === "KW" ? n / 1000 : u === "W" ? n / 1e6 : n;
  return mw >= 1000
    ? (mw / 1000).toFixed(2) + " GW"
    : (Math.round(mw * 10) / 10).toLocaleString() + " MW";
}

osmLayer({
  key: "powerplant",
  label: "Power plants",
  color: "#ffd84a",
  icon: "⚡",
  tag: "Power plant · OpenStreetMap",
  unnamed: "Power plant",
  filter: '["power"="plant"]',
  maxKm: 500,
  rows: function (t) {
    var src = String(t["plant:source"] || "").split(";")[0];
    return [
      ["SOURCE OF POWER", src ? tfWords(src) : "—"],
      ["OUTPUT", plantOutput(t["plant:output:electricity"])],
      ["METHOD", t["plant:method"] ? tfWords(t["plant:method"]) : "—"]
    ];
  },
  colorOf: function (t) {
    return PLANT_COLORS[String(t["plant:source"] || "").split(";")[0]];
  }
});

osmLayer({
  key: "fuel",
  label: "Fuel stations",
  color: "#ff9a2e",
  icon: "⛽",
  tag: "Fuel station · OpenStreetMap",
  unnamed: "Fuel station",
  filter: '["amenity"="fuel"]',
  rows: function (t) {
    var fuels = Object.keys(t)
      .filter(function (k) {
        return /^fuel:/.test(k) && t[k] === "yes";
      })
      .map(function (k) {
        return tfWords(k.slice(5));
      });
    return [
      ["BRAND", t.brand || "—"],
      ["FUELS", fuels.join(", ") || "—"],
      ["HOURS", t.opening_hours || "—"]
    ];
  }
});

// ---------- Volcanoes (Smithsonian GVP) and US alert levels (USGS HANS) ----------
var VOL_CODES = { GREEN: "#39d98a", YELLOW: "#ffd84a", ORANGE: "#ff9a2e", RED: "#ff4d5e" };

function volItems(d, feats, alerts) {
  var al = {};
  (alerts || []).forEach(function (a) {
    if (a.vnum) al[String(a.vnum)] = a;
  });
  return (feats || []).reduce(function (out, f) {
    var p = f.properties || {},
      g = (f.geometry && f.geometry.coordinates) || [p.Longitude, p.Latitude],
      a = al[String(p.Volcano_Number)],
      code = a && String(a.color_code || "").toUpperCase(),
      yr = num(p.Last_Eruption_Year);
    if (num(g[1]) == null) return out;
    out.push(
      ilItem(d, {
        id: "vol:" + p.Volcano_Number,
        n: p.Volcano_Name || "Volcano",
        label: a ? String(p.Volcano_Name).toUpperCase() + " " + code : "",
        lat: num(g[1]),
        lon: num(g[0]),
        color:
          (a && VOL_CODES[code]) ||
          (yr != null && yr >= new Date().getFullYear() - 1 ? "#ff6a2e" : "#a0522d"),
        size: a ? 7 : 3.5,
        big: !!a,
        tag: a
          ? "USGS " + code + " · " + String(a.alert_level || "").toUpperCase()
          : "Volcano · Smithsonian GVP",
        links: [
          [
            "Smithsonian volcano profile",
            "https://volcano.si.edu/volcano.cfm?vn=" + encodeURIComponent(p.Volcano_Number)
          ]
        ].concat(a && a.notice_url ? [["Latest USGS notice", safeUrl(a.notice_url)]] : []),
        rows: [
          ["TYPE", p.Primary_Volcano_Type || "—"],
          ["LAST ERUPTION", yr == null ? "Unknown" : yr < 0 ? Math.abs(yr) + " BCE" : String(yr)],
          [
            "ELEVATION",
            p.Elevation != null ? Math.round(p.Elevation).toLocaleString() + " m" : "—"
          ],
          ["COUNTRY", p.Country || "—"],
          ["REGION", p.Subregion || p.Region || "—"]
        ]
          .concat(
            a
              ? [
                  ["US ALERT", String(a.alert_level || "—") + " · aviation " + (code || "—")],
                  ["NOTICE SENT", a.sent_utc ? a.sent_utc + " UTC" : "—"]
                ]
              : []
          )
          .concat([
            [
              "SOURCE",
              "Smithsonian Global Volcanism Program" + (a ? "; USGS Volcano Hazards Program" : "")
            ]
          ])
      })
    );
    return out;
  }, []);
}

ilDef({
  key: "volcano",
  label: "Volcanoes",
  color: "#ff6a2e",
  icon: "🌋",
  every: 30 * 60000,
  load: function (d) {
    return Promise.all([
      getJSON(
        "https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&outputFormat=application/json&propertyName=Volcano_Number,Volcano_Name,Primary_Volcano_Type,Last_Eruption_Year,Country,Region,Subregion,Elevation,GeoLocation",
        40000
      ),
      getJSON(
        "https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes",
        20000
      ).catch(function () {
        return [];
      })
    ]).then(function (r) {
      return volItems(d, (r[0] || {}).features, r[1]);
    });
  }
});

// ---------- US Drought Monitor ----------
var DM_CATS = [
  ["Abnormally dry", "#ffff00", "rgba(255,255,0,.16)"],
  ["Moderate drought", "#fcd37f", "rgba(252,211,127,.22)"],
  ["Severe drought", "#ffaa00", "rgba(255,170,0,.26)"],
  ["Extreme drought", "#e60000", "rgba(230,0,0,.28)"],
  ["Exceptional drought", "#730000", "rgba(115,0,0,.34)"]
];

// Split each category's multipolygon into its parts so every area can be tapped on its own.
function droughtItems(d, gj) {
  var out = [];
  ((gj && gj.features) || []).forEach(function (f) {
    var p = f.properties || {},
      cat = DM_CATS[num(p.DM)],
      g = f.geometry || {},
      polys =
        g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    if (!cat) return;
    polys.forEach(function (rings, i) {
      if (!rings || !rings[0] || rings[0].length < 4) return;
      var b = ringsBox(rings);
      if ((b.e - b.w) * (b.n - b.s) < 0.01) return;
      out.push(
        ilItem(d, {
          id: "dm:" + p.DM + ":" + i,
          n: cat[0],
          label: "",
          lat: (b.s + b.n) / 2,
          lon: (b.w + b.e) / 2,
          rings: rings,
          fill: cat[2],
          color: cat[1],
          noMark: true,
          tag: "D" + p.DM + " · " + cat[0],
          rows: [
            ["CATEGORY", "D" + p.DM + " · " + cat[0]],
            ["MAP VALID", p.ValidStart ? ilWhen(p.ValidStart) + " to " + ilWhen(p.ValidEnd) : "—"],
            [
              "SHARE OF US",
              p.CatagoricalPerct != null ? p.CatagoricalPerct + "% at D" + p.DM + " or worse" : "—"
            ],
            ["SOURCE", "U.S. Drought Monitor (NDMC, USDA, NOAA)"]
          ]
        })
      );
    });
  });
  return out;
}

ilDef({
  key: "drought",
  label: "Drought (US)",
  color: "#ffaa00",
  icon: "🏜",
  every: 12 * 3600000,
  drawKm: 12000,
  ringKm: 12000,
  load: function (d) {
    return getJSON(
      "https://services5.arcgis.com/0OTVzJS4K09zlixn/ArcGIS/rest/services/USDM_current/FeatureServer/0/query?where=1%3D1&outFields=DM,ValidStart,ValidEnd,CatagoricalPerct&outSR=4326&maxAllowableOffset=0.02&geometryPrecision=3&f=geojson",
      40000
    ).then(function (gj) {
      return droughtItems(d, gj);
    });
  }
});

// ---------- Temperature now (Open-Meteo) ----------
function tempColor(c) {
  if (c == null) return "#7d93a8";
  if (c <= -10) return "#9f7aff";
  if (c <= 0) return "#4c8dff";
  if (c <= 10) return "#4cc3ff";
  if (c <= 20) return "#39d98a";
  if (c <= 30) return "#ffd84a";
  if (c <= 38) return "#ff9a2e";
  return "#ff4d5e";
}

function tempText(c) {
  return c == null ? "—" : Math.round(c) + "°C / " + Math.round((c * 9) / 5 + 32) + "°F";
}

ilDef({
  key: "tempnow",
  label: "Temperature now",
  color: "#ffd84a",
  icon: "🌡",
  every: 30 * 60000,
  maxKm: 6000,
  drawKm: 6000,
  byArea: true,
  load: function (d, b) {
    var pts = aqGrid(b, 6),
      col = function (k) {
        return pts
          .map(function (p) {
            return p[k];
          })
          .join(",");
      };
    return getJSON(
      "https://api.open-meteo.com/v1/forecast?current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m&latitude=" +
        col(0) +
        "&longitude=" +
        col(1),
      25000
    ).then(function (j) {
      return [].concat(j || []).reduce(function (out, r, i) {
        var c = (r && r.current) || {},
          t = num(c.temperature_2m),
          p = pts[i];
        if (t == null || !p) return out;
        out.push(
          ilItem(d, {
            id: "temp:" + p[0] + "," + p[1],
            n: "Temperature " + tempText(t),
            label: Math.round(t) + "° / " + Math.round((t * 9) / 5 + 32) + "°F",
            lat: p[0],
            lon: p[1],
            color: tempColor(t),
            size: 6,
            big: true,
            tag: "Temperature now · model",
            rows: [
              ["TEMPERATURE", tempText(t)],
              ["FEELS LIKE", tempText(num(c.apparent_temperature))],
              ["PRECIPITATION", c.precipitation != null ? c.precipitation + " mm" : "—"],
              ["WIND", c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) + " km/h" : "—"],
              ["SOURCE", "Open-Meteo weather model"]
            ]
          })
        );
        return out;
      }, []);
    });
  }
});

// ---------- Culture (OpenStreetMap) ----------
osmLayer({
  key: "museum",
  label: "Museums",
  color: "#c58bff",
  icon: "🏛",
  tag: "Museum · OpenStreetMap",
  unnamed: "Museum",
  filter: '["tourism"="museum"]',
  rows: function (t) {
    return [
      ["SUBJECT", t.museum ? tfWords(t.museum) : "—"],
      ["HOURS", t.opening_hours || "—"],
      ["FEE", t.fee === "no" ? "Free" : t.fee === "yes" ? "Paid" : "—"]
    ];
  }
});

osmLayer({
  key: "historic",
  label: "Historic sites",
  color: "#d9a066",
  icon: "🏰",
  tag: "Historic site · OpenStreetMap",
  unnamed: "Historic site",
  filter:
    '["historic"~"^(monument|castle|fort|archaeological_site|ruins|battlefield|monastery|city_gate|manor)$"]["name"]',
  rows: function (t) {
    return [
      ["KIND", tfWords(t.historic)],
      ["BUILT", t.start_date || "—"],
      ["HERITAGE", t.heritage ? "Listed" : "—"]
    ];
  }
});

osmLayer({
  key: "unesco",
  label: "UNESCO World Heritage",
  color: "#4cc3ff",
  icon: "🌐",
  tag: "World Heritage · OpenStreetMap",
  unnamed: "World Heritage site",
  filter: '["heritage:operator"="whc"]["name"]',
  maxKm: 4000,
  rows: function (t) {
    var ref = t["ref:whc"] || t["whc:ref"] || "";
    return [
      ["WHC NUMBER", ref || "—"],
      ["INSCRIBED", t["whc:inscription_date"] || t["heritage:inscription_date"] || "—"]
    ];
  }
});

// ---------- Populated places (Wikidata) ----------
function wdPlacesQuery(b) {
  return (
    'SELECT ?place ?placeLabel (MAX(?p) AS ?pop) (SAMPLE(?c) AS ?coord) (SAMPLE(?ar) AS ?area) (SAMPLE(?el) AS ?elev) (SAMPLE(?inc) AS ?founded) WHERE { SERVICE wikibase:box { ?place wdt:P625 ?c. bd:serviceParam wikibase:cornerSouthWest "Point(' +
    b.w.toFixed(3) +
    " " +
    b.s.toFixed(3) +
    ')"^^geo:wktLiteral; wikibase:cornerNorthEast "Point(' +
    b.e.toFixed(3) +
    " " +
    b.n.toFixed(3) +
    ')"^^geo:wktLiteral. } ?place wdt:P1082 ?p. FILTER(?p >= 1000) OPTIONAL { ?place wdt:P2046 ?ar. } OPTIONAL { ?place wdt:P2044 ?el. } OPTIONAL { ?place wdt:P571 ?inc. } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?place ?placeLabel ORDER BY DESC(?pop) LIMIT 150'
  );
}

function wdPoint(s) {
  var m = /Point\(([-\d.eE]+)\s+([-\d.eE]+)\)/.exec(String(s || ""));
  return m ? [parseFloat(m[2]), parseFloat(m[1])] : null;
}

function wdItems(d, j) {
  var rows = (j && j.results && j.results.bindings) || [],
    v = function (r, k) {
      return r[k] ? r[k].value : null;
    };
  return rows.reduce(function (out, r) {
    var at = wdPoint(v(r, "coord")),
      pop = num(v(r, "pop")),
      area = num(v(r, "area")),
      qid = String(v(r, "place") || "")
        .split("/")
        .pop();
    if (!at || pop == null) return out;
    var name = v(r, "placeLabel") || qid,
      yr = /^(-?\d{1,4})/.exec(String(v(r, "founded") || "").replace(/^\+/, ""));
    out.push(
      ilItem(d, {
        id: "wd:" + qid,
        n: name,
        label: pop >= 100000 ? name.toUpperCase() : "",
        lat: at[0],
        lon: at[1],
        color: pop >= 1e6 ? "#ff6ad5" : pop >= 1e5 ? "#c58bff" : "#9fb4c8",
        size: pop >= 1e6 ? 6 : pop >= 1e5 ? 4.5 : 3,
        tag: "Population " + Math.round(pop).toLocaleString() + " · Wikidata",
        links: /^Q\d+$/.test(qid)
          ? [["Wikidata entry", "https://www.wikidata.org/wiki/" + qid]]
          : null,
        rows: [
          ["POPULATION", Math.round(pop).toLocaleString()],
          ["AREA", area != null ? Math.round(area).toLocaleString() + " km²" : "—"],
          ["DENSITY", area ? Math.round(pop / area).toLocaleString() + " per km²" : "—"],
          ["ELEVATION", num(v(r, "elev")) != null ? Math.round(num(v(r, "elev"))) + " m" : "—"],
          ["FOUNDED", yr ? String(+yr[1]) : "—"],
          ["SOURCE", "Wikidata (CC0)"]
        ]
      })
    );
    return out;
  }, []);
}

ilDef({
  key: "places",
  label: "Area facts (places)",
  color: "#c58bff",
  icon: "🏙",
  every: 24 * 3600000,
  maxKm: 1500,
  drawKm: 1500,
  byArea: true,
  none: "NONE LISTED HERE",
  load: function (d, b) {
    return getJSON(
      "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(wdPlacesQuery(b)),
      30000
    ).then(function (j) {
      return wdItems(d, j);
    });
  }
});

// ---------- Country facts and farming (World Bank) ----------
// A World Bank indicator layer: one item per country, one row per indicator.
function wbLayer(o) {
  ilDef({
    key: o.key,
    label: o.label,
    color: o.color,
    icon: o.icon,
    every: 24 * 3600000,
    load: function (d) {
      return Promise.all(
        o.ind
          .map(function (ind) {
            return getJSON(
              "https://api.worldbank.org/v2/country/all/indicator/" +
                ind[0] +
                "?format=json&mrnev=1&per_page=400",
              30000
            ).catch(function () {
              return null;
            });
          })
          .concat([wbCountries()])
      ).then(function (r) {
        var ix = r.pop();
        return wbItems(d, r, ix, o);
      });
    }
  });
}

function wbItems(d, sets, ix, o) {
  var by = {};
  sets.forEach(function (rows, k) {
    ((rows && rows[1]) || []).forEach(function (r) {
      var c = ix.by3[r.countryiso3code],
        v = num(r.value);
      if (!c || v == null) return;
      var e = (by[c.iso2] = by[c.iso2] || { c: c, v: {}, yr: {} });
      e.v[k] = v;
      e.yr[k] = r.date;
    });
  });
  return Object.keys(by).map(function (k) {
    var e = by[k];
    return ilItem(d, {
      id: o.key + ":" + k,
      n: e.c.name,
      label: "",
      lat: e.c.lat,
      lon: e.c.lon,
      color: o.colorOf(e.v[0]),
      size: 4.5,
      tag: o.tagOf(e.v[0]) + " · World Bank",
      rows: o.ind
        .map(function (ind, i) {
          return [ind[1], wbNum(e.v[i], ind[2]) + (e.yr[i] ? " (" + e.yr[i] + ")" : "")];
        })
        .concat([["SOURCE", "World Bank, World Development Indicators"]])
    });
  });
}

function wbNum(v, kind) {
  if (v == null) return "—";
  if (kind === "pct") return (Math.round(v * 10) / 10).toFixed(1) + "%";
  if (kind === "yrs") return (Math.round(v * 10) / 10).toFixed(1) + " years";
  if (kind === "km2") return Math.round(v).toLocaleString() + " km²";
  if (kind === "kgha") return Math.round(v).toLocaleString() + " kg per hectare";
  if (kind === "big")
    return v >= 1e9
      ? (v / 1e9).toFixed(2) + " billion"
      : v >= 1e6
        ? (v / 1e6).toFixed(1) + " million"
        : Math.round(v).toLocaleString();
  return String(Math.round(v * 10) / 10);
}

wbLayer({
  key: "countryfacts",
  label: "Area facts (countries)",
  color: "#ff6ad5",
  icon: "🗺",
  ind: [
    ["SP.POP.TOTL", "POPULATION", "big"],
    ["AG.SRF.TOTL.K2", "AREA", "km2"],
    ["SP.DYN.LE00.IN", "LIFE EXPECTANCY", "yrs"],
    ["SP.URB.TOTL.IN.ZS", "LIVING IN CITIES", "pct"],
    ["IT.NET.USER.ZS", "USING THE INTERNET", "pct"],
    ["EG.ELC.ACCS.ZS", "WITH ELECTRICITY", "pct"]
  ],
  colorOf: function (pop) {
    return pop >= 1e8 ? "#ff6ad5" : pop >= 2e7 ? "#c58bff" : "#9fb4c8";
  },
  tagOf: function (pop) {
    return pop != null ? wbNum(pop, "big") + " people" : "Country facts";
  }
});

wbLayer({
  key: "farming",
  label: "Farming by country",
  color: "#9fe870",
  icon: "🌾",
  ind: [
    ["AG.LND.AGRI.ZS", "FARMLAND", "pct"],
    ["AG.YLD.CREL.KG", "CEREAL YIELD", "kgha"],
    ["NV.AGR.TOTL.ZS", "SHARE OF ECONOMY", "pct"],
    ["SL.AGR.EMPL.ZS", "SHARE OF JOBS", "pct"],
    ["AG.LND.IRIG.AG.ZS", "IRRIGATED FARMLAND", "pct"]
  ],
  colorOf: function (pct) {
    return pct == null
      ? "#7d93a8"
      : pct >= 60
        ? "#5fbf5f"
        : pct >= 35
          ? "#9fe870"
          : pct >= 15
            ? "#ffd84a"
            : "#d9a066";
  },
  tagOf: function (pct) {
    return pct != null ? wbNum(pct, "pct") + " farmland" : "Farming";
  }
});

osmLayer({
  key: "farmshop",
  label: "Farm shops & markets",
  color: "#9fe870",
  icon: "🧺",
  tag: "Farm shop · OpenStreetMap",
  unnamed: "Farm shop",
  filter: '["shop"="farm"]',
  rows: function (t) {
    return [
      ["SELLS", t.produce ? tfWords(t.produce) : "—"],
      ["HOURS", t.opening_hours || "—"]
    ];
  }
});
