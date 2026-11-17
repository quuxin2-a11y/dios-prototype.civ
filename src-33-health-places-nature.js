/**
 * @file Health, public places and nature layers.
 * Disease outbreak news (WHO), pharmacies, libraries, public toilets, EV chargers, free Wi-Fi,
 * parks and national parks (OpenStreetMap), recent wildlife observations (iNaturalist) and live
 * river and lake levels (USGS). Built on the info-layer framework in module 27.
 *
 * Module 33 of 44. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Countries: names and capital positions (World Bank) ----------
// Shared by the outbreak, travel advisory and economy layers.
var WB_COUNTRIES = null;

function wbCountries() {
  if (WB_COUNTRIES) return WB_COUNTRIES;
  WB_COUNTRIES = getJSON("https://api.worldbank.org/v2/country?format=json&per_page=400", 25000)
    .then(function (j) {
      return wbIndex((j && j[1]) || []);
    })
    .catch(function (e) {
      WB_COUNTRIES = null;
      throw e;
    });
  return WB_COUNTRIES;
}

// Fold a name for matching: lower case, no accents, no punctuation, no leading "the".
function ctFold(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the /, "")
    .trim();
}

var CT_ALIASES = {
  "democratic republic of the congo": "CD",
  "democratic republic of congo": "CD",
  drc: "CD",
  "republic of the congo": "CG",
  "republic of congo": "CG",
  burma: "MM",
  "cote divoire": "CI",
  "ivory coast": "CI",
  "south korea": "KR",
  "north korea": "KP",
  "korea south": "KR",
  "korea north": "KP",
  russia: "RU",
  iran: "IR",
  syria: "SY",
  venezuela: "VE",
  laos: "LA",
  vietnam: "VN",
  turkey: "TR",
  turkiye: "TR",
  egypt: "EG",
  yemen: "YE",
  gambia: "GM",
  bahamas: "BS",
  "bahamas the": "BS",
  "gambia the": "GM",
  "united states": "US",
  "united kingdom": "GB",
  "czech republic": "CZ",
  czechia: "CZ",
  "slovak republic": "SK",
  kyrgyzstan: "KG",
  "cabo verde": "CV",
  "cape verde": "CV",
  micronesia: "FM",
  "west bank": "PS",
  gaza: "PS",
  "hong kong": "HK",
  macau: "MO",
  "timor leste": "TL",
  "east timor": "TL",
  "saint lucia": "LC",
  "st lucia": "LC",
  eswatini: "SZ",
  swaziland: "SZ",
  "united republic of tanzania": "TZ",
  tanzania: "TZ",
  bolivia: "BO",
  moldova: "MD"
};

// Build lookups from World Bank country rows: by ISO2, by ISO3 and by folded name.
function wbIndex(rows) {
  var ix = { by2: {}, by3: {}, byName: {} },
    names = null;
  try {
    names = new Intl.DisplayNames(["en"], { type: "region" });
  } catch (e) {
    names = null;
  }
  rows.forEach(function (r) {
    var lat = num(r.latitude),
      lon = num(r.longitude),
      iso2 = r.iso2Code;
    if (lat == null || lon == null || !/^[A-Z]{2}$/.test(iso2 || "")) return;
    var c = {
      iso2: iso2,
      iso3: r.id,
      name: r.name,
      capital: r.capitalCity || "",
      lat: lat,
      lon: lon
    };
    ix.by2[iso2] = c;
    ix.by3[r.id] = c;
    ix.byName[ctFold(r.name)] = c;
    if (names)
      try {
        ix.byName[ctFold(names.of(iso2))] = c;
      } catch (e) {
        /* code unknown to this browser */
      }
  });
  Object.keys(CT_ALIASES).forEach(function (k) {
    var c = ix.by2[CT_ALIASES[k]];
    if (c) ix.byName[k] = c;
  });
  return ix;
}

function ctFind(ix, name) {
  return ix.byName[ctFold(name)] || null;
}

// ---------- Disease outbreak news (WHO) ----------
// Titles read "Disease – Country" or "Disease, Country A, Country B and Country C".
function donPlaces(ix, title) {
  var parts = String(title || "")
    .split(/\s[–—-]\s|,\s*|\sand\s/)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  var seen = {};
  return parts.slice(1).reduce(function (out, p) {
    var c = ctFind(ix, p);
    if (c && !seen[c.iso2]) {
      seen[c.iso2] = 1;
      out.push(c);
    }
    return out;
  }, []);
}

function donDisease(title) {
  return (
    String(title || "")
      .split(/\s[–—-]\s|,\s/)[0]
      .trim() || "Outbreak"
  );
}

function donItems(d, rows, ix) {
  var out = [];
  (rows || []).forEach(function (r) {
    var places = donPlaces(ix, r.Title),
      at = Date.parse(r.PublicationDateAndTime || r.PublicationDate),
      dz = donDisease(r.Title),
      url =
        "https://www.who.int/emergencies/disease-outbreak-news/item/" +
        encodeURIComponent(r.UrlName || "");
    places.forEach(function (c) {
      out.push(
        ilItem(d, {
          id: "don:" + r.UrlName + ":" + c.iso2,
          n: dz + " · " + c.name,
          label: dz.toUpperCase().slice(0, 24),
          lat: c.lat,
          lon: c.lon,
          size: 6,
          big: Date.now() - at < 14 * 864e5,
          tag: "Outbreak news · WHO",
          links: r.UrlName ? [["Read the WHO report", url]] : null,
          rows: [
            ["DISEASE", dz],
            ["COUNTRY", c.name],
            ["PUBLISHED", ilWhen(at)],
            ["REPORT", r.Title || "—"],
            ["SOURCE", "World Health Organization, Disease Outbreak News"]
          ]
        })
      );
    });
  });
  return out;
}

ilDef({
  key: "outbreaks",
  label: "Disease outbreaks",
  color: "#ff5c7a",
  icon: "🦠",
  every: 3 * 3600000,
  none: "NONE IN 90 DAYS",
  load: function (d) {
    var since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    return Promise.all([
      getJSON(
        "https://www.who.int/api/news/diseaseoutbreaknews?$orderby=PublicationDateAndTime%20desc&$top=60&$filter=" +
          encodeURIComponent("PublicationDateAndTime ge " + since + "T00:00:00Z"),
        25000
      ),
      wbCountries()
    ]).then(function (r) {
      return donItems(d, (r[0] || {}).value, r[1]);
    });
  }
});

// ---------- Places from OpenStreetMap ----------
osmLayer({
  key: "pharmacy",
  label: "Pharmacies",
  color: "#39d98a",
  icon: "💊",
  tag: "Pharmacy · OpenStreetMap",
  unnamed: "Pharmacy",
  filter: '["amenity"="pharmacy"]',
  rows: function (t) {
    return [
      ["HOURS", t.opening_hours || "—"],
      [
        "DISPENSING",
        t.dispensing === "yes" ? "Prescriptions" : t.dispensing === "no" ? "No prescriptions" : "—"
      ]
    ];
  }
});

osmLayer({
  key: "library",
  label: "Libraries",
  color: "#c58bff",
  icon: "📚",
  tag: "Library · OpenStreetMap",
  unnamed: "Library",
  filter: '["amenity"="library"]',
  rows: function (t) {
    return [["HOURS", t.opening_hours || "—"]];
  }
});

osmLayer({
  key: "toilets",
  label: "Public toilets",
  color: "#4cc3ff",
  icon: "🚻",
  tag: "Toilets · OpenStreetMap",
  unnamed: "Public toilets",
  filter: '["amenity"="toilets"]',
  rows: function (t) {
    return [
      ["FREE", t.fee === "no" ? "Yes" : t.fee === "yes" ? "No" : "—"],
      ["WHEELCHAIR", t.wheelchair ? tfWords(t.wheelchair) : "—"],
      ["CHANGING TABLE", t.changing_table ? tfWords(t.changing_table) : "—"],
      ["HOURS", t.opening_hours || "—"]
    ];
  }
});

osmLayer({
  key: "evcharge",
  label: "EV chargers",
  color: "#39ff6a",
  icon: "🔌",
  tag: "EV charging · OpenStreetMap",
  unnamed: "EV charging",
  filter: '["amenity"="charging_station"]',
  rows: function (t) {
    var plugs = Object.keys(t)
      .filter(function (k) {
        return /^socket:[^:]+$/.test(k);
      })
      .map(function (k) {
        return tfWords(k.slice(7)) + (/^\d+$/.test(t[k]) ? " ×" + t[k] : "");
      });
    return [
      ["NETWORK", t.network || t.brand || "—"],
      ["PLUGS", plugs.join(", ") || "—"],
      ["SPACES", t.capacity || "—"],
      ["FEE", t.fee === "no" ? "Free" : t.fee === "yes" ? "Paid" : "—"]
    ];
  }
});

osmLayer({
  key: "wifi",
  label: "Free Wi-Fi",
  color: "#7fe3ff",
  icon: "📶",
  tag: "Free Wi-Fi · OpenStreetMap",
  unnamed: "Free Wi-Fi",
  filter: '["internet_access"~"wlan|yes"]["internet_access:fee"="no"]',
  rows: function (t) {
    return [
      [
        "PLACE",
        t.amenity
          ? tfWords(t.amenity)
          : t.shop
            ? tfWords(t.shop)
            : t.tourism
              ? tfWords(t.tourism)
              : "—"
      ],
      ["NETWORK NAME", t["internet_access:ssid"] || "—"]
    ];
  }
});

osmLayer({
  key: "parks",
  label: "Parks",
  color: "#39d98a",
  icon: "🌳",
  tag: "Park · OpenStreetMap",
  unnamed: "Park",
  filter: '["leisure"="park"]["name"]',
  rows: function (t) {
    return [["HOURS", t.opening_hours || "—"]];
  }
});

osmLayer({
  key: "natpark",
  label: "National parks",
  color: "#7fd36b",
  icon: "🏞",
  tag: "National park · OpenStreetMap",
  unnamed: "National park",
  filter: '["boundary"="national_park"]["name"]',
  maxKm: 1500,
  rows: function (t) {
    return [["PROTECTED BY", t.operator || t["protection_title"] || "—"]];
  }
});

// ---------- Wildlife observations (iNaturalist) ----------
// Research-grade observations from the last 30 days. Observer names are not shown.
// iNaturalist blurs the position of sensitive species; those are marked as approximate.
var INAT_COLORS = {
  Aves: "#4cc3ff",
  Mammalia: "#ff9a2e",
  Reptilia: "#7fd36b",
  Amphibia: "#39d98a",
  Actinopterygii: "#4c8dff",
  Insecta: "#ffd84a",
  Arachnida: "#c58bff",
  Plantae: "#5fbf5f",
  Fungi: "#d9a066",
  Mollusca: "#ff6ad5"
};

function inatItems(d, list) {
  return (list || []).reduce(function (out, o) {
    var g = (o.geojson && o.geojson.coordinates) || [],
      t = o.taxon || {},
      ph =
        o.photos &&
        o.photos[0] &&
        safeUrl(String(o.photos[0].url || "").replace("square", "medium")),
      name = t.preferred_common_name || t.name || "Unknown species";
    if (num(g[1]) == null) return out;
    out.push(
      ilItem(d, {
        id: "inat:" + o.id,
        n: name.replace(/^./, function (c) {
          return c.toUpperCase();
        }),
        label: "",
        lat: num(g[1]),
        lon: num(g[0]),
        color: INAT_COLORS[t.iconic_taxon_name] || "#9fb4c8",
        size: 3.5,
        tag: (t.iconic_taxon_name || "Wildlife") + " · iNaturalist",
        img: /^https:\/\//.test(ph || "") ? ph : null,
        links: o.uri ? [["See on iNaturalist", safeUrl(o.uri)]] : null,
        rows: [
          ["SPECIES", t.name || "—"],
          ["SEEN", o.observed_on || "—"],
          ["NEAR", o.place_guess || "—"],
          ["POSITION", o.obscured ? "Approximate (protected species)" : "As recorded"],
          ["SOURCE", "iNaturalist community, research grade"]
        ]
      })
    );
    return out;
  }, []);
}

ilDef({
  key: "wildlife",
  label: "Wildlife sightings",
  color: "#7fd36b",
  icon: "🦉",
  every: 60 * 60000,
  maxKm: 300,
  drawKm: 300,
  byArea: true,
  none: "NONE RECENT HERE",
  load: function (d, b) {
    var since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    return getJSON(
      "https://api.inaturalist.org/v1/observations?quality_grade=research&per_page=200&order_by=observed_on&photos=true" +
        "&d1=" +
        since +
        "&swlat=" +
        b.s.toFixed(3) +
        "&swlng=" +
        b.w.toFixed(3) +
        "&nelat=" +
        b.n.toFixed(3) +
        "&nelng=" +
        b.e.toFixed(3),
      25000
    ).then(function (j) {
      return inatItems(d, j.results);
    });
  }
});

// ---------- River and lake levels (USGS) ----------
var USGS_PARAMS = {
  "00065": ["GAGE HEIGHT", "ft"],
  "00060": ["FLOW", "ft³/s"],
  62614: ["LAKE LEVEL", "ft above sea level"],
  62615: ["LAKE LEVEL", "ft above sea level"]
};

// USGS limits a box to 25 square degrees; shrink around the centre if needed.
function usgsBox(b) {
  var c = gdCentre(b),
    h = Math.min((b.n - b.s) / 2, 2.4),
    w = Math.min((b.e - b.w) / 2, 2.4);
  return [c[1] - w, c[0] - h, c[1] + w, c[0] + h].map(function (v) {
    return v.toFixed(4);
  });
}

function usgsItems(d, ts) {
  var by = {};
  (ts || []).forEach(function (t) {
    var si = t.sourceInfo || {},
      code = ((si.siteCode || [])[0] || {}).value,
      g = (si.geoLocation || {}).geogLocation || {},
      p = ((((t.variable || {}).variableCode || [])[0] || {}).value || "").trim(),
      vals = ((t.values || [])[0] || {}).value || [],
      last = vals[vals.length - 1],
      def = USGS_PARAMS[p];
    if (!code || !def || !last) return;
    var v = num(last.value);
    if (v == null || v <= -999) return;
    var s = (by[code] = by[code] || {
      code: code,
      name: si.siteName,
      lat: num(g.latitude),
      lon: num(g.longitude),
      rows: [],
      at: 0
    });
    s.rows.push([def[0], v.toLocaleString() + " " + def[1]]);
    s.at = Math.max(s.at, Date.parse(last.dateTime) || 0);
  });
  return Object.keys(by).map(function (k) {
    var s = by[k];
    return ilItem(d, {
      id: "usgs:" + s.code,
      n: tfWords(s.name || "Water gauge"),
      label: "",
      lat: s.lat,
      lon: s.lon,
      size: 4,
      tag: "Water level · USGS " + s.code,
      links: [["USGS site page", "https://waterdata.usgs.gov/monitoring-location/" + s.code + "/"]],
      rows: s.rows.concat([
        ["READING", s.at ? ago(s.at) : "—"],
        ["SOURCE", "U.S. Geological Survey"]
      ])
    });
  });
}

ilDef({
  key: "water",
  label: "River & lake levels",
  color: "#4cc3ff",
  icon: "🌊",
  every: 15 * 60000,
  maxKm: 600,
  drawKm: 600,
  byArea: true,
  none: "NO US GAUGES HERE",
  load: function (d, b) {
    return getJSON(
      "https://waterservices.usgs.gov/nwis/iv/?format=json&siteStatus=active&parameterCd=00065,00060,62614,62615&bBox=" +
        usgsBox(b).join(","),
      30000
    ).then(function (j) {
      return usgsItems(d, ((j || {}).value || {}).timeSeries);
    });
  }
});
