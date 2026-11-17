/**
 * @file Sky: the night sky right now and the solar system, from either world.
 * "Sky now" shows the stars, constellations (Orion and the rest), the Moon with its phase, the
 * Sun and the planets as they stand at this moment over the place in view, computed on the phone
 * from star positions (d3-celestial, BSD) and published orbital elements (JPL). "Solar system"
 * shows the eight planets on their orbits today. Opened by holding the logo or the ✦ button.
 *
 * Module 40 of 44. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

var SKY = {
  on: false,
  mode: "sky",
  az: 180,
  alt: 35,
  zoom: 1,
  t: 0, // minutes ahead of now
  data: null,
  loading: false,
  pts: [],
  sel: null,
  sys: { yaw: 0.6, tilt: 0.9, zoom: 1 }
};
var SKY_DATA = "https://cdn.jsdelivr.net/gh/ofrohn/d3-celestial@master/data/";

// ---------- Astronomy ----------
function skyJD(ms) {
  return ms / 864e5 + 2440587.5;
}

// Greenwich mean sidereal time in degrees.
function skyGMST(jd) {
  var g = 280.46061837 + 360.98564736629 * (jd - 2451545);
  return ((g % 360) + 360) % 360;
}

// Right ascension and declination (degrees) to altitude and azimuth (degrees, azimuth from north
// through east) for an observer at lat, lon at Julian date jd.
function skyAltAz(ra, dec, lat, lon, jd) {
  var r = Math.PI / 180,
    ha = (skyGMST(jd) + lon - ra) * r,
    d = dec * r,
    p = lat * r;
  var sa = Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(ha),
    alt = Math.asin(Math.max(-1, Math.min(1, sa))),
    az = Math.atan2(
      -Math.sin(ha) * Math.cos(d),
      Math.cos(p) * Math.sin(d) - Math.sin(p) * Math.cos(d) * Math.cos(ha)
    );
  return [alt / r, (((az / r) % 360) + 360) % 360];
}

// JPL "Approximate Positions of the Planets", 1800–2050: a, e, I, L, long. perihelion, long. node
// at J2000, then their rates per century.
var SKY_PLANETS = [
  [
    "Mercury",
    "#b5b1aa",
    2440,
    [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    "88 days",
    "58.6 days"
  ],
  [
    "Venus",
    "#e8d6a8",
    6052,
    [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
    "225 days",
    "243 days (backwards)"
  ],
  [
    "Earth",
    "#4c8dff",
    6371,
    [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
    "365.25 days",
    "23.9 hours"
  ],
  [
    "Mars",
    "#d9673f",
    3390,
    [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    "687 days",
    "24.6 hours"
  ],
  [
    "Jupiter",
    "#d8b48a",
    69911,
    [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    "11.9 years",
    "9.9 hours"
  ],
  [
    "Saturn",
    "#e3cf98",
    58232,
    [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    "29.5 years",
    "10.7 hours"
  ],
  [
    "Uranus",
    "#9fd8e0",
    25362,
    [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
    "84 years",
    "17.2 hours (backwards)"
  ],
  [
    "Neptune",
    "#5b7fe8",
    24622,
    [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
    "165 years",
    "16.1 hours"
  ]
];

// Heliocentric ecliptic x, y, z (AU) of a planet at Julian date jd.
function skyHelio(p, jd) {
  var T = (jd - 2451545) / 36525,
    r = Math.PI / 180,
    el = p[3].map(function (v, i) {
      return v + p[4][i] * T;
    }),
    a = el[0],
    e = el[1],
    I = el[2] * r,
    L = el[3],
    wb = el[4],
    O = el[5],
    w = (wb - O) * r,
    M = ((((L - wb) % 360) + 540) % 360) - 180;
  var Mr = M * r,
    E = Mr + e * Math.sin(Mr);
  for (var k = 0; k < 8; k++) E = E - (E - e * Math.sin(E) - Mr) / (1 - e * Math.cos(E));
  var xp = a * (Math.cos(E) - e),
    yp = a * Math.sqrt(1 - e * e) * Math.sin(E),
    Or = O * r,
    cw = Math.cos(w),
    sw = Math.sin(w),
    cO = Math.cos(Or),
    sO = Math.sin(Or),
    cI = Math.cos(I),
    sI = Math.sin(I);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp
  ];
}

// Ecliptic vector to right ascension and declination (degrees).
function skyEclToEq(v) {
  var ob = 23.43928 * (Math.PI / 180),
    x = v[0],
    y = v[1] * Math.cos(ob) - v[2] * Math.sin(ob),
    z = v[1] * Math.sin(ob) + v[2] * Math.cos(ob);
  var ra = (Math.atan2(y, x) * 180) / Math.PI,
    dec = (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI;
  return [(ra + 360) % 360, dec, Math.sqrt(x * x + y * y + z * z)];
}

// Low-precision Moon (Meeus, main terms): ecliptic longitude, latitude (degrees), distance (km).
function skyMoon(jd) {
  var r = Math.PI / 180,
    d = jd - 2451545,
    L = 218.316 + 13.176396 * d,
    M = (134.963 + 13.064993 * d) * r,
    F = (93.272 + 13.22935 * d) * r,
    lon = L + 6.289 * Math.sin(M),
    lat = 5.128 * Math.sin(F),
    dist = 385001 - 20905 * Math.cos(M);
  return [((lon % 360) + 360) % 360, lat, dist];
}

// Sun's geocentric ecliptic longitude (degrees).
function skySunLon(jd) {
  var e = skyHelio(SKY_PLANETS[2], jd);
  return ((Math.atan2(-e[1], -e[0]) * 180) / Math.PI + 360) % 360;
}

// Fraction of the Moon lit (0 new, 1 full) and whether it is waxing.
function skyMoonPhase(jd) {
  var el = (((skyMoon(jd)[0] - skySunLon(jd)) % 360) + 360) % 360;
  return [(1 - Math.cos((el * Math.PI) / 180)) / 2, el < 180];
}

function skyEclLonLatToEq(lon, lat) {
  var r = Math.PI / 180;
  return skyEclToEq([
    Math.cos(lat * r) * Math.cos(lon * r),
    Math.cos(lat * r) * Math.sin(lon * r),
    Math.sin(lat * r)
  ]);
}

// Stereographic projection of (alt, az) around the view centre; null when behind the viewer.
function skyProject(alt, az, alt0, az0, scale, cx, cy) {
  var r = Math.PI / 180,
    a = alt * r,
    b = alt0 * r,
    dz = (az - az0) * r,
    cosc = Math.sin(b) * Math.sin(a) + Math.cos(b) * Math.cos(a) * Math.cos(dz);
  if (cosc < -0.2) return null;
  var k = (2 / (1 + cosc)) * scale;
  return [
    cx + k * Math.cos(a) * Math.sin(dz),
    cy - k * (Math.cos(b) * Math.sin(a) - Math.sin(b) * Math.cos(a) * Math.cos(dz))
  ];
}

function skyStarColor(bv) {
  var b = parseFloat(bv);
  if (!isFinite(b)) return "#ffffff";
  if (b < 0) return "#a9c8ff";
  if (b < 0.3) return "#dfe9ff";
  if (b < 0.6) return "#fff8ea";
  if (b < 1.0) return "#ffe2b0";
  if (b < 1.4) return "#ffc890";
  return "#ffaa78";
}

var SKY_NAMES = [
  ["Sirius", 101.287, -16.716],
  ["Betelgeuse", 88.793, 7.407],
  ["Rigel", 78.634, -8.202],
  ["Polaris", 37.954, 89.264],
  ["Vega", 279.235, 38.784],
  ["Arcturus", 213.915, 19.182],
  ["Capella", 79.172, 45.998],
  ["Aldebaran", 68.98, 16.509],
  ["Antares", 247.352, -26.432],
  ["Spica", 201.298, -11.161],
  ["Altair", 297.696, 8.868],
  ["Deneb", 310.358, 45.28],
  ["Procyon", 114.825, 5.225],
  ["Pollux", 116.329, 28.026],
  ["Regulus", 152.093, 11.967],
  ["Canopus", 95.988, -52.696],
  ["Fomalhaut", 344.413, -29.622]
];

// ---------- Data ----------
function skyLoad() {
  if (SKY.data || SKY.loading) return;
  SKY.loading = true;
  idbGet("sky")
    .then(function (c) {
      if (c && c.stars) return c;
      return Promise.all([
        getJSON(SKY_DATA + "stars.6.json", 40000),
        getJSON(SKY_DATA + "constellations.lines.json", 30000),
        getJSON(SKY_DATA + "constellations.json", 30000)
      ]).then(function (r) {
        var c2 = skyPack(r[0], r[1], r[2]);
        idbSet("sky", c2);
        return c2;
      });
    })
    .then(function (c) {
      SKY.data = c;
      skyDraw();
    })
    .catch(function () {
      SKY.data = { stars: [], lines: [], names: [], offline: true };
      skyDraw();
    })
    .then(function () {
      SKY.loading = false;
    });
}

// Compact the catalogues: stars as [ra, dec, mag, colour], lines as [[ra, dec], …], names.
function skyPack(st, li, cn) {
  var ra = function (x) {
    return x < 0 ? x + 360 : x;
  };
  return {
    stars: ((st && st.features) || []).map(function (f) {
      var c = f.geometry.coordinates;
      return [ra(c[0]), c[1], f.properties.mag, skyStarColor(f.properties.bv)];
    }),
    lines: [].concat.apply(
      [],
      ((li && li.features) || []).map(function (f) {
        return f.geometry.coordinates.map(function (seg) {
          return seg.map(function (p) {
            return [ra(p[0]), p[1]];
          });
        });
      })
    ),
    names: ((cn && cn.features) || [])
      .filter(function (f) {
        return +f.properties.rank <= 2;
      })
      .map(function (f) {
        var c = f.geometry.coordinates;
        return [f.properties.en || f.properties.name, ra(c[0]), c[1]];
      })
  };
}

// ---------- Drawing ----------
function skyWhere() {
  if (T4.on && T4.v) {
    try {
      var cp = T4.v.camera.positionCartographic;
      return [cp.latitude / D, cp.longitude / D];
    } catch (e) {}
  }
  return [rot.lat, rot.lon];
}

function skyDraw() {
  var cv = $("skycv");
  if (!cv || !SKY.on) return;
  var dpr = Math.min(2, window.devicePixelRatio || 1),
    w = cv.clientWidth,
    h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  var g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  SKY.pts = [];
  if (SKY.mode === "sys") skyDrawSystem(g, w, h);
  else skyDrawSky(g, w, h);
  skyInfo();
}

function skyDrawSky(g, w, h) {
  var jd = skyJD(Date.now() + SKY.t * 60000),
    here = skyWhere(),
    lat = here[0],
    lon = here[1],
    cx = w / 2,
    cy = h / 2,
    scale = (Math.min(w, h) / 2.4) * SKY.zoom,
    P = function (alt, az) {
      return skyProject(alt, az, SKY.alt, SKY.az, scale, cx, cy);
    },
    sunEq = skyEclLonLatToEq(skySunLon(jd), 0),
    sun = skyAltAz(sunEq[0], sunEq[1], lat, lon, jd),
    day = Math.max(0, Math.min(1, (sun[0] + 12) / 18));
  // Sky colour follows the Sun: black at night, deep blue at dusk, blue in daytime.
  var top = day > 0.66 ? "#2f6fb8" : day > 0.33 ? "#16305a" : "#02040a",
    bot = day > 0.66 ? "#8fbbe8" : day > 0.33 ? "#3b3f6b" : "#08101f";
  var bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, top);
  bg.addColorStop(1, bot);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  var starAlpha = 1 - Math.min(1, day * 1.4),
    data = SKY.data || { stars: [], lines: [], names: [] };
  // Constellation lines.
  g.strokeStyle = "rgba(120,170,255," + (0.45 * starAlpha + 0.05).toFixed(2) + ")";
  g.lineWidth = 1;
  g.beginPath();
  data.lines.forEach(function (seg) {
    var prev = null;
    seg.forEach(function (p) {
      var aa = skyAltAz(p[0], p[1], lat, lon, jd),
        q = P(aa[0], aa[1]);
      if (q && prev) {
        g.moveTo(prev[0], prev[1]);
        g.lineTo(q[0], q[1]);
      }
      prev = q;
    });
  });
  g.stroke();
  // Stars, brighter ones bigger.
  var limit = 4.5 + SKY.zoom * 1.2;
  data.stars.forEach(function (s) {
    if (s[2] > limit) return;
    var aa = skyAltAz(s[0], s[1], lat, lon, jd);
    if (aa[0] < -2) return;
    var q = P(aa[0], aa[1]);
    if (!q || q[0] < -5 || q[0] > w + 5 || q[1] < -5 || q[1] > h + 5) return;
    var rad = Math.max(0.5, (5.2 - s[2]) * 0.55) * Math.sqrt(SKY.zoom);
    g.globalAlpha = Math.max(0.15, starAlpha) * (s[2] < 2 ? 1 : 0.85);
    g.fillStyle = s[3];
    g.beginPath();
    g.arc(q[0], q[1], rad, 0, 6.2832);
    g.fill();
  });
  g.globalAlpha = 1;
  // Constellation and star names.
  g.font = "600 11px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillStyle = "rgba(150,190,255," + (0.75 * starAlpha + 0.2).toFixed(2) + ")";
  data.names.forEach(function (n) {
    var aa = skyAltAz(n[1], n[2], lat, lon, jd);
    if (aa[0] < 0) return;
    var q = P(aa[0], aa[1]);
    if (q) g.fillText(n[0].toUpperCase(), q[0], q[1]);
  });
  g.textAlign = "left";
  g.fillStyle = "rgba(255,240,210,.85)";
  SKY_NAMES.forEach(function (n) {
    var aa = skyAltAz(n[1], n[2], lat, lon, jd);
    if (aa[0] < 0) return;
    var q = P(aa[0], aa[1]);
    if (q) {
      g.fillText(n[0], q[0] + 6, q[1] - 4);
      SKY.pts.push([q[0], q[1], { kind: "star", name: n[0], alt: aa[0], az: aa[1] }]);
    }
  });
  // Planets.
  var earth = skyHelio(SKY_PLANETS[2], jd);
  SKY_PLANETS.forEach(function (p, i) {
    if (i === 2) return;
    var hp = skyHelio(p, jd),
      eq = skyEclToEq([hp[0] - earth[0], hp[1] - earth[1], hp[2] - earth[2]]),
      aa = skyAltAz(eq[0], eq[1], lat, lon, jd);
    if (aa[0] < -1) return;
    var q = P(aa[0], aa[1]);
    if (!q) return;
    g.fillStyle = p[1];
    g.beginPath();
    g.arc(q[0], q[1], 3.6, 0, 6.2832);
    g.fill();
    g.fillStyle = "#ffe9a8";
    g.font = "700 12px system-ui, sans-serif";
    g.fillText(p[0], q[0] + 7, q[1] + 4);
    SKY.pts.push([q[0], q[1], { kind: "planet", i: i, alt: aa[0], az: aa[1], au: eq[2] }]);
  });
  // The Moon with its phase.
  var mo = skyMoon(jd),
    meq = skyEclLonLatToEq(mo[0], mo[1]),
    maa = skyAltAz(meq[0], meq[1], lat, lon, jd),
    mq = maa[0] > -2 ? P(maa[0], maa[1]) : null;
  if (mq) {
    var ph = skyMoonPhase(jd),
      mr = 11 * Math.sqrt(SKY.zoom);
    skyMoonDisc(g, mq[0], mq[1], mr, ph[0], ph[1]);
    g.fillStyle = "#e8eef6";
    g.font = "700 12px system-ui, sans-serif";
    g.fillText("Moon", mq[0] + mr + 5, mq[1] + 4);
    SKY.pts.push([
      mq[0],
      mq[1],
      { kind: "moon", alt: maa[0], az: maa[1], lit: ph[0], waxing: ph[1], km: mo[2] }
    ]);
  }
  // The Sun, when up.
  var sq = sun[0] > -1 ? P(sun[0], sun[1]) : null;
  if (sq) {
    var sg = g.createRadialGradient(sq[0], sq[1], 2, sq[0], sq[1], 40);
    sg.addColorStop(0, "rgba(255,250,220,1)");
    sg.addColorStop(0.3, "rgba(255,220,120,.6)");
    sg.addColorStop(1, "rgba(255,200,80,0)");
    g.fillStyle = sg;
    g.beginPath();
    g.arc(sq[0], sq[1], 40, 0, 6.2832);
    g.fill();
    SKY.pts.push([sq[0], sq[1], { kind: "sun", alt: sun[0], az: sun[1] }]);
  }
  // Ground below the horizon, and compass points.
  g.fillStyle = "rgba(10,16,12,.92)";
  g.beginPath();
  var started = false;
  for (var az = SKY.az - 180; az <= SKY.az + 180; az += 3) {
    var hq = P(0, az);
    if (!hq) continue;
    if (!started) {
      g.moveTo(hq[0], hq[1]);
      started = true;
    } else g.lineTo(hq[0], hq[1]);
  }
  if (started) {
    g.lineTo(w + 50, h + 50);
    g.lineTo(-50, h + 50);
    g.closePath();
    g.fill();
  }
  g.font = "800 13px system-ui, sans-serif";
  g.textAlign = "center";
  [
    ["N", 0],
    ["NE", 45],
    ["E", 90],
    ["SE", 135],
    ["S", 180],
    ["SW", 225],
    ["W", 270],
    ["NW", 315]
  ].forEach(function (c) {
    var q = P(0, c[1]);
    if (!q) return;
    g.fillStyle = c[0].length === 1 ? "#36f1b5" : "rgba(54,241,181,.6)";
    g.fillText(c[0], q[0], q[1] + 16);
  });
  g.textAlign = "left";
  if (data.offline) {
    g.fillStyle = "rgba(255,255,255,.7)";
    g.font = "12px system-ui, sans-serif";
    g.fillText("Star catalogue unavailable offline — Moon and planets shown.", 14, h - 90);
  }
}

// A disc lit by phase: f is the lit fraction; a waxing Moon is lit on the right (north of the
// tropics), a waning one on the left.
function skyMoonDisc(g, x, y, r, f, waxing) {
  var dark = "#2a2f38",
    lit = "#eef2f7",
    side = waxing ? 1 : -1,
    tw = Math.abs(1 - 2 * f) * r;
  g.save();
  g.fillStyle = dark;
  g.beginPath();
  g.arc(x, y, r, 0, 6.2832);
  g.fill();
  // The lit half.
  g.fillStyle = lit;
  g.beginPath();
  g.arc(x, y, r, -Math.PI / 2, Math.PI / 2, side < 0);
  g.closePath();
  g.fill();
  // The terminator: less than half lit covers part of the lit half, more than half adds to it.
  g.fillStyle = f < 0.5 ? dark : lit;
  g.beginPath();
  g.ellipse(x, y, tw, r, 0, 0, 6.2832);
  g.fill();
  g.restore();
}

function skyDrawSystem(g, w, h) {
  var jd = skyJD(Date.now() + SKY.t * 60000),
    cx = w / 2,
    cy = h / 2,
    S = SKY.sys,
    unit = (Math.min(w, h) / 2 / Math.sqrt(31)) * S.zoom,
    proj = function (v) {
      // Distances on a square-root scale so the outer planets fit; tilted view.
      var d = Math.sqrt(v[0] * v[0] + v[1] * v[1]) || 1e-9,
        k = Math.sqrt(d) / d,
        x = v[0] * k,
        y = v[1] * k,
        cs = Math.cos(S.yaw),
        sn = Math.sin(S.yaw),
        xr = x * cs - y * sn,
        yr = x * sn + y * cs;
      return [cx + xr * unit, cy + yr * unit * Math.cos(S.tilt) - v[2] * unit * Math.sin(S.tilt)];
    };
  g.fillStyle = "#02040a";
  g.fillRect(0, 0, w, h);
  // Distant stars.
  var seed = 7;
  for (var i = 0; i < 260; i++) {
    seed = (seed * 16807) % 2147483647;
    var sx = (seed / 2147483647) * w;
    seed = (seed * 16807) % 2147483647;
    var sy = (seed / 2147483647) * h;
    g.fillStyle = "rgba(255,255,255," + (0.2 + (i % 5) * 0.12).toFixed(2) + ")";
    g.fillRect(sx, sy, 1.2, 1.2);
  }
  // Orbits.
  SKY_PLANETS.forEach(function (p) {
    g.strokeStyle = "rgba(120,170,255,.25)";
    g.beginPath();
    for (var k = 0; k <= 120; k++) {
      var q = proj(skyHelio(p, jd + (k / 120) * 365.25 * Math.pow(p[3][0], 1.5)));
      if (k) g.lineTo(q[0], q[1]);
      else g.moveTo(q[0], q[1]);
    }
    g.stroke();
  });
  // The Sun.
  var sg = g.createRadialGradient(cx, cy, 2, cx, cy, 26);
  sg.addColorStop(0, "#fffbe6");
  sg.addColorStop(0.4, "#ffd36a");
  sg.addColorStop(1, "rgba(255,170,40,0)");
  g.fillStyle = sg;
  g.beginPath();
  g.arc(cx, cy, 26, 0, 6.2832);
  g.fill();
  SKY.pts.push([cx, cy, { kind: "sun" }]);
  // Planets, sized by a compressed scale.
  SKY_PLANETS.forEach(function (p, i) {
    var hp = skyHelio(p, jd),
      q = proj(hp),
      r = 3 + Math.pow(p[2] / 2440, 0.45) * 1.6;
    var pg = g.createRadialGradient(q[0] - r / 3, q[1] - r / 3, r / 5, q[0], q[1], r);
    pg.addColorStop(0, "#ffffff");
    pg.addColorStop(0.25, p[1]);
    pg.addColorStop(1, "#0b0f18");
    g.fillStyle = pg;
    g.beginPath();
    g.arc(q[0], q[1], r, 0, 6.2832);
    g.fill();
    if (p[0] === "Saturn") {
      g.strokeStyle = "rgba(227,207,152,.7)";
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(q[0], q[1], r * 2, r * 0.7, -0.3, 0, 6.2832);
      g.stroke();
      g.lineWidth = 1;
    }
    g.fillStyle = "#dfe9f5";
    g.font = "700 11px system-ui, sans-serif";
    g.fillText(p[0], q[0] + r + 4, q[1] + 4);
    SKY.pts.push([
      q[0],
      q[1],
      {
        kind: "planet",
        i: i,
        au: Math.sqrt(hp[0] * hp[0] + hp[1] * hp[1] + hp[2] * hp[2]),
        helio: true
      }
    ]);
  });
  g.fillStyle = "rgba(255,255,255,.55)";
  g.font = "11px system-ui, sans-serif";
  g.fillText(
    "Positions for " +
      new Date(Date.now() + SKY.t * 60000).toUTCString().slice(0, 22) +
      " UTC · sizes and distances not to scale",
    12,
    h - 92
  );
}

// ---------- Panel ----------
function skyCompass(az) {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(az / 45) % 8];
}

function skyInfo() {
  var el = $("skyinfo"),
    o = SKY.sel;
  if (!el) return;
  if (!o) {
    el.style.display = "none";
    return;
  }
  var rows = [],
    title = "";
  if (o.kind === "planet") {
    var p = SKY_PLANETS[o.i];
    title = p[0];
    rows.push(["SIZE", (p[2] * 2).toLocaleString() + " km across"]);
    rows.push(["YEAR", p[7]], ["DAY", p[8]]);
    if (o.au != null)
      rows.push([
        o.helio ? "FROM THE SUN" : "FROM EARTH",
        (o.au * 149.6).toFixed(0) + " million km"
      ]);
  } else if (o.kind === "moon") {
    title = "Moon";
    rows.push(["LIT", Math.round(o.lit * 100) + "% · " + (o.waxing ? "waxing" : "waning")]);
    rows.push(["FROM EARTH", Math.round(o.km).toLocaleString() + " km"]);
  } else if (o.kind === "sun") title = "Sun";
  else title = o.name;
  if (o.alt != null)
    rows.push(["IN THE SKY", Math.round(o.alt) + "° up, toward " + skyCompass(o.az)]);
  el.innerHTML =
    "<b>" +
    esc(title) +
    "</b>" +
    rows
      .map(function (r) {
        return "<div><span>" + r[0] + "</span>" + esc(r[1]) + "</div>";
      })
      .join("");
  el.style.display = "block";
}

function galOpen() {
  var el = $("sky");
  if (!el) {
    el = document.createElement("div");
    el.id = "sky";
    el.innerHTML =
      '<canvas id="skycv"></canvas>' +
      '<div class="skytop"><button data-sky="sky" class="on">SKY NOW</button><button data-sky="sys">SOLAR SYSTEM</button><span style="flex:1"></span><button data-sky="x" aria-label="Back">✕</button></div>' +
      '<div id="skyinfo"></div>' +
      '<div class="skybot"><button data-sky="back">−1 h</button><button data-sky="now">NOW</button><button data-sky="fwd">+1 h</button><button data-sky="day">+1 day</button></div>';
    document.body.appendChild(el);
    skyGestures($("skycv"));
  }
  SKY.on = true;
  SKY.sel = null;
  el.style.display = "block";
  document.body.classList.add("sky-open");
  skyLoad();
  skyDraw();
}

function galClose() {
  SKY.on = false;
  document.body.classList.remove("sky-open");
  var el = $("sky");
  if (el) el.style.display = "none";
}

document.addEventListener("click", function (e) {
  if (e.target.closest("#bSky")) {
    galOpen();
    return;
  }
  var b = e.target.closest("[data-sky]");
  if (!b) return;
  var k = b.getAttribute("data-sky");
  if (k === "x") galClose();
  else if (k === "sky" || k === "sys") {
    SKY.mode = k;
    SKY.sel = null;
    Array.prototype.forEach.call(document.querySelectorAll(".skytop [data-sky]"), function (x) {
      x.classList.toggle("on", x.getAttribute("data-sky") === k);
    });
  } else if (k === "now") SKY.t = 0;
  else if (k === "back") SKY.t -= 60;
  else if (k === "fwd") SKY.t += 60;
  else if (k === "day") SKY.t += 1440;
  skyDraw();
});

// Drag to look around (or turn the solar system), pinch to zoom, tap to identify.
function skyGestures(cv) {
  var pts = {},
    last = null,
    pinch = null,
    moved = 0;
  cv.addEventListener("pointerdown", function (e) {
    pts[e.pointerId] = [e.clientX, e.clientY];
    cv.setPointerCapture(e.pointerId);
    last = [e.clientX, e.clientY];
    moved = 0;
    var ids = Object.keys(pts);
    if (ids.length === 2) {
      var a = pts[ids[0]],
        b = pts[ids[1]];
      pinch = [Math.hypot(a[0] - b[0], a[1] - b[1]), SKY.mode === "sys" ? SKY.sys.zoom : SKY.zoom];
    }
  });
  cv.addEventListener("pointermove", function (e) {
    if (!pts[e.pointerId]) return;
    pts[e.pointerId] = [e.clientX, e.clientY];
    var ids = Object.keys(pts);
    if (ids.length === 2 && pinch) {
      var a = pts[ids[0]],
        b = pts[ids[1]],
        z = Math.max(
          0.5,
          Math.min(8, (pinch[1] * Math.hypot(a[0] - b[0], a[1] - b[1])) / pinch[0])
        );
      if (SKY.mode === "sys") SKY.sys.zoom = z;
      else SKY.zoom = z;
      moved = 99;
      skyDraw();
      return;
    }
    var dx = e.clientX - last[0],
      dy = e.clientY - last[1];
    last = [e.clientX, e.clientY];
    moved += Math.abs(dx) + Math.abs(dy);
    if (SKY.mode === "sys") {
      SKY.sys.yaw += dx * 0.008;
      SKY.sys.tilt = Math.max(0, Math.min(1.45, SKY.sys.tilt + dy * 0.006));
    } else {
      var f = 0.18 / SKY.zoom;
      SKY.az = (((SKY.az - dx * f) % 360) + 360) % 360;
      SKY.alt = Math.max(-10, Math.min(90, SKY.alt + dy * f));
    }
    skyDraw();
  });
  var up = function (e) {
    delete pts[e.pointerId];
    if (Object.keys(pts).length < 2) pinch = null;
    if (moved < 8 && e.type === "pointerup") {
      var r = cv.getBoundingClientRect(),
        x = e.clientX - r.left,
        y = e.clientY - r.top,
        best = null,
        bd = 30;
      SKY.pts.forEach(function (p) {
        var d = Math.hypot(p[0] - x, p[1] - y);
        if (d < bd) {
          bd = d;
          best = p[2];
        }
      });
      SKY.sel = best;
      skyDraw();
    }
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      var z = Math.max(
        0.5,
        Math.min(8, (SKY.mode === "sys" ? SKY.sys.zoom : SKY.zoom) * (e.deltaY < 0 ? 1.12 : 0.89))
      );
      if (SKY.mode === "sys") SKY.sys.zoom = z;
      else SKY.zoom = z;
      skyDraw();
    },
    { passive: false }
  );
}

// Keep the sky moving in real time while it is open.
setInterval(function () {
  if (SKY.on && !document.hidden) skyDraw();
}, 5000);
window.addEventListener("resize", function () {
  if (SKY.on) skyDraw();
});
