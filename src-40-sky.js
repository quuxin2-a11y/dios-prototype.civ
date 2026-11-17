/**
 * @file Space and sky: the solar system in 3D, and the night sky right now.
 * "3D space" (the default) is a solar system you can fly through: planets, moons, rings, the
 * Milky Way, Earth's satellites, spacecraft and the landers and rovers on Mars and the Moon,
 * all where they are today (see "3D space" below). "Night sky" shows the stars, constellations,
 * the Moon with its phase, the Sun and the planets as they stand now over the place in view,
 * computed on the phone from star positions (d3-celestial, BSD) and published orbital elements
 * (JPL). Without a connection for the 3D engine, a flat solar system stands in. Opened by
 * tapping the logo.
 *
 * Module 39 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

var SKY = {
  on: false,
  mode: "space",
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
  if (!cv || !SKY.on || SKY.mode === "space") return;
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

// The logo opens space in 3D.
function galOpen() {
  skyOpen();
  spxOpen();
}

function skyTabs() {
  Array.prototype.forEach.call(document.querySelectorAll(".skytop [data-sky]"), function (x) {
    var k = x.getAttribute("data-sky");
    x.classList.toggle("on", k === SKY.mode || (k === "space" && SKY.mode === "sys"));
  });
}

function skyOpen() {
  var el = $("sky");
  if (!el) {
    el = document.createElement("div");
    el.id = "sky";
    el.innerHTML =
      '<canvas id="skycv"></canvas>' +
      '<div class="skytop"><button data-sky="space" class="on">3D SPACE</button><button data-sky="sky">NIGHT SKY</button><span style="flex:1"></span><button data-sky="x" aria-label="Back">✕</button></div>' +
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
  spxClose();
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
  else if (k === "space") {
    spxOpen();
    return;
  } else if (k === "sky") {
    spxClose();
    SKY.mode = k;
    SKY.sel = null;
    skyTabs();
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

// ---------- 3D space: the solar system you can fly through ----------
// The Sun, the eight planets and Pluto where they really are today (the same JPL elements as
// above), with their larger moons, Saturn's rings, the Milky Way behind, and the spacecraft and
// landers we know of: thousands of live Earth satellites with the ISS (CelesTrak), the telescopes
// at the Lagrange points, the probes leaving the solar system, and the rovers and landers on Mars
// and the Moon. Drag to turn, pinch to zoom, tap anything to fly there; time can run faster.
// Distances are squeezed (the square root of the real ones) and the planets enlarged, or almost
// everything would be invisible; the card for each object gives the real numbers.
// Drawn with three.js (MIT). Planet maps: Solar System Scope (CC BY 4.0), USGS, NASA/JPL and
// Björn Jónsson, by way of threex.planets; credits in THIRD-PARTY.md.
var SPX = {
    on: false,
    ready: false,
    loading: null,
    T: 0, // simulated time (ms) at the last frame
    rate: 1, // simulated seconds per real second
    paused: false,
    yaw: 0.6,
    pitch: 0.42,
    dist: 120,
    target: null, // body followed by the camera
    fly: null, // camera move in progress
    sel: null,
    bodies: [],
    byId: {},
    marks: [], // labelled points: spacecraft, landers, satellites with names
    tab: "sys"
  },
  SPX_THREE = "https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.min.js",
  SPX_TXA = "https://cdn.jsdelivr.net/gh/ofrohn/threex.planets@master/images/maps/",
  SPX_TXB = "https://cdn.jsdelivr.net/gh/homer-jay/solar-system-textures@master/",
  SPX_RATES = [
    ["LIVE", 1],
    ["1 HR/S", 3600],
    ["1 DAY/S", 86400],
    ["1 WK/S", 604800]
  ],
  SPX_EARTH_R = 0.9; // Earth's radius in scene units

// Squeezed distance from the Sun: real AU to scene units.
function spxSqueeze(au) {
  return 26 * Math.sqrt(Math.max(0, au));
}

// Planet size in scene units from its real radius.
function spxSize(km) {
  return SPX_EARTH_R * Math.pow(km / 6371, 0.45);
}

// Ecliptic (x, y, z with z north) to scene (y up).
function spxScene(v) {
  return [v[0], v[2], -v[1]];
}

// Heliocentric ecliptic AU vector to a squeezed scene position.
function spxHelioScene(v) {
  var r = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1,
    k = spxSqueeze(r) / r;
  return spxScene([v[0] * k, v[1] * k, v[2] * k]);
}

// Equatorial (Earth's equator and pole) to ecliptic.
function spxEqToEcl(v) {
  var ob = 23.43928 * D,
    c = Math.cos(ob),
    s = Math.sin(ob);
  return [v[0], v[1] * c + v[2] * s, -v[1] * s + v[2] * c];
}

function spxRaDec(ra, dec) {
  return spxEqToEcl([
    Math.cos(dec * D) * Math.cos(ra * D),
    Math.cos(dec * D) * Math.sin(ra * D),
    Math.sin(dec * D)
  ]);
}

// Facts for the card: known moons, surface gravity (m/s²), temperature.
var SPX_FACTS = {
  Sun: [
    "A G-type star, 4.6 billion years old",
    "1,392,700 km across",
    "274 m/s²",
    "5,500 °C surface · 15 million °C core"
  ],
  Mercury: ["0 moons", null, "3.7 m/s²", "−180 to 430 °C"],
  Venus: ["0 moons", null, "8.9 m/s²", "465 °C, the hottest planet"],
  Earth: ["1 moon", null, "9.8 m/s²", "15 °C average"],
  Mars: ["2 moons", null, "3.7 m/s²", "−65 °C average"],
  Jupiter: ["95+ moons", null, "24.8 m/s²", "−110 °C cloud tops"],
  Saturn: ["274 moons", null, "10.4 m/s²", "−140 °C cloud tops"],
  Uranus: ["29 moons", null, "8.7 m/s²", "−195 °C"],
  Neptune: ["16 moons", null, "11.2 m/s²", "−200 °C"],
  Pluto: ["5 moons · a dwarf planet", "2,377 km across", "0.6 m/s²", "−230 °C"]
};

// Pluto's elements (JPL approximate, J2000), in the same layout as SKY_PLANETS.
var SPX_PLUTO = [
  "Pluto",
  "#c9b29a",
  1188,
  [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
  [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
  "248 years",
  "6.4 days (backwards)"
];

// Bodies: [id, name, parent, radius km, map, axial tilt°, day (hours, negative backwards), colour,
//          orbit around the parent for moons: [visual radius in parent radii, period days]].
var SPX_BODIES = [
  ["sun", "Sun", null, 696000, SPX_TXB + "sun.jpg", 7.25, 609, "#ffcc66"],
  ["mercury", "Mercury", "sun", 2440, SPX_TXA + "mercurymap.jpg", 0.03, 1408, "#b5b1aa"],
  ["venus", "Venus", "sun", 6052, SPX_TXA + "venusmap.jpg", 177.4, -5832, "#e8d6a8"],
  ["earth", "Earth", "sun", 6371, SPX_TXB + "earth_daymap.jpg", 23.44, 23.93, "#4c8dff"],
  ["moon", "Moon", "earth", 1737, SPX_TXB + "moon.jpg", 6.7, 655.7, "#cfcfcf"],
  ["mars", "Mars", "sun", 3390, SPX_TXA + "marsmap.jpg", 25.19, 24.62, "#d9673f"],
  ["phobos", "Phobos", "mars", 11, SPX_TXA + "phobosmap.jpg", 0, 7.65, "#9a8c80", [1.6, 0.319]],
  ["deimos", "Deimos", "mars", 6, SPX_TXA + "deimosmap.jpg", 0, 30.3, "#a99c8c", [2.3, 1.263]],
  ["jupiter", "Jupiter", "sun", 69911, SPX_TXA + "jupitermap.jpg", 3.13, 9.93, "#d8b48a"],
  ["io", "Io", "jupiter", 1822, SPX_TXA + "iomap.jpg", 0, 42.5, "#e6d27a", [1.7, 1.769]],
  [
    "europa",
    "Europa",
    "jupiter",
    1561,
    SPX_TXA + "europamap.jpg",
    0,
    85.2,
    "#d8c9b0",
    [2.2, 3.551]
  ],
  [
    "ganymede",
    "Ganymede",
    "jupiter",
    2634,
    SPX_TXA + "ganymedemap.jpg",
    0,
    171.7,
    "#a49a8e",
    [2.9, 7.155]
  ],
  [
    "callisto",
    "Callisto",
    "jupiter",
    2410,
    SPX_TXA + "callistomap.jpg",
    0,
    400.5,
    "#7f766c",
    [3.7, 16.689]
  ],
  ["saturn", "Saturn", "sun", 58232, SPX_TXA + "saturnmap.jpg", 26.73, 10.7, "#e3cf98"],
  ["titan", "Titan", "saturn", 2575, SPX_TXA + "titanmap.jpg", 0, 382.7, "#d8a85a", [3.2, 15.945]],
  ["uranus", "Uranus", "sun", 25362, null, 97.77, -17.2, "#9fd8e0"],
  ["neptune", "Neptune", "sun", 24622, SPX_TXA + "neptunemap.jpg", 28.32, 16.1, "#5b7fe8"],
  [
    "triton",
    "Triton",
    "neptune",
    1353,
    SPX_TXA + "tritonmap.jpg",
    0,
    -141,
    "#c9c2b8",
    [2.2, -5.877]
  ],
  ["pluto", "Pluto", "sun", 1188, SPX_TXA + "plutomap.jpg", 122.5, -153.3, "#c9b29a"],
  ["charon", "Charon", "pluto", 606, SPX_TXA + "charonmap.jpg", 0, 153.3, "#9c968f", [2.6, 6.387]]
];

// Places on the surface: [body, name, lat, lon (east), what].
var SPX_SITES = [
  [
    "mars",
    "Perseverance",
    18.45,
    77.37,
    "NASA rover, exploring Jezero crater since 2021 (with the Ingenuity helicopter, retired 2024)",
    "m20"
  ],
  [
    "mars",
    "Curiosity",
    -4.73,
    137.38,
    "NASA rover, climbing Mount Sharp in Gale crater since 2012",
    "msl"
  ],
  ["mars", "Zhurong", 25.07, 109.93, "China's rover, Utopia Planitia, 2021–2022 (asleep since)"],
  ["mars", "Opportunity", -2.0, -5.53, "NASA rover, Meridiani Planum, 2004–2018"],
  ["mars", "Spirit", -14.57, 175.47, "NASA rover, Gusev crater, 2004–2010"],
  ["mars", "Sojourner", 19.13, -33.22, "The first Mars rover, 1997"],
  ["mars", "InSight", 4.5, 135.62, "NASA lander that listened for marsquakes, 2018–2022"],
  ["mars", "Viking 1", 22.27, -47.95, "The first successful Mars landing, 1976"],
  ["mars", "Viking 2", 47.67, 134.28, "NASA lander, Utopia Planitia, 1976–1980"],
  ["mars", "Phoenix", 68.22, -125.75, "NASA lander that found water ice, 2008"],
  ["moon", "Apollo 11", 0.67, 23.47, "First people on the Moon, July 20, 1969"],
  ["moon", "Apollo 12", -3.01, -23.42, "November 1969"],
  ["moon", "Apollo 14", -3.65, -17.47, "February 1971"],
  ["moon", "Apollo 15", 26.13, 3.63, "July 1971, the first lunar rover"],
  ["moon", "Apollo 16", -8.97, 15.5, "April 1972"],
  ["moon", "Apollo 17", 20.19, 30.77, "December 1972, the last crewed landing so far"],
  ["moon", "Chang'e 4 · Yutu-2", -45.44, 177.6, "The first landing on the far side, 2019"],
  ["moon", "Chang'e 6", -41.64, -153.99, "Brought back the first far-side samples, 2024"],
  ["moon", "Chandrayaan-3", -69.37, 32.32, "India's lander near the south pole, 2023"],
  ["moon", "SLIM", -13.32, 25.25, "Japan's precision lander, 2024"],
  ["moon", "Odysseus", -80.13, 1.44, "The first private landing, 2024"],
  ["moon", "Blue Ghost", 18.56, 61.81, "Firefly's lander, Mare Crisium, 2025"],
  ["moon", "Lunokhod 1", 38.32, -35.0, "The first robot rover on another world, 1970"]
];

// Probes far from home, placed from their known course: [name, RA°, Dec°, AU on 2025-01-01,
// AU per year, what]. Their direction barely changes, so this stays within a few percent.
var SPX_PROBES = [
  [
    "Voyager 1",
    257.8,
    12.0,
    164.8,
    3.58,
    "The farthest human-made object, in interstellar space since 2012"
  ],
  ["Voyager 2", 302.1, -58.7, 138.0, 3.25, "In interstellar space since 2018"],
  ["New Horizons", 289.9, -20.6, 61.8, 2.95, "Flew past Pluto in 2015 and Arrokoth in 2019"],
  ["Pioneer 10", 78.0, 26.0, 136.8, 2.51, "Silent since 2003"],
  ["Pioneer 11", 283.0, -8.5, 114.5, 2.37, "Silent since 1995"]
];

function spxJd() {
  return skyJD(SPX.T);
}

// Where a planet is now, in scene units.
function spxPlanetPos(name, jd) {
  if (name === "Pluto") return spxHelioScene(skyHelio(SPX_PLUTO, jd));
  for (var i = 0; i < SKY_PLANETS.length; i++)
    if (SKY_PLANETS[i][0] === name) return spxHelioScene(skyHelio(SKY_PLANETS[i], jd));
  return [0, 0, 0];
}

function spxElements(name) {
  if (name === "Pluto") return SPX_PLUTO;
  for (var i = 0; i < SKY_PLANETS.length; i++)
    if (SKY_PLANETS[i][0] === name) return SKY_PLANETS[i];
  return null;
}

// A soft round glow drawn once into a canvas, for the Sun and the planets' atmospheres.
function spxGlow(color) {
  var c = document.createElement("canvas");
  c.width = c.height = 128;
  var g = c.getContext("2d"),
    gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, color);
  gr.addColorStop(0.25, color.replace(/[\d.]+\)$/, "0.35)"));
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Saturn's ring map is a radial strip: lay it across a flat ring.
function spxRing(inner, outer, tex) {
  var geo = new THREE.RingGeometry(inner, outer, 128, 1),
    pos = geo.attributes.position,
    uv = geo.attributes.uv,
    v = new THREE.Vector3();
  for (var i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  var m = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    })
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

function spxBuild() {
  var T = THREE,
    host = $("spx"),
    lite = displayMode() !== "globe"; // the phones that flicker get the plainest drawing
  var R = (SPX.renderer = new T.WebGLRenderer({
    antialias: !lite,
    alpha: false,
    powerPreference: "high-performance"
  }));
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.75 : 2));
  R.setClearColor(0x000000, 1);
  host.insertBefore(R.domElement, host.firstChild);
  R.domElement.id = "spxcv";
  var S = (SPX.scene = new T.Scene());
  SPX.cam = new T.PerspectiveCamera(50, 1, 0.01, 20000);
  var load = new T.TextureLoader(),
    tex = function (u) {
      var t = load.load(u);
      t.colorSpace = T.SRGBColorSpace;
      return t;
    };
  load.setCrossOrigin("anonymous");
  // The Milky Way all around.
  var sky = new T.Mesh(
    new T.SphereGeometry(9000, 48, 24),
    new T.MeshBasicMaterial({
      map: tex(SPX_TXB + "stars_milky_way.jpg"),
      side: T.BackSide,
      depthWrite: false
    })
  );
  sky.rotation.x = -23.44 * D; // the texture is in equatorial coordinates
  S.add(sky);
  S.add(new T.AmbientLight(0xffffff, 0.11));
  var sunLight = new T.PointLight(0xffffff, 3.2, 0, 0);
  S.add(sunLight);
  SPX_BODIES.forEach(function (b) {
    var r =
        b[0] === "sun" ? 6 : b[2] && b[2] !== "sun" ? Math.max(0.08, spxSize(b[3])) : spxSize(b[3]),
      mat =
        b[0] === "sun"
          ? new T.MeshBasicMaterial({ map: tex(b[4]) })
          : new T.MeshStandardMaterial({
              map: b[4] ? tex(b[4]) : null,
              color: b[4] ? 0xffffff : b[7],
              roughness: 1,
              metalness: 0
            }),
      mesh = new T.Mesh(new T.SphereGeometry(1, 64, 32), mat),
      g = new T.Group();
    mesh.scale.setScalar(r);
    mesh.userData.id = b[0];
    g.add(mesh);
    S.add(g);
    var o = {
      id: b[0],
      name: b[1],
      parent: b[2],
      km: b[3],
      r: r,
      tilt: b[5],
      day: b[6],
      color: b[7],
      orbit: b[8],
      g: g,
      mesh: mesh,
      label: null
    };
    if (b[0] === "sun") {
      var glow = new T.Sprite(
        new T.SpriteMaterial({
          map: spxGlow("rgba(255,190,90,1)"),
          blending: T.AdditiveBlending,
          depthWrite: false
        })
      );
      glow.scale.setScalar(r * 6);
      g.add(glow);
    }
    if (b[0] === "earth") {
      var atm = new T.Sprite(
        new T.SpriteMaterial({
          map: spxGlow("rgba(90,160,255,1)"),
          blending: T.AdditiveBlending,
          depthWrite: false,
          opacity: 0.55
        })
      );
      atm.scale.setScalar(r * 2.7);
      g.add(atm);
    }
    if (b[0] === "saturn") g.add(spxRing(r * 1.24, r * 2.27, tex(SPX_TXA + "saturnrings.png")));
    SPX.bodies.push(o);
    SPX.byId[o.id] = o;
  });
  // Orbits of the planets, traced from the same elements.
  SPX.bodies.forEach(function (o) {
    if (o.parent !== "sun") return;
    var el = spxElements(o.name);
    if (!el) return;
    var per = 365.25 * Math.pow(el[3][0], 1.5),
      pts = [],
      jd0 = spxJd();
    for (var i = 0; i <= 256; i++) pts.push.apply(pts, spxPlanetPos(o.name, jd0 + (per * i) / 256));
    var geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(pts, 3));
    S.add(
      new T.Line(geo, new T.LineBasicMaterial({ color: o.color, transparent: true, opacity: 0.32 }))
    );
  });
  // Surface sites ride on their body's sphere.
  SPX_SITES.forEach(function (s) {
    var b = SPX.byId[s[0]],
      la = s[2] * D,
      lo = s[3] * D;
    if (!b) return;
    var p = new T.Object3D();
    p.position.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
    b.mesh.add(p);
    SPX.marks.push({
      kind: "site",
      body: s[0],
      name: s[1],
      what: s[4],
      live: s[5] || "",
      obj: p,
      lat: s[2],
      lon: s[3]
    });
  });
  // Probes, telescopes and the satellites' points.
  SPX_PROBES.forEach(function (p) {
    SPX.marks.push({
      kind: "probe",
      name: p[0],
      what: p[5],
      ra: p[1],
      dec: p[2],
      au0: p[3],
      auy: p[4],
      pos: new T.Vector3()
    });
  });
  [
    [
      "JWST",
      -1,
      "James Webb Space Telescope, at the Sun–Earth L2 point 1.5 million km beyond Earth"
    ],
    ["SOHO · Aditya-L1", 1, "Sun watchers at the Sun–Earth L1 point, 1.5 million km sunward"]
  ].forEach(function (l) {
    SPX.marks.push({ kind: "lpoint", name: l[0], side: l[1], what: l[2], pos: new T.Vector3() });
  });
  var sg = new T.BufferGeometry();
  sg.setAttribute("position", new T.Float32BufferAttribute(new Float32Array(3 * 2000), 3));
  sg.setDrawRange(0, 0);
  SPX.satPts = new T.Points(
    sg,
    new T.PointsMaterial({
      color: 0x8fe9ff,
      size: 0.035,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85
    })
  );
  SPX.satPts.frustumCulled = false; // its points move every second; never culled on a stale bound
  S.add(SPX.satPts);
  SPX.ray = new T.Raycaster();
  SPX.sunLight = sunLight;
  SPX.ready = true;
}

// Moves every body to where it is at the simulated time.
function spxPlace() {
  var jd = spxJd(),
    d2000 = jd - 2451545,
    T = THREE;
  SPX.bodies.forEach(function (o) {
    var p;
    if (o.id === "sun") p = [0, 0, 0];
    else if (o.parent === "sun") p = spxPlanetPos(o.name, jd);
    else if (o.id === "moon") {
      var m = skyMoon(jd),
        e = SPX.byId.earth.g.position,
        k = SPX.byId.earth.r * 7, // 60 Earth radii in life
        v = spxScene([
          Math.cos(m[1] * D) * Math.cos(m[0] * D) * k,
          Math.cos(m[1] * D) * Math.sin(m[0] * D) * k,
          Math.sin(m[1] * D) * k
        ]);
      p = [e.x + v[0], e.y + v[1], e.z + v[2]];
    } else {
      var par = SPX.byId[o.parent],
        a = (2 * Math.PI * d2000) / o.orbit[1],
        rr = par.r * o.orbit[0] + o.r;
      p = [
        par.g.position.x + Math.cos(a) * rr,
        par.g.position.y,
        par.g.position.z - Math.sin(a) * rr
      ];
    }
    o.g.position.set(p[0], p[1], p[2]);
    if (o.id === "earth") {
      // Earth turns for real: Greenwich faces the sky at the current sidereal time.
      var gm = skyGMST(jd) * D,
        ax = new T.Vector3().fromArray(spxScene(spxEqToEcl([Math.cos(gm), Math.sin(gm), 0]))),
        ay = new T.Vector3().fromArray(spxScene(spxEqToEcl([0, 0, 1]))),
        az = new T.Vector3().crossVectors(ax, ay);
      o.mesh.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(ax, ay, az));
    } else if (o.id === "moon") {
      // The same face always toward Earth.
      var to = new T.Vector3().subVectors(SPX.byId.earth.g.position, o.g.position).normalize(),
        up = new T.Vector3(0, 1, 0),
        z = new T.Vector3().crossVectors(to, up).normalize(),
        y = new T.Vector3().crossVectors(z, to);
      o.mesh.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(to, y, z));
    } else {
      o.mesh.rotation.set(0, 0, 0);
      o.mesh.rotation.z = o.tilt * D;
      o.mesh.rotateY(((d2000 * 24) / o.day) * 2 * Math.PI);
    }
  });
  var E = SPX.byId.earth.g.position,
    sunDir = E.clone().normalize();
  SPX.marks.forEach(function (m) {
    if (m.kind === "probe") {
      var au = m.au0 + (m.auy * (SPX.T - Date.UTC(2025, 0, 1))) / 31557600000,
        v = spxRaDec(m.ra, m.dec);
      m.pos.fromArray(spxHelioScene([v[0] * au, v[1] * au, v[2] * au]));
      m.au = au;
    } else if (m.kind === "lpoint") m.pos.copy(E).addScaledVector(sunDir, -m.side * 2.2);
  });
}

// Earth satellites from the satellite layer's elements (module 10), in Earth's frame.
function spxSats() {
  if (!SATREC.length || !window.satellite) {
    if (!SPX.satAsked) {
      SPX.satAsked = true;
      loadSats();
    }
    return;
  }
  var when = new Date(SPX.T),
    E = SPX.byId.earth.g.position,
    k = SPX_EARTH_R / 6371,
    arr = SPX.satPts.geometry.attributes.position.array,
    n = 0;
  SPX.named = [];
  for (var i = 0; i < SATREC.length && n < 2000; i++) {
    try {
      var pv = satellite.propagate(SATREC[i].rec, when);
      if (!pv || !pv.position) continue;
      var q = pv.position,
        v = spxScene(spxEqToEcl([q.x * k, q.y * k, q.z * k]));
      arr[n * 3] = E.x + v[0];
      arr[n * 3 + 1] = E.y + v[1];
      arr[n * 3 + 2] = E.z + v[2];
      var nm = SATREC[i].ent.n;
      if (/^(ISS \(ZARYA\)|CSS \(TIANHE\)|HST)$/.test(nm))
        SPX.named.push({
          name: nm === "HST" ? "Hubble" : nm === "CSS (TIANHE)" ? "Tiangong" : "ISS",
          at: n
        });
      n++;
    } catch (e) {}
  }
  SPX.satN = n;
  SPX.satPts.geometry.setDrawRange(0, n);
  SPX.satPts.geometry.attributes.position.needsUpdate = true;
}

// ---------- Labels ----------
function spxLabel(key, text, cls) {
  var L = (SPX.lab = SPX.lab || {}),
    el = L[key];
  if (!el) {
    el = L[key] = document.createElement("button");
    el.className = "spxl " + (cls || "");
    el.setAttribute("data-spx", "l-" + key);
    el.textContent = text;
    $("spxlabels").appendChild(el);
  }
  return el;
}

function spxShow(el, v, w, h, on) {
  if (!on) {
    el.style.display = "none";
    return;
  }
  var p = v.clone().project(SPX.cam);
  if (p.z > 1 || p.x < -1.2 || p.x > 1.2 || p.y < -1.2 || p.y > 1.2) {
    el.style.display = "none";
    return;
  }
  el.style.display = "block";
  el.style.transform = "translate(" + ((p.x + 1) / 2) * w + "px," + ((1 - p.y) / 2) * h + "px)";
}

// Is a point on a sphere facing the camera?
function spxFacing(o, world) {
  var n = world.clone().sub(o.g.position),
    c = SPX.cam.position.clone().sub(world);
  return n.dot(c) > 0;
}

function spxLabels() {
  var w = SPX.w,
    h = SPX.h,
    tgt = SPX.target,
    near = tgt ? SPX.cam.position.distanceTo(tgt.g.position) / tgt.r : 999;
  SPX.bodies.forEach(function (o) {
    var moonish = o.parent && o.parent !== "sun",
      on = !moonish || (tgt && (tgt.id === o.parent || tgt.parent === o.parent || tgt.id === o.id));
    spxShow(
      spxLabel(o.id, o.name, moonish ? "moon" : "planet"),
      o.g.position.clone().add(new THREE.Vector3(0, o.r * 1.25, 0)),
      w,
      h,
      on
    );
  });
  SPX.marks.forEach(function (m, i) {
    var el = spxLabel("m" + i, m.name, m.kind),
      on = false,
      at = null;
    if (m.kind === "site") {
      var b = SPX.byId[m.body];
      at = m.obj.getWorldPosition(new THREE.Vector3());
      on = tgt === b && near < 14 && spxFacing(b, at);
    } else {
      at = m.pos;
      on =
        m.kind === "probe"
          ? !tgt || tgt.id === "sun" || SPX.dist > 200
          : tgt && tgt.id === "earth" && near < 60;
    }
    spxShow(el, at, w, h, on);
  });
  // The best-known spacecraft around Earth get names when Earth is close.
  var arr = SPX.satPts.geometry.attributes.position.array;
  ["ISS", "Tiangong", "Hubble"].forEach(function (nm) {
    var s = (SPX.named || []).filter(function (x) {
        return x.name === nm;
      })[0],
      el = spxLabel("s-" + nm, nm, "sat");
    if (!s || !tgt || tgt.id !== "earth" || near > 20) return spxShow(el, null, w, h, false);
    spxShow(el, new THREE.Vector3(arr[s.at * 3], arr[s.at * 3 + 1], arr[s.at * 3 + 2]), w, h, true);
  });
}

// ---------- Camera ----------
function spxCamera() {
  var c = SPX.cam,
    f = SPX.fly,
    goal = SPX.target ? SPX.target.g.position : new THREE.Vector3();
  if (f) {
    var t = Math.min(1, (performance.now() - f.t0) / f.ms),
      e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    SPX.look = f.from.clone().lerp(goal, e);
    SPX.dist = f.d0 + (f.d1 - f.d0) * e;
    if (t >= 1) SPX.fly = null;
  } else SPX.look = goal.clone();
  var cp = Math.cos(SPX.pitch);
  c.position.set(
    SPX.look.x + SPX.dist * cp * Math.sin(SPX.yaw),
    SPX.look.y + SPX.dist * Math.sin(SPX.pitch),
    SPX.look.z + SPX.dist * cp * Math.cos(SPX.yaw)
  );
  c.near = Math.max(0.002, SPX.dist * 0.004);
  c.far = 20000;
  c.updateProjectionMatrix();
  c.lookAt(SPX.look);
}

// Flies to a body (or back out to the whole system with no body).
function spxGo(id, d) {
  var o = SPX.byId[id] || null;
  SPX.fly = {
    from: SPX.look ? SPX.look.clone() : new THREE.Vector3(),
    d0: SPX.dist,
    d1: d || (o ? Math.max(o.r * (o.id === "sun" ? 6 : 4.2), 0.6) : 150),
    t0: performance.now(),
    ms: 1800
  };
  SPX.target = o;
  SPX.sel = o ? { kind: "body", o: o } : null;
  spxCard();
}

// ---------- Frame ----------
function spxFrame(now) {
  if (!SPX.on) return;
  SPX.raf = requestAnimationFrame(spxFrame);
  if (document.hidden) return;
  var dt = Math.min(0.1, (now - (SPX.last || now)) / 1000);
  SPX.last = now;
  if (!SPX.paused) SPX.T += dt * 1000 * SPX.rate;
  var host = $("spx"),
    w = host.clientWidth,
    h = host.clientHeight;
  if (w !== SPX.w || h !== SPX.h) {
    SPX.w = w;
    SPX.h = h;
    SPX.renderer.setSize(w, h);
    SPX.cam.aspect = w / Math.max(1, h);
  }
  spxPlace();
  if (now - (SPX.satAt || 0) > (SPX.rate > 60 ? 120 : 1000)) {
    SPX.satAt = now;
    spxSats();
  }
  spxCamera();
  SPX.renderer.render(SPX.scene, SPX.cam);
  spxLabels();
  if (now - (SPX.clockAt || 0) > 500) {
    SPX.clockAt = now;
    $("spxclock").textContent = new Date(SPX.T).toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }
}

// ---------- Card ----------
function spxKm(au) {
  var km = au * 149597870.7;
  return km > 1e9
    ? (km / 1e9).toFixed(2) + " billion km"
    : km > 1e6
      ? Math.round(km / 1e6).toLocaleString() + " million km"
      : Math.round(km).toLocaleString() + " km";
}

function spxCard() {
  var el = $("spxcard"),
    s = SPX.sel;
  if (!el) return;
  if (!s) {
    el.style.display = "none";
    return;
  }
  var rows = [],
    title = "",
    sub = "",
    jd = spxJd(),
    earth = skyHelio(SKY_PLANETS[2], jd);
  if (s.kind === "body") {
    var o = s.o,
      f = SPX_FACTS[o.name],
      el2 = spxElements(o.name);
    title = o.name;
    sub =
      o.id === "sun"
        ? "Star"
        : o.parent === "sun"
          ? o.id === "pluto"
            ? "Dwarf planet"
            : "Planet"
          : "Moon of " + SPX.byId[o.parent].name;
    if (f) {
      if (f[0]) rows.push(["MOONS", f[0]]);
    }
    rows.push(["SIZE", (f && f[1]) || (o.km * 2).toLocaleString() + " km across"]);
    if (el2) {
      rows.push(["YEAR", el2[7] || el2[5]], ["DAY", el2[8] || el2[6]]);
      var hv = o.id === "pluto" ? skyHelio(SPX_PLUTO, jd) : skyHelio(el2, jd),
        rs = Math.hypot(hv[0], hv[1], hv[2]);
      rows.push(["FROM THE SUN", spxKm(rs)]);
      if (o.id !== "earth")
        rows.push([
          "FROM EARTH NOW",
          spxKm(Math.hypot(hv[0] - earth[0], hv[1] - earth[1], hv[2] - earth[2]))
        ]);
    }
    if (o.id === "moon")
      rows.push(["FROM EARTH NOW", Math.round(skyMoon(jd)[2]).toLocaleString() + " km"]);
    if (f) rows.push(["GRAVITY", f[2]], ["TEMPERATURE", f[3]]);
    if (o.id === "earth")
      rows.push(["SATELLITES SHOWN", (SPX.satN || 0).toLocaleString() + " · live from CelesTrak"]);
  } else {
    var m = s.m;
    title = m.name;
    sub =
      m.kind === "site"
        ? "On " + SPX.byId[m.body].name
        : m.kind === "probe"
          ? "Spacecraft"
          : "Space telescope";
    rows.push(["WHAT", m.what]);
    if (m.kind === "site")
      rows.push([
        "WHERE",
        Math.abs(m.lat).toFixed(2) +
          "° " +
          (m.lat >= 0 ? "N" : "S") +
          ", " +
          Math.abs(m.lon).toFixed(2) +
          "° " +
          (m.lon >= 0 ? "E" : "W") +
          (m.live === "fixed" ? " · from NASA's latest drive" : "")
      ]);
    if (m.kind === "probe")
      rows.push([
        "FROM THE SUN",
        spxKm(m.au) + " (" + m.au.toFixed(1) + " AU) · estimated from its course"
      ]);
  }
  el.innerHTML =
    '<div class="spxch"><div><b>' +
    esc(title) +
    '</b><i class="mono">' +
    esc(sub.toUpperCase()) +
    '</i></div><button data-spx="x" aria-label="Close">✕</button></div>' +
    rows
      .map(function (r) {
        return "<div><span>" + r[0] + "</span>" + esc(String(r[1])) + "</div>";
      })
      .join("");
  el.style.display = "block";
}

// ---------- Open, close, controls ----------
function spxOpen(tab) {
  var el = $("sky");
  if (!el) {
    galOpen();
    el = $("sky");
  }
  SKY.mode = "space";
  skyTabs();
  var host = $("spx");
  if (!host) {
    host = document.createElement("div");
    host.id = "spx";
    host.innerHTML =
      '<div id="spxlabels"></div><div id="spxcard"></div>' +
      '<div class="spxbar"><span class="mono" id="spxclock"></span>' +
      SPX_RATES.map(function (r, i) {
        return '<button data-spx="r-' + i + '" class="mono">' + r[0] + "</button>";
      }).join("") +
      '</div><div class="spxgo">' +
      [
        ["all", "SOLAR SYSTEM"],
        ["earth", "EARTH ORBIT"],
        ["moon", "MOON"],
        ["mars", "MARS"],
        ["jupiter", "JUPITER"],
        ["saturn", "SATURN"],
        ["far", "DEEP SPACE"]
      ]
        .map(function (t) {
          return '<button data-spx="go-' + t[0] + '" class="mono">' + t[1] + "</button>";
        })
        .join("") +
      "</div>";
    el.insertBefore(host, el.firstChild);
    spxGestures(host);
  }
  host.style.display = "block";
  el.classList.add("space");
  SPX.on = true;
  SPX.T = SPX.T || Date.now();
  (window.THREE ? Promise.resolve() : SPX.loading || (SPX.loading = loadScript(SPX_THREE)))
    .then(function () {
      if (!SPX.on) return;
      if (!SPX.ready) spxBuild();
      spxRates();
      // Arrive from deep space.
      if (!SPX.arrived) {
        SPX.arrived = true;
        SPX.dist = 2200;
        SPX.look = new THREE.Vector3();
        spxGo(tab || null, tab ? null : 150);
        SPX.fly.ms = 3200;
      } else if (tab) spxGo(tab);
      SPX.last = 0;
      cancelAnimationFrame(SPX.raf);
      SPX.raf = requestAnimationFrame(spxFrame);
    })
    .catch(function () {
      SPX.loading = null;
      note(
        "Space",
        "The 3D view needs a connection the first time. Showing the flat solar system for now."
      );
      spxClose();
      SKY.mode = "sys";
      skyTabs();
      skyDraw();
    });
}

function spxClose() {
  SPX.on = false;
  cancelAnimationFrame(SPX.raf);
  var host = $("spx");
  if (host) host.style.display = "none";
  var el = $("sky");
  if (el) el.classList.remove("space");
}

function spxRates() {
  Array.prototype.forEach.call(document.querySelectorAll("#spx [data-spx^='r-']"), function (b) {
    b.classList.toggle("on", SPX_RATES[+b.getAttribute("data-spx").slice(2)][1] === SPX.rate);
  });
}

// Mars rovers' latest positions from the app's data feed (harvest.py reads NASA's rover maps).
function spxRovers() {
  if (SPX.roversAsked) return;
  SPX.roversAsked = true;
  getJSON(feedUrl("meta.json"), 9000)
    .then(function (m) {
      var r = (m && m.rovers) || {};
      SPX.marks.forEach(function (k) {
        var p = k.live && r[k.live];
        if (!p || !isFinite(p.lat) || !isFinite(p.lon)) return;
        k.lat = p.lat;
        k.lon = p.lon;
        k.live = "fixed";
        var la = p.lat * D,
          lo = p.lon * D;
        k.obj.position.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
      });
    })
    .catch(function () {});
}

document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-spx]");
  if (!b || !SPX.ready) return;
  var k = b.getAttribute("data-spx");
  if (k === "x") {
    SPX.sel = null;
    spxCard();
  } else if (k.indexOf("r-") === 0) {
    var r = SPX_RATES[+k.slice(2)][1];
    if (r === 1) SPX.T = Date.now(); // LIVE also returns to now
    SPX.rate = r;
    spxRates();
  } else if (k.indexOf("go-") === 0) {
    var t = k.slice(3);
    if (t === "all") spxGo(null, 150);
    else if (t === "far") {
      spxGo("sun", 900);
    } else {
      spxGo(t);
      if (t === "mars") spxRovers();
    }
  } else if (k.indexOf("l-") === 0) spxPick(k.slice(2));
});

function spxPick(key) {
  if (SPX.byId[key]) {
    spxGo(key);
    if (key === "mars") spxRovers();
    return;
  }
  var m = key.charAt(0) === "m" ? SPX.marks[+key.slice(1)] : null;
  if (m) {
    SPX.sel = { kind: "mark", m: m };
    spxCard();
  } else if (key.indexOf("s-") === 0) {
    SPX.sel = {
      kind: "mark",
      m: {
        kind: "sat",
        name: key.slice(2),
        what:
          key === "s-ISS"
            ? "International Space Station, about 420 km up, with a crew aboard"
            : key === "s-Tiangong"
              ? "China's space station, about 390 km up"
              : "Hubble Space Telescope, about 520 km up"
      }
    };
    spxCard();
  }
}

// Drag to turn, pinch or scroll to zoom, tap a planet to fly to it.
function spxGestures(host) {
  var pts = {},
    last = null,
    pinch = null,
    moved = 0;
  host.addEventListener("pointerdown", function (e) {
    if (e.target.closest("button, #spxcard")) return;
    pts[e.pointerId] = [e.clientX, e.clientY];
    host.setPointerCapture(e.pointerId);
    last = [e.clientX, e.clientY];
    moved = 0;
    var ids = Object.keys(pts);
    if (ids.length === 2)
      pinch = [
        Math.hypot(pts[ids[0]][0] - pts[ids[1]][0], pts[ids[0]][1] - pts[ids[1]][1]),
        SPX.dist
      ];
  });
  host.addEventListener("pointermove", function (e) {
    if (!pts[e.pointerId]) return;
    pts[e.pointerId] = [e.clientX, e.clientY];
    var ids = Object.keys(pts);
    if (ids.length === 2 && pinch) {
      var d = Math.hypot(pts[ids[0]][0] - pts[ids[1]][0], pts[ids[0]][1] - pts[ids[1]][1]);
      spxZoom((pinch[1] * pinch[0]) / Math.max(10, d));
      moved = 99;
      return;
    }
    var dx = e.clientX - last[0],
      dy = e.clientY - last[1];
    last = [e.clientX, e.clientY];
    moved += Math.abs(dx) + Math.abs(dy);
    SPX.yaw -= dx * 0.006;
    SPX.pitch = Math.max(-1.45, Math.min(1.45, SPX.pitch + dy * 0.005));
  });
  var up = function (e) {
    delete pts[e.pointerId];
    if (Object.keys(pts).length < 2) pinch = null;
    if (moved < 8 && e.type === "pointerup" && SPX.ready) {
      var r = host.getBoundingClientRect(),
        v = new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          -((e.clientY - r.top) / r.height) * 2 + 1
        );
      SPX.ray.setFromCamera(v, SPX.cam);
      var hit = SPX.ray.intersectObjects(
        SPX.bodies.map(function (o) {
          return o.mesh;
        }),
        false
      )[0];
      if (hit) spxPick(hit.object.userData.id);
    }
  };
  host.addEventListener("pointerup", up);
  host.addEventListener("pointercancel", up);
  host.addEventListener(
    "wheel",
    function (e) {
      e.preventDefault();
      spxZoom(SPX.dist * (e.deltaY < 0 ? 0.88 : 1.14));
    },
    { passive: false }
  );
}

function spxZoom(d) {
  var min = SPX.target ? SPX.target.r * 1.15 : 5;
  SPX.dist = Math.max(min, Math.min(4000, d));
  SPX.fly = null;
}
