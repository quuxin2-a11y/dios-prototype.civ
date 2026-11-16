/**
 * @file Infrastructure data layers.
 * Hospitals, fire stations and police stations (OpenStreetMap), open emergency shelters (FEMA),
 * internet outages by country (IODA), federal disaster declarations by county (OpenFEMA) and
 * Seattle Fire Department 911 dispatches (City of Seattle). Built on the info-layer framework
 * in module 27.
 *
 * Module 30 of 39. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Hospitals, fire stations and police stations (OpenStreetMap via Overpass) ----------
function osmAddress(t) {
  var a = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "),
    c = t["addr:city"] || "";
  return [a, c].filter(Boolean).join(", ") || "—";
}

function osmWebsite(t) {
  var u = safeUrl(t.website || t["contact:website"] || "");
  return /^https?:\/\//.test(u) ? u : "";
}

// One OpenStreetMap facility layer, e.g. amenity=hospital.
function osmLayer(o) {
  ilDef({
    key: o.key,
    label: o.label,
    color: o.color,
    icon: o.icon,
    every: 6 * 3600000,
    maxKm: o.maxKm || 150,
    drawKm: o.maxKm || 150,
    byArea: true,
    none: "NONE MAPPED HERE",
    load: function (d, b) {
      var bb = [b.s, b.w, b.n, b.e]
        .map(function (v) {
          return v.toFixed(3);
        })
        .join(",");
      return getJSON(
        "https://overpass-api.de/api/interpreter?data=" +
          encodeURIComponent(
            "[out:json][timeout:25];nwr" + o.filter + "(" + bb + ");out center tags 1500;"
          ),
        30000
      ).then(function (j) {
        return (j.elements || []).map(function (x) {
          var t = x.tags || {},
            c = x.center || x,
            web = osmWebsite(t);
          return ilItem(d, {
            id: o.key + ":" + x.type + x.id,
            n: t.name || o.unnamed,
            label: t.name || "",
            color: o.colorOf ? o.colorOf(t) : null,
            lat: num(c.lat),
            lon: num(c.lon),
            size: 4.5,
            tag: o.tag,
            links: web ? [["Website", web]] : null,
            rows: o.rows(t).concat([
              ["ADDRESS", osmAddress(t)],
              ["OPERATOR", t.operator || "—"],
              ["SOURCE", "OpenStreetMap contributors"]
            ])
          });
        });
      });
    }
  });
}

osmLayer({
  key: "hospitals",
  label: "Hospitals",
  color: "#ff5c7a",
  icon: "✚",
  tag: "Hospital · OpenStreetMap",
  unnamed: "Hospital",
  filter: '["amenity"="hospital"]',
  rows: function (t) {
    return [
      [
        "EMERGENCY ROOM",
        t.emergency === "yes" ? "Yes" : t.emergency === "no" ? "No" : "Not listed"
      ],
      ["BEDS", t.beds || "—"],
      ["TYPE", t["healthcare:speciality"] ? tfWords(t["healthcare:speciality"]) : "Hospital"]
    ];
  }
});

osmLayer({
  key: "firestations",
  label: "Fire stations",
  color: "#ff7a2e",
  icon: "🚒",
  tag: "Fire station · OpenStreetMap",
  unnamed: "Fire station",
  filter: '["amenity"="fire_station"]',
  rows: function (t) {
    return [["STAFFING", t["fire_station:type"] ? tfWords(t["fire_station:type"]) : "—"]];
  }
});

osmLayer({
  key: "police",
  label: "Police stations",
  color: "#4c8dff",
  icon: "🛡",
  tag: "Police station · OpenStreetMap",
  unnamed: "Police station",
  filter: '["amenity"="police"]',
  rows: function () {
    return [["TYPE", "Police station"]];
  }
});

// ---------- Open emergency shelters (FEMA National Shelter System) ----------
var SH_URL =
  "https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0/query?where=1%3D1&outSR=4326&f=json&resultRecordCount=2000&outFields=SHELTER_NAME,ADDRESS,CITY,STATE,SHELTER_STATUS,EVACUATION_CAPACITY,TOTAL_POPULATION,PET_ACCOMMODATIONS_CODE";

function shCount(v) {
  var n = num(v);
  return n == null ? "—" : n.toLocaleString();
}

ilDef({
  key: "shelters",
  label: "Open emergency shelters",
  color: "#39d98a",
  icon: "⛺",
  every: 20 * 60000,
  drawKm: 6000,
  none: "NONE OPEN",
  load: function (d) {
    return getJSON(SH_URL, 25000).then(function (j) {
      return (j.features || []).map(function (f) {
        var a = f.attributes || {},
          g = f.geometry || {};
        return ilItem(d, {
          id: "shelter:" + a.SHELTER_NAME + ":" + g.x + "," + g.y,
          n: a.SHELTER_NAME || "Shelter",
          label: "",
          lat: num(g.y),
          lon: num(g.x),
          size: 5,
          tag: "Shelter · " + (a.SHELTER_STATUS || "Open") + " · FEMA",
          rows: [
            ["STATUS", a.SHELTER_STATUS || "—"],
            ["ADDRESS", [a.ADDRESS, a.CITY, a.STATE].filter(Boolean).join(", ") || "—"],
            ["CAPACITY", shCount(a.EVACUATION_CAPACITY)],
            ["STAYING NOW", shCount(a.TOTAL_POPULATION)],
            ["PETS", a.PET_ACCOMMODATIONS_CODE ? tfWords(a.PET_ACCOMMODATIONS_CODE) : "—"],
            ["SOURCE", "FEMA National Shelter System"]
          ]
        });
      });
    });
  }
});

// ---------- Internet outages by country (IODA, Georgia Tech) ----------
var IO_PLACES = null;

function ioPlaces() {
  if (!IO_PLACES) {
    try {
      IO_PLACES = JSON.parse(document.getElementById("countries").textContent);
    } catch (e) {
      IO_PLACES = {};
    }
  }
  return IO_PLACES;
}

// IODA's overall score grows with the size and length of an outage; it is roughly logarithmic.
function ioLevel(score) {
  if (!(score > 0)) return ["Minor", "#ffd84a", 3];
  var l = Math.log10(score);
  if (l >= 6) return ["Severe", "#ff4d5e", 8];
  if (l >= 4.5) return ["Major", "#ff9a2e", 6.5];
  if (l >= 3) return ["Moderate", "#ffd84a", 5];
  return ["Minor", "#9fb4c8", 3.5];
}

var IO_SIGNALS = {
  bgp: "Routing (BGP)",
  "ping-slash24": "Active probing",
  "merit-nt": "Telescope traffic",
  gtr: "Google traffic"
};

function ioItems(d, list, places) {
  return (list || []).reduce(function (out, s) {
    var e = s.entity || {},
      p = places[e.code];
    if (!p) return out;
    var sc = (s.scores || {}).overall,
      lv = ioLevel(sc),
      sig = Object.keys(s.scores || {})
        .filter(function (k) {
          return k !== "overall";
        })
        .map(function (k) {
          return IO_SIGNALS[k.split(".")[0]] || k.split(".")[0];
        });
    out.push(
      ilItem(d, {
        id: "outage:" + e.code,
        n: (e.name || e.code) + " internet outage",
        label: (e.name || e.code).toUpperCase(),
        lat: p[0],
        lon: p[1],
        color: lv[1],
        size: lv[2],
        big: lv[2] >= 6.5,
        tag: lv[0] + " outage · IODA",
        links: [["Open in IODA", "https://ioda.inetintel.cc.gatech.edu/country/" + e.code]],
        rows: [
          ["SEVERITY", lv[0] + (sc ? " · score " + Math.round(sc).toLocaleString() : "")],
          ["EVENTS", s.event_cnt != null ? String(s.event_cnt) : "—"],
          ["SEEN IN", sig.length ? sig.join(", ") : "—"],
          ["WINDOW", "Last 24 hours"],
          ["SOURCE", "IODA, Georgia Tech"]
        ]
      })
    );
    return out;
  }, []);
}

ilDef({
  key: "outages",
  label: "Internet outages",
  color: "#ff9a2e",
  icon: "📡",
  every: 15 * 60000,
  none: "NONE IN LAST 24H",
  load: function (d) {
    var now = Math.floor(Date.now() / 1000);
    return getJSON(
      "https://api.ioda.inetintel.cc.gatech.edu/v2/outages/summary?entityType=country&limit=300&from=" +
        (now - 86400) +
        "&until=" +
        now,
      25000
    ).then(function (j) {
      return ioItems(d, j.data, ioPlaces());
    });
  }
});

// ---------- Federal disaster declarations by county (OpenFEMA) ----------
var FD_TYPES = { DR: "Major disaster", EM: "Emergency", FM: "Fire management" },
  FD_MAP = null,
  FD_DAYS = 90;

// County and state outlines from us-atlas, keyed by FIPS code.
function fdMap() {
  if (FD_MAP) return FD_MAP;
  FD_MAP = getJSON("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json", 40000)
    .then(function (t) {
      var m = {};
      topoFeatures(t, "counties")
        .concat(topoFeatures(t, "states"))
        .forEach(function (f) {
          m[f.id] = f;
        });
      return m;
    })
    .catch(function (e) {
      FD_MAP = null;
      throw e;
    });
  return FD_MAP;
}

function fdItems(d, list, shapes) {
  var by = {};
  (list || []).forEach(function (r) {
    var st = String(r.fipsStateCode || "").padStart(2, "0"),
      co = String(r.fipsCountyCode || "").padStart(3, "0"),
      fips = co === "000" ? st : st + co,
      f = shapes[fips];
    if (!f) return;
    var k = r.disasterNumber + ":" + fips;
    if (!by[k]) by[k] = { r: r, f: f };
  });
  return Object.keys(by).map(function (k) {
    var r = by[k].r,
      f = by[k].f,
      ty = FD_TYPES[r.declarationType] || r.declarationType || "Declaration",
      col =
        r.declarationType === "DR" ? "#ff4d5e" : r.declarationType === "EM" ? "#ff9a2e" : "#ffd84a";
    return ilItem(d, {
      id: "fema:" + k,
      n: tfWords(r.declarationTitle || r.incidentType || "Disaster"),
      label: "",
      lat: (f.box.s + f.box.n) / 2,
      lon: (f.box.w + f.box.e) / 2,
      rings: f.rings,
      fill: "rgba(255,77,94,.16)",
      color: col,
      size: 4,
      tag: ty + " · FEMA " + r.disasterNumber,
      rows: [
        ["AREA", r.designatedArea || f.name],
        ["TYPE", ty],
        ["INCIDENT", r.incidentType || "—"],
        ["DECLARED", ilWhen(Date.parse(r.declarationDate))],
        [
          "INCIDENT PERIOD",
          ilWhen(Date.parse(r.incidentBeginDate)) +
            " to " +
            (r.incidentEndDate ? ilWhen(Date.parse(r.incidentEndDate)) : "ongoing")
        ],
        ["DISASTER NUMBER", String(r.disasterNumber)],
        ["SOURCE", "OpenFEMA"]
      ],
      links: [["FEMA disaster page", "https://www.fema.gov/disaster/" + r.disasterNumber]]
    });
  });
}

ilDef({
  key: "fema",
  label: "Disaster declarations",
  color: "#ff4d5e",
  icon: "⚑",
  every: 60 * 60000,
  drawKm: 9000,
  none: "NONE IN 90 DAYS",
  load: function (d) {
    var since = new Date(Date.now() - FD_DAYS * 864e5).toISOString().slice(0, 10);
    return Promise.all([
      getJSON(
        "https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$top=5000&$orderby=declarationDate%20desc&$filter=" +
          encodeURIComponent("declarationDate ge '" + since + "T00:00:00.000Z'"),
        30000
      ),
      fdMap()
    ]).then(function (r) {
      return fdItems(d, (r[0] || {}).DisasterDeclarationsSummaries, r[1]);
    });
  }
});

// ---------- Seattle Fire Department 911 dispatches (City of Seattle) ----------
// The feed's times are Seattle local time without a zone.
function usDst(y, m, day, h) {
  var nth = function (mon, n) {
    var first = new Date(Date.UTC(y, mon, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
  };
  var start = nth(2, 2),
    end = nth(10, 1);
  if (m > 2 && m < 10) return true;
  if (m === 2) return day > start || (day === start && h >= 2);
  if (m === 10) return day < end || (day === end && h < 2);
  return false;
}

function seaTime(s) {
  var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(String(s || ""));
  if (!m) return null;
  var y = +m[1],
    mo = +m[2] - 1,
    dd = +m[3],
    h = +m[4],
    off = usDst(y, mo, dd, h) ? 7 : 8;
  return Date.UTC(y, mo, dd, h + off, +m[5]);
}

function seaColor(type) {
  var t = String(type || "").toLowerCase();
  if (/fire|smoke|explosion|hazmat/.test(t)) return "#ff4d5e";
  if (/aid|medic|mci/.test(t)) return "#ff9a2e";
  if (/rescue|water/.test(t)) return "#4cc3ff";
  return "#ffd84a";
}

ilDef({
  key: "sea911",
  label: "Seattle fire & EMS calls",
  color: "#ff9a2e",
  icon: "☎",
  every: 5 * 60000,
  maxKm: 2500,
  drawKm: 400,
  none: "NO RECENT CALLS",
  status: function (d) {
    var t = d.items.length ? d.items[0].at : 0;
    if (!t) return d.none;
    return Date.now() - t > 6 * 36e5 ? "LATEST " + ago(t).toUpperCase() : "";
  },
  load: function (d) {
    return getJSON(
      "https://data.seattle.gov/resource/kzjm-xkqj.json?$order=datetime%20DESC&$limit=300",
      20000
    ).then(function (rows) {
      return (rows || []).map(function (r) {
        var t = seaTime(r.datetime);
        return ilItem(d, {
          id: "sea911:" + r.incident_number,
          n: r.type || "Dispatch",
          label: "",
          lat: num(r.latitude),
          lon: num(r.longitude),
          at: t,
          color: seaColor(r.type),
          size: 4,
          tag: "Seattle Fire dispatch",
          rows: [
            ["CALL TYPE", r.type || "—"],
            ["BLOCK", r.address || "—"],
            ["DISPATCHED", t ? ago(t) : "—"],
            ["INCIDENT", r.incident_number || "—"],
            ["SOURCE", "City of Seattle open data"]
          ]
        });
      });
    });
  }
});
