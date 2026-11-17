/**
 * @file Travel and economy layers.
 * US airport delays and closures (FAA), US State Department travel advisories, ferry terminals
 * (OpenStreetMap) and country economic indicators (World Bank). Built on the info-layer
 * framework in module 27.
 *
 * Module 34 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Airport delays (FAA National Airspace System status) ----------
// The FAA lists airports by FAA code without positions; positions come from aviationweather.gov.
var FAA_ICAO = {
  ANC: "PANC",
  FAI: "PAFA",
  JNU: "PAJN",
  HNL: "PHNL",
  OGG: "PHOG",
  KOA: "PHKO",
  LIH: "PHLI",
  ITO: "PHTO",
  SJU: "TJSJ",
  STT: "TIST",
  STX: "TISX",
  GUM: "PGUM"
};
var FAA_POS = {};

function faaIcao(code) {
  code = String(code || "").toUpperCase();
  return FAA_ICAO[code] || (/^[A-Z0-9]{3}$/.test(code) ? "K" + code : code);
}

function faaText(el, tag) {
  var x = el.getElementsByTagName(tag)[0];
  return x ? x.textContent.trim() : "";
}

// Every element with an ARPT child is one event; its parent list says what kind.
function faaParse(xml) {
  var doc = new DOMParser().parseFromString(xml, "text/xml"),
    ap = doc.getElementsByTagName("ARPT"),
    by = {};
  for (var i = 0; i < ap.length; i++) {
    var ev = ap[i].parentNode,
      list = ev.parentNode ? ev.parentNode.nodeName : "",
      code = ap[i].textContent.trim().toUpperCase();
    if (!code) continue;
    var a = (by[code] = by[code] || { code: code, events: [] }),
      reason = faaText(ev, "Reason");
    if (/Ground_Stop/i.test(list)) {
      a.events.push({
        kind: "Ground stop",
        sev: 4,
        text: reason + (faaText(ev, "End_Time") ? " · until " + faaText(ev, "End_Time") : "")
      });
    } else if (/Ground_Delay/i.test(list)) {
      a.events.push({
        kind: "Ground delay",
        sev: 3,
        text:
          "Average " +
          faaText(ev, "Avg") +
          ", up to " +
          faaText(ev, "Max") +
          (reason ? " · " + reason : "")
      });
    } else if (/Arrival_Departure/i.test(list)) {
      var ad = ev.getElementsByTagName("Arrival_Departure")[0],
        type = ad ? ad.getAttribute("Type") || "Delay" : "Delay";
      a.events.push({
        kind: type + " delay",
        sev: 2,
        text:
          faaText(ev, "Min") +
          " to " +
          faaText(ev, "Max") +
          (faaText(ev, "Trend") ? " · " + faaText(ev, "Trend").toLowerCase() : "") +
          (reason ? " · " + reason : "")
      });
    } else if (/Closure/i.test(list)) {
      // Standing closures to private planes are routine; only full closures are flagged.
      var full = !/non-scheduled|transient|general aviation|PPR/i.test(reason);
      a.events.push({
        kind: full ? "Closed" : "Restriction",
        sev: full ? 4 : 0,
        text: reason + (faaText(ev, "Reopen") ? " · reopens " + faaText(ev, "Reopen") : "")
      });
    } else {
      a.events.push({ kind: "Notice", sev: 1, text: reason });
    }
  }
  return Object.keys(by).map(function (k) {
    return by[k];
  });
}

function faaPositions(codes) {
  var need = codes.filter(function (c) {
    return !FAA_POS[c];
  });
  if (!need.length) return Promise.resolve(FAA_POS);
  return getJSON(
    "https://aviationweather.gov/api/data/airport?format=json&ids=" + need.map(faaIcao).join(","),
    20000
  ).then(function (list) {
    (list || []).forEach(function (a) {
      var c = a.faaId || a.iataId;
      if (c && num(a.lat) != null)
        FAA_POS[c] = {
          lat: num(a.lat),
          lon: num(a.lon),
          name: tfWords(String(a.name || "").trim())
        };
    });
    return FAA_POS;
  });
}

var FAA_COLORS = ["#7d93a8", "#ffd84a", "#ff9a2e", "#ff6a2e", "#ff4d5e"];

function faaItems(d, airports, pos) {
  return airports.reduce(function (out, a) {
    var p = pos[a.code];
    if (!p) return out;
    var sev = Math.max.apply(
        null,
        a.events.map(function (e) {
          return e.sev;
        })
      ),
      top = a.events.filter(function (e) {
        return e.sev === sev;
      })[0];
    out.push(
      ilItem(d, {
        id: "faa:" + a.code,
        n: p.name || a.code,
        label: sev >= 2 ? a.code + " " + top.kind.toUpperCase() : "",
        lat: p.lat,
        lon: p.lon,
        color: FAA_COLORS[sev] || FAA_COLORS[0],
        size: sev >= 3 ? 7 : sev >= 2 ? 5.5 : 3.5,
        big: sev >= 3,
        tag: a.code + " · " + top.kind + " · FAA",
        links: [["FAA airport status", "https://nasstatus.faa.gov/"]],
        rows: a.events
          .slice()
          .sort(function (x, y) {
            return y.sev - x.sev;
          })
          .map(function (e) {
            return [e.kind.toUpperCase(), e.text || "—"];
          })
          .concat([["SOURCE", "FAA National Airspace System status"]])
      })
    );
    return out;
  }, []);
}

ilDef({
  key: "airdelay",
  label: "Airport delays (US)",
  color: "#ff9a2e",
  icon: "🛫",
  every: 5 * 60000,
  none: "NO DELAYS REPORTED",
  load: function (d) {
    return netGet(
      "https://nasstatus.faa.gov/api/airport-status-information",
      20000,
      null,
      true
    ).then(function (xml) {
      var airports = faaParse(xml);
      return faaPositions(
        airports.map(function (a) {
          return a.code;
        })
      ).then(function (pos) {
        return faaItems(d, airports, pos);
      });
    });
  }
});

// ---------- Travel advisories (US State Department) ----------
var ADV_LEVELS = [
  null,
  ["Exercise normal precautions", "#39d98a"],
  ["Exercise increased caution", "#ffd84a"],
  ["Reconsider travel", "#ff9a2e"],
  ["Do not travel", "#ff4d5e"]
];

// Titles read "Country - Level 2: Exercise Increased Caution"; links end "destination.xxx.html".
function advParse(r, ix) {
  var t = String(r.Title || ""),
    m = /^(.*?)\s+-\s+Level\s+(\d)/i.exec(t),
    lvl = m ? +m[2] : 0,
    i3 = /destination\.([a-z]{3})\./i.exec(r.Link || ""),
    c = (i3 && ix.by3[i3[1].toUpperCase()]) || (m && ctFind(ix, m[1]));
  if (!c || !ADV_LEVELS[lvl]) return null;
  return {
    c: c,
    lvl: lvl,
    name: m ? m[1] : c.name,
    at: Date.parse(r.Updated || r.Published),
    link: safeUrl(r.Link || "")
  };
}

function advItems(d, rows, ix) {
  var seen = {};
  return (rows || []).reduce(function (out, r) {
    var a = advParse(r, ix);
    if (!a || seen[a.c.iso2]) return out;
    seen[a.c.iso2] = 1;
    var L = ADV_LEVELS[a.lvl];
    out.push(
      ilItem(d, {
        id: "adv:" + a.c.iso2,
        n: a.name + " travel advisory",
        label: a.lvl >= 3 ? a.name.toUpperCase() : "",
        lat: a.c.lat,
        lon: a.c.lon,
        color: L[1],
        size: 3 + a.lvl,
        big: a.lvl === 4,
        tag: "Level " + a.lvl + " · " + L[0],
        links: /^https:\/\//.test(a.link) ? [["Full advisory", a.link]] : null,
        rows: [
          ["LEVEL", a.lvl + " of 4 · " + L[0]],
          ["COUNTRY", a.name],
          ["UPDATED", a.at ? ilWhen(a.at) : "—"],
          ["FOR", "US citizens"],
          ["SOURCE", "US Department of State"]
        ]
      })
    );
    return out;
  }, []);
}

ilDef({
  key: "advisory",
  label: "Travel advisories",
  color: "#ffd84a",
  icon: "🧳",
  every: 6 * 3600000,
  load: function (d) {
    return Promise.all([
      getJSON("https://cadataapi.state.gov/api/TravelAdvisories", 30000),
      wbCountries()
    ]).then(function (r) {
      return advItems(d, r[0], r[1]);
    });
  }
});

osmLayer({
  key: "ferry",
  label: "Ferry terminals",
  color: "#4c8dff",
  icon: "⛴",
  tag: "Ferry terminal · OpenStreetMap",
  unnamed: "Ferry terminal",
  filter: '["amenity"="ferry_terminal"]',
  maxKm: 600,
  rows: function (t) {
    return [["CARS", t.motor_vehicle === "yes" || t.motorcar === "yes" ? "Yes" : "—"]];
  }
});

// ---------- Economy by country (World Bank) ----------
var WB_IND = [
  ["NY.GDP.PCAP.CD", "GDP PER PERSON", "usd"],
  ["SL.UEM.TOTL.ZS", "UNEMPLOYMENT", "pct"],
  ["FP.CPI.TOTL.ZG", "INFLATION", "pct"],
  ["NY.GDP.MKTP.KD.ZG", "GDP GROWTH", "pct"]
];

function wbFmt(v, kind) {
  if (v == null) return "—";
  if (kind === "usd") return "$" + Math.round(v).toLocaleString();
  return (Math.round(v * 10) / 10).toFixed(1) + "%";
}

function econColor(gdp) {
  if (gdp == null) return "#7d93a8";
  if (gdp >= 40000) return "#39d98a";
  if (gdp >= 12000) return "#9fe870";
  if (gdp >= 4000) return "#ffd84a";
  return "#ff9a2e";
}

// Merge indicator rows ([meta, rows] per indicator) into one item per country.
function econItems(d, sets, ix) {
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
      id: "econ:" + k,
      n: e.c.name + " economy",
      label: "",
      lat: e.c.lat,
      lon: e.c.lon,
      color: econColor(e.v[0]),
      size: 4.5,
      tag: (e.v[0] != null ? wbFmt(e.v[0], "usd") + " per person" : "Economy") + " · World Bank",
      rows: WB_IND.map(function (ind, i) {
        return [ind[1], wbFmt(e.v[i], ind[2]) + (e.yr[i] ? " (" + e.yr[i] + ")" : "")];
      }).concat([
        ["CAPITAL", e.c.capital || "—"],
        ["SOURCE", "World Bank, World Development Indicators"]
      ])
    });
  });
}

ilDef({
  key: "economy",
  label: "Economy by country",
  color: "#9fe870",
  icon: "💹",
  every: 24 * 3600000,
  load: function (d) {
    return Promise.all(
      WB_IND.map(function (ind) {
        return getJSON(
          "https://api.worldbank.org/v2/country/all/indicator/" +
            ind[0] +
            "?format=json&mrnev=1&per_page=400",
          30000
        ).catch(function () {
          return null;
        });
      }).concat([wbCountries()])
    ).then(function (r) {
      var ix = r.pop();
      return econItems(d, r, ix);
    });
  }
});

// ---------- Currencies against the US dollar (ExchangeRate-API, open access) ----------
// Each country's currency (ISO 4217), grouped by currency to keep the table short.
var FX_COUNTRIES = {
  USD: "US EC SV TL PR GU AS VI MP FM MH PW BQ TC VG IO UM",
  EUR: "AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK AD MC SM VA ME XK GF GP MQ YT RE BL MF PM AX TF",
  XOF: "BJ BF CI GW ML NE SN TG",
  XAF: "CM CF TD CG GQ GA",
  XCD: "AG DM GD KN LC VC AI MS",
  AUD: "AU KI NR TV CX CC NF HM",
  NZD: "NZ CK NU PN TK",
  GBP: "GB GG JE IM GS",
  DKK: "DK FO GL",
  NOK: "NO SJ BV",
  CHF: "CH LI",
  ZAR: "ZA",
  INR: "IN BT",
  XPF: "PF NC WF",
  ANG: "CW SX",
  MAD: "MA EH",
  ILS: "IL PS",
  AED: "AE",
  AFN: "AF",
  ALL: "AL",
  AMD: "AM",
  AOA: "AO",
  ARS: "AR",
  AWG: "AW",
  AZN: "AZ",
  BAM: "BA",
  BBD: "BB",
  BDT: "BD",
  BGN: "BG",
  BHD: "BH",
  BIF: "BI",
  BMD: "BM",
  BND: "BN",
  BOB: "BO",
  BRL: "BR",
  BSD: "BS",
  BWP: "BW",
  BYN: "BY",
  BZD: "BZ",
  CAD: "CA",
  CDF: "CD",
  CLP: "CL",
  CNY: "CN",
  COP: "CO",
  CRC: "CR",
  CUP: "CU",
  CVE: "CV",
  CZK: "CZ",
  DJF: "DJ",
  DOP: "DO",
  DZD: "DZ",
  EGP: "EG",
  ERN: "ER",
  ETB: "ET",
  FJD: "FJ",
  FKP: "FK",
  GEL: "GE",
  GHS: "GH",
  GIP: "GI",
  GMD: "GM",
  GNF: "GN",
  GTQ: "GT",
  GYD: "GY",
  HKD: "HK",
  HNL: "HN",
  HTG: "HT",
  HUF: "HU",
  IDR: "ID",
  IQD: "IQ",
  IRR: "IR",
  ISK: "IS",
  JMD: "JM",
  JOD: "JO",
  JPY: "JP",
  KES: "KE",
  KGS: "KG",
  KHR: "KH",
  KMF: "KM",
  KPW: "KP",
  KRW: "KR",
  KWD: "KW",
  KYD: "KY",
  KZT: "KZ",
  LAK: "LA",
  LBP: "LB",
  LKR: "LK",
  LRD: "LR",
  LSL: "LS",
  LYD: "LY",
  MDL: "MD",
  MGA: "MG",
  MKD: "MK",
  MMK: "MM",
  MNT: "MN",
  MOP: "MO",
  MRU: "MR",
  MUR: "MU",
  MVR: "MV",
  MWK: "MW",
  MXN: "MX",
  MYR: "MY",
  MZN: "MZ",
  NAD: "NA",
  NGN: "NG",
  NIO: "NI",
  NPR: "NP",
  OMR: "OM",
  PAB: "PA",
  PEN: "PE",
  PGK: "PG",
  PHP: "PH",
  PKR: "PK",
  PLN: "PL",
  PYG: "PY",
  QAR: "QA",
  RON: "RO",
  RSD: "RS",
  RUB: "RU",
  RWF: "RW",
  SAR: "SA",
  SBD: "SB",
  SCR: "SC",
  SDG: "SD",
  SEK: "SE",
  SGD: "SG",
  SHP: "SH",
  SLE: "SL",
  SOS: "SO",
  SRD: "SR",
  SSP: "SS",
  STN: "ST",
  SYP: "SY",
  SZL: "SZ",
  THB: "TH",
  TJS: "TJ",
  TMT: "TM",
  TND: "TN",
  TOP: "TO",
  TRY: "TR",
  TTD: "TT",
  TWD: "TW",
  TZS: "TZ",
  UAH: "UA",
  UGX: "UG",
  UYU: "UY",
  UZS: "UZ",
  VES: "VE",
  VND: "VN",
  VUV: "VU",
  WST: "WS",
  YER: "YE",
  ZMW: "ZM",
  ZWL: "ZW"
};

// Rates to map items: one per country, at its centre, with the rate both ways.
function fxItems(d, j, places) {
  var rates = (j && j.rates) || {},
    when = j && j.time_last_update_unix ? j.time_last_update_unix * 1000 : 0,
    names = null,
    cur = null,
    out = [];
  try {
    names = new Intl.DisplayNames(["en"], { type: "region" });
    cur = new Intl.DisplayNames(["en"], { type: "currency" });
  } catch (e) {}
  var fmt = function (v) {
    return v >= 100 ? Math.round(v).toLocaleString() : v >= 1 ? v.toFixed(2) : v.toPrecision(3);
  };
  Object.keys(FX_COUNTRIES).forEach(function (code) {
    var r = rates[code];
    if (!(r > 0)) return;
    FX_COUNTRIES[code].split(" ").forEach(function (cc) {
      var p = places[cc];
      if (!p) return;
      var country = (names && names.of(cc)) || cc,
        cname = (cur && cur.of(code)) || code;
      out.push(
        ilItem(d, {
          id: "fx:" + cc,
          n: country + " · " + code,
          label: code === "USD" ? "" : code,
          lat: p[0],
          lon: p[1],
          tag: "Currency · " + cname,
          rows: [
            ["CURRENCY", cname + " (" + code + ")"],
            ["1 US DOLLAR", fmt(r) + " " + code],
            ["1 " + code, fmt(1 / r) + " USD"],
            ["UPDATED", when ? ilWhen(when) : "—"],
            ["SOURCE", "Rates by Exchange Rate API"]
          ],
          links: [["Rates by Exchange Rate API", "https://www.exchangerate-api.com"]]
        })
      );
    });
  });
  return out;
}

ilDef({
  key: "currency",
  label: "Currencies vs the US dollar",
  color: "#7dffb3",
  icon: "$",
  every: 6 * 3600000,
  load: function (d) {
    return getJSON("https://open.er-api.com/v6/latest/USD", 20000).then(function (j) {
      if (!j || j.result !== "success") throw new Error("no rates");
      return fxItems(d, j, ioPlaces());
    });
  }
});
