/**
 * @file Home, reports and views.
 * Home page and recent scans, the PDF report, the zoom viewer, the bottom sheet, and view
 * settings restored at start-up.
 *
 * Module 25 of 38. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- home page ----------
var sigN = 0,
  sigT = 0;
document.addEventListener("click", function (e) {
  if (e.target.closest("#sigfx")) {
    $("sigfx").style.display = "none";
    return;
  }
  if (!e.target.closest(".brand")) return;
  var n = Date.now();
  sigN = n - sigT < 700 ? sigN + 1 : 1;
  sigT = n;
  if (sigN >= 5) {
    sigN = 0;
    $("sigfx").style.display = "flex";
  }
});
function goDash() {
  var h = $("home");
  if (h.style.display === "none") return;
  h.classList.add("out");
  zoom = 0.5;
  target = { lon: rot.lon + 25, lat: rot.lat, z: 1 };
  setTimeout(function () {
    h.style.display = "none";
    h.classList.remove("out");
  }, 520);
}
var RECENT = ls("ojos-recent") || [];
function rememberScan(q) {
  q = String(q || "").trim();
  if (!q || /^-?\d/.test(q)) return;
  RECENT = [q]
    .concat(
      RECENT.filter(function (x) {
        return x.toLowerCase() !== q.toLowerCase();
      })
    )
    .slice(0, 5);
  ls("ojos-recent", RECENT);
  homeChips();
}
function homeChips() {
  var el = $("hrecent");
  if (!el) return;
  el.innerHTML = RECENT.length
    ? "<span>RECENT</span>" +
      RECENT.map(function (r) {
        return '<button data-rs="' + esc(r) + '">' + esc(r) + "</button>";
      }).join("")
    : "";
}
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-rs]");
  if (b) {
    goDash();
    $("addr").value = b.getAttribute("data-rs");
    scan(b.getAttribute("data-rs"));
  }
});
homeChips();
$("hEnter").onclick = goDash;
$("hform").addEventListener("submit", function (e) {
  e.preventDefault();
  var v = $("haddr").value.trim();
  goDash();
  if (v) {
    $("addr").value = v;
    scan(v);
  }
});
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-h]");
  if (b) {
    var k = b.getAttribute("data-h");
    goDash();
    if (k === "sun") $("bSun").click();
    else if (k === "wall") openWall();
    else if (k === "fav") {
      var fv = FAV.map(camByU).filter(function (c) {
        return c && c.live;
      });
      if (fv.length) {
        wall = fv.slice(0, 9).map(function (c) {
          return c.u;
        });
        ls("godeye-wall", wall);
        updWallBtn();
        layout =
          fv.length <= 1 ? 1 : fv.length <= 2 ? 2 : fv.length <= 4 ? 4 : fv.length <= 6 ? 6 : 9;
        openWall();
      } else note("Favorites", "Open any camera and tap ☆ Save. Your saved cameras appear here.");
    } else if (k === "rand") {
      if (LIVE.length) select(LIVE[Math.floor(Math.random() * LIVE.length)]);
      else note("Random camera", "Cameras are still loading. Try again in a moment.");
    } else if (k === "quake") {
      var q = QUAKES.slice().sort(function (x, y) {
        return y.mag - x.mag;
      })[0];
      if (q) select(q);
      else note("Earthquakes", "No earthquake data loaded yet.");
    }
  }
  void 0;
});

// ---- live report (PDF): tests the feeds for real and packages the result for whoever maintains the app
var RESP = {};
function shape(d) {
  try {
    if (typeof d === "string")
      return "text " + d.length + " chars: " + d.slice(0, 70).replace(/\s+/g, " ");
    if (Array.isArray(d))
      return (
        "array[" +
        d.length +
        "]" +
        (d[0] && typeof d[0] === "object"
          ? " of {" + Object.keys(d[0]).slice(0, 12).join(",") + "}"
          : "")
      );
    if (d && typeof d === "object")
      return (
        "{" +
        Object.keys(d)
          .slice(0, 12)
          .map(function (k) {
            var v = d[k];
            return (
              k +
              (Array.isArray(v)
                ? "[" +
                  v.length +
                  "]" +
                  (v[0] && typeof v[0] === "object"
                    ? "{" + Object.keys(v[0]).slice(0, 10).join(",") + "}"
                    : "")
                : v && typeof v === "object"
                  ? "{" + Object.keys(v).slice(0, 6).join(",") + "}"
                  : "")
            );
          })
          .join(", ") +
        "}"
      );
    return String(d).slice(0, 40);
  } catch (e) {
    return "?";
  }
}
(function () {
  var _ng = netGet;
  netGet = function (url, ms, h, text) {
    var p = String(url)
        .replace(/^https?:\/\//, "")
        .split("?")[0]
        .split("/"),
      host = p
        .slice(0, /osrm|nominatim|open-meteo|googleapis/.test(p[0]) ? 1 : 4)
        .join("/")
        .slice(0, 80);
    return _ng(url, ms, h, text).then(
      function (d) {
        if (Object.keys(RESP).length < 220 || RESP[host]) RESP[host] = "OK   " + shape(d);
        return d;
      },
      function (e) {
        RESP[host] = "FAIL " + String((e && e.message) || e).slice(0, 70);
        throw e;
      }
    );
  };
})();
function pdfMake(lines) {
  var enc = function (s) {
    return String(s)
      .replace(/[—–]/g, "-")
      .replace(/[·•]/g, "*")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/→/g, "->")
      .replace(/…/g, "...")
      .replace(/[^\x20-\x7e]/g, "?")
      .replace(/([\\()])/g, "\\$1");
  };
  var wrap = [];
  lines.forEach(function (l) {
    l = String(l);
    if (!l.length) {
      wrap.push("");
      return;
    }
    for (var i = 0; i < l.length; i += 112) wrap.push((i ? "    " : "") + l.slice(i, i + 112));
  });
  var per = 74,
    pages = [];
  for (var i = 0; i < wrap.length; i += per) pages.push(wrap.slice(i, i + per));
  if (!pages.length) pages = [[""]];
  var objs = [],
    kids = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";
  pages.forEach(function (pg, pi) {
    var c =
        "BT /F1 8 Tf 10 TL 30 762 Td\n" +
        pg
          .map(function (l) {
            return "(" + enc(l) + ") Tj T*";
          })
          .join("\n") +
        "\nET",
      cn = 4 + pi * 2,
      pn = 5 + pi * 2;
    objs[cn] = "<< /Length " + c.length + " >>\nstream\n" + c + "\nendstream";
    objs[pn] =
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents " +
      cn +
      " 0 R >>";
    kids.push(pn + " 0 R");
  });
  objs[2] = "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + pages.length + " >>";
  var out = "%PDF-1.4\n",
    off = [];
  for (var n = 1; n < objs.length; n++) {
    off[n] = out.length;
    out += n + " 0 obj\n" + objs[n] + "\nendobj\n";
  }
  var x = out.length;
  out += "xref\n0 " + objs.length + "\n0000000000 65535 f \n";
  for (n = 1; n < objs.length; n++) out += ("0000000000" + off[n]).slice(-10) + " 00000 n \n";
  return out + "trailer\n<< /Size " + objs.length + " /Root 1 0 R >>\nstartxref\n" + x + "\n%%EOF";
}
function probeCam(c) {
  var t0 = Date.now();
  return new Promise(function (res) {
    var done = false,
      fin = function (ok, why) {
        if (done) return;
        done = true;
        res({ ok: ok, why: why, ms: Date.now() - t0 });
      };
    setTimeout(function () {
      fin(false, "timeout 12s");
    }, 12000);
    loadPix(c.e + (isJ(c.e) ? "" : (c.e.indexOf("?") < 0 ? "?" : "&") + "_p=" + Date.now()))
      .then(function (im) {
        fin(im && im.naturalWidth > 8, im && im.naturalWidth > 8 ? "" : "empty image");
      })
      .catch(function (e) {
        fin(false, String((e && e.message) || "failed"));
      });
  });
}
var repBusy = false;
function liveReport() {
  if (repBusy) return;
  repBusy = true;
  var say = function (t) {
    var b = $("repBtn");
    if (b) b.textContent = t;
  };
  var by = {};
  LIVE.forEach(function (c) {
    (by[c.src] || (by[c.src] = [])).push(c);
  });
  var jobs = [];
  Object.keys(by).forEach(function (src) {
    var a = by[src],
      pickN = Math.min(3, a.length);
    for (var i = 0; i < pickN; i++)
      jobs.push({ src: src, c: a[Math.floor(((i + 0.5) * a.length) / pickN)] });
  });
  var res = {},
    done = 0,
    ix = 0;
  function next() {
    if (ix >= jobs.length) return Promise.resolve();
    var j = jobs[ix++];
    return probeCam(j.c).then(function (r) {
      (res[j.src] || (res[j.src] = [])).push({ r: r, c: j.c });
      done++;
      say("Testing cameras… " + done + " of " + jobs.length);
      return next();
    });
  }
  say(EMBED_OK && jobs.length ? "Testing cameras… 0 of " + jobs.length : "Building report…");
  (EMBED_OK ? Promise.all([0, 1, 2, 3, 4, 5].map(next)) : Promise.resolve())
    .then(function () {
      var L = [],
        hr =
          "------------------------------------------------------------------------------------------------";
      L.push("OJOS DE DIOS  -  LIVE REPORT  (v64)");
      L.push("Made " + new Date().toString());
      L.push("Diagnostic report: what worked on this device and what did not.");
      L.push(hr);
      diagText()
        .split("\n")
        .slice(1)
        .forEach(function (x) {
          L.push(x);
        });
      L.push(
        "KEYS SAVED (names only): " +
          (Object.keys(KEYS).join(", ") || "none") +
          "   GPS: " +
          (navigator.geolocation ? "available" : "none") +
          "   DRIVE: " +
          (DRV.R
            ? "route " +
              Math.round(DRV.R.len) +
              " m by " +
              DRV.R.src +
              ", " +
              DRV.cams.length +
              " cams"
            : "not used") +
          "   STREET VIEW JS API: " +
          (GM_BAD ? "refused" : window.google && google.maps ? "loaded" : "not tried")
      );
      L.push(hr);
      L.push(
        "CAMERA NETWORKS  (listed = cameras the network gave us; test = 3 real cameras opened just now)"
      );
      L.push("");
      SOURCES.forEach(function (s) {
        var st = LIVESTAT[s.name],
          lock = s.keyName && !keyOf(s.keyName),
          t = res[s.name] || [],
          okN = t.filter(function (x) {
            return x.r.ok;
          }).length;
        L.push(
          (lock
            ? "NEEDS KEY "
            : !st
              ? "NO REPLY  "
              : st.n
                ? t.length && !okN
                  ? "LISTS-ONLY"
                  : "WORKING   "
                : "FAILED    ") +
            " " +
            s.name +
            (st && st.n
              ? "   listed " +
                st.n +
                (t.length ? "   test " + okN + "/" + t.length + " images loaded" : "")
              : "") +
            (st && !st.n ? "   reason: " + (st.err || st.s || "?") : "")
        );
        t.forEach(function (x) {
          if (!x.r.ok)
            L.push(
              "              x " +
                x.r.why +
                " (" +
                x.r.ms +
                " ms)  " +
                x.c.e
                  .replace(/^https?:\/\//, "")
                  .split("?")[0]
                  .slice(0, 84)
            );
        });
      });
      L.push(hr);
      L.push(
        "WHAT EACH SERVER SENT BACK  (the shape of the data, so the reader for it can be fixed)"
      );
      L.push("");
      Object.keys(RESP)
        .sort()
        .forEach(function (k) {
          L.push(k);
          L.push("    " + RESP[k]);
        });
      L.push(hr);
      L.push("END OF REPORT");
      return L;
    })
    .then(function (L) {
      var pdf = pdfMake(L),
        name =
          "ojos-report-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-") + ".pdf",
        P = null;
      try {
        P =
          window.Capacitor &&
          Capacitor.isNativePlatform &&
          Capacitor.isNativePlatform() &&
          Capacitor.Plugins;
      } catch (e) {}
      if (P && P.Filesystem && P.Share) {
        return P.Filesystem.writeFile({ path: name, data: btoa(pdf), directory: "CACHE" })
          .then(function (w) {
            return P.Share.share({
              title: "Ojos de Dios live report",
              dialogTitle: "Save or send the report",
              files: [w.uri]
            });
          })
          .catch(function (e) {
            if (!/cancel/i.test(String(e && e.message))) copyText(L.join("\n"));
          });
      }
      try {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        note("Report", "Saved " + name + " to your downloads.");
      } catch (e) {
        copyText(L.join("\n"));
      }
    })
    .catch(function (e) {
      note("Report", "Couldn't build the report: " + esc(String((e && e.message) || e)));
    })
    .then(function () {
      repBusy = false;
      say("⤓ Download live report (PDF)");
    });
}
document.addEventListener("click", function (e) {
  if (e.target.closest("#repBtn")) liveReport();
});

// ---- full-screen zoom viewer: pinch to zoom, drag to move, double-tap to zoom, tap ✕ to close
var ZV = { s: 1, x: 0, y: 0, p: {}, d0: 0, s0: 1, t: 0, timer: 0 };
function zvApply() {
  var im = $("zvimg");
  if (im) im.style.transform = "translate(" + ZV.x + "px," + ZV.y + "px) scale(" + ZV.s + ")";
}
function zvOpen(src, name) {
  var z = $("zoomv");
  src = safeUrl(src);
  if (!z || !src) return;
  $("zvname").textContent = name || "";
  var im = $("zvimg");
  im._nt = null;
  im.setAttribute("data-src", src);
  im.src = /^data:/.test(src)
    ? src
    : src + (isJ(src) ? "" : (src.indexOf("?") < 0 ? "?" : "&") + "_t=" + Date.now());
  ZV.s = 1;
  ZV.x = 0;
  ZV.y = 0;
  zvApply();
  z.style.display = "flex";
  clearInterval(ZV.timer);
  ZV.timer = setInterval(
    function () {
      if (z.style.display !== "flex") {
        clearInterval(ZV.timer);
        return;
      }
      snapRefresh(im);
    },
    isJ(src) ? 2500 : 6000
  );
}
document.addEventListener("click", function (e) {
  if (e.target.closest("#zvclose")) {
    $("zoomv").style.display = "none";
    clearInterval(ZV.timer);
    return;
  }
  var im = e.target.closest("#detail .camview img.snap");
  if (im && im.naturalWidth > 8) {
    var c = selected;
    zvOpen(im.getAttribute("data-src") || im.src, (c && c.n) || "");
  }
});
(function () {
  var z = $("zvstage");
  if (!z) return;
  z.addEventListener("pointerdown", function (e) {
    z.setPointerCapture(e.pointerId);
    ZV.p[e.pointerId] = [e.clientX, e.clientY];
    var k = Object.keys(ZV.p);
    if (k.length === 2) {
      var a = ZV.p[k[0]],
        b = ZV.p[k[1]];
      ZV.d0 = Math.hypot(a[0] - b[0], a[1] - b[1]);
      ZV.s0 = ZV.s;
    }
    var n = Date.now();
    if (k.length === 1 && n - ZV.t < 300) {
      ZV.s = ZV.s > 1.2 ? 1 : 3;
      if (ZV.s === 1) {
        ZV.x = 0;
        ZV.y = 0;
      }
      zvApply();
    }
    ZV.t = n;
  });
  z.addEventListener("pointermove", function (e) {
    var pr = ZV.p[e.pointerId];
    if (!pr) return;
    var k = Object.keys(ZV.p);
    ZV.p[e.pointerId] = [e.clientX, e.clientY];
    if (k.length === 2) {
      var a = ZV.p[k[0]],
        b = ZV.p[k[1]],
        d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (ZV.d0) ZV.s = Math.max(1, Math.min(8, (ZV.s0 * d) / ZV.d0));
    } else {
      ZV.x += e.clientX - pr[0];
      ZV.y += e.clientY - pr[1];
    }
    zvApply();
  });
  var up = function (e) {
    delete ZV.p[e.pointerId];
    if (ZV.s <= 1.01) {
      ZV.x = 0;
      ZV.y = 0;
      zvApply();
    }
  };
  z.addEventListener("pointerup", up);
  z.addEventListener("pointercancel", up);
})();
// ---- details sheet you can drag: pull the bar up or down, tap ▾ to tuck it away
var SHH = Math.max(22, Math.min(84, +(ls("ojos-sheet") || 50)));
function sheetSet(v, save) {
  SHH = Math.max(22, Math.min(84, v));
  document.body.style.setProperty("--sh", SHH + "vh");
  if (save) {
    ls("ojos-sheet", SHH);
    setTimeout(resize, 30);
  }
}
sheetSet(SHH, false);
(function () {
  var bar = $("sheetbar"),
    d = null,
    moved = false;
  if (!bar) return;
  bar.addEventListener("pointerdown", function (e) {
    if (e.target.closest("button")) return;
    d = { y: e.clientY, h: SHH };
    moved = false;
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener("pointermove", function (e) {
    if (!d) return;
    var dv = ((d.y - e.clientY) / window.innerHeight) * 100;
    if (Math.abs(dv) > 1) moved = true;
    sheetSet(d.h + dv, false);
  });
  var up = function (e) {
    if (!d) return;
    var raw = d.h + ((d.y - e.clientY) / window.innerHeight) * 100;
    d = null;
    if (moved && raw < 16) {
      document.body.classList.remove("sheet");
      sheetSet(50, true);
      return;
    }
    sheetSet(SHH, true);
  };
  bar.addEventListener("pointerup", up);
  bar.addEventListener("pointercancel", up);
})();
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-sh]");
  if (!b) return;
  var k = b.getAttribute("data-sh");
  if (k === "hide") {
    document.body.classList.remove("sheet");
    setTimeout(resize, 40);
  } else if (k === "size") {
    sheetSet(SHH > 66 ? 50 : SHH > 40 ? 84 : 50, true);
  } else if (k === "open") {
    document.body.classList.add("sheet");
    setTimeout(resize, 40);
  }
});
setInterval(function () {
  var pk = $("peek");
  if (!pk) return;
  var open = document.body.classList.contains("sheet"),
    nm = selected && selected.n ? selected.n : DRV.R ? "Drive: " + DRV.R.b.name : "";
  pk.style.display = !open && nm && W < 1000 ? "flex" : "none";
  if (nm) $("peekt").textContent = nm;
}, 600);
if (ls("ojos-clean") === true) document.body.classList.add("clean");
if (ls("ojos-static") === true)
  setTimeout(function () {
    ST2D = true;
    staticSet(true);
    ST2D = false;
  }, 400);
if (ls("ojos-view") === "3d" && EMBED_OK) setTimeout(t3Open, 1200);
if (ls("ojos-view") === "real" && EMBED_OK && kG3())
  setTimeout(function () {
    t4Open({ auto: true });
  }, 1200);
if (WL.dots) {
  spin = false;
  var bd0 = $("bDots");
  if (bd0) bd0.classList.add("on");
}
