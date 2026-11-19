/**
 * @file Globe renderer.
 * Projection maths, WebGL and 2D drawing of the globe, camera dots and overlays, and the
 * performance governor.
 *
 * Module 5 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- globe renderer (pure canvas, no libraries) ----------
var cv = $("map"),
  ctx = cv.getContext("2d"),
  W = 0,
  H = 0,
  DPR = 1;
var rot = { lon: -40, lat: 18 },
  zoom = 1,
  target = null,
  lastInteract = 0,
  dragging = false,
  t0 = performance.now();
var stars = [];
for (var i = 0; i < 220; i++)
  stars.push([Math.random(), Math.random(), Math.random() * 1.2 + 0.2, Math.random()]);
var PERF = { cap: 2, moveCap: 2, ema: 16, slow: 0, fast: 0, last: 0, act: 0 };
function starBg() {
  try {
    var c = document.createElement("canvas");
    c.width = Math.max(2, W | 0);
    c.height = Math.max(2, H | 0);
    var g = c.getContext("2d");
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      g.fillStyle = "rgba(200,225,255," + (0.2 + 0.5 * s[3]).toFixed(2) + ")";
      g.fillRect(s[0] * W, s[1] * H, s[2], s[2]);
    }
    cv.parentNode.style.backgroundImage = "url(" + c.toDataURL() + ")";
    cv.parentNode.style.backgroundSize = "100% 100%";
  } catch (e) {}
}
function resize() {
  var r = cv.parentNode.getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, PERF.cap);
  var nw = r.width !== W || r.height !== H;
  W = r.width;
  H = r.height;
  cv.width = W * DPR;
  cv.height = H * DPR;
  cv.style.width = W + "px";
  cv.style.height = H + "px";
  var g2 = document.getElementById("gl");
  if (g2) {
    g2.width = cv.width;
    g2.height = cv.height;
    g2.style.width = W + "px";
    g2.style.height = H + "px";
  }
  if (nw) starBg();
}
window.addEventListener("resize", resize);
resize();
var D = Math.PI / 180;
function topInset() {
  return document.body.classList.contains("clean") ? 64 : W < 700 ? 150 : 118;
}
function lowF() {
  return Math.max(0, Math.min(1, (1.7 - zoom) / 0.6));
}
function CY() {
  return H / 2 + (topInset() / 2) * (H > topInset() * 2.2 ? 1 : 0.6);
}
function radius() {
  // Never below 1: while the app is in the background the screen can report no height.
  return Math.max(1, Math.min(W, H - lowF() * (topInset() + 14)) * 0.43 * zoom);
}
var PC = {};
function pcu() {
  if (PC.lon !== rot.lon || PC.lat !== rot.lat || PC.z !== zoom || PC.W !== W || PC.H !== H) {
    PC.lon = rot.lon;
    PC.lat = rot.lat;
    PC.z = zoom;
    PC.W = W;
    PC.H = H;
    PC.R = radius();
    PC.cy = CY();
    PC.s0 = Math.sin(rot.lat * D);
    PC.c0 = Math.cos(rot.lat * D);
  }
  return PC;
}
function proj(lon, lat) {
  // orthographic
  var c = pcu(),
    l = (lon - rot.lon) * D,
    p = lat * D,
    cp = Math.cos(p),
    sp = Math.sin(p),
    cl = Math.cos(l);
  return [
    W / 2 + c.R * cp * Math.sin(l),
    c.cy - c.R * (c.c0 * sp - c.s0 * cp * cl),
    c.s0 * sp + c.c0 * cp * cl
  ];
}
function proj2(lon, lat) {
  // equirectangular for 2D mode
  var w = Math.min(W, H * 2) * 0.96 * zoom,
    h = w / 2,
    ox = (W - w) / 2 - ((rot.lon + 0) / 360) * w * 0,
    oy = (H - h) / 2;
  var x = ((lon + 180) / 360) * w,
    y = ((90 - lat) / 180) * h;
  x += panX;
  y += panY;
  return [ox + x, oy + y, 1];
}
var panX = 0,
  panY = 0;
var COVER = ["newsp", "flog", "brief", "cmp", "ops", "fnd", "plans", "rec", "emgp", "cty", "chk"];
var PERF_L = [
  [1, 16, 1.5, 1.5, 30],
  [1.25, 10, 2, 2, 45],
  [2, 6, 3, 2, 0]
]; // [3D pixel scale, 3D tile detail error] for Smooth, Balanced, Sharp
function perfSet(i) {
  i = i == null ? 1 : +i;
  SET.perf = i;
  setSave();
  try {
    if (T4.v) {
      T4.v.resolutionScale = Math.min(window.devicePixelRatio || 1, PERF_L[i][0]);
      T4.v.targetFrameRate = PERF_L[i][4] || undefined;
      PERF.moveCap = Math.min(PERF.moveCap, PERF_L[i][3]);
      T4.v.scene.requestRender && T4.v.scene.requestRender();
    }
    if (T4.ts) T4.ts.maximumScreenSpaceError = PERF_L[i][1];
  } catch (e) {}
}
function covered() {
  var w = $("wall"),
    sv = $("svfull");
  if (
    T3.on ||
    T4.on ||
    INS.on ||
    (w && w.style.display === "flex") ||
    (sv && sv.style.display === "flex")
  )
    return true;
  for (var i = 0; i < COVER.length; i++) {
    var e = $(COVER[i]);
    if (e && e.style.display === "flex") return true;
  }
  return false;
}
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden || covered()) {
    frame.last = now;
    return;
  }
  var spinning = mode === "3d" && spin && !dragging && now - lastInteract > 2500 && !target;
  var active = !!target || dragging || now - lastInteract < 700 || spinning;
  if (!active && now - PERF.last < (now - lastInteract > 6000 && !(EMG.on && EMG.pos) ? 50 : 30))
    return; // idle: 30 fps for the pulses, 20 fps once left alone
  // The slow turn of a zoomed-out globe looks the same at 30 frames a second, and drawing the whole planet
  // every frame starved everything else on the phone (the scrolling news strip visibly stuttered).
  if (spinning && !target && now - PERF.last < 32) return;
  var dt = now - (frame.last || now),
    t = (now - t0) / 1000;
  // adaptive sharpness: if moving the globe is slow on this phone, render motion a little softer and sharpen when still
  if (active) {
    PERF.act = now;
    if (dt > 0 && dt < 200) {
      PERF.ema = PERF.ema * 0.9 + dt * 0.1;
      if (PERF.ema > 21 && PERF.moveCap > 1) {
        if (++PERF.slow > 20) {
          PERF.moveCap = Math.max(1, PERF.moveCap - 0.5);
          PERF.slow = 0;
          PERF.ema = 16;
        }
      } else PERF.slow = 0;
      if (PERF.ema < 12.5 && PERF.moveCap < PERF_L[SET.perf == null ? 1 : SET.perf][3]) {
        if (++PERF.fast > 150) {
          PERF.moveCap += 0.5;
          PERF.fast = 0;
        }
      } else PERF.fast = 0;
    }
  }
  var PL = PERF_L[SET.perf == null ? 1 : SET.perf],
    want = active ? Math.min(PERF.moveCap, PL[3]) : now - PERF.act > 900 ? PL[2] : PERF.cap;
  if (want !== PERF.cap) {
    PERF.cap = want;
    resize();
  }
  PERF.last = now;
  // motion
  var dtf = Math.min(30, Math.max(0.2, dt / 16.67));
  if (target) {
    var dl = ((target.lon - rot.lon + 540) % 360) - 180,
      dp = target.lat - rot.lat;
    var kp = 1 - Math.pow(0.92, dtf),
      kz = 1 - Math.pow(0.9, dtf);
    rot.lon += dl * kp;
    rot.lat += dp * kp;
    zoom *= Math.pow(target.z / zoom, kz);
    if (
      Math.abs(dl) < 0.05 / Math.max(1, zoom / 40) &&
      Math.abs(dp) < 0.05 / Math.max(1, zoom / 40) &&
      Math.abs(target.z / zoom - 1) < 0.01
    )
      target = null;
  } else if (spinning) rot.lon += 0.06 * dtf;
  frame.last = now;
  rot.lon = ((rot.lon + 540) % 360) - 180;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  // One part failing must never leave the globe black: the error is recorded with where it
  // happened, and after repeated failures the satellite layer (the likeliest cause) is set aside
  // so the plain globe, cameras and layers keep drawing.
  try {
    if (mode === "3d") draw3d(t);
    else draw2d(t);
    frame.bad = 0;
  } catch (e) {
    frame.bad = (frame.bad || 0) + 1;
    if (frame.bad === 1 || frame.bad === 30) errLog("Globe drawing: " + errWhere(e));
    if (frame.bad === 30 && !frame.safe) {
      frame.safe = true;
      satSafe = true;
    }
  }
}
var satSafe = false; // set when drawing keeps failing: the globe is drawn without the satellite layer

// "message at function (line)" from an error, for the error report.
function errWhere(e) {
  var st = String((e && e.stack) || "")
    .split("\n")
    .slice(1, 4)
    .map(function (l) {
      return l
        .replace(/^\s*at\s+/, "")
        .replace(/\(?(https?|file|capacitor):\/\/[^)]*?(:\d+:\d+)\)?/, "$2");
    })
    .join(" < ");
  return String((e && e.message) || e) + (st ? " @ " + st : "");
}
function draw3d(t) {
  var R = radius(),
    cx = W / 2,
    cy = CY();
  // atmosphere glow
  if (R < Math.max(W, H) * 1.2) {
    var g = ctx.createRadialGradient(cx, cy, R * 0.985, cx, cy, R * 1.22),
      clr = lookClear();
    g.addColorStop(0, "rgba(120,175,255,0)");
    g.addColorStop(0.05, clr ? "rgba(140,195,255,0.85)" : "rgba(120,175,255,0.5)");
    g.addColorStop(0.3, clr ? "rgba(80,150,255,0.28)" : "rgba(90,150,255,0.14)");
    g.addColorStop(1, "rgba(90,150,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.22, 0, Math.PI * 2);
    ctx.closePath();
    ctx.arc(cx, cy, R * 0.985, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();
  }
  if (!satDraw(R, cx, cy)) {
    // ocean sphere
    var o = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
    o.addColorStop(0, lookClear() ? "#1d5fae" : "#0f2a40");
    o.addColorStop(1, lookClear() ? "#061a3d" : "#030a12");
    ctx.fillStyle = o;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 7);
    ctx.fill();
    // graticule
    ctx.strokeStyle = "rgba(94,230,255,0.09)";
    ctx.lineWidth = 1;
    for (var lo = -180; lo < 180; lo += 30) {
      ctx.beginPath();
      var pen = false;
      for (var la = -90; la <= 90; la += 3) {
        var p = proj(lo, la);
        if (p[2] > 0) {
          pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
          pen = true;
        } else pen = false;
      }
      ctx.stroke();
    }
    for (var la2 = -60; la2 <= 60; la2 += 30) {
      ctx.beginPath();
      pen = false;
      for (var lo2 = -180; lo2 <= 180; lo2 += 3) {
        var q = proj(lo2, la2);
        if (q[2] > 0) {
          pen ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
          pen = true;
        } else pen = false;
      }
      ctx.stroke();
    }
    // land dots
    var ds = Math.max(1.1, R / 230);
    for (var i = 0; i < DOTS.length; i += 2) {
      var p2 = proj(DOTS[i], DOTS[i + 1]);
      if (p2[2] <= 0.02) continue;
      var a = 0.25 + 0.65 * p2[2];
      var nt = WL && WL.night && sunCos(DOTS[i], DOTS[i + 1]) < 0;
      ctx.fillStyle = nt
        ? "rgba(64,88,135," + (a * 0.6).toFixed(2) + ")"
        : lookClear()
          ? "rgba(150,205,140," + a.toFixed(2) + ")"
          : "rgba(120,200,235," + a.toFixed(2) + ")";
      ctx.fillRect(p2[0] - ds / 2, p2[1] - ds / 2, ds, ds);
    }
    if (WL && WL.night) {
      var sl = (SUN.lon - rot.lon) * D,
        sp = SUN.lat * D,
        p0 = rot.lat * D,
        sx = Math.cos(sp) * Math.sin(sl),
        sy = Math.cos(p0) * Math.sin(sp) - Math.sin(p0) * Math.cos(sp) * Math.cos(sl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, 7);
      ctx.clip();
      var ng = ctx.createRadialGradient(
        cx + R * sx * 0.9,
        cy - R * sy * 0.9,
        R * 0.55,
        cx + R * sx * 0.9,
        cy - R * sy * 0.9,
        R * 1.75
      );
      ng.addColorStop(0, "rgba(0,4,10,0)");
      ng.addColorStop(1, "rgba(0,4,10,0.6)");
      ctx.fillStyle = ng;
      ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      ctx.restore();
    }
  }
  hybDraw(R); // Smooth globe's borders and names (module 42)
  // limb ring
  ctx.strokeStyle = "rgba(150,195,255,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 7);
  ctx.stroke();
  markers(t, proj);
}
function draw2d(t) {
  satClear();
  var w = Math.min(W, H * 2) * 0.96 * zoom,
    h = w / 2,
    ox = (W - w) / 2 + panX,
    oy = (H - h) / 2 + panY;
  ctx.fillStyle = "rgba(10,30,48,0.6)";
  ctx.fillRect(ox, oy, w, h);
  ctx.strokeStyle = "rgba(54,241,181,0.09)";
  for (var lo = -180; lo <= 180; lo += 30) {
    var x = ox + ((lo + 180) / 360) * w;
    ctx.beginPath();
    ctx.moveTo(x, oy);
    ctx.lineTo(x, oy + h);
    ctx.stroke();
  }
  for (var la = -90; la <= 90; la += 30) {
    var y = oy + ((90 - la) / 180) * h;
    ctx.beginPath();
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + w, y);
    ctx.stroke();
  }
  var ds = Math.max(1.2, w / 900);
  ctx.fillStyle = "rgba(120,200,235,0.75)";
  for (var i = 0; i < DOTS.length; i += 2) {
    ctx.fillRect(
      ox + ((DOTS[i] + 180) / 360) * w - ds / 2,
      oy + ((90 - DOTS[i + 1]) / 180) * h - ds / 2,
      ds,
      ds
    );
  }
  markers(t, function (lon, lat) {
    return [ox + ((lon + 180) / 360) * w, oy + ((90 - lat) / 180) * h, 1];
  });
}
var screenPts = [];
function dest(lat, lon, brg, km) {
  var R = 6371,
    d = km / R,
    b = brg * D,
    p1 = lat * D,
    l1 = lon * D;
  var p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  var l2 =
    l1 +
    Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [l2 / D, p2 / D];
}
function drawPin(t, P) {
  if (!pin) return;
  [100, 300, 800].forEach(function (km, ix) {
    ctx.strokeStyle = "rgba(255,93,143," + (0.55 - ix * 0.13) + ")";
    ctx.lineWidth = 1;
    ctx.setLineDash(ix ? [3, 5] : []);
    ctx.beginPath();
    var pen = false;
    for (var b = 0; b <= 360; b += 6) {
      var g = dest(pin.lat, pin.lon, b, km),
        q = P(g[0], g[1]);
      if (q[2] > 0) {
        pen ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
        pen = true;
      } else pen = false;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  });
  var p = P(pin.lon, pin.lat);
  if (p[2] <= 0) return;
  var ph = (t * 0.7) % 1;
  ctx.strokeStyle = "rgba(255,93,143," + (1 - ph) + ")";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p[0], p[1], 6 + ph * 26, 0, 7);
  ctx.stroke();
  ctx.fillStyle = "#ff5d8f";
  ctx.shadowColor = "#ff5d8f";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(p[0], p[1] - 9);
  ctx.lineTo(p[0] + 6, p[1]);
  ctx.lineTo(p[0], p[1] + 9);
  ctx.lineTo(p[0] - 6, p[1]);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  var label = "◆ " + pin.name.toUpperCase().slice(0, 34);
  ctx.font = "600 11px 'JetBrains Mono',monospace";
  var tw = ctx.measureText(label).width,
    lx = Math.min(p[0] + 14, W - tw - 16),
    ly = p[1] + 26;
  ctx.fillStyle = "rgba(8,17,26,0.85)";
  ctx.fillRect(lx - 6, ly - 13, tw + 12, 19);
  ctx.strokeStyle = "#ff5d8f";
  ctx.strokeRect(lx - 6, ly - 13, tw + 12, 19);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, lx, ly);
}
var GSP = {};
function glowSpr(rgb) {
  var c = GSP[rgb];
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 32;
  var g = c.getContext("2d"),
    gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.18, "rgba(" + rgb + ",0.95)");
  gr.addColorStop(0.5, "rgba(" + rgb + ",0.28)");
  gr.addColorStop(1, "rgba(" + rgb + ",0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return (GSP[rgb] = c);
}
var SPR = {};
function spr(col, shape) {
  var k = col + shape,
    c = SPR[k];
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 56;
  var g = c.getContext("2d");
  g.scale(2, 2);
  g.translate(14, 14);
  g.fillStyle = col;
  g.shadowColor = col;
  g.shadowBlur = 5;
  g.beginPath();
  if (shape === "d") {
    g.moveTo(0, -3.6);
    g.lineTo(3.6, 0);
    g.lineTo(0, 3.6);
    g.lineTo(-3.6, 0);
    g.closePath();
  } else if (shape === "t") {
    g.moveTo(0, -5);
    g.lineTo(4.5, 4);
    g.lineTo(-4.5, 4);
    g.closePath();
  } else g.arc(0, 0, shape === "C" ? 4.6 : shape === "s" ? 2.6 : 3.4, 0, 7);
  g.fill();
  g.shadowBlur = 0;
  g.lineWidth = 1;
  g.strokeStyle = "rgba(2,8,14,0.85)";
  g.stroke();
  return (SPR[k] = c);
}
function filteredLiveN() {
  return visLive.length;
}
function camDot(x, y, z, lc) {
  var st = STATS[lc.u],
    lr =
      st && st.length && Date.now() - st[st.length - 1].t < 15 * 60000 ? st[st.length - 1] : null,
    im;
  if (lr) {
    var lv = level(lr.v);
    im = spr(LVCOL[lv], lv === "HEAVY" ? "C" : "c");
  } else
    im = spr(
      lc.t === "hazard"
        ? "#ff7a45"
        : lc.t === "nature"
          ? "#5dffa9"
          : lc.t === "ocean"
            ? "#2ad4e6"
            : lc.v
              ? "#ff5d8f"
              : "#ffd36b",
      "d"
    );
  ctx.drawImage(im, x - 14, y - 14, 28, 28);
  if (FAV.length && FAV.indexOf(lc.u) >= 0) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, 7);
    ctx.stroke();
  }
  screenPts.push([x, y, lc]);
}
var VX = [],
  VY = [],
  VC = [],
  VNUM = 0,
  VRECT = false,
  DOT_OCC = null,
  DOT_FRAME = 0,
  CGn = null,
  CGx,
  CGy,
  CGlo,
  CGla,
  CGm;
// The globe look: "clear" (default) shows imagery at full brightness with coloured points;
// "classic" keeps the darker look with direction arrows. Chosen in Briefing.
function lookClear() {
  if (typeof hybCanvas === "function" && hybCanvas()) return false; // the dark look for Smooth globe
  return !(typeof SET === "object" && SET && SET.look === "classic");
}

var CAM_KIND_COLORS = null;

// Draw the VNUM visible cameras as round points, one path per colour so it stays fast.
function drawCamPoints(n) {
  if (!CAM_KIND_COLORS) {
    CAM_KIND_COLORS = {};
    Object.keys(L).forEach(function (k) {
      CAM_KIND_COLORS[k] = L[k][1];
    });
  }
  var r = zoom > 60 ? 4.6 : zoom > 8 ? 3.6 : zoom > 2.5 ? 2.6 : n > 20000 ? 1.5 : 1.9,
    grp = {},
    j,
    lc,
    ky;
  for (j = 0; j < n; j++) {
    lc = VC[j];
    ky = lc.v || lc.mj ? "#ff4d8a" : CAM_KIND_COLORS[lc.t] || "#4cc3ff";
    (grp[ky] || (grp[ky] = [])).push(j);
  }
  ctx.save();
  // Zoomed in, points get a white ring; zoomed out, a thin dark edge keeps dense areas readable.
  var ring = r >= 3.6;
  ctx.lineWidth = ring ? 1.1 : 0.6;
  ctx.strokeStyle = ring ? "rgba(255,255,255,0.9)" : "rgba(2,10,24,0.55)";
  // Very many points: squares are far cheaper to draw than circles and look the same that small.
  var square = n > 30000;
  for (ky in grp) {
    var ar = grp[ky];
    ctx.fillStyle = ky;
    if (square) {
      for (var b = 0; b < ar.length; b++) ctx.fillRect(VX[ar[b]] - r, VY[ar[b]] - r, r * 2, r * 2);
      continue;
    }
    ctx.beginPath();
    for (var a = 0; a < ar.length; a++) {
      j = ar[a];
      ctx.moveTo(VX[j] + r, VY[j]);
      ctx.arc(VX[j], VY[j], r, 0, 6.2832);
    }
    ctx.fill();
    if (r > 1.6) ctx.stroke();
  }
  ctx.restore();
}

function markers(t, P) {
  screenPts = [];
  drawPin(t, P);
  curP = P;
  if (WL) drawWorld(t, P);
  drawDrive(P);
  drawEmg(P);
  drawSvLink(P);
  var n = 0,
    j,
    lc,
    x,
    y,
    z,
    fast = P === proj,
    c = pcu(),
    R = c.R,
    hw = W / 2,
    cyy = c.cy,
    s0 = c.s0,
    c0 = c.c0,
    lon0 = rot.lon,
    zmin = 0,
    hyp = Math.sqrt(hw * hw + Math.pow(Math.max(cyy, H - cyy), 2)) + 12;
  if (fast && hyp < R) zmin = Math.sqrt(1 - (hyp * hyp) / (R * R)) - 1e-9;
  var seen = 0,
    thin = WL.dots && visLive.length > 3000,
    gwid = ((W + 16) >> 1) + 2;
  if (thin) {
    var need = gwid * (((H + 16) >> 1) + 2);
    if (!DOT_OCC || DOT_OCC.length < need) DOT_OCC = new Uint32Array(need);
    DOT_FRAME = (DOT_FRAME + 1) >>> 0 || 1;
  }
  for (j = 0; j < visLive.length; j++) {
    lc = visLive[j];
    if (fast) {
      if (lc._c === undefined) {
        lc._s = Math.sin(lc.lat * D);
        lc._c = Math.cos(lc.lat * D);
      }
      var l = (lc.lon - lon0) * D,
        cl = Math.cos(l);
      z = s0 * lc._s + c0 * lc._c * cl;
      if (z <= zmin) continue;
      x = hw + R * lc._c * Math.sin(l);
      if (x < -8 || x > W + 8) continue;
      y = cyy - R * (c0 * lc._s - s0 * lc._c * cl);
      if (y < -8 || y > H + 8) continue;
    } else {
      var lp = P(lc.lon, lc.lat);
      if (lp[2] <= 0) continue;
      x = lp[0];
      y = lp[1];
      z = lp[2];
      if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
    }
    seen++;
    // Every-camera dots: one per 2-pixel cell. Tens of thousands of points land on the same pixels when
    // zoomed out, and drawing them all each frame slowed the whole phone; the picture looks the same.
    if (thin) {
      var ci = ((y + 8) >> 1) * gwid + ((x + 8) >> 1);
      if (DOT_OCC[ci] === DOT_FRAME) continue;
      DOT_OCC[ci] = DOT_FRAME;
    }
    VX[n] = x;
    VY[n] = y;
    VC[n] = lc;
    n++;
  }
  VNUM = n;
  VRECT = false;
  if (WL.dots !== markers._d || seen !== markers._n) {
    markers._d = WL.dots;
    markers._n = seen;
    var lg = $("dotsleg");
    if (lg) {
      lg.style.display = WL.dots ? "block" : "none";
      if (WL.dots)
        lg.innerHTML =
          "<b>" +
          filteredLiveN().toLocaleString() +
          "</b> live cameras<span>" +
          seen.toLocaleString() +
          " in view · tap any point</span>";
    }
  }
  var clus = !WL.dots && n > (W < 700 ? 110 : 220),
    cell = W < 700 ? 30 : 34;
  if (WL.dots && n > 500 && lookClear()) {
    // clear look: every camera as a coloured point over the imagery, coloured by kind
    VRECT = true;
    drawCamPoints(n);
  } else if (WL.dots && n > 500) {
    // every camera as its own point of light, no grouping
    VRECT = true;
    ctx.save();
    ctx.fillStyle = "rgba(3,8,16,0.46)";
    if (fast && R < Math.max(W, H)) {
      ctx.beginPath();
      ctx.arc(hw, cyy, R, 0, 7);
      ctx.fill();
    } else ctx.fillRect(0, 0, W, H);
    var ds, hs;
    if (n <= 7000) {
      // a small arrow per camera, pointing the way it looks
      var sz = zoom > 60 ? 8.5 : zoom > 8 ? 7 : zoom > 2.5 ? 5.5 : 4.2,
        grp = {},
        ky,
        ar;
      for (j = 0; j < n; j++) {
        lc = VC[j];
        if (lc._hc === undefined) {
          var hh = camHdg(lc) * D;
          lc._hc = Math.cos(hh);
          lc._hs = Math.sin(hh);
        }
        ky =
          lc.t === "hazard"
            ? "#ff7a45"
            : lc.t === "nature"
              ? "#6effaa"
              : lc.v || lc.mj
                ? "#ff5d6c"
                : "#46d2ff";
        (grp[ky] || (grp[ky] = [])).push(j);
      }
      ctx.lineJoin = "round";
      for (ky in grp) {
        ar = grp[ky];
        ctx.beginPath();
        for (var a2 = 0; a2 < ar.length; a2++) {
          j = ar[a2];
          lc = VC[j];
          var x0 = VX[j],
            y0 = VY[j],
            c1 = lc._hc,
            s1 = lc._hs; // forward = (s1,-c1) on screen
          ctx.moveTo(x0 + s1 * sz, y0 - c1 * sz);
          ctx.lineTo(x0 - s1 * sz * 0.55 + c1 * sz * 0.62, y0 + c1 * sz * 0.55 + s1 * sz * 0.62);
          ctx.lineTo(x0 - s1 * sz * 0.2, y0 + c1 * sz * 0.2);
          ctx.lineTo(x0 - s1 * sz * 0.55 - c1 * sz * 0.62, y0 + c1 * sz * 0.55 - s1 * sz * 0.62);
          ctx.closePath();
        }
        ctx.fillStyle = ky;
        ctx.fill();
        ctx.strokeStyle = "rgba(2,8,14,0.7)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    } else {
      ds = zoom > 8 ? 2.6 : 2;
      hs = ds / 2;
      ctx.fillStyle = "rgba(70,210,255,0.92)";
      for (j = 0; j < n; j++) ctx.fillRect(VX[j] - hs, VY[j] - hs, ds, ds);
    }
    ctx.restore();
  } else if (!clus) for (j = 0; j < n; j++) camDot(VX[j], VY[j], 1, VC[j]);
  else {
    var gw = Math.ceil((W + 16) / cell) + 1,
      gh = Math.ceil((H + 16) / cell) + 1,
      gsz = gw * gh,
      gi,
      kq;
    if (!CGn || CGn.length < gsz) {
      CGn = new Int32Array(gsz);
      CGx = new Float32Array(gsz);
      CGy = new Float32Array(gsz);
      CGlo = new Float64Array(gsz);
      CGla = new Float64Array(gsz);
      CGm = new Int32Array(gsz * 3);
    }
    CGn.fill(0, 0, gsz);
    CGx.fill(0, 0, gsz);
    CGy.fill(0, 0, gsz);
    CGlo.fill(0, 0, gsz);
    CGla.fill(0, 0, gsz);
    for (j = 0; j < n; j++) {
      lc = VC[j];
      gi = (((VY[j] + 8) / cell) | 0) * gw + (((VX[j] + 8) / cell) | 0);
      if (gi < 0 || gi >= gsz) continue;
      kq = CGn[gi]++;
      if (kq < 3) CGm[gi * 3 + kq] = j;
      CGx[gi] += VX[j];
      CGy[gi] += VY[j];
      CGlo[gi] += lc.lon;
      CGla[gi] += lc.lat;
    }
    var CL = [];
    for (gi = 0; gi < gsz; gi++) {
      var qn = CGn[gi];
      if (!qn) continue;
      if (qn <= 3) {
        for (var mi = 0; mi < qn; mi++) {
          var jj = CGm[gi * 3 + mi];
          camDot(VX[jj], VY[jj], 1, VC[jj]);
        }
        continue;
      }
      CL.push({ n: qn, x: CGx[gi] / qn, y: CGy[gi] / qn, lo: CGlo[gi], la: CGla[gi] });
    }
    CL.sort(function (a, b) {
      return b.n - a.n;
    });
    var KEEP = [];
    var crad = function (n) {
      return 9 + Math.min(13, (Math.log(n) / Math.LN2) * 1.8);
    };
    CL.forEach(function (c) {
      for (var z = 0; z < KEEP.length; z++) {
        var k = KEEP[z],
          dd = Math.sqrt((k.x - c.x) * (k.x - c.x) + (k.y - c.y) * (k.y - c.y));
        if (dd < crad(k.n) + crad(c.n) + 5) {
          k.x = (k.x * k.n + c.x * c.n) / (k.n + c.n);
          k.y = (k.y * k.n + c.y * c.n) / (k.n + c.n);
          k.n += c.n;
          k.lo += c.lo;
          k.la += c.la;
          return;
        }
      }
      KEEP.push(c);
    });
    ctx.font = "700 10px 'JetBrains Mono',monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1.5;
    KEEP.forEach(function (q) {
      var qr = crad(q.n);
      ctx.fillStyle = "rgba(8,22,34,0.86)";
      ctx.strokeStyle = "rgba(94,230,255,0.95)";
      ctx.beginPath();
      ctx.arc(q.x, q.y, qr, 0, 7);
      ctx.fill();
      ctx.stroke();
      var lb = q.n > 999 ? Math.round(q.n / 100) / 10 + "k" : "" + q.n;
      ctx.fillStyle = "#dff6ff";
      ctx.fillText(lb, q.x, q.y + 0.5);
      screenPts.push([q.x, q.y, { cluster: true, n: q.n, lon: q.lo / q.n, lat: q.la / q.n }]);
    });
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }
  var sm = W < 600,
    pr = sm ? 5 : 12,
    pulse = visible.length < 80;
  for (var i = 0; i < visible.length; i++) {
    var cc = visible[i],
      p = P(cc.lon, cc.lat);
    if (p[2] <= 0 || p[0] < -12 || p[0] > W + 12 || p[1] < -12 || p[1] > H + 12) continue;
    var color = col(cc.t);
    if (pulse) {
      var ph = (t * 0.8 + i * 0.37) % 1;
      ctx.globalAlpha = (1 - ph) * 0.8 * Math.max(0.4, p[2]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 3 + ph * pr, 0, 7);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(spr(color, sm ? "s" : "c"), p[0] - 14, p[1] - 14, 28, 28);
    screenPts.push([p[0], p[1], cc]);
  }
  drawFocus(P);
  if (selected) {
    var s = P(selected.lon, selected.lat);
    if (s[2] > 0) {
      var sx = s[0],
        sy = s[1],
        k = 14 + Math.sin(t * 4) * 2;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, k, 0, 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx - k - 8, sy);
      ctx.lineTo(sx - k + 3, sy);
      ctx.moveTo(sx + k - 3, sy);
      ctx.lineTo(sx + k + 8, sy);
      ctx.moveTo(sx, sy - k - 8);
      ctx.lineTo(sx, sy - k + 3);
      ctx.moveTo(sx, sy + k - 3);
      ctx.lineTo(sx, sy + k + 8);
      ctx.stroke();
      var label = selected.n.toUpperCase();
      ctx.font = "600 11px 'JetBrains Mono',monospace";
      var tw = ctx.measureText(label).width;
      var lx = Math.min(sx + k + 12, W - tw - 16),
        ly = sy - k - 12;
      ctx.fillStyle = "rgba(8,17,26,0.85)";
      ctx.fillRect(lx - 6, ly - 13, tw + 12, 19);
      ctx.strokeStyle = col(selected.t);
      ctx.strokeRect(lx - 6, ly - 13, tw + 12, 19);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, lx, ly);
    }
  }
}
requestAnimationFrame(frame);

// interaction
var ptrs = {},
  startDist = 0,
  startZoom = 1,
  downAt = null,
  moved = false;
cv.addEventListener("pointerdown", function (e) {
  cv.setPointerCapture(e.pointerId);
  ptrs[e.pointerId] = [e.clientX, e.clientY];
  dragging = true;
  moved = false;
  downAt = [e.clientX, e.clientY];
  target = null;
  lastInteract = performance.now();
  var ids = Object.keys(ptrs);
  if (ids.length === 2) {
    var a = ptrs[ids[0]],
      b = ptrs[ids[1]];
    startDist = Math.hypot(a[0] - b[0], a[1] - b[1]);
    startZoom = zoom;
  }
});
cv.addEventListener("pointermove", function (e) {
  if (e.pointerType !== "touch" && !dragging) {
    var hov = hit(e);
    cv.style.cursor = hov ? "pointer" : "grab";
    showTip(hov, e);
  }
  if (!ptrs[e.pointerId]) return;
  var prev = ptrs[e.pointerId];
  ptrs[e.pointerId] = [e.clientX, e.clientY];
  lastInteract = performance.now();
  var ids = Object.keys(ptrs);
  if (ids.length === 2) {
    var a = ptrs[ids[0]],
      b = ptrs[ids[1]];
    var d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (startDist) zoom = clampZ((startZoom * d) / startDist);
    moved = true;
    return;
  }
  var dx = e.clientX - prev[0],
    dy = e.clientY - prev[1];
  if (Math.abs(e.clientX - downAt[0]) + Math.abs(e.clientY - downAt[1]) > 4) moved = true;
  if (mode === "3d") {
    var R = radius();
    rot.lon -= (dx / R) * 57.3;
    rot.lat = Math.max(-85, Math.min(85, rot.lat + (dy / R) * 57.3));
  } else {
    panX += dx;
    panY += dy;
  }
});
function up(e) {
  delete ptrs[e.pointerId];
  if (!Object.keys(ptrs).length) dragging = false;
  if (!moved) {
    var h = hit(e);
    if (!h) h = hitObj(e);
    if (h && h.kind) ringOnGlobe(h);
    else if (h) camTap(h);
    else if (RING.o) ringClose();
    else propHit(e);
  }
}
// Aircraft, ships and events are small and moving; a touch anywhere near one catches it.
function hitObj(e) {
  var r = cv.getBoundingClientRect(),
    pts = screenPts.filter(function (p) {
      return p[2] && p[2].kind;
    });
  return ringNearest(pts, e.clientX - r.left, e.clientY - r.top, RING_SLOP);
}
function ringOnGlobe(o) {
  ringTap(
    o,
    function () {
      var r = cv.getBoundingClientRect(),
        f = ringFresh(o);
      for (var i = 0; i < screenPts.length; i++) {
        var p = screenPts[i];
        if (p[2] === f || p[2] === o) return [p[0] + r.left, p[1] + r.top];
      }
      return null;
    },
    camTap
  );
}
cv.addEventListener("pointerup", up);
cv.addEventListener("pointercancel", function (e) {
  delete ptrs[e.pointerId];
  dragging = false;
});
cv.addEventListener("pointerleave", function () {
  $("gtip").style.display = "none";
});
cv.addEventListener(
  "wheel",
  function (e) {
    e.preventDefault();
    zoom = clampZ(zoom * Math.exp(-e.deltaY * 0.0015));
    lastInteract = performance.now();
    target = null;
  },
  { passive: false }
);
function clampZ(z) {
  return Math.max(0.7, Math.min(90000, z));
}
function hit(e) {
  var r = cv.getBoundingClientRect(),
    x = e.clientX - r.left,
    y = e.clientY - r.top,
    best = null,
    bd = 14 * 14;
  var i, p, d;
  for (i = 0; i < screenPts.length; i++) {
    p = screenPts[i];
    d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
    if (d < bd) {
      bd = d;
      best = p[2];
    }
  }
  if (!best && VRECT) {
    bd = 16 * 16;
    for (i = 0; i < VNUM; i++) {
      d = (VX[i] - x) * (VX[i] - x) + (VY[i] - y) * (VY[i] - y);
      if (d < bd) {
        bd = d;
        best = VC[i];
      }
    }
  }
  return best;
}
function showTip(c, e) {
  var tp = $("gtip");
  if (!c || e.pointerType === "touch") {
    tp.style.display = "none";
    return;
  }
  var r = cv.parentNode.getBoundingClientRect();
  tp.innerHTML = "<b>" + esc(c.n) + "</b><br><span>" + esc(c.r) + " · " + esc(c.c) + "</span>";
  tp.style.display = "block";
  tp.style.left = Math.min(e.clientX - r.left + 14, r.width - 230) + "px";
  tp.style.top = e.clientY - r.top + 14 + "px";
}
