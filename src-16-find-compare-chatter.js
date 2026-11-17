/**
 * @file Find, compare and public chatter.
 * Look up a flight or ship by any identifier, side-by-side comparison, and public posts about a
 * place.
 *
 * Module 16 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Find a flight or ship by name, compare two cameras, live chatter ----------
var AIRL = {
  AA: "AAL",
  UA: "UAL",
  DL: "DAL",
  WN: "SWA",
  B6: "JBU",
  AS: "ASA",
  NK: "NKS",
  F9: "FFT",
  G4: "AAY",
  HA: "HAL",
  BA: "BAW",
  LH: "DLH",
  AF: "AFR",
  KL: "KLM",
  EK: "UAE",
  QR: "QTR",
  AC: "ACA",
  FX: "FDX",
  "5X": "UPS",
  VS: "VIR",
  IB: "IBE",
  TK: "THY",
  QF: "QFA",
  SQ: "SIA",
  NH: "ANA",
  JL: "JAL",
  EY: "ETD",
  AM: "AMX",
  WS: "WJA",
  FR: "RYR",
  U2: "EZY",
  LX: "SWR",
  AZ: "ITY",
  SK: "SAS",
  CX: "CPA",
  KE: "KAL",
  NZ: "ANZ",
  LA: "LAN",
  AV: "AVA",
  CM: "CMP",
  Y4: "VOI"
};
function craftKey(q) {
  q = String(q || "")
    .toUpperCase()
    .replace(/[\s-]/g, "");
  var m = /^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/.exec(q);
  return m && AIRL[m[1]] ? AIRL[m[1]] + m[2] : q;
}
function craftLooks(q) {
  var r = String(q || "")
    .toUpperCase()
    .replace(/[\s-]/g, "");
  return craftKey(q) !== r || /^[A-Z]{3}\d{1,4}[A-Z]?$/.test(r);
}
function craftFind(q) {
  var k = craftKey(q),
    lo = String(q || "")
      .trim()
      .toLowerCase(),
    i,
    a,
    best = null;
  if (k.length >= 3 && /\d/.test(k)) {
    for (i = 0; i < PLANES.length; i++) {
      a = PLANES[i];
      var cs = String(a.n || "")
        .replace(/\s/g, "")
        .toUpperCase();
      if (cs === k) return a;
      if (!best && cs.indexOf(k) === 0) best = a;
    }
    if (best) return best;
  }
  if (lo.length >= 4) {
    for (i = 0; i < SHIPS.length; i++) {
      a = SHIPS[i];
      var nm = String(a.n || "").toLowerCase();
      if (nm === lo) return a;
      if (!best && nm.indexOf(lo) >= 0 && !/^vessel /.test(nm)) best = a;
    }
  }
  return best;
}
function craftGo(o) {
  select(o);
  target = { lon: o.lon, lat: o.lat, z: Math.max(zoom, 6) };
  if (T4.on && T4.v) {
    T4.h = 0;
    if (o.kind === "plane") {
      T4MT = 0;
      t4Flight();
    } else t4Fly(o.lon, o.lat, 1200, 0);
  }
}
function craftSearch(q) {
  var o = craftFind(q);
  if (o) {
    craftGo(o);
    return true;
  }
  if (!craftLooks(q)) return false;
  if (!WL.air) setLayer("air", true);
  note("Flight search", "Looking for " + esc(craftKey(q)) + " among aircraft in the air…");
  var n = 0,
    t = setInterval(function () {
      var x = craftFind(q);
      if (x || ++n > 7) {
        clearInterval(t);
        if (x) craftGo(x);
        else
          note(
            "Flight search",
            "No aircraft in the air is using " +
              esc(craftKey(q)) +
              " right now. It may be on the ground or out of coverage."
          );
      }
    }, 1500);
  return true;
}
// ----- compare: two cameras, one above the other, refreshed at the same instant -----
var CMP = { a: null, b: null, tm: 0 };
function cmpDraw() {
  var el = $("cmp");
  if (!el) {
    el = document.createElement("div");
    el.id = "cmp";
    document.body.appendChild(el);
  }
  el.style.display = "flex";
  var pane = function (c, k) {
    return (
      '<div class="cmpp"><div class="cmph"><b class="mono">' +
      k +
      "</b><span>" +
      esc(String(c.n || "Camera").slice(0, 48)) +
      '</span><em class="mono">' +
      esc(String(c.src || "").slice(0, 22)) +
      '</em></div><div class="cmpm" data-cm="' +
      k +
      '">' +
      media(c, "wimg") +
      "</div></div>"
    );
  };
  el.innerHTML =
    '<div class="nh"><div><b class="mono">◆ COMPARE</b><h3>Two cameras, in step</h3></div><button data-cm="swap" aria-label="Swap">⇅</button><button data-cm="x" aria-label="Close">✕</button></div>' +
    pane(CMP.a, "A") +
    pane(CMP.b, "B") +
    '<div class="nf mono" id="cmpf">BOTH PICTURES REFRESH TOGETHER EVERY 5 SECONDS</div>';
  wireMedia(el);
  clearInterval(CMP.tm);
  CMP.tm = setInterval(function () {
    if ($("cmp").style.display === "none") {
      clearInterval(CMP.tm);
      return;
    }
    var t = new Date().toLocaleTimeString();
    [].forEach.call($("cmp").querySelectorAll("img.snap"), function (im) {
      snapRefresh(im);
    });
    var f = $("cmpf");
    if (f) f.textContent = "BOTH REFRESHED TOGETHER AT " + t.toUpperCase();
  }, 5000);
}
function cmpPick(c) {
  if (!c || !c.live) return;
  if (!CMP.a || CMP.a === c || CMP.b) {
    CMP.a = c;
    CMP.b = null;
    note(
      "Compare",
      "First camera set: " +
        esc(String(c.n || "camera").slice(0, 40)) +
        ". Now open a second camera and tap ⇄ Compare again."
    );
    return;
  }
  CMP.b = c;
  cmpDraw();
}
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-cm]");
  if (!b) return;
  var k = b.getAttribute("data-cm");
  if (k === "x") {
    clearInterval(CMP.tm);
    $("cmp").style.display = "none";
    $("cmp").innerHTML = "";
    CMP.a = CMP.b = null;
  } else if (k === "swap") {
    var t = CMP.a;
    CMP.a = CMP.b;
    CMP.b = t;
    cmpDraw();
  } else if (k === "pick") cmpPick(selected);
});
// ----- live chatter: public posts about a topic, newest first. Unverified by nature, and labelled so. -----
// Bluesky and Mastodon are open networks with public read access. X needs the user's own API token. Instagram offers no public search, so it is not included.
var CHAT = { q: "", t: 0, busy: false, tm: 0 };
NEWS.chat = [];
function chatText(h) {
  try {
    var d = new DOMParser().parseFromString("<div>" + h + "</div>", "text/html");
    return (d.body.textContent || "").replace(/\s+/g, " ").trim();
  } catch (e) {
    return "";
  }
}
function chatBsky(q) {
  var u =
    "/xrpc/app.bsky.feed.searchPosts?q=" + encodeURIComponent(q) + "&sort=latest&limit=30&lang=en";
  return getJSON("https://api.bsky.app" + u, 15000)
    .catch(function () {
      return getJSON("https://public.api.bsky.app" + u, 15000);
    })
    .then(function (j) {
      return ((j && j.posts) || []).map(function (p) {
        var a = p.author || {},
          r = p.record || {};
        return {
          net: "Bluesky",
          who: "@" + (a.handle || "unknown"),
          t: String(r.text || ""),
          d: Date.parse(r.createdAt || p.indexedAt) || 0,
          u:
            "https://bsky.app/profile/" +
            (a.handle || a.did) +
            "/post/" +
            String(p.uri || "")
              .split("/")
              .pop()
        };
      });
    })
    .catch(function () {
      return [];
    });
}
function chatTags(q) {
  var w = String(q)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
    o = [];
  if (w.length > 1) o.push(w.join(""));
  w.forEach(function (x) {
    if (x.length > 3 && o.indexOf(x) < 0 && o.length < 3) o.push(x);
  });
  return o.slice(0, 3);
}
function chatMasto(q) {
  var words = String(q)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(function (x) {
      return x.length > 2;
    });
  return Promise.all(
    chatTags(q).map(function (tg) {
      return getJSON(
        "https://mastodon.social/api/v1/timelines/tag/" + encodeURIComponent(tg) + "?limit=20",
        15000
      ).catch(function () {
        return [];
      });
    })
  )
    .then(function (r) {
      var o = [];
      r.forEach(function (a) {
        (Array.isArray(a) ? a : []).forEach(function (p) {
          var ac = p.account || {},
            t = chatText(p.content || ""),
            lo = t.toLowerCase();
          if (
            !t ||
            !words.some(function (w) {
              return lo.indexOf(w) >= 0;
            })
          )
            return;
          o.push({
            net: "Mastodon",
            who:
              "@" +
              (String(ac.acct || "unknown").indexOf("@") < 0
                ? ac.acct + "@mastodon.social"
                : ac.acct),
            t: t,
            d: Date.parse(p.created_at) || 0,
            u: p.url || p.uri
          });
        });
      });
      return o;
    })
    .catch(function () {
      return [];
    });
}
function chatX(q) {
  if (!KEYS.x) return Promise.resolve([]);
  return netGet(
    "https://api.x.com/2/tweets/search/recent?query=" +
      encodeURIComponent(q + " -is:retweet lang:en") +
      "&max_results=25&tweet.fields=created_at,author_id&expansions=author_id&user.fields=username",
    15000,
    { Authorization: "Bearer " + KEYS.x }
  )
    .then(function (j) {
      if (typeof j === "string") j = JSON.parse(j);
      var us = {};
      ((j.includes || {}).users || []).forEach(function (u) {
        us[u.id] = u.username;
      });
      return (j.data || []).map(function (t) {
        return {
          net: "X",
          who: "@" + (us[t.author_id] || "unknown"),
          t: String(t.text || ""),
          d: Date.parse(t.created_at) || 0,
          u: "https://x.com/" + (us[t.author_id] || "i") + "/status/" + t.id
        };
      });
    })
    .catch(function () {
      return [];
    });
}
function chatMerge(a) {
  var seen = {},
    o = [];
  a.sort(function (x, y) {
    return y.d - x.d;
  }).forEach(function (p) {
    var t = String(p.t || "")
        .replace(/\s+/g, " ")
        .trim(),
      k = p.net + p.who + t.slice(0, 50);
    if (!t || seen[k] || !/^https?:/.test(p.u || "") || Date.now() - p.d > 3 * 864e5) return;
    seen[k] = 1;
    p.t = t.length > 300 ? t.slice(0, 297) + "…" : t;
    o.push(p);
  });
  return o.slice(0, 60);
}
function chatTopics() {
  var o = [],
    add = function (x) {
      x = String(x || "").trim();
      if (x && o.indexOf(x) < 0 && o.length < 6) o.push(x);
    };
  if (NEWS.bc)
    add(
      /ground stop|grounded/i.test(NEWS.bc.t)
        ? "ground stop"
        : /earthquake/i.test(NEWS.bc.t)
          ? "earthquake"
          : /tsunami/i.test(NEWS.bc.t)
            ? "tsunami"
            : ""
    );
  if (NEWS.area) {
    add(NEWS.area.city);
    add(NEWS.area.state);
  }
  ["breaking news", "flight delays", "power outage", "wildfire"].forEach(add);
  return o;
}
function chatLoad(q, quiet) {
  q = String(q || CHAT.q || chatTopics()[0] || "breaking news").trim();
  if (CHAT.busy) return;
  CHAT.busy = true;
  if (q !== CHAT.q) {
    NEWS.chat = [];
    CHAT.q = q;
  }
  if (!quiet) newsDraw();
  Promise.all([chatBsky(q), chatMasto(q), chatX(q)])
    .then(function (r) {
      NEWS.chat = chatMerge(r[0].concat(r[1]).concat(r[2]));
      CHAT.t = Date.now();
      CHAT.n = [r[0].length, r[1].length, r[2].length];
    })
    .catch(function () {})
    .then(function () {
      CHAT.busy = false;
      newsDraw();
    });
}
function chatHTML() {
  var h =
    '<form class="chq" id="chatForm"><input id="chatQ" type="search" value="' +
    esc(CHAT.q) +
    '" placeholder="Topic, e.g. flights grounded" autocomplete="off"><button>Go</button></form><div class="chc">' +
    chatTopics()
      .map(function (t) {
        return (
          '<button type="button" data-nw="ct-' +
          esc(t) +
          '" class="' +
          (t === CHAT.q ? "on" : "") +
          '">' +
          esc(t) +
          "</button>"
        );
      })
      .join("") +
    "</div>";
  if (CHAT.busy && !NEWS.chat.length) return h + '<p class="ne">Listening for public posts…</p>';
  if (!NEWS.chat.length)
    return (
      h +
      '<p class="ne">No recent public posts found for “' +
      esc(CHAT.q) +
      "”. Try a shorter topic.</p>"
    );
  return (
    h +
    NEWS.chat
      .map(function (p) {
        return (
          '<a class="chp n' +
          p.net.charAt(0) +
          '" href="' +
          esc(p.u) +
          '" target="_blank" rel="noopener"><i class="mono">(' +
          p.net +
          ") " +
          esc(p.who.slice(0, 34)) +
          " · " +
          ago(p.d) +
          "</i><span>" +
          esc(p.t) +
          "</span></a>"
        );
      })
      .join("")
  );
}
document.addEventListener("submit", function (e) {
  if (e.target && e.target.id === "chatForm") {
    e.preventDefault();
    var v = $("chatQ").value.trim();
    if (v) {
      $("chatQ").blur();
      chatLoad(v);
    }
  }
});
setInterval(function () {
  if (
    NEWS.open &&
    NEWS.tab === "chat" &&
    !document.hidden &&
    Date.now() - CHAT.t > 30000 &&
    document.activeElement !== $("chatQ")
  )
    chatLoad(CHAT.q, true);
}, 5000);
