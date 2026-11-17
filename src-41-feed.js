/**
 * @file Data feed: everything ready the moment the app opens.
 * A scheduled job in the repository (.github/workflows/data.yml, harvest.py) opens this app in a
 * headless browser every 20 minutes, lets every camera network and worldwide data layer load, and
 * publishes the result as two compact files on the repository's "data" branch. The app reads them
 * at start-up, so one download replaces dozens of requests from the phone; networks the feed
 * covers are not asked again while it is fresh. Each network the phone does load live still
 * replaces its share, and the phone's own copy from the last session (module 08) fills any gap.
 *
 * Module 41 of 44. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

var FEED = {
  base: "https://raw.githubusercontent.com/quuxin2-a11y/dios-prototype.civ/data/",
  t: 0
};
var FEED_FRESH_MS = 3 * 3600000, // a feed newer than this covers its networks
  FEED_WAIT_MS = 3500, // longest the phone waits for the feed before loading networks itself
  FEED_EVERY_MS = 20 * 60000;

// Compact camera rows back into camera objects: {t, srcs, keys, rows: [[src index, ...values]]}.
function feedDecode(f) {
  var out = [];
  if (!f || !Array.isArray(f.rows) || !Array.isArray(f.keys) || !Array.isArray(f.srcs)) return out;
  f.rows.forEach(function (r) {
    if (!Array.isArray(r)) return;
    var c = { src: f.srcs[r[0]] };
    for (var i = 0; i < f.keys.length; i++) if (r[i + 1] != null) c[f.keys[i]] = r[i + 1];
    if (
      c.src &&
      typeof c.lat === "number" &&
      typeof c.lon === "number" &&
      /^https:/i.test(c.e || "")
    )
      out.push(c);
  });
  return out;
}

// The reverse, used by the harvest: plain values only, one shared key list.
function feedEncode(cams, t) {
  var srcs = [],
    si = {},
    keys = [],
    ki = {};
  cams.forEach(function (c) {
    for (var k in c)
      if (
        !Object.prototype.hasOwnProperty.call(ki, k) &&
        !/^(src|snap|live)$/.test(k) &&
        /^(string|number|boolean)$/.test(typeof c[k])
      ) {
        ki[k] = keys.length;
        keys.push(k);
      }
  });
  var rows = cams.map(function (c) {
    if (!Object.prototype.hasOwnProperty.call(si, c.src)) {
      si[c.src] = srcs.length;
      srcs.push(c.src);
    }
    var r = [si[c.src]];
    keys.forEach(function (k) {
      var v = c[k];
      r.push(/^(string|number|boolean)$/.test(typeof v) ? v : null);
    });
    while (r.length > 1 && r[r.length - 1] === null) r.pop();
    return r;
  });
  return { v: 1, t: t, srcs: srcs, keys: keys, rows: rows };
}

function feedUrl(name) {
  // A new address every 5 minutes, so a phone never sees a copy older than the file host's cache.
  return FEED.base + name + "?v=" + Math.floor(Date.now() / 300000);
}

function feedCams() {
  return getJSON(feedUrl("cams.json"), 9000).then(function (f) {
    if (!f || !f.t) throw new Error("empty feed");
    FEED.t = f.t;
    var cams = feedDecode(f),
      covered = {};
    liveApply(cams, f.t);
    if (Date.now() - f.t < FEED_FRESH_MS)
      f.srcs.forEach(function (s) {
        covered[s] = true;
      });
    return covered;
  });
}

// Worldwide layers (the ones that don't depend on the view) from the feed, for any layer still empty.
function feedLayers() {
  return getJSON(feedUrl("layers.json"), 15000)
    .then(function (f) {
      if (!f || !f.layers) return;
      Object.keys(f.layers).forEach(function (k) {
        var d = IL[k],
          l = f.layers[k];
        if (!d || d.byArea || d.busy || d.items.length || !l || !Array.isArray(l.items)) return;
        d.items = l.items.filter(ilValid);
        d.at = l.t || f.t;
        d.area = "";
        d.st = d.items.length ? "" : d.none || "NONE ACTIVE";
      });
      wstat();
    })
    .catch(function () {
      /* each layer loads itself as usual */
    });
}

if (EMBED_OK) {
  if (window.__ODD_HARVEST) liveSourcesStart({});
  else {
    var feedStarted = false,
      feedStart = function (covered) {
        if (feedStarted) return;
        feedStarted = true;
        liveSourcesStart(covered);
      };
    setTimeout(function () {
      feedStart({});
    }, FEED_WAIT_MS);
    feedCams()
      .then(feedStart)
      .catch(function () {
        feedStart({});
      });
    setTimeout(feedLayers, 600);
    setInterval(function () {
      if (!document.hidden) feedCams().catch(function () {});
    }, FEED_EVERY_MS);
  }
}

// ---------- Harvest hooks, used only by harvest.py in the scheduled job ----------
if (window.__ODD_HARVEST)
  window.__oddHarvest = {
    // Worldwide layers only: view-dependent ones are loaded by each phone for its own area.
    start: function () {
      IL_ORDER.forEach(function (k) {
        var d = IL[k];
        if (!d.byArea && !d.maxKm) WL[k] = true;
      });
    },
    status: function () {
      return {
        cams: LIVE.length,
        networks: Object.keys(LIVESTAT).length,
        layersBusy: IL_ORDER.filter(function (k) {
          return IL[k].busy;
        }).length
      };
    },
    collect: function () {
      var t = Date.now(),
        layers = {};
      IL_ORDER.forEach(function (k) {
        var d = IL[k];
        if (d.byArea || d.maxKm || WSTAT[k] !== "ok") return;
        try {
          layers[k] = { t: d.at, items: JSON.parse(JSON.stringify(d.items)) };
        } catch (e) {
          /* a layer whose items cannot be written out is simply loaded by each phone */
        }
      });
      return {
        cams: feedEncode(
          LIVE.filter(function (c) {
            return c.src !== WN;
          }),
          t
        ),
        layers: { v: 1, t: t, layers: layers }
      };
    }
  };
