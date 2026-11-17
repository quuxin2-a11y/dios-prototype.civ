/**
 * @file Cockpit view and native bridge.
 * Flight-deck view with weather at altitude, and the bridge to the Android plugin (widget,
 * vibration, shortcuts).
 *
 * Module 23 of 44. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Cockpit view: the real world from a live aircraft's position, with the weather the forecast model reports there ----------
var CKP = {
  on: false,
  id: "",
  p: null,
  fix: null,
  wx: null,
  wxAt: 0,
  wxPos: null,
  yaw: 0,
  pit: 0,
  fx: [],
  raf: 0
};
var CKP_LV = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150];
function ckpLevel(altM) {
  var p = 1013.25 * Math.pow(Math.max(0.05, 1 - 2.25577e-5 * Math.max(0, altM)), 5.25588),
    best = CKP_LV[0],
    bd = 1e9;
  CKP_LV.forEach(function (l) {
    var d = Math.abs(l - p);
    if (d < bd) {
      bd = d;
      best = l;
    }
  });
  return best;
}
// turn the model's numbers into what you would see through the windscreen
function ckpScene(w, altM) {
  if (!w)
    return {
      cloud: 0,
      under: 0,
      over: 0,
      rain: 0,
      snow: 0,
      night: false,
      txt: "Reading the weather…"
    };
  var here = w.lvCloud != null ? w.lvCloud : 0,
    low = w.low || 0,
    mid = w.mid || 0,
    high = w.high || 0,
    under = altM > 6500 ? Math.max(low, mid) : altM > 2200 ? low : 0,
    over =
      altM < 2000 ? Math.max(low, mid, high) : altM < 6000 ? Math.max(mid, high) * 0.8 : high * 0.6,
    inCloud = here >= 55,
    wet = (w.precip || 0) > 0.05 && altM < Math.max(1500, (w.frz || 3000) + 2500),
    snow = wet && ((w.snow || 0) > 0 || (w.lvT != null && w.lvT < -1)),
    txt = inCloud
      ? "In cloud"
      : under >= 70
        ? "Above a solid cloud deck"
        : under >= 30
          ? "Broken cloud below"
          : over >= 70
            ? "Under an overcast sky"
            : over >= 30
              ? "Scattered cloud above"
              : "Clear air";
  if (wet) txt += snow ? " · snow" : " · rain";
  if (w.vis != null && w.vis < 5000 && altM < 1500) txt += " · low visibility";
  return {
    cloud: inCloud ? Math.min(1, here / 100) : 0,
    under: under / 100,
    over: over / 100,
    rain: wet && !snow ? Math.min(1, 0.35 + (w.precip || 0) / 4) : 0,
    snow: snow ? Math.min(1, 0.35 + (w.precip || 0) / 3) : 0,
    night: w.day === 0,
    txt: txt
  };
}
function ckpWx(lat, lon, altM) {
  var lv = ckpLevel(altM),
    L = lv + "hPa";
  CKP.wxAt = Date.now();
  CKP.wxPos = { lat: lat, lon: lon };
  return getJSON(
    "https://api.open-meteo.com/v1/forecast?latitude=" +
      lat.toFixed(3) +
      "&longitude=" +
      lon.toFixed(3) +
      "&current=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation,snowfall,weather_code,visibility,is_day,wind_gusts_10m&hourly=temperature_" +
      L +
      ",wind_speed_" +
      L +
      ",wind_direction_" +
      L +
      ",cloud_cover_" +
      L +
      ",freezing_level_height&forecast_hours=1&wind_speed_unit=kn&timezone=GMT",
    15000
  )
    .then(function (j) {
      var c = (j && j.current) || {},
        h = (j && j.hourly) || {},
        g = function (k) {
          return h[k] && h[k][0] != null ? h[k][0] : null;
        };
      CKP.wx = {
        lv: lv,
        low: c.cloud_cover_low,
        mid: c.cloud_cover_mid,
        high: c.cloud_cover_high,
        tot: c.cloud_cover,
        precip: c.precipitation,
        snow: c.snowfall,
        code: c.weather_code,
        vis: c.visibility,
        day: c.is_day,
        gust: c.wind_gusts_10m,
        lvT: g("temperature_" + L),
        lvW: g("wind_speed_" + L),
        lvD: g("wind_direction_" + L),
        lvCloud: g("cloud_cover_" + L),
        frz: g("freezing_level_height")
      };
    })
    .catch(function () {
      CKP.wxErr = true;
    });
}
function ckpPlane() {
  for (var i = 0; i < PLANES.length; i++) if (PLANES[i].id === CKP.id) return PLANES[i];
  return CKP.p;
}
function ckpPos() {
  var q = CKP.p,
    f = CKP.fix;
  if (!f || f.lon !== q.lon || f.lat !== q.lat)
    f = CKP.fix = {
      lon: q.lon,
      lat: q.lat,
      t: Date.now(),
      olon: f ? f.clon : q.lon,
      olat: f ? f.clat : q.lat
    };
  var dt = Math.min(40, (Date.now() - f.t) / 1000),
    d = (q.v || 0) * dt,
    h = (q.trk || 0) * D,
    lon = f.lon + (d * Math.sin(h)) / (111320 * Math.max(0.2, Math.cos(f.lat * D))),
    lat = f.lat + (d * Math.cos(h)) / 110540,
    k = Math.min(1, dt / 3);
  if (f.olon != null) {
    lon = f.olon + (lon - f.olon) * k + (1 - k) * 0;
    lat = f.olat + (lat - f.olat) * k;
  }
  f.clon = lon;
  f.clat = lat;
  return { lon: lon, lat: lat, alt: Math.max(120, q.alt || 9000) };
}
function ckpFrame() {
  if (!CKP.on || !T4.v || !window.Cesium) return;
  var C = Cesium,
    v = T4.v,
    q = ckpPos(),
    S = CKP.sc || {},
    sh = S.cloud
      ? Math.sin(performance.now() / 130) * 0.0025 + Math.sin(performance.now() / 47) * 0.0012
      : 0;
  try {
    v.camera.setView({
      destination: C.Cartesian3.fromDegrees(q.lon, q.lat, q.alt),
      orientation: {
        heading: ((CKP.p.trk || 0) + CKP.yaw) * D,
        pitch: (-4 + CKP.pit) * D + sh,
        roll: sh * 0.6
      }
    });
    var e = T4M["p" + CKP.id];
    if (e && e.show !== false) e.show = false;
  } catch (x) {}
}
function ckpPaint() {
  if (!CKP.on) return;
  CKP.raf = requestAnimationFrame(ckpPaint);
  var cv = $("ckpfx");
  if (!cv) return;
  var w = cv.clientWidth,
    h = cv.clientHeight,
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  var g = cv.getContext("2d"),
    S = CKP.sc || {},
    t = performance.now() / 1000,
    i;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  if (S.night) {
    g.fillStyle = "rgba(4,8,22,0.5)";
    g.fillRect(0, 0, w, h);
  }
  if (S.over > 0.05) {
    var go = g.createLinearGradient(0, 0, 0, h * 0.5);
    go.addColorStop(
      0,
      "rgba(" + (S.night ? "40,46,60" : "196,202,210") + "," + (0.75 * S.over).toFixed(2) + ")"
    );
    go.addColorStop(1, "rgba(196,202,210,0)");
    g.fillStyle = go;
    g.fillRect(0, 0, w, h * 0.5);
  }
  if (S.under > 0.05) {
    var hz = h * 0.47,
      gu = g.createLinearGradient(0, hz, 0, h);
    gu.addColorStop(0, "rgba(" + (S.night ? "60,66,80" : "236,240,244") + ",0)");
    gu.addColorStop(
      0.18,
      "rgba(" + (S.night ? "60,66,80" : "236,240,244") + "," + (0.9 * S.under).toFixed(2) + ")"
    );
    gu.addColorStop(
      1,
      "rgba(" +
        (S.night ? "50,56,70" : "250,252,254") +
        "," +
        Math.min(0.97, S.under * 1.05).toFixed(2) +
        ")"
    );
    g.fillStyle = gu;
    g.fillRect(0, hz, w, h - hz);
    for (i = 0; i < 16; i++) {
      var z = (i / 16 + t * 0.035) % 1,
        y = hz + Math.pow(z, 2.2) * (h - hz),
        x = ((i * 0.618034) % 1) * w * 1.4 - w * 0.2 + (i % 2 ? 1 : -1) * z * z * w * 0.25,
        r = 14 + z * z * 150;
      g.fillStyle =
        "rgba(" + (S.night ? "80,86,100" : "255,255,255") + "," + (0.16 * S.under).toFixed(3) + ")";
      g.beginPath();
      g.ellipse(x, y, r * 2.1, r * 0.55, 0, 0, 7);
      g.fill();
    }
  }
  if (S.cloud > 0) {
    g.fillStyle =
      "rgba(" +
      (S.night ? "34,38,48" : "214,219,224") +
      "," +
      Math.min(0.94, 0.5 + S.cloud * 0.45 + Math.sin(t * 0.7) * 0.04).toFixed(2) +
      ")";
    g.fillRect(0, 0, w, h);
    for (i = 0; i < 5; i++) {
      var cx = (((i * 0.37 + t * 0.22) % 1.4) - 0.2) * w,
        cy = h * (0.2 + 0.15 * i);
      g.fillStyle = "rgba(255,255,255,0.05)";
      g.beginPath();
      g.ellipse(cx, cy, w * 0.5, h * 0.12, 0, 0, 7);
      g.fill();
    }
  }
  var n = Math.round(90 * (S.rain || 0) + 70 * (S.snow || 0));
  if (n) {
    g.lineCap = "round";
    for (i = 0; i < n; i++) {
      var a = ((i * 0.754877) % 1) * 6.283,
        sp = S.snow ? 0.5 : 1.7,
        k = (i * 0.381966 + t * sp) % 1,
        r0 = 20 + k * k * Math.max(w, h) * 0.75,
        x0 = w / 2 + Math.cos(a) * r0,
        y0 = h * 0.44 + Math.sin(a) * r0 * 0.8,
        len = S.snow ? 2 : 8 + k * 38;
      if (S.snow) {
        g.fillStyle = "rgba(255,255,255," + (0.35 + k * 0.5).toFixed(2) + ")";
        g.beginPath();
        g.arc(x0, y0, 1 + k * 2.2, 0, 7);
        g.fill();
      } else {
        g.strokeStyle = "rgba(215,228,240," + (0.12 + k * 0.4).toFixed(2) + ")";
        g.lineWidth = 1 + k;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len * 0.8);
        g.stroke();
      }
    }
  }
}
function ckpHud() {
  if (!CKP.on) return;
  var p = (CKP.p = ckpPlane()),
    el = $("ckphud");
  if (!p || !el) return;
  var alt = Math.max(0, p.alt || 0),
    w = CKP.wx,
    S = (CKP.sc = ckpScene(w, alt)),
    moved = CKP.wxPos ? hav(p.lat, p.lon, CKP.wxPos.lat, CKP.wxPos.lon) : 1e9;
  if (
    Date.now() - CKP.wxAt > 4 * 60000 ||
    moved > 45 ||
    (w && ckpLevel(alt) !== w.lv && Date.now() - CKP.wxAt > 30000)
  )
    ckpWx(p.lat, p.lon, alt).then(ckpHud);
  try {
    if (T4.v) {
      var f = T4.v.scene.fog;
      f.enabled = true;
      f.density =
        w && w.vis != null && alt < 3000 ? Math.min(0.0012, 0.9 / Math.max(600, w.vis)) : 0.00012;
      var sa = T4.v.scene.skyAtmosphere;
      if (sa) {
        sa.brightnessShift = S.night ? -0.75 : -(S.over || 0) * 0.35;
        sa.saturationShift = -(S.over || 0) * 0.6;
      }
    }
  } catch (e) {}
  var cell = function (k, v) {
    return "<div><span>" + k + "</span><b>" + v + "</b></div>";
  };
  el.innerHTML =
    '<div class="ckpt"><div class="ckpn"><b class="mono">◉ COCKPIT · ' +
    esc(p.n || p.id) +
    '</b><button data-ckx="1" aria-label="Leave the cockpit">✕</button></div><span>' +
    esc(S.txt) +
    '</span></div><div class="ckpg">' +
    cell("ALTITUDE", Math.round(alt * 3.281).toLocaleString() + " ft") +
    cell("GROUND SPEED", Math.round((p.v || 0) * 1.944) + " kt") +
    cell("HEADING", ("00" + Math.round(((p.trk || 0) + 360) % 360)).slice(-3) + "°") +
    cell("OUTSIDE AIR", w && w.lvT != null ? Math.round((w.lvT * 9) / 5 + 32) + "°F" : "…") +
    cell(
      "WIND ALOFT",
      w && w.lvW != null
        ? ("00" + Math.round(w.lvD || 0)).slice(-3) + "° " + Math.round(w.lvW) + " kt"
        : "…"
    ) +
    cell("CLOUD HERE", w && w.lvCloud != null ? Math.round(w.lvCloud) + "%" : "…") +
    '</div><i class="mono">' +
    (CKP.wxErr && !w
      ? "THE WEATHER MODEL DID NOT ANSWER · VIEW SHOWN WITHOUT WEATHER"
      : "WEATHER SIMULATED FROM THE FORECAST MODEL FOR THIS POSITION AND HEIGHT · NOT A CAMERA") +
    " · DRAG TO LOOK AROUND</i>";
}
function ckpOpen(p) {
  if (!p || p.kind !== "plane") return;
  if (!kG3()) {
    note(
      "Cockpit view",
      "Cockpit view shows the real world in 3D, which uses Google's 3D models. Add your Google Maps key under Layers → Sources &amp; keys first.",
      openKeys
    );
    return;
  }
  CKP.id = p.id;
  CKP.p = p;
  CKP.fix = null;
  CKP.yaw = 0;
  CKP.pit = 0;
  CKP.wx = null;
  CKP.wxErr = false;
  CKP.wxAt = 0;
  CKP.wxPos = null;
  CKP.sc = null;
  if (!T4.on) t4Open();
  var n = 0,
    go = function () {
      if (!T4.on) {
        return;
      }
      if (!T4.ready || !T4.v) {
        if (n++ < 120) setTimeout(go, 500);
        return;
      }
      ckpStart();
    };
  go();
}
function ckpChrome(hide) {
  var st = document.querySelector(".stage"),
    L = [];
  try {
    [].forEach.call(
      document.querySelectorAll(
        ".grid>*,.top,.scanbar,.hud,.kpis,.mtabs,#sheetbar,#peek,#lfrail,#irail,#t4bar,#t4places,#brandov,#bcast,#cmdbar,#cmdtk,#emgpill,#ftiles,#insfacts,#dotsleg,#tilt,#attr"
      ),
      function (e) {
        if (
          e === st ||
          (st && e.contains(st)) ||
          e.id === "real" ||
          e.id === "czmap" ||
          e.id === "ckp"
        )
          return;
        L.push(e);
      }
    );
    var rl = $("real");
    if (rl)
      [].forEach.call(rl.children, function (e) {
        if (e.id !== "czmap") L.push(e);
      });
  } catch (x) {}
  if (hide) {
    CKP.hid = L.map(function (e) {
      var o = [e, e.style.getPropertyValue("display"), e.style.getPropertyPriority("display")];
      e.style.setProperty("display", "none", "important");
      return o;
    });
  } else {
    (CKP.hid || []).forEach(function (o) {
      try {
        if (o[1]) o[0].style.setProperty("display", o[1], o[2]);
        else o[0].style.removeProperty("display");
      } catch (x) {}
    });
    CKP.hid = null;
  }
}
function ckpStart() {
  var v = T4.v;
  CKP.on = true;
  try {
    COVER.forEach(function (id) {
      var e = $(id);
      if (e && e.style.display === "flex") e.style.display = "none";
    });
    NEWS.open = FLOG.open = FND.open = REC.open = PLN.open = CTY.open = CHK.open = false;
    EMG.open = false;
  } catch (e) {}
  setTimeout(function () {
    try {
      v.resize();
    } catch (e) {}
  }, 60);
  try {
    v.trackedEntity = undefined;
    t4OrbitStop();
  } catch (e) {}
  try {
    t4FlightOff();
  } catch (e) {}
  try {
    v.scene.screenSpaceCameraController.enableInputs = false;
  } catch (e) {}
  var el = $("ckp");
  if (!el) {
    el = document.createElement("div");
    el.id = "ckp";
    el.innerHTML =
      '<canvas id="ckpfx"></canvas><div id="ckpframe"><i></i><i></i></div><button id="ckpx" aria-label="Leave the cockpit">✕ Leave cockpit</button><button id="ckpc" aria-label="Look straight ahead">⌖</button><div id="ckphud"></div>';
    document.documentElement.appendChild(el);
    var dn = null;
    el.addEventListener("pointerdown", function (e) {
      if (e.target.closest("button")) return;
      dn = { x: e.clientX, y: e.clientY, yaw: CKP.yaw, pit: CKP.pit };
    });
    el.addEventListener("pointermove", function (e) {
      if (!dn) return;
      CKP.yaw = Math.max(-150, Math.min(150, dn.yaw - (e.clientX - dn.x) * 0.25));
      CKP.pit = Math.max(-55, Math.min(35, dn.pit + (e.clientY - dn.y) * 0.2));
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (k) {
      el.addEventListener(k, function () {
        dn = null;
      });
    });
    $("ckpx").onclick = ckpClose;
    $("ckpc").onclick = function () {
      CKP.yaw = 0;
      CKP.pit = 0;
    };
  }
  el.style.display = "block";
  document.documentElement.classList.add("ckp");
  if (!CKP.hid) ckpChrome(true);
  if (!CKP.hook) {
    CKP.hook = true;
    try {
      v.scene.preRender.addEventListener(ckpFrame);
    } catch (e) {}
  }
  clearInterval(CKP.iv);
  CKP.iv = setInterval(ckpHud, 1000);
  ckpHud();
  cancelAnimationFrame(CKP.raf);
  ckpPaint();
}
function ckpClose() {
  if (!CKP.on) return;
  CKP.on = false;
  clearInterval(CKP.iv);
  cancelAnimationFrame(CKP.raf);
  var el = $("ckp");
  if (el) el.style.display = "none";
  document.documentElement.classList.remove("ckp");
  ckpChrome(false);
  setTimeout(function () {
    try {
      T4.v.resize();
    } catch (e) {}
  }, 60);
  try {
    var v = T4.v;
    v.scene.screenSpaceCameraController.enableInputs = true;
    v.scene.fog.density = 0.0002;
    var sa = v.scene.skyAtmosphere;
    if (sa) {
      sa.brightnessShift = 0;
      sa.saturationShift = 0;
    }
    var e = T4M["p" + CKP.id];
    if (e) e.show = true;
    T4F.key = "";
    T4MT = 0;
  } catch (x) {}
}
document.addEventListener("click", function (e) {
  if (e.target.closest("[data-ckx]")) {
    ckpClose();
    return;
  }
  var b = e.target.closest("[data-ckp]");
  if (!b) return;
  ckpOpen(selected && selected.kind === "plane" ? selected : null);
});
// ----- native Android extras (OjosNativePlugin.java): shortcuts, home-screen widget, keep-awake, vibration -----
function natv() {
  try {
    var C = window.Capacitor;
    if (!C || !C.isNativePlatform || !C.isNativePlatform()) return null;
    return (
      (C.Plugins && C.Plugins.OjosNative) ||
      (C.registerPlugin && C.registerPlugin("OjosNative")) ||
      null
    );
  } catch (e) {
    return null;
  }
}
function natCall(m, a) {
  var p = natv();
  if (!p || typeof p[m] !== "function") return Promise.resolve(null);
  try {
    return Promise.resolve(p[m](a || {})).catch(function () {
      return null;
    });
  } catch (e) {
    return Promise.resolve(null);
  }
}
function natLaunch(a) {
  if (a === "emergency") {
    if (EMG.on) emgOpen();
    else emgAsk();
  } else if (a === "finder") fndOpen();
  else if (a === "briefing") brOpen("brief");
}
setTimeout(function () {
  var p = natv();
  if (!p) return;
  natCall("getLaunchAction").then(function (r) {
    if (r && r.action) natLaunch(r.action);
  });
  try {
    p.addListener &&
      p.addListener("launchAction", function (e) {
        if (e && e.action) natLaunch(e.action);
      });
  } catch (e) {}
  natCall("setEmergencyState", { on: EMG.on });
}, 2500);
