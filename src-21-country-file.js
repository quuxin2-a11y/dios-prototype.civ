/**
 * @file Country file.
 * Travel advisory, emergency numbers, leadership, economy and currency for any country.
 *
 * Module 21 of 25. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Country file: public facts for any country, from open worldwide sources ----------
var CTY = { open: false, busy: false, d: null, cache: {}, adv: null };
var CTY_WB = [
  ["NY.GDP.MKTP.CD", "Economy (GDP)", "usd"],
  ["NY.GDP.PCAP.CD", "GDP per person", "usd"],
  ["FP.CPI.TOTL.ZG", "Inflation", "pct"],
  ["SL.UEM.TOTL.ZS", "Unemployment", "pct"],
  ["SP.DYN.LE00.IN", "Life expectancy", "yr"],
  ["IT.NET.USER.ZS", "People online", "pct"]
];
function ctyMoney(v) {
  return v >= 1e12
    ? "$" + (v / 1e12).toFixed(2) + " trillion"
    : v >= 1e9
      ? "$" + (v / 1e9).toFixed(1) + " billion"
      : v >= 1e6
        ? "$" + (v / 1e6).toFixed(1) + " million"
        : "$" + Math.round(v).toLocaleString();
}
function ctyAdvParse(x) {
  var d = new DOMParser().parseFromString(x, "text/xml"),
    o = [];
  [].slice.call(d.getElementsByTagName("item")).forEach(function (it) {
    var g = function (n) {
        var e = it.getElementsByTagName(n)[0];
        return e ? e.textContent.trim() : "";
      },
      t = g("title"),
      m = /^(.*?)\s+-\s+Level\s+(\d)\s*:\s*(.*)$/.exec(t);
    if (m) o.push({ c: m[1].toLowerCase(), lvl: +m[2], t: m[3], u: g("link"), d: g("pubDate") });
  });
  return o;
}
function ctyAdvFind(L, name) {
  var n = String(name || "")
    .toLowerCase()
    .replace(/^the\s+/, "");
  if (!n) return null;
  var i, c;
  for (i = 0; i < L.length; i++) if (L[i].c.replace(/^the\s+/, "") === n) return L[i];
  for (i = 0; i < L.length; i++) {
    c = L[i].c.replace(/^the\s+/, "");
    if (c.indexOf(n + " ") === 0 || n.indexOf(c + " ") === 0) return L[i];
  }
  return null;
}
function ctyFacts(cc) {
  cc = String(cc || "").toUpperCase();
  if (CTY.cache[cc]) return Promise.resolve(CTY.cache[cc]);
  var q =
    'SELECT ?c ?cLabel ?capLabel ?pop ?hsLabel ?hgLabel ?curLabel ?curCode ?code ?emLabel ?langLabel ?driveLabel ?area WHERE{?c wdt:P297 "' +
    cc.replace(/[^A-Z]/g, "") +
    '". OPTIONAL{?c wdt:P36 ?cap} OPTIONAL{?c wdt:P1082 ?pop} OPTIONAL{?c wdt:P35 ?hs} OPTIONAL{?c wdt:P6 ?hg} OPTIONAL{?c wdt:P38 ?cur. OPTIONAL{?cur wdt:P498 ?curCode}} OPTIONAL{?c wdt:P474 ?code} OPTIONAL{?c wdt:P2852 ?em} OPTIONAL{?c wdt:P37 ?lang} OPTIONAL{?c wdt:P1622 ?drive} OPTIONAL{?c wdt:P2046 ?area} SERVICE wikibase:label{bd:serviceParam wikibase:language "en"}} LIMIT 400';
  return getJSON(
    "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q),
    20000
  ).then(function (j) {
    var B = (j && j.results && j.results.bindings) || [],
      F = { cc: cc },
      set = function (k) {
        var s = {},
          o = [];
        B.forEach(function (b) {
          var v = b[k] && b[k].value;
          if (v && !s[v] && !/^Q\d+$/.test(v)) {
            s[v] = 1;
            o.push(v);
          }
        });
        return o;
      };
    if (!B.length) return F;
    F.name = set("cLabel")[0];
    F.qid = String(set("c")[0] || "")
      .split("/")
      .pop();
    F.capital = set("capLabel").slice(0, 3).join(", ");
    F.pop = Math.max.apply(null, set("pop").map(Number).concat([0]));
    F.hs = set("hsLabel").slice(0, 2).join(", ");
    F.hg = set("hgLabel").slice(0, 2).join(", ");
    F.cur = set("curLabel").slice(0, 2).join(", ");
    F.curCode = set("curCode")[0] || "";
    F.dial = set("code").slice(0, 2).join(", ");
    F.em = set("emLabel").slice(0, 5);
    F.lang = set("langLabel").slice(0, 5).join(", ");
    F.drive = set("driveLabel")[0] || "";
    F.area = +set("area")[0] || 0;
    CTY.cache[cc] = F;
    return F;
  });
}
function ctyLoad(cc, name) {
  cc = String(cc || "").toUpperCase();
  var d = (CTY.d = { cc: cc, name: name || cc, wb: {} });
  CTY.busy = true;
  ctyDraw();
  var jobs = [
    ctyFacts(cc)
      .then(function (F) {
        d.F = F;
        if (F.name) d.name = F.name;
        ctyDraw();
        if (F.curCode && F.curCode !== "USD")
          return getJSON(
            "https://api.frankfurter.dev/v1/latest?from=USD&to=" + encodeURIComponent(F.curCode),
            12000
          )
            .then(function (j) {
              var r = j && j.rates && j.rates[F.curCode];
              if (r) d.fx = { r: r, date: j.date };
            })
            .catch(function () {});
      })
      .catch(function () {
        d.err = true;
      }),
    (CTY.adv
      ? Promise.resolve(CTY.adv)
      : netGet("https://travel.state.gov/_res/rss/TAsTWs.xml", 25000, null, true).then(
          function (x) {
            return (CTY.adv = ctyAdvParse(String(x)));
          }
        )
    ).catch(function () {
      return null;
    })
  ];
  CTY_WB.forEach(function (w) {
    jobs.push(
      getJSON(
        "https://api.worldbank.org/v2/country/" +
          cc +
          "/indicator/" +
          w[0] +
          "?format=json&mrnev=1",
        15000
      )
        .then(function (j) {
          var r = j && j[1] && j[1][0];
          if (r && r.value != null) d.wb[w[0]] = { v: r.value, y: r.date };
        })
        .catch(function () {})
    );
  });
  Promise.all(jobs).then(function () {
    d.adv = CTY.adv ? ctyAdvFind(CTY.adv, d.name) : null;
    d.haz = (NEWS.alerts || [])
      .filter(function (a) {
        return (
          d.name &&
          String(a.t || "")
            .toLowerCase()
            .indexOf(d.name.toLowerCase()) >= 0
        );
      })
      .slice(0, 5);
    CTY.busy = false;
    ctyDraw();
  });
}
function ctyHere() {
  var c = EMG.on && EMG.pos ? [EMG.pos.lat, EMG.pos.lon] : newsCentre();
  CTY.busy = true;
  ctyDraw();
  getJSON(
    "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=3&accept-language=en&lat=" +
      c[0].toFixed(3) +
      "&lon=" +
      c[1].toFixed(3),
    12000
  )
    .then(function (j) {
      var a = (j && j.address) || {};
      if (a.country_code) ctyLoad(a.country_code, a.country);
      else {
        CTY.busy = false;
        CTY.d = { none: true };
        ctyDraw();
      }
    })
    .catch(function () {
      CTY.busy = false;
      CTY.d = { none: true };
      ctyDraw();
    });
}
function ctyFind(q) {
  q = String(q || "").trim();
  if (!q) return;
  CTY.busy = true;
  ctyDraw();
  getJSON(
    "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&accept-language=en&featuretype=country&q=" +
      encodeURIComponent(q),
    12000
  )
    .then(function (j) {
      var p = j && j[0],
        a = (p && p.address) || {};
      if (a.country_code) {
        CTY.pt = { lat: +p.lat, lon: +p.lon };
        ctyLoad(a.country_code, a.country);
      } else {
        CTY.busy = false;
        CTY.d = { none: true, q: q };
        ctyDraw();
      }
    })
    .catch(function () {
      CTY.busy = false;
      CTY.d = { none: true, q: q };
      ctyDraw();
    });
}
function ctyDraw() {
  var el = $("cty");
  if (!el || !CTY.open) return;
  if (document.activeElement && document.activeElement.id === "ctyQ") return;
  var d = CTY.d,
    F = (d && d.F) || {},
    row = function (k, v) {
      return v ? "<tr><td>" + k + "</td><td>" + esc(String(v)) + "</td></tr>" : "";
    },
    h =
      '<div class="nh"><div><b class="mono">◍ COUNTRY FILE</b><h3>' +
      esc((d && d.name) || "Any country") +
      '</h3></div><button data-cy="here" aria-label="Country in view">⌖</button><button data-cy="x" aria-label="Close">✕</button></div><div class="nl"><form class="chq" id="ctyForm"><input id="ctyQ" type="search" placeholder="Country name" autocomplete="off"><button>Open</button></form>';
  if (CTY.busy && !(d && d.F)) h += '<p class="bre">Reading public records…</p>';
  else if (d && d.none)
    h +=
      '<p class="bre">' +
      (d.q
        ? "No country found for “" + esc(d.q) + "”."
        : "No country at the centre of the map. Move over land, or type a name.") +
      "</p>";
  else if (d) {
    if (d.adv)
      h +=
        '<h4 class="mono">TRAVEL ADVISORY</h4><a class="brc l' +
        (d.adv.lvl >= 4 ? 3 : d.adv.lvl === 3 ? 2 : 1) +
        '" href="' +
        esc(d.adv.u) +
        '" target="_blank" rel="noopener"><b>Level ' +
        d.adv.lvl +
        " of 4 · " +
        esc(d.adv.t) +
        '</b><i class="mono">US DEPARTMENT OF STATE · ' +
        esc(d.adv.d) +
        " · TAP FOR THE FULL ADVISORY</i></a>";
    h +=
      '<h4 class="mono">FACTS</h4><div class="brc"><table>' +
      row("Capital", F.capital) +
      row("Population", F.pop ? Math.round(F.pop).toLocaleString() : "") +
      row("Head of state", F.hs) +
      row("Head of government", F.hg) +
      row("Official language", F.lang) +
      row("Area", F.area ? Math.round(F.area).toLocaleString() + " km²" : "") +
      row("Drives on the", F.drive) +
      row("Dialling code", F.dial) +
      row("Emergency numbers", (F.em || []).join(" · ")) +
      row(
        "Currency",
        F.cur +
          (d.fx
            ? " · 1 US dollar = " +
              (+d.fx.r).toLocaleString(undefined, { maximumFractionDigits: 2 }) +
              " " +
              F.curCode
            : "")
      ) +
      '</table><i class="mono">WIKIDATA' +
      (d.fx ? " · RATE: EUROPEAN CENTRAL BANK VIA FRANKFURTER, " + esc(d.fx.date) : "") +
      "</i>" +
      (d.err ? '<span class="brd">The facts service did not answer.</span>' : "") +
      "</div>";
    var wb = CTY_WB.filter(function (w) {
      return d.wb[w[0]];
    });
    if (wb.length)
      h +=
        '<h4 class="mono">ECONOMY AND PEOPLE</h4><div class="brc"><table>' +
        wb
          .map(function (w) {
            var x = d.wb[w[0]];
            return row(
              w[1],
              (w[2] === "usd"
                ? ctyMoney(x.v)
                : w[2] === "pct"
                  ? (+x.v).toFixed(1) + "%"
                  : (+x.v).toFixed(1) + " years") +
                " (" +
                x.y +
                ")"
            );
          })
          .join("") +
        '</table><i class="mono">WORLD BANK OPEN DATA · LATEST YEAR REPORTED</i></div>';
    if (d.haz && d.haz.length)
      h +=
        '<h4 class="mono">ACTIVE ALERTS</h4>' +
        d.haz
          .map(function (a) {
            return (
              '<div class="brc l' +
              a.lvl +
              '"><b>' +
              esc(String(a.t).slice(0, 100)) +
              '</b><i class="mono">' +
              esc(a.src || "") +
              "</i></div>"
            );
          })
          .join("");
    h +=
      '<div class="brt"><button data-cy="news">◉ News there</button><button data-cy="go">Show on map</button><button data-cy="rec">◆ Company register</button><a class="brl" href="https://www.wikidata.org/wiki/' +
      esc(F.qid || "") +
      '" target="_blank" rel="noopener">Full open record</a></div>';
  }
  h +=
    '</div><div class="nf mono">OPEN WORLDWIDE SOURCES: WIKIDATA · WORLD BANK · US STATE DEPARTMENT · GDACS · EUROPEAN CENTRAL BANK</div>';
  el.innerHTML = h;
}
function ctyOpen(cc, name) {
  var el = $("cty");
  if (!el) {
    el = document.createElement("div");
    el.id = "cty";
    el.className = "pn";
    document.body.appendChild(el);
  }
  CTY.open = true;
  CTY.pt = null;
  el.style.display = "flex";
  if (cc) ctyLoad(cc, name);
  else if (!CTY.d) ctyHere();
  else ctyDraw();
}
document.addEventListener("submit", function (e) {
  if (e.target && e.target.id === "ctyForm") {
    e.preventDefault();
    var v = $("ctyQ").value;
    $("ctyQ").blur();
    ctyFind(v);
  }
});
document.addEventListener("click", function (e) {
  if (e.target.closest("#bCty")) {
    ctyOpen();
    return;
  }
  var b = e.target.closest("[data-cy]");
  if (!b) return;
  var k = b.getAttribute("data-cy"),
    d = CTY.d,
    cl = function () {
      CTY.open = false;
      $("cty").style.display = "none";
    };
  if (k === "x") cl();
  else if (k === "here") {
    CTY.pt = null;
    ctyHere();
  } else if (k === "rec" && d) {
    cl();
    recOpen();
    REC.cc = d.cc;
    REC.country = d.name;
  } else if (k === "emg") {
    ctyOpen(b.getAttribute("data-cc"), "");
  } else if ((k === "go" || k === "news") && d && d.name) {
    var go = function (p) {
      cl();
      target = { lon: p.lon, lat: p.lat, z: clampZ(Math.min(zoom, 6)) };
      rot.lon = p.lon;
      rot.lat = p.lat;
      if (k === "news")
        setTimeout(function () {
          newsOpen("here");
          newsLoad(true);
        }, 600);
    };
    if (CTY.pt) go(CTY.pt);
    else
      geo1(d.name)
        .then(go)
        .catch(function () {});
  }
});
