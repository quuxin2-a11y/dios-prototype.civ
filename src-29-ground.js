/**
 * @file Ground data layers.
 * Bike-share docks (CityBikes), shared scooters and e-bikes (public GBFS feeds), traffic
 * incidents and work zones (city open-data portals) and US land border wait times (CBP).
 * Built on the info-layer framework in module 27.
 *
 * Module 29 of 36. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// Centre of an area box, and whether a point falls inside one.
function gdCentre(b) {
  return [(b.s + b.n) / 2, (b.w + b.e) / 2];
}

function gdInBox(b, lat, lon, pad) {
  pad = pad || 0;
  return lat >= b.s - pad && lat <= b.n + pad && lon >= b.w - pad && lon <= b.e + pad;
}

// The `n` entries nearest the area centre, given a function returning [lat, lon] for each.
function gdNearest(list, b, n, at) {
  var c = gdCentre(b);
  return list
    .map(function (x) {
      var p = at(x);
      return [hav(c[0], c[1], p[0], p[1]), x];
    })
    .sort(function (a, z) {
      return a[0] - z[0];
    })
    .slice(0, n)
    .map(function (x) {
      return x[1];
    });
}

// Minimal CSV parser: handles quoted fields, doubled quotes and CRLF line ends.
function gdCsv(text) {
  var rows = [],
    row = [],
    f = "",
    q = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        f += '"';
        i++;
      } else if (ch === '"') q = false;
      else f += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(f);
      f = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(f);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      f = "";
    } else f += ch;
  }
  if (f !== "" || row.length) {
    row.push(f);
    rows.push(row);
  }
  return rows;
}

// ---------- Bike share docks (CityBikes) ----------
var BK_API = "https://api.citybik.es/v2/networks",
  BK_NETS = null;

function bkColor(free, slots) {
  if (!free) return "#ff4d5e";
  if (free < 3) return "#ffb02e";
  return slots === 0 ? "#4cc3ff" : "#39d98a";
}

function bkStation(d, net, s) {
  var x = s.extra || {},
    free = num(s.free_bikes) || 0,
    slots = num(s.empty_slots),
    eb = num(x.ebikes);
  return ilItem(d, {
    id: "bikes:" + net.id + ":" + s.id,
    n: s.name || "Bike dock",
    label: String(free),
    lat: num(s.latitude),
    lon: num(s.longitude),
    color: bkColor(free, slots),
    size: 3.5,
    tag: (net.name || "Bike share") + " · dock",
    rows: [
      ["BIKES", free + (eb ? " (" + eb + " electric)" : "")],
      ["FREE DOCKS", slots == null ? "—" : String(slots)],
      ["RENTING", x.renting === 0 || x.renting === false ? "No" : "Yes"],
      ["NETWORK", (net.name || "—") + (net.location ? " · " + net.location.city : "")],
      ["UPDATED", s.timestamp ? ago(Date.parse(s.timestamp)) : "—"],
      ["SOURCE", "CityBikes"]
    ]
  });
}

function bkNetworks() {
  if (BK_NETS) return Promise.resolve(BK_NETS);
  return getJSON(BK_API + "?fields=id,name,location", 25000).then(function (j) {
    BK_NETS = (j.networks || []).filter(function (n) {
      return n.location && num(n.location.latitude) != null;
    });
    return BK_NETS;
  });
}

ilDef({
  key: "bikes",
  label: "Bike share docks",
  color: "#39d98a",
  icon: "🚲",
  every: 3 * 60000,
  maxKm: 400,
  drawKm: 400,
  byArea: true,
  none: "NO NETWORKS HERE",
  load: function (d, b) {
    return bkNetworks().then(function (nets) {
      var near = nets.filter(function (n) {
        return gdInBox(b, n.location.latitude, n.location.longitude, 0.3);
      });
      near = gdNearest(near, b, 4, function (n) {
        return [n.location.latitude, n.location.longitude];
      });
      return Promise.all(
        near.map(function (n) {
          return getJSON(BK_API + "/" + encodeURIComponent(n.id), 25000)
            .then(function (j) {
              var net = j.network || {};
              net.location = net.location || n.location;
              return (net.stations || []).map(function (s) {
                return bkStation(d, net, s);
              });
            })
            .catch(function () {
              return [];
            });
        })
      ).then(function (parts) {
        return [].concat.apply([], parts).slice(0, 5000);
      });
    });
  }
});

// ---------- Shared scooters and e-bikes (public GBFS feeds listed by MobilityData) ----------
// Only systems published without authentication are used. Vehicle IDs are not shown; GBFS
// rotates them so rides cannot be followed.
var SC_LIST = "https://raw.githubusercontent.com/MobilityData/gbfs/master/systems.csv",
  SC_SYS = null,
  SC_OPS = /\b(dott|voi|lime|bird|tier|spin|bolt|veo|superpedestrian|neuron|beam|link|scooter)/i;

// Turn systems.csv rows into {name, city, url, lat, lon}, keeping open feeds in known cities.
function scSystems(rows) {
  var h = rows[0] || [],
    col = function (k) {
      return h.indexOf(k);
    },
    iN = col("Name"),
    iL = col("Location"),
    iU = col("Auto-Discovery URL"),
    iA = col("Authentication Type"),
    iI = col("Authentication Info URL");
  if (iN < 0 || iL < 0 || iU < 0) return [];
  var gaz = {};
  GAZ.forEach(function (g) {
    gaz[g[0].toLowerCase()] = g;
  });
  return rows.slice(1).reduce(function (out, r) {
    if (!SC_OPS.test(r[iN] || "")) return out;
    if ((iA >= 0 && r[iA]) || (iI >= 0 && r[iI])) return out;
    var city = String(r[iL] || "")
        .split(",")[0]
        .trim(),
      g = gaz[city.toLowerCase()];
    if (!g || !/^https:\/\//.test(r[iU] || "")) return out;
    out.push({ name: r[iN], city: city, url: r[iU], lat: g[1], lon: g[2] });
    return out;
  }, []);
}

// Find the vehicle feed in a GBFS discovery document (v1/v2: free_bike_status, v3: vehicle_status).
function scFeedUrl(j) {
  var data = (j && j.data) || {},
    feeds = data.feeds;
  if (!feeds) {
    var lang = data.en || data[Object.keys(data)[0]] || {};
    feeds = lang.feeds || [];
  }
  var f = feeds.filter(function (x) {
    return x.name === "vehicle_status" || x.name === "free_bike_status";
  })[0];
  return f && /^https:\/\//.test(f.url) ? f.url : null;
}

function scVehicles(d, sys, j) {
  var data = (j && j.data) || {},
    list = data.vehicles || data.bikes || [];
  return list
    .filter(function (v) {
      return !v.is_disabled && !v.is_reserved;
    })
    .map(function (v, i) {
      var km = num(v.current_range_meters);
      return ilItem(d, {
        id: "scoot:" + sys.url + ":" + i,
        n: sys.name,
        label: "",
        lat: num(v.lat),
        lon: num(v.lon),
        color: km != null && km < 5000 ? "#ffb02e" : "#c58bff",
        size: 2.5,
        tag: sys.name + " · available",
        rows: [
          ["OPERATOR", sys.name],
          ["RANGE", km != null ? (km / 1000).toFixed(1) + " km" : "—"],
          ["CITY", sys.city],
          ["SOURCE", "Public GBFS feed (MobilityData list)"]
        ]
      });
    });
}

ilDef({
  key: "scooters",
  label: "Scooters & e-bikes",
  color: "#c58bff",
  icon: "🛴",
  every: 2 * 60000,
  maxKm: 120,
  drawKm: 120,
  byArea: true,
  none: "NO OPEN FEEDS HERE",
  load: function (d, b) {
    var sys = SC_SYS
      ? Promise.resolve(SC_SYS)
      : netGet(SC_LIST, 25000, null, true).then(function (t) {
          SC_SYS = scSystems(gdCsv(t));
          return SC_SYS;
        });
    return sys.then(function (all) {
      var near = all.filter(function (s) {
        return gdInBox(b, s.lat, s.lon, 0.25);
      });
      near = gdNearest(near, b, 4, function (s) {
        return [s.lat, s.lon];
      });
      return Promise.all(
        near.map(function (s) {
          return getJSON(s.url, 20000)
            .then(function (j) {
              var u = scFeedUrl(j);
              if (!u) return [];
              return getJSON(u, 20000).then(function (v) {
                return scVehicles(d, s, v);
              });
            })
            .catch(function () {
              return [];
            });
        })
      ).then(function (parts) {
        return [].concat.apply([], parts).slice(0, 4000);
      });
    });
  }
});

// ---------- Traffic incidents and work zones (city open-data portals) ----------
var TF_SOURCES = [
  {
    id: "atx-incidents",
    city: "Austin, TX",
    box: { s: 29.9, w: -98.2, n: 30.8, e: -97.3 },
    load: tfAustinIncidents
  },
  {
    id: "atx-workzones",
    city: "Austin, TX",
    box: { s: 29.9, w: -98.2, n: 30.8, e: -97.3 },
    load: tfAustinWorkZones
  },
  {
    id: "yyc-incidents",
    city: "Calgary, AB",
    box: { s: 50.8, w: -114.4, n: 51.3, e: -113.8 },
    load: tfCalgaryIncidents
  }
];

function tfColor(text) {
  var s = String(text || "").toLowerCase();
  if (/collision|crash|stall|fatal|injur/.test(s)) return "#ff4d5e";
  if (/hazard|debris|flood|ice|signal/.test(s)) return "#ffb02e";
  if (/closed|closure/.test(s)) return "#ff7a2e";
  return "#ffd84a";
}

function tfWords(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, function (c) {
      return c.toUpperCase();
    });
}

function tfAustinIncidents(d) {
  return getJSON(
    "https://data.austintexas.gov/resource/dx9v-zd7x.json?traffic_report_status=ACTIVE&$limit=500",
    20000
  ).then(function (rows) {
    return (rows || []).map(function (r) {
      var what = tfWords(r.issue_reported) || "Incident";
      return ilItem(d, {
        id: "traffic:atx:" + r.traffic_report_id,
        n: what,
        label: what.toUpperCase(),
        lat: num(r.latitude),
        lon: num(r.longitude),
        color: tfColor(r.issue_reported),
        size: 5,
        tag: "Traffic incident · Austin",
        rows: [
          ["WHAT", what],
          ["WHERE", r.address || "—"],
          ["REPORTED", r.published_date ? ago(Date.parse(r.published_date)) : "—"],
          ["RESPONDING", r.agency ? tfWords(r.agency) : "—"],
          ["SOURCE", "City of Austin open data"]
        ]
      });
    });
  });
}

// Socrata floating timestamps: local ISO without a zone.
function tfNowIso() {
  return new Date().toISOString().slice(0, 19);
}

function tfAustinWorkZones(d) {
  var now = tfNowIso();
  return getJSON(
    "https://data.austintexas.gov/resource/qyfh-gwei.json?$limit=1500&$where=" +
      encodeURIComponent("start_date <= '" + now + "' AND end_date >= '" + now + "'"),
    25000
  ).then(function (rows) {
    return (rows || []).map(function (r) {
      var g = r.geometry || {},
        line = g.type === "LineString" ? g.coordinates || [] : [],
        mid = line[Math.floor(line.length / 2)] || [];
      var impact = tfWords(r.vehicle_impact) || "Work zone";
      return ilItem(d, {
        id: "traffic:atxwz:" + r.id,
        n: r.road_names ? tfWords(r.road_names) + " work zone" : "Work zone",
        label: "",
        lat: num(mid[1]),
        lon: num(mid[0]),
        line: line,
        color: /all lanes closed/i.test(impact) ? "#ff7a2e" : "#ffd84a",
        size: 3.5,
        tag: "Work zone · Austin",
        rows: [
          ["ROAD", r.road_names || "—"],
          ["DIRECTION", tfWords(r.direction) || "—"],
          ["IMPACT", impact],
          ["FROM", ilWhen(Date.parse(r.start_date))],
          ["UNTIL", ilWhen(Date.parse(r.end_date))],
          ["WORKERS PRESENT", r.are_workers_present ? "Yes" : "Not reported"],
          ["SOURCE", "City of Austin open data (WZDx)"]
        ]
      });
    });
  });
}

function tfCalgaryIncidents(d) {
  return getJSON("https://data.calgary.ca/resource/4jah-h97u.json?$limit=500", 20000).then(
    function (rows) {
      return (rows || []).map(function (r, i) {
        var what = tfWords(String(r.description || "Incident").replace(/\.$/, ""));
        return ilItem(d, {
          id: "traffic:yyc:" + i + ":" + r.start_dt_utc,
          n: what,
          label: what.toUpperCase(),
          lat: num(r.latitude),
          lon: num(r.longitude),
          color: tfColor(r.description),
          size: 5,
          tag: "Traffic incident · Calgary",
          rows: [
            ["WHAT", what],
            ["WHERE", r.incident_info || "—"],
            ["QUADRANT", r.quadrant || "—"],
            ["REPORTED", r.start_dt_utc ? ago(Date.parse(r.start_dt_utc.replace(" ", "T"))) : "—"],
            ["SOURCE", "City of Calgary open data"]
          ]
        });
      });
    }
  );
}

ilDef({
  key: "traffic",
  label: "Traffic incidents & work zones",
  color: "#ffb02e",
  icon: "⚠",
  every: 3 * 60000,
  maxKm: 2500,
  drawKm: 2500,
  byArea: true,
  none: "NO OPEN FEED HERE YET",
  load: function (d, b) {
    var src = TF_SOURCES.filter(function (s) {
      var x = s.box;
      return x.s < b.n && x.n > b.s && x.w < b.e && x.e > b.w;
    });
    return Promise.all(
      src.map(function (s) {
        return s.load(d).catch(function () {
          return [];
        });
      })
    ).then(function (parts) {
      return [].concat.apply([], parts);
    });
  }
});

// ---------- US land border wait times (CBP) ----------
// CBP's feed has no coordinates, so ports are placed from a bundled table keyed by the
// four-digit port code (BTS Border Crossing Entry Data).
var BW_PORTS = null;

function bwPorts() {
  if (!BW_PORTS) {
    BW_PORTS = {};
    try {
      JSON.parse(document.getElementById("ports").textContent).forEach(function (p) {
        BW_PORTS[p[0]] = p;
      });
    } catch (e) {
      /* table missing: no ports placed */
    }
  }
  return BW_PORTS;
}

// One lane group, e.g. passenger standard lanes: {min, open, text} or null if not reported.
function bwLane(o) {
  if (!o) return null;
  var st = String(o.operational_status || "").toLowerCase();
  if (!st || st === "n/a" || st === "update pending") return null;
  if (st === "lanes closed") return { min: null, open: 0, text: "Closed" };
  var m = num(o.delay_minutes),
    open = num(o.lanes_open);
  if (m == null) return null;
  return {
    min: m,
    open: open,
    text: (m ? m + " min" : "No delay") + (open != null ? " · " + open + " open" : "")
  };
}

function bwColor(min) {
  if (min == null) return "#7d93a8";
  if (min < 20) return "#39d98a";
  if (min < 45) return "#ffd84a";
  if (min < 90) return "#ff9a2e";
  return "#ff4d5e";
}

// Group CBP crossings by port and build one map item per port.
function bwItems(d, list, ports) {
  var by = {};
  (list || []).forEach(function (c) {
    var code = String(c.port_number || "").slice(0, 4),
      p = ports[code];
    if (!p) return;
    (by[code] = by[code] || { p: p, c: [] }).c.push(c);
  });
  return Object.keys(by).map(function (code) {
    var g = by[code],
      worst = null,
      rows = [];
    g.c.forEach(function (c) {
      var pv = c.passenger_vehicle_lanes || {},
        cv = c.commercial_vehicle_lanes || {},
        pd = c.pedestrian_lanes || {},
        car = bwLane(pv.standard_lanes),
        fast = bwLane(pv.NEXUS_SENTRI_lanes),
        truck = bwLane(cv.standard_lanes),
        walk = bwLane(pd.standard_lanes);
      if (car && car.min != null) worst = Math.max(worst || 0, car.min);
      var name = (c.crossing_name || c.port_name || "Crossing").toUpperCase();
      if (c.port_status && c.port_status !== "Open") rows.push([name, c.port_status]);
      if (car) rows.push([name + " · CARS", car.text]);
      if (fast) rows.push([name + " · NEXUS/SENTRI", fast.text]);
      if (truck) rows.push([name + " · TRUCKS", truck.text]);
      if (walk) rows.push([name + " · WALKING", walk.text]);
      if (!car && !truck && !walk) rows.push([name, "No current report"]);
    });
    var first = g.c[0] || {};
    rows.push(["BORDER", first.border || "—"]);
    rows.push(["UPDATED", (first.date || "") + " " + (first.time || "")]);
    rows.push(["SOURCE", "U.S. Customs and Border Protection"]);
    return ilItem(d, {
      id: "border:" + code,
      n: g.p[1] + " border crossing",
      label: g.p[1].toUpperCase() + (worst != null ? " " + worst + "m" : ""),
      lat: g.p[2],
      lon: g.p[3],
      color: bwColor(worst),
      size: 6,
      big: worst != null && worst >= 45,
      tag: worst != null ? "Car wait " + worst + " min · CBP" : "Border crossing · CBP",
      rows: rows
    });
  });
}

ilDef({
  key: "border",
  label: "Border wait times",
  color: "#ffd84a",
  icon: "🛂",
  every: 10 * 60000,
  drawKm: 6000,
  none: "NO REPORTS",
  load: function (d) {
    return getJSON("https://bwt.cbp.gov/api/bwtnew", 25000).then(function (list) {
      return bwItems(d, list, bwPorts());
    });
  }
});
