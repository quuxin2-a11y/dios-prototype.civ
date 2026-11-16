/**
 * @file Inspect.
 * A continuous zoom from the 3D city into procedurally drawn cutaways of buildings and aircraft,
 * with labelled facts.
 *
 * Module 12 of 36. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

// ---------- Inspect: a continuous zoom from the whole object down to a single atom ----------
// Own small WebGL renderer, no library. Models are illustrative: generic aircraft and structure, never anyone's real drawings.
// Buildings use the real footprint, height and floor count from OpenStreetMap when it has them.
var INS = {
  on: false,
  gl: null,
  pr: null,
  st: [],
  i: 0,
  t: 0,
  play: true,
  raf: 0,
  bufs: [],
  last: 0,
  yaw: 0,
  drag: null,
  DUR: 6.2
};
var IC = {
  g: [0.62, 0.63, 0.66],
  d: [0.2, 0.21, 0.24],
  l: [0.86, 0.87, 0.89],
  m: [0.42, 0.43, 0.46],
  k: [0.09, 0.1, 0.12],
  lime: [0.78, 1, 0.36],
  yel: [1, 0.84, 0.2],
  or: [0.95, 0.5, 0.25],
  red: [0.9, 0.25, 0.3],
  bl: [0.3, 0.45, 0.85],
  teal: [0.25, 0.88, 0.82]
};
function insMesh() {
  var P = [],
    T = null,
    o = {};
  o.tf = function (f) {
    T = f;
  };
  o.tri = function (a, b, c, col, e) {
    if (T) {
      a = T(a);
      b = T(b);
      c = T(c);
    }
    var ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2],
      vx = c[0] - a[0],
      vy = c[1] - a[1],
      vz = c[2] - a[2],
      nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx,
      l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    e = e || 0;
    P.push(
      a[0],
      a[1],
      a[2],
      nx,
      ny,
      nz,
      col[0],
      col[1],
      col[2],
      e,
      b[0],
      b[1],
      b[2],
      nx,
      ny,
      nz,
      col[0],
      col[1],
      col[2],
      e,
      c[0],
      c[1],
      c[2],
      nx,
      ny,
      nz,
      col[0],
      col[1],
      col[2],
      e
    );
  };
  o.quad = function (a, b, c, d, col, e) {
    o.tri(a, b, c, col, e);
    o.tri(a, c, d, col, e);
  };
  o.loft = function (R, col, cap, e) {
    var i, j, n;
    for (i = 0; i < R.length - 1; i++) {
      n = R[i].length;
      for (j = 0; j < n; j++)
        o.quad(R[i][j], R[i][(j + 1) % n], R[i + 1][(j + 1) % n], R[i + 1][j], col, e);
    }
    if (cap !== false)
      [R[0], R[R.length - 1]].forEach(function (r) {
        var m = [0, 0, 0];
        r.forEach(function (p) {
          m[0] += p[0] / r.length;
          m[1] += p[1] / r.length;
          m[2] += p[2] / r.length;
        });
        for (j = 0; j < r.length; j++) o.tri(m, r[j], r[(j + 1) % r.length], col, e);
      });
  };
  o.box = function (x0, x1, y0, y1, z0, z1, col, e) {
    o.loft(
      [
        [
          [x0, y0, z0],
          [x1, y0, z0],
          [x1, y1, z0],
          [x0, y1, z0]
        ],
        [
          [x0, y0, z1],
          [x1, y0, z1],
          [x1, y1, z1],
          [x0, y1, z1]
        ]
      ],
      col,
      true,
      e
    );
  };
  // ring of n points around the axis a→b at point a+(b-a)*t with radius r
  o.cyl = function (a, b, rs, n, col, e, cap, a0, a1) {
    var ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      L = Math.hypot(ax[0], ax[1], ax[2]) || 1;
    ax = [ax[0] / L, ax[1] / L, ax[2] / L];
    var u = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0],
      p = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]],
      pl = Math.hypot(p[0], p[1], p[2]);
    p = [p[0] / pl, p[1] / pl, p[2] / pl];
    var q = [ax[1] * p[2] - ax[2] * p[1], ax[2] * p[0] - ax[0] * p[2], ax[0] * p[1] - ax[1] * p[0]],
      R = [],
      part = a0 != null;
    rs.forEach(function (s) {
      var t = s[0],
        r = s[1],
        c = [a[0] + ax[0] * L * t, a[1] + ax[1] * L * t, a[2] + ax[2] * L * t],
        ring = [],
        k,
        an,
        m = part ? n + 1 : n;
      for (k = 0; k < m; k++) {
        an = part ? a0 + ((a1 - a0) * k) / n : (2 * Math.PI * k) / n;
        ring.push([
          c[0] + r * (Math.cos(an) * p[0] + Math.sin(an) * q[0]),
          c[1] + r * (Math.cos(an) * p[1] + Math.sin(an) * q[1]),
          c[2] + r * (Math.cos(an) * p[2] + Math.sin(an) * q[2])
        ]);
      }
      R.push(ring);
    });
    if (part) {
      for (var i = 0; i < R.length - 1; i++)
        for (var j = 0; j < n; j++)
          o.quad(R[i][j], R[i][j + 1], R[i + 1][j + 1], R[i + 1][j], col, e);
    } else o.loft(R, col, cap, e);
  };
  o.sph = function (c, r, col, e, ns) {
    ns = ns || 7;
    var i,
      j,
      a0,
      a1,
      b0,
      b1,
      pt = function (a, b) {
        return [
          c[0] + r * Math.sin(a) * Math.cos(b),
          c[1] + r * Math.cos(a),
          c[2] + r * Math.sin(a) * Math.sin(b)
        ];
      };
    for (i = 0; i < ns; i++) {
      a0 = (Math.PI * i) / ns;
      a1 = (Math.PI * (i + 1)) / ns;
      for (j = 0; j < ns * 2; j++) {
        b0 = (Math.PI * j) / ns;
        b1 = (Math.PI * (j + 1)) / ns;
        if (i > 0) o.tri(pt(a0, b0), pt(a0, b1), pt(a1, b1), col, e);
        if (i < ns - 1) o.tri(pt(a0, b0), pt(a1, b1), pt(a1, b0), col, e);
      }
    }
  };
  o.done = function (spin) {
    return { v: new Float32Array(P), n: P.length / 10, spin: spin || null };
  };
  return o;
}
// ear clipping for building footprints; pts are [x,z]
function insEar(pts) {
  var n = pts.length,
    ix = [],
    i,
    out = [],
    ar = 0;
  for (i = 0; i < n; i++) {
    ix.push(i);
    ar += pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1];
  }
  if (ar < 0) ix.reverse();
  var cr = function (a, b, c) {
      return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    },
    inT = function (p, a, b, c) {
      return cr(a, b, p) >= 0 && cr(b, c, p) >= 0 && cr(c, a, p) >= 0;
    },
    g = 0;
  while (ix.length > 3 && g++ < 4000) {
    var cut = false;
    for (i = 0; i < ix.length; i++) {
      var a = pts[ix[(i + ix.length - 1) % ix.length]],
        b = pts[ix[i]],
        c = pts[ix[(i + 1) % ix.length]];
      if (cr(a, b, c) <= 0) continue;
      var ok = true;
      for (var k = 0; k < ix.length; k++) {
        var p = pts[ix[k]];
        if (p === a || p === b || p === c) continue;
        if (inT(p, a, b, c)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        out.push([a, b, c]);
        ix.splice(i, 1);
        cut = true;
        break;
      }
    }
    if (!cut) break;
  }
  if (ix.length === 3) out.push([pts[ix[0]], pts[ix[1]], pts[ix[2]]]);
  return out;
}
function insIn(pts, x, z) {
  var c = false,
    i,
    j;
  for (i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if (
      pts[i][1] > z !== pts[j][1] > z &&
      x < ((pts[j][0] - pts[i][0]) * (z - pts[i][1])) / (pts[j][1] - pts[i][1]) + pts[i][0]
    )
      c = !c;
  }
  return c;
}
function insPrism(M, fp, y0, y1, col, e, roofCol) {
  var i,
    n = fp.length;
  for (i = 0; i < n; i++) {
    var a = fp[i],
      b = fp[(i + 1) % n];
    M.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], col, e);
  }
  insEar(fp).forEach(function (t) {
    M.tri(
      [t[0][0], y1, t[0][1]],
      [t[1][0], y1, t[1][1]],
      [t[2][0], y1, t[2][1]],
      roofCol || col,
      e
    );
    M.tri([t[0][0], y0, t[0][1]], [t[1][0], y0, t[1][1]], [t[2][0], y0, t[2][1]], col, e);
  });
}
function insLattice(M, kind, a, nx, ny, nz, r, col, hi) {
  var basis =
      kind === "zb"
        ? [
            [0, 0, 0],
            [0.5, 0.5, 0],
            [0.5, 0, 0.5],
            [0, 0.5, 0.5],
            [0.25, 0.25, 0.25, 1],
            [0.75, 0.75, 0.25, 1],
            [0.75, 0.25, 0.75, 1],
            [0.25, 0.75, 0.75, 1]
          ]
        : kind === "fcc"
          ? [
              [0, 0, 0],
              [0.5, 0.5, 0],
              [0.5, 0, 0.5],
              [0, 0.5, 0.5]
            ]
          : [
              [0, 0, 0],
              [0.5, 0.5, 0.5]
            ],
    x,
    y,
    z,
    b,
    first = null,
    mid = [Math.floor(nx / 2), ny - 1, Math.floor(nz / 2)];
  for (x = 0; x < nx; x++)
    for (y = 0; y < ny; y++)
      for (z = 0; z < nz; z++)
        for (b = 0; b < basis.length; b++) {
          var p = [
              (x + basis[b][0] - nx / 2) * a,
              (y + basis[b][1] - ny / 2) * a,
              (z + basis[b][2] - nz / 2) * a
            ],
            h = x === mid[0] && y === mid[1] && z === mid[2] && b === (kind === "fcc" ? 1 : 1);
          if (h) first = p;
          M.sph(
            p,
            basis[b][3] ? r * 0.82 : r,
            h ? IC.lime : basis[b][3] ? IC.d : col,
            h ? 1 : 0,
            h ? 9 : 6
          );
        }
  return first;
}
// ----- aircraft -----
function insPlaneModel(M, hiEng) {
  var R = 1.95,
    prof = [
      [19, 0.05, -0.45],
      [18.3, 0.55, -0.35],
      [17.2, 1.1, -0.2],
      [15.6, 1.6, -0.05],
      [13.5, 1.9, 0],
      [10, R, 0],
      [-6, R, 0],
      [-10, 1.75, 0.15],
      [-13.5, 1.3, 0.5],
      [-16.5, 0.75, 0.95],
      [-18.6, 0.3, 1.3],
      [-19.2, 0.08, 1.4]
    ],
    rings = prof.map(function (p) {
      var r = [],
        k;
      for (k = 0; k < 18; k++)
        r.push([
          p[1] * Math.cos((k * Math.PI) / 9),
          p[2] + p[1] * Math.sin((k * Math.PI) / 9),
          p[0]
        ]);
      return r;
    });
  M.loft(rings, IC.l);
  var wing = function (sx, a, b, col) {
    var sec = function (x, y, zl, zt, t) {
      var zm = zl - (zl - zt) * 0.3;
      return [
        [sx * x, y, zl],
        [sx * x, y + t / 2, zm],
        [sx * x, y + t * 0.15, zt],
        [sx * x, y - t / 2, zm]
      ];
    };
    M.loft([sec.apply(0, a), sec.apply(0, b)], col);
  };
  [-1, 1].forEach(function (sx) {
    wing(sx, [1.4, -0.9, 4.5, -3.2, 0.9], [17.2, 0.35, -5.6, -7.4, 0.22], IC.g);
    wing(sx, [0.8, 0.75, -14.6, -17.6, 0.35], [6.6, 1.15, -17.4, -18.9, 0.12], IC.g);
    M.loft(
      [
        [
          [sx * 17.2, 0.35, -5.7],
          [sx * 17.25, 0.35, -7.3],
          [sx * 17.6, 2, -7.7],
          [sx * 17.55, 2, -6.9]
        ],
        [
          [sx * 17.35, 0.35, -5.7],
          [sx * 17.4, 0.35, -7.3],
          [sx * 17.75, 2, -7.7],
          [sx * 17.7, 2, -6.9]
        ]
      ],
      IC.m
    );
    var h = hiEng && sx > 0;
    M.cyl(
      [sx * 5.9, -1.75, 3.6],
      [sx * 5.9, -1.75, -0.6],
      [
        [0, 0.95],
        [0.1, 1.08],
        [0.76, 1],
        [1, 0.62]
      ],
      14,
      h ? IC.lime : IC.d,
      h ? 0.9 : 0
    );
    M.box(sx * 5.9 - 0.12, sx * 5.9 + 0.12, -1, -0.55, -0.6, 2.6, IC.g);
  });
  M.loft(
    [
      [
        [-0.18, 1.7, -13.2],
        [0.18, 1.7, -13.2],
        [0.18, 1.9, -18.6],
        [-0.18, 1.9, -18.6]
      ],
      [
        [-0.07, 7.4, -17.4],
        [0.07, 7.4, -17.4],
        [0.07, 7.4, -19.6],
        [-0.07, 7.4, -19.6]
      ]
    ],
    IC.m
  );
  for (var z = -9; z < 13; z += 0.9)
    [-1, 1].forEach(function (sx) {
      M.box(sx * (R + 0.01) - 0.02, sx * (R + 0.01) + 0.02, 0.3, 0.62, z, z + 0.5, IC.k);
    });
}
function insGround(M, s, y, col) {
  M.quad([-s, y, -s], [s, y, -s], [s, y, s], [-s, y, s], col || IC.k);
  var i,
    st = s / 8;
  for (i = -8; i <= 8; i++) {
    M.box(i * st - s * 0.002, i * st + s * 0.002, y, y + s * 0.001, -s, s, IC.d);
    M.box(-s, s, y, y + s * 0.001, i * st - s * 0.002, i * st + s * 0.002, IC.d);
  }
}
function insAirfoil(c, th, tw, y, n) {
  var up = [],
    lo = [],
    i,
    u,
    x,
    t,
    cam,
    ct = Math.cos(tw),
    sn = Math.sin(tw),
    rot = function (x, z) {
      return [x * ct - z * sn, y, x * sn + z * ct];
    };
  for (i = 0; i <= n; i++) {
    u = i / n;
    x = (u - 0.5) * c;
    t =
      5 *
      th *
      c *
      (0.2969 * Math.sqrt(u) -
        0.126 * u -
        0.3516 * u * u +
        0.2843 * u * u * u -
        0.1036 * u * u * u * u);
    cam = 0.5 * c * 0.36 * u * (1 - u);
    up.push(rot(x, cam + t));
    if (i > 0 && i < n) lo.unshift(rot(x, cam - t));
  }
  return up.concat(lo);
}
function insPlaneStages(p) {
  var name = String((p && p.n) || "AIRCRAFT").toUpperCase(),
    ill = "ILLUSTRATIVE GENERIC AIRLINER · NOT THIS AIRCRAFT'S ACTUAL DRAWINGS";
  return [
    {
      title: name,
      sub: "FROM THE WHOLE AIRCRAFT DOWN TO A SINGLE ATOM",
      sub2: ill,
      fov: 62,
      bg: [0.03, 0.035, 0.045],
      cam: {
        t: [0, 0, 0],
        d: [62, 40],
        yaw: [0.9, 0.35],
        pit: [0.32, 0.24],
        f: [5.9, -1.75, 1.5]
      },
      build: function () {
        var M = insMesh();
        insGround(M, 120, -6, [0.05, 0.055, 0.065]);
        insPlaneModel(M, false);
        return [M.done()];
      },
      labels: [
        [0, 7.6, -18.4, "Vertical stabiliser"],
        [17.5, 2.2, -7, "Winglet"],
        [0, 1, 17, "Flight deck"],
        [5.9, -0.6, 2, "Engine"]
      ]
    },
    {
      title: "WING AND ENGINE",
      sub: "TWO HIGH-BYPASS TURBOFANS HANG ON PYLONS UNDER THE WING",
      sub2: ill,
      fov: 19,
      bg: [0.03, 0.035, 0.045],
      cam: {
        t: [6.5, -1, 0.5],
        d: [19, 9],
        yaw: [0.75, 0.45],
        pit: [0.12, 0.05],
        f: [5.9, -1.75, 1.5]
      },
      build: function () {
        var M = insMesh();
        insPlaneModel(M, true);
        return [M.done()];
      },
      labels: [
        [5.9, -0.55, 1, "Pylon"],
        [5.9, -2.9, 2.6, "Nacelle"],
        [11, -0.1, -4.4, "Flap"],
        [3, 0, 1.5, "Wing root"]
      ]
    },
    {
      title: "INSIDE THE TURBOFAN",
      sub: "AIR IS DRAWN IN, SQUEEZED, BURNED AND BLOWN OUT THE BACK",
      sub2: "CUTAWAY · " + ill,
      fov: 5.2,
      bg: [0.07, 0.075, 0.085],
      cam: {
        t: [0, 0, 0],
        d: [7.4, 4.6],
        yaw: [0.95, 0.5],
        pit: [0.3, 0.2],
        f: [0.36, 0.3, -1.0]
      },
      build: function () {
        var S = insMesh(),
          F = insMesh(),
          C = insMesh(),
          a0 = Math.PI * 0.5,
          a1 = Math.PI * 1.5,
          i,
          k;
        S.cyl(
          [0, 0, 2.3],
          [0, 0, -1.2],
          [
            [0, 1.22],
            [0.08, 1.34],
            [0.6, 1.3],
            [1, 1.12]
          ],
          26,
          IC.g,
          0,
          false,
          a0,
          a1
        );
        S.cyl(
          [0, 0, 2.3],
          [0, 0, -1.2],
          [
            [0, 1.14],
            [0.08, 1.2],
            [0.6, 1.17],
            [1, 1.04]
          ],
          26,
          IC.d,
          0,
          false,
          a0,
          a1
        );
        S.cyl(
          [0, 0, 1.0],
          [0, 0, -1.9],
          [
            [0, 0.6],
            [0.3, 0.5],
            [0.55, 0.5],
            [0.8, 0.6],
            [1, 0.5]
          ],
          22,
          IC.m,
          0,
          false,
          a0,
          a1
        );
        S.cyl(
          [0, 0, -0.35],
          [0, 0, -0.85],
          [
            [0, 0.3],
            [0.15, 0.44],
            [0.85, 0.44],
            [1, 0.34]
          ],
          18,
          IC.or,
          0.55
        );
        S.cyl(
          [0, 0, -1.9],
          [0, 0, -2.7],
          [
            [0, 0.32],
            [1, 0.03]
          ],
          16,
          IC.d
        );
        S.cyl(
          [0, 0, 1.6],
          [0, 0, -1.9],
          [
            [0, 0.07],
            [1, 0.07]
          ],
          8,
          IC.k
        );
        F.cyl(
          [0, 0, 2.05],
          [0, 0, 1.5],
          [
            [0, 0.02],
            [0.5, 0.2],
            [1, 0.3]
          ],
          16,
          IC.l
        );
        for (i = 0; i < 20; i++) {
          (function (an) {
            F.tf(function (p) {
              var c = Math.cos(an),
                s = Math.sin(an);
              return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
            });
            F.loft(
              [
                [
                  [0.28, -0.11, 1.52],
                  [0.28, 0.11, 1.36],
                  [0.28, 0.13, 1.38],
                  [0.28, -0.09, 1.54]
                ],
                [
                  [1.12, -0.2, 1.6],
                  [1.12, 0.2, 1.3],
                  [1.12, 0.22, 1.32],
                  [1.12, -0.18, 1.62]
                ]
              ],
              IC.g
            );
          })((i * Math.PI) / 10);
        }
        F.tf(null);
        for (k = 0; k < 8; k++) {
          var z = 0.95 - k * 0.15,
            r = 0.47 - k * 0.022;
          C.cyl(
            [0, 0, z],
            [0, 0, z - 0.05],
            [
              [0, r],
              [1, r]
            ],
            20,
            k % 2 ? IC.l : IC.g
          );
        }
        for (k = 0; k < 4; k++) {
          var z2 = -0.95 - k * 0.22,
            r2 = 0.38 + k * 0.045;
          C.cyl(
            [0, 0, z2],
            [0, 0, z2 - 0.07],
            [
              [0, r2],
              [1, r2]
            ],
            22,
            k === 0 ? IC.lime : k % 2 ? IC.g : IC.l,
            k === 0 ? 1 : 0
          );
        }
        return [S.done(), F.done({ w: 2.6 }), C.done({ w: -4.2 })];
      },
      labels: [
        [0, 1.25, 1.5, "Fan"],
        [-0.2, 0.62, 0.45, "Compressor"],
        [0, 0.52, -0.6, "Combustor"],
        [0, 0.5, -1.0, "High-pressure turbine"],
        [-1.1, 0.4, -0.4, "Bypass duct"]
      ]
    },
    {
      title: "ONE TURBINE BLADE",
      sub: "IT SPINS IN GAS HOTTER THAN ITS OWN MELTING POINT, COOLED BY AIR THROUGH TINY HOLES",
      sub2: ill,
      fov: 0.14,
      bg: [0.33, 0.34, 0.36],
      cam: {
        t: [0, 0.045, 0],
        d: [0.2, 0.12],
        yaw: [-0.7, 0.3],
        pit: [0.22, 0.14],
        f: [0, 0.06, 0.006]
      },
      build: function () {
        var M = insMesh(),
          R = [],
          i,
          u;
        for (i = 0; i <= 10; i++) {
          u = i / 10;
          R.push(
            insAirfoil(0.034 - 0.008 * u, 0.13 - 0.04 * u, -0.35 + 0.75 * u, 0.022 + 0.07 * u, 12)
          );
        }
        M.loft(R, IC.g);
        M.box(-0.024, 0.024, 0.014, 0.022, -0.016, 0.016, IC.l);
        [
          [0.012, 0.006, 0.014],
          [0.016, -0.002, 0.006],
          [0.011, -0.01, -0.002],
          [0.014, -0.018, -0.01]
        ].forEach(function (s) {
          M.box(-0.02, 0.02, s[2] - 0.008, s[2], -s[0], s[0], IC.m);
        });
        for (i = 0; i < 9; i++) {
          u = (i + 0.5) / 9;
          var tw = -0.35 + 0.75 * u,
            c = 0.034 - 0.008 * u,
            x = -0.5 * c * 0.93;
          M.sph(
            [x * Math.cos(tw), 0.022 + 0.07 * u, x * Math.sin(tw) + 0.0005],
            0.0012,
            i === 4 ? IC.lime : IC.k,
            i === 4 ? 1 : 0,
            5
          );
        }
        return [M.done()];
      },
      labels: [
        [0, 0.094, 0, "Tip"],
        [-0.016, 0.057, -0.004, "Film-cooling holes"],
        [0, 0.018, 0.017, "Platform"],
        [0, -0.012, 0.012, "Fir-tree root"]
      ]
    },
    {
      title: "SINGLE-CRYSTAL SUPERALLOY",
      sub: "THE BLADE IS ONE CRYSTAL OF NICKEL ALLOY, PACKED WITH CUBES HALF A MICROMETRE WIDE",
      sub2: "GENERIC γ / γ′ MICROSTRUCTURE · ILLUSTRATIVE",
      fov: 5.5e-6,
      bg: [0.45, 0.34, 0.34],
      cam: {
        t: [0, 0, 0],
        d: [7.5, 3.4],
        yaw: [0.55, 0.95],
        pit: [0.62, 0.45],
        f: [0.27, 0.3, 0.27]
      },
      unit: 1e-6,
      build: function () {
        var M = insMesh(),
          x,
          z,
          y,
          s = 0.46,
          g = 0.54;
        for (y = 0; y < 2; y++)
          for (x = -6; x < 6; x++)
            for (z = -6; z < 6; z++) {
              var hi = y === 1 && x === 0 && z === 0,
                j = ((x * 7 + z * 13 + y * 5) % 5) * 0.012;
              M.box(
                x * g,
                x * g + s,
                y * g - 0.8 + j,
                y * g - 0.8 + s + j,
                z * g,
                z * g + s,
                hi ? IC.lime : (x + z) % 3 ? IC.g : IC.m,
                hi ? 1 : 0
              );
            }
        M.box(-3.4, 3.4, -0.95, -0.82, -3.4, 3.4, IC.d);
        return [M.done()];
      },
      labels: [
        [0.25, 0.35, 0.25, "One γ′ cube"],
        [-1.4, 0.3, 1.4, "γ matrix channels"]
      ]
    },
    {
      title: "ATOMS 0.25 NM APART",
      sub: "EACH NICKEL ATOM SITS IN A FACE-CENTRED CUBIC LATTICE WITH TWELVE NEAREST NEIGHBOURS",
      sub2: "LATTICE CONSTANT 0.352 NM · ILLUSTRATIVE",
      fov: 2.6e-9,
      bg: [0.5, 0.5, 0.52],
      cam: { t: [0, 0, 0], d: [3.4, 1.9], yaw: [0.3, 0.75], pit: [0.5, 0.38] },
      unit: 1e-9,
      build: function () {
        var M = insMesh();
        this.hp = insLattice(M, "fcc", 0.352, 7, 3, 7, 0.118, IC.g);
        return [M.done()];
      },
      labels: "atom:One nickel atom"
    }
  ];
}
// ----- buildings: everything shown is from the public record (OpenStreetMap) unless the screen says "typical" -----
function insFacts(t, b) {
  var F = [],
    add = function (k, v) {
      if (v != null && String(v).trim() !== "")
        F.push([k, String(v).replace(/_/g, " ").slice(0, 40)]);
    },
    use =
      t.building && t.building !== "yes"
        ? t.building
        : t.office
          ? t.office + " office"
          : t.amenity || t.shop || t.tourism || t.leisure || "";
  add("USE", use);
  add("FLOORS", t["building:levels"]);
  add("HEIGHT", b.est ? "≈ " + Math.round(b.h) + " m (estimated)" : Math.round(b.h) + " m");
  add("BUILT", t.start_date || t["construction_date"]);
  add("ARCHITECT", t.architect);
  add("OPERATOR", t.operator);
  add(
    "ADDRESS",
    [t["addr:housenumber"], t["addr:street"], t["addr:city"]].filter(Boolean).join(" ")
  );
  add("FACADE", t["building:material"] || t["building:cladding"]);
  add("ROOF", t["roof:shape"]);
  add("PARTS ON RECORD", b.parts.length || "");
  add("ROOMS ON RECORD", b.rooms.length || "");
  return F;
}
function insCentroid(fp) {
  var x = 0,
    z = 0;
  fp.forEach(function (p) {
    x += p[0] / fp.length;
    z += p[1] / fp.length;
  });
  return [x, z];
}
function insBuildingStages(b) {
  b.parts = b.parts || [];
  b.rooms = b.rooms || [];
  b.tags = b.tags || {};
  var fp = b.fp,
    H = b.h,
    L = b.lv,
    i,
    span = 0;
  fp.forEach(function (p) {
    span = Math.max(span, Math.abs(p[0]), Math.abs(p[1]));
  });
  span = Math.max(8, span);
  var size = Math.max(span * 2, H),
    fh = H / L,
    name = String(b.n || "BUILDING")
      .toUpperCase()
      .slice(0, 34),
    shown = Math.min(L, 14),
    mat = b.tags["building:material"],
    src = b.real
      ? (b.parts.length
          ? "REAL SHAPE: " + b.parts.length + " MAPPED PARTS · OPENSTREETMAP"
          : "REAL OUTLINE" + (b.est ? "" : ", HEIGHT AND FLOORS") + " · OPENSTREETMAP") +
        (b.est ? " · HEIGHT ESTIMATED" : "")
      : "NOTHING ON PUBLIC RECORD FOR THIS SPOT · PLACEHOLDER SHAPE";
  var S = [
    {
      title: name,
      sub: b.real ? "THE BUILDING AS IT IS ON THE PUBLIC RECORD" : "NO PUBLIC RECORD FOUND HERE",
      sub2: src,
      facts: b.real ? insFacts(b.tags, b) : null,
      fov: size * 1.5,
      bg: [0.03, 0.035, 0.045],
      cam: {
        t: [0, H * 0.45, 0],
        d: [size * 1.9, size * 1.25],
        yaw: [0.9, 0.4],
        pit: [0.42, 0.3],
        f: [0, H * 0.5, 0]
      },
      build: function () {
        var M = insMesh();
        insGround(M, size * 3, 0, [0.05, 0.055, 0.065]);
        if (b.parts.length) {
          b.parts.forEach(function (p, k) {
            try {
              insPrism(
                M,
                p.fp,
                p.h0,
                p.h1,
                k % 3 === 0 ? IC.g : k % 3 === 1 ? IC.m : [0.52, 0.53, 0.56],
                0,
                IC.l
              );
            } catch (e) {}
          });
        } else {
          insPrism(M, fp, 0, H, IC.g, 0, IC.l);
          for (i = 1; i < L && i < 80; i++) {
            var y = i * fh;
            fp.forEach(function (a, k) {
              var c = fp[(k + 1) % fp.length],
                dx = c[0] - a[0],
                dz = c[1] - a[1],
                l = Math.hypot(dx, dz) || 1,
                nx = (dz / l) * 0.06,
                nz = (-dx / l) * 0.06;
              [1, -1].forEach(function (s) {
                M.quad(
                  [a[0] + nx * s, y - fh * 0.06, a[1] + nz * s],
                  [c[0] + nx * s, y - fh * 0.06, c[1] + nz * s],
                  [c[0] + nx * s, y + fh * 0.06, c[1] + nz * s],
                  [a[0] + nx * s, y + fh * 0.06, a[1] + nz * s],
                  IC.d
                );
              });
            });
          }
        }
        return [M.done()];
      },
      labels: [
        [fp[0][0], H, fp[0][1], (b.est ? "≈ " : "") + Math.round(H) + " m tall"],
        [fp[Math.floor(fp.length / 2)][0], H * 0.5, fp[Math.floor(fp.length / 2)][1], L + " floors"]
      ]
    },
    {
      title: L + " FLOORS, PULLED APART",
      sub: "EVERY FLOOR PLATE IS CUT FROM THE BUILDING'S REAL OUTLINE",
      sub2: b.rooms.length
        ? "A REAL INDOOR MAP IS ON RECORD · SHOWN NEXT"
        : "THE INTERIOR LAYOUT OF THIS BUILDING IS NOT ON ANY PUBLIC RECORD",
      fov: size * 1.8,
      bg: [0.05, 0.055, 0.065],
      cam: {
        t: [0, shown * fh * 0.95, 0],
        d: [Math.max(size, shown * fh * 2) * 1.9, Math.max(size, shown * fh * 2) * 1.1],
        yaw: [0.3, 0.95],
        pit: [0.36, 0.26],
        f: [0, fh * 1.9 * Math.floor(shown / 2), 0]
      },
      build: function () {
        var M = insMesh(),
          k;
        for (k = 0; k < shown; k++) {
          var y = k * fh * 1.9,
            hi = k === Math.floor(shown / 2);
          insPrism(M, fp, y, y + 0.4, hi ? IC.lime : k % 2 ? IC.g : IC.l, hi ? 0.9 : 0);
        }
        return [M.done()];
      },
      labels: [
        [fp[0][0], fh * 1.9 * Math.floor(shown / 2) + 0.5, fp[0][1], "One floor plate"],
        [
          fp[Math.floor(fp.length / 2)][0],
          fh * 1.9 * (shown - 1) + 1,
          fp[Math.floor(fp.length / 2)][1],
          L > shown ? "Showing " + shown + " of " + L : "Top floor"
        ]
      ]
    }
  ];
  if (b.rooms.length) {
    var named = b.rooms
      .filter(function (r) {
        return r.n;
      })
      .slice(0, 7);
    S.push({
      title: "REAL FLOOR PLAN · LEVEL " + b.lvl,
      sub: b.rooms.length + " ROOMS AND CORRIDORS AS MAPPED INSIDE THIS BUILDING",
      sub2: "INDOOR MAP © OPENSTREETMAP CONTRIBUTORS · MAY BE INCOMPLETE",
      fov: span * 2.4,
      bg: [0.3, 0.31, 0.33],
      cam: {
        t: [0, 1, 0],
        d: [span * 3.3, span * 2.0],
        yaw: [0.7, 0.2],
        pit: [0.85, 0.62],
        f: named.length ? [insCentroid(named[0].fp)[0], 1, insCentroid(named[0].fp)[1]] : [0, 1, 0]
      },
      build: function () {
        var M = insMesh();
        insPrism(M, fp, -0.4, 0, IC.d);
        b.rooms.forEach(function (r, k) {
          try {
            var hi = named.length && r === named[0];
            insPrism(
              M,
              r.fp,
              0,
              r.c ? 0.12 : 0.3,
              hi ? IC.lime : r.c ? IC.m : k % 2 ? IC.g : IC.l,
              hi ? 0.9 : 0
            );
            r.fp.forEach(function (a, q) {
              var c = r.fp[(q + 1) % r.fp.length];
              M.quad(
                [a[0], 0, a[1]],
                [c[0], 0, c[1]],
                [c[0], r.c ? 0.5 : 1.5, c[1]],
                [a[0], r.c ? 0.5 : 1.5, a[1]],
                IC.k
              );
            });
          } catch (e) {}
        });
        return [M.done()];
      },
      labels: named.map(function (r) {
        var c = insCentroid(r.fp);
        return [c[0], 1.8, c[1], r.n.slice(0, 26)];
      })
    });
  }
  S.push({
    title: "REINFORCED CONCRETE",
    sub: "CONCRETE TAKES THE SQUEEZE, A MESH OF STEEL BARS TAKES THE PULL",
    sub2:
      (mat
        ? "RECORDED FACADE MATERIAL: " + String(mat).toUpperCase().replace(/_/g, " ") + " · "
        : "") + "TYPICAL SLAB SECTION · NOT SAMPLED FROM THIS BUILDING",
    fov: 0.55,
    bg: [0.33, 0.34, 0.36],
    cam: {
      t: [0, 0.05, 0],
      d: [0.95, 0.42],
      yaw: [0.5, 0.95],
      pit: [0.42, 0.26],
      f: [0.3, 0.04, 0]
    },
    build: function () {
      var M = insMesh(),
        k,
        s = 7;
      M.box(-0.3, 0.18, -0.09, 0.09, -0.3, 0.18, IC.l);
      for (k = -2; k <= 2; k++) {
        M.cyl(
          [-0.3, 0.04, k * 0.1 - 0.04],
          [0.36, 0.04, k * 0.1 - 0.04],
          [
            [0, 0.008],
            [1, 0.008]
          ],
          8,
          k === 0 ? IC.lime : IC.or,
          k === 0 ? 1 : 0.15
        );
        M.cyl(
          [k * 0.1 - 0.04, 0.056, -0.3],
          [k * 0.1 - 0.04, 0.056, 0.36],
          [
            [0, 0.008],
            [1, 0.008]
          ],
          8,
          IC.or,
          0.15
        );
      }
      for (k = 0; k < 70; k++) {
        s = (s * 16807) % 2147483647;
        var u = s / 2147483647;
        s = (s * 16807) % 2147483647;
        var v = s / 2147483647;
        s = (s * 16807) % 2147483647;
        var w = s / 2147483647;
        M.sph(
          k % 2
            ? [0.18, -0.08 + u * 0.16, -0.29 + v * 0.46]
            : [-0.29 + v * 0.46, -0.08 + u * 0.16, 0.18],
          0.006 + w * 0.012,
          IC.m,
          0,
          4
        );
      }
      return [M.done()];
    },
    labels: [
      [0.34, 0.05, -0.04, "Steel reinforcing bar"],
      [0.18, -0.02, 0.0, "Aggregate"],
      [-0.1, 0.1, -0.1, "Concrete"]
    ]
  });
  var iron = insIronStage();
  iron.sub2 = "TYPICAL · NOT SAMPLED FROM THIS BUILDING · LATTICE CONSTANT 0.287 NM";
  S.push(iron);
  return S;
}
// look the building up on OpenStreetMap: outline, height, floors, mapped building parts and any indoor map
function insBuilding(lat, lon, gh) {
  note("Inspect", "Looking up this building on the public record…");
  INS.geoKeep = true;
  INS.geo = { lat: lat, lon: lon, h: gh || 0, H: 40 };
  var a = lat.toFixed(6) + "," + lon.toFixed(6),
    q =
      "[out:json][timeout:20];way(around:35," +
      a +
      ")[building];out tags geom 12;way(around:140," +
      a +
      ')["building:part"];out tags geom 90;way(around:140,' +
      a +
      ")[indoor];out tags geom 400;",
    gen = function () {
      insOpen(
        insBuildingStages({
          fp: [
            [-20, -14],
            [20, -14],
            [20, 14],
            [-20, 14]
          ],
          h: 48,
          lv: 14,
          n: "Building",
          real: false,
          est: true
        })
      );
    };
  getJSON("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(q), 24000)
    .then(function (j) {
      var k = Math.cos(lat * D),
        best = null,
        bd = 1e9,
        els = ((j && j.elements) || []).filter(function (w) {
          return w.geometry && w.geometry.length >= 4;
        }),
        loc = function (w) {
          return w.geometry.slice(0, -1).map(function (g) {
            return [(g.lon - lon) * 111320 * k, -(g.lat - lat) * 110540];
          });
        };
      els.forEach(function (w) {
        if (!w.tags || !w.tags.building) return;
        var fp = loc(w),
          ins = insIn(fp, 0, 0),
          d = ins
            ? 0
            : Math.min.apply(
                0,
                fp.map(function (p) {
                  return Math.hypot(p[0], p[1]);
                })
              );
        if (d < bd) {
          bd = d;
          best = { w: w, fp: fp };
        }
      });
      if (!best) {
        gen();
        return;
      }
      var t = best.w.tags || {},
        raw = best.fp,
        c0 = insCentroid(raw),
        sh = function (fp) {
          return fp.map(function (p) {
            return [p[0] - c0[0], p[1] - c0[1]];
          });
        },
        thin = function (fp, n) {
          if (fp.length <= n) return fp;
          var s = Math.ceil(fp.length / n);
          return fp.filter(function (p, i) {
            return i % s === 0;
          });
        },
        fp = thin(sh(raw), 90);
      var lv = parseInt(t["building:levels"], 10),
        h = parseFloat(t.height),
        est = false,
        parts = [],
        rooms = [],
        byL = {};
      els.forEach(function (w) {
        var g = w.tags || {};
        if (!g["building:part"] || g["building:part"] === "no" || parts.length >= 70) return;
        var p = loc(w),
          c = insCentroid(p);
        if (!insIn(raw, c[0], c[1])) return;
        var h1 = parseFloat(g.height) || (parseInt(g["building:levels"], 10) || 0) * 3.3,
          h0 = parseFloat(g.min_height) || (parseInt(g["building:min_level"], 10) || 0) * 3.3;
        if (h1 > h0) parts.push({ fp: thin(sh(p), 40), h0: h0, h1: Math.min(900, h1) });
      });
      if (parts.length) {
        var top = Math.max.apply(
          0,
          parts.map(function (p) {
            return p.h1;
          })
        );
        if (!(h > 0) || top > h) h = top;
      }
      if (!(h > 0)) {
        if (lv > 0) h = lv * 3.3;
        else {
          h = 12;
          est = true;
        }
      }
      if (!(lv > 0)) lv = Math.max(1, Math.round(h / 3.3));
      els.forEach(function (w) {
        var g = w.tags || {};
        if (!/^(room|area|corridor)$/.test(g.indoor || "")) return;
        var p = loc(w),
          c = insCentroid(p);
        if (!insIn(raw, c[0], c[1])) return;
        var l = String(g.level != null ? g.level : "0")
          .split(/[;,]/)[0]
          .trim();
        (byL[l] = byL[l] || []).push({
          fp: thin(sh(p), 24),
          n: String(g.name || g.ref || (g.room && g.room !== "yes" ? g.room : "") || "").replace(
            /_/g,
            " "
          ),
          c: g.indoor === "corridor"
        });
      });
      var bl = Object.keys(byL).sort(function (x, y) {
        return byL[y].length - byL[x].length;
      })[0];
      if (bl && byL[bl].length >= 3) rooms = byL[bl].slice(0, 140);
      INS.geo.H = h;
      insOpen(
        insBuildingStages({
          fp: fp,
          h: Math.min(900, h),
          lv: Math.min(200, lv),
          n:
            t.name ||
            t["addr:housename"] ||
            (t["addr:housenumber"] && t["addr:street"]
              ? t["addr:housenumber"] + " " + t["addr:street"]
              : "Building"),
          real: true,
          est: est,
          tags: t,
          parts: parts,
          rooms: rooms,
          lvl: bl || "0"
        })
      );
    })
    .catch(gen);
}
// ----- ships and satellites -----
function insIronStage() {
  return {
    title: "IRON ATOMS 0.248 NM APART",
    sub: "STEEL IS IRON IN A BODY-CENTRED CUBIC LATTICE, WITH A LITTLE CARBON WEDGED BETWEEN",
    sub2: "LATTICE CONSTANT 0.287 NM · ILLUSTRATIVE",
    fov: 2.2e-9,
    bg: [0.5, 0.5, 0.52],
    cam: { t: [0, 0, 0], d: [2.9, 1.6], yaw: [0.3, 0.75], pit: [0.5, 0.38] },
    unit: 1e-9,
    build: function () {
      var M = insMesh();
      this.hp = insLattice(M, "bcc", 0.2866, 8, 4, 8, 0.105, IC.g);
      return [M.done()];
    },
    labels: "atom:One iron atom"
  };
}
function insShipModel(M) {
  var hull = function (z, hw, keel) {
      return [
        [-hw, 9, z],
        [-hw * 0.96, 0, z],
        [-hw * 0.7, -keel, z],
        [hw * 0.7, -keel, z],
        [hw * 0.96, 0, z],
        [hw, 9, z]
      ];
    },
    sec = [
      [-105, 13, 5],
      [-100, 15.5, 7],
      [-60, 16, 8],
      [60, 16, 8],
      [82, 13, 7.5],
      [96, 7, 6],
      [103, 2.5, 3],
      [106, 0.3, 0.5]
    ],
    hr = sec.map(function (s) {
      return hull.apply(0, s);
    }),
    i,
    z,
    k,
    sd = 5,
    rnd = function () {
      sd = (sd * 16807) % 2147483647;
      return sd / 2147483647;
    },
    cc = [IC.or, IC.bl, [0.25, 0.6, 0.36], IC.yel, IC.g, IC.l, IC.teal, IC.red];
  M.loft(hr, [0.16, 0.22, 0.31]);
  for (i = 0; i < hr.length - 1; i++) {
    var A = hr[i],
      B = hr[i + 1];
    M.quad(A[1], A[2], B[2], B[1], [0.5, 0.18, 0.16]);
    M.quad(A[2], A[3], B[3], B[2], [0.5, 0.18, 0.16]);
    M.quad(A[3], A[4], B[4], B[3], [0.5, 0.18, 0.16]);
    M.quad(A[0], A[5], B[5], B[0], IC.m);
  }
  M.box(-13, 13, 9, 30, -98, -80, IC.l);
  M.box(-15, 15, 30, 33, -99, -79, IC.l);
  M.box(-4, 4, 33, 43, -96, -88, IC.m);
  for (z = -74; z < 86; z += 13.6) {
    var hw = z < 56 ? 16 : Math.max(3, 16 - (z - 56) * 0.33),
      nx = Math.floor((hw * 2 - 2) / 2.6),
      x0 = -nx * 1.3;
    for (k = 0; k < nx; k++) {
      var h = 2 + Math.floor(rnd() * 5);
      M.box(
        x0 + k * 2.6 + 0.08,
        x0 + (k + 1) * 2.6 - 0.08,
        9,
        9 + h * 2.7,
        z,
        z + 12.4,
        cc[Math.floor(rnd() * cc.length)]
      );
    }
  }
}
function insProp(M, c, R, hi) {
  M.cyl(
    [c[0], c[1], c[2] - R * 0.25],
    [c[0], c[1], c[2] + R * 0.35],
    [
      [0, R * 0.2],
      [0.7, R * 0.2],
      [1, R * 0.04]
    ],
    12,
    IC.yel
  );
  for (var i = 0; i < 5; i++) {
    (function (an) {
      M.tf(function (p) {
        var cs = Math.cos(an),
          sn = Math.sin(an);
        return [c[0] + p[0] * cs - p[1] * sn, c[1] + p[0] * sn + p[1] * cs, c[2] + p[2]];
      });
      M.loft(
        [
          [
            [R * 0.18, -R * 0.1, -R * 0.1],
            [R * 0.18, R * 0.1, R * 0.1],
            [R * 0.18, R * 0.12, R * 0.12],
            [R * 0.18, -R * 0.08, -R * 0.08]
          ],
          [
            [R * 0.7, -R * 0.34, -R * 0.12],
            [R * 0.7, R * 0.34, R * 0.14],
            [R * 0.7, R * 0.35, R * 0.16],
            [R * 0.7, -R * 0.33, -R * 0.1]
          ],
          [
            [R, -R * 0.12, -R * 0.02],
            [R, R * 0.14, R * 0.06],
            [R, R * 0.14, R * 0.07],
            [R, -R * 0.12, -R * 0.01]
          ]
        ],
        hi ? IC.lime : IC.yel,
        hi ? 0.8 : 0.2
      );
    })((i * Math.PI * 2) / 5);
  }
  M.tf(null);
}
function insShipStages(s) {
  var name = String((s && s.n) || "VESSEL")
      .toUpperCase()
      .slice(0, 30),
    ill = "ILLUSTRATIVE GENERIC CONTAINER SHIP · NOT THIS VESSEL'S ACTUAL DRAWINGS";
  return [
    {
      title: name,
      sub: "FROM THE WHOLE SHIP DOWN TO A SINGLE ATOM",
      sub2: ill,
      fov: 240,
      bg: [0.03, 0.035, 0.045],
      cam: { t: [0, 10, 0], d: [250, 170], yaw: [2.3, 2.8], pit: [0.3, 0.22], f: [0, 2, -95] },
      build: function () {
        var M = insMesh();
        M.quad([-900, 0, -900], [900, 0, -900], [900, 0, 900], [-900, 0, 900], [0.04, 0.07, 0.1]);
        insShipModel(M);
        return [M.done()];
      },
      labels: [
        [0, 45, -92, "Bridge"],
        [0, 26, 20, "Container stacks"],
        [0, 10, 104, "Bow"],
        [0, 2, -106, "Stern"]
      ]
    },
    {
      title: "THE ENGINE ROOM",
      sub: "ONE SLOW TWO-STROKE DIESEL THE SIZE OF A HOUSE TURNS A SINGLE SHAFT",
      sub2: "CUTAWAY · " + ill,
      fov: 42,
      bg: [0.07, 0.075, 0.085],
      cam: { t: [0, 5, -4], d: [46, 28], yaw: [2.2, 2.75], pit: [0.3, 0.22], f: [0, 2.2, -24] },
      build: function () {
        var M = insMesh(),
          P = insMesh(),
          i;
        M.box(-9, 9, -0.4, 0, -22, 14, IC.d);
        M.box(-3, 3, 0, 7, -4, 10, IC.g);
        M.box(-3.4, 3.4, 7, 7.6, -4.2, 10.2, IC.m);
        for (i = 0; i < 8; i++) {
          M.cyl(
            [0, 7.6, -3 + i * 1.75],
            [0, 10, -3 + i * 1.75],
            [
              [0, 0.75],
              [0.8, 0.75],
              [1, 0.45]
            ],
            10,
            IC.l
          );
          M.cyl(
            [2.2, 6, -3 + i * 1.75],
            [3.9, 8.4, -3 + i * 1.75],
            [
              [0, 0.18],
              [1, 0.18]
            ],
            6,
            IC.or,
            0.2
          );
        }
        M.cyl(
          [3.9, 8.4, -3.6],
          [3.9, 8.4, 9.8],
          [
            [0, 0.5],
            [1, 0.5]
          ],
          10,
          IC.or,
          0.2
        );
        M.cyl(
          [-4.6, 6.5, 4],
          [-4.6, 6.5, 7.5],
          [
            [0, 1.2],
            [1, 1.2]
          ],
          14,
          IC.m
        );
        M.cyl(
          [0, 2.2, -4],
          [0, 2.2, -22.6],
          [
            [0, 0.45],
            [1, 0.45]
          ],
          10,
          IC.l
        );
        [-9, -14, -19].forEach(function (z) {
          M.box(-0.9, 0.9, 0, 2.2, z - 0.5, z + 0.5, IC.m);
        });
        for (i = 0; i < 7; i++) {
          var z = -21 + i * 5.8;
          M.box(-9.3, -9, 0, 11, z, z + 0.4, IC.m);
          M.box(-9.3, 9.3, -0.8, -0.4, z, z + 0.4, IC.m);
        }
        insProp(P, [0, 2.2, -24], 3.4, true);
        return [M.done(), P.done({ w: 1.1 })];
      },
      labels: [
        [0, 10.4, 3, "Cylinders"],
        [3.9, 9.2, 3, "Exhaust manifold"],
        [-4.6, 8, 5.5, "Turbocharger"],
        [0, 3, -13, "Propeller shaft"],
        [0, 6.2, -24, "Propeller"]
      ]
    },
    {
      title: "THE PROPELLER",
      sub: "FIVE BRONZE BLADES, EACH A TWISTED WING, PUSH THE WHOLE SHIP",
      sub2: ill,
      fov: 11,
      bg: [0.07, 0.075, 0.085],
      cam: { t: [0, 0, 0], d: [13, 7.5], yaw: [0.5, 1.0], pit: [0.18, 0.1], f: [2.6, 0.4, 0.1] },
      build: function () {
        var P = insMesh(),
          M = insMesh();
        insProp(P, [0, 0, 0], 3.4, false);
        M.cyl(
          [0, 0, -0.8],
          [0, 0, -7],
          [
            [0, 0.45],
            [1, 0.45]
          ],
          10,
          IC.l
        );
        M.box(-0.2, 0.2, -4.5, 4.5, 2.4, 5.2, IC.m);
        return [P.done({ w: 0.7 }), M.done()];
      },
      labels: [
        [0, 3.5, 0, "Blade tip"],
        [0, 0.3, 1.3, "Hub"],
        [0, 4.6, 3.8, "Rudder"]
      ]
    },
    {
      title: "HULL PLATE AND WELD",
      sub: "STEEL PLATES A FEW CENTIMETRES THICK, STIFFENED BEHIND AND WELDED EDGE TO EDGE",
      sub2: "GENERIC SHELL PLATING · ILLUSTRATIVE",
      fov: 3.2,
      bg: [0.33, 0.34, 0.36],
      cam: { t: [0, 0.3, 0], d: [4.6, 2.6], yaw: [0.6, 1.05], pit: [0.5, 0.34], f: [0, 0.03, 0] },
      build: function () {
        var M = insMesh(),
          i;
        M.box(-2, -0.012, -0.04, 0, -1.4, 1.4, IC.g);
        M.box(0.012, 2, -0.04, 0, -1.4, 1.4, IC.l);
        M.box(-0.02, 0.02, -0.045, 0.012, -1.4, 1.4, IC.lime, 1);
        for (i = -2; i <= 2; i++) {
          if (i === 0) continue;
          M.box(i * 0.8 - 0.01, i * 0.8 + 0.01, 0, 0.3, -1.4, 1.4, IC.m);
          M.box(i * 0.8 - 0.09, i * 0.8 + 0.09, 0.3, 0.32, -1.4, 1.4, IC.m);
        }
        M.box(-2, 2, 0, 0.42, -0.012, 0.012, IC.d);
        M.box(-2, 2, 0.42, 0.44, -0.12, 0.12, IC.d);
        return [M.done()];
      },
      labels: [
        [0, 0.06, 0.6, "Weld seam"],
        [0.8, 0.36, 0.5, "Stiffener"],
        [1.4, 0.02, -0.9, "Shell plate"],
        [-1, 0.46, 0, "Frame"]
      ]
    },
    {
      title: "STEEL GRAINS",
      sub: "THE PLATE IS A MOSAIC OF CRYSTALS, EACH A FEW HUNDREDTHS OF A MILLIMETRE ACROSS",
      sub2: "GENERIC FERRITE GRAIN STRUCTURE · ILLUSTRATIVE",
      fov: 3.2e-4,
      bg: [0.45, 0.34, 0.34],
      cam: {
        t: [0, 0, 0],
        d: [7.5, 3.6],
        yaw: [0.55, 0.95],
        pit: [0.62, 0.45],
        f: [0.3, 0.3, 0.3]
      },
      unit: 1e-5,
      build: function () {
        var M = insMesh(),
          x,
          z,
          sd = 11,
          r = function () {
            sd = (sd * 16807) % 2147483647;
            return sd / 2147483647;
          };
        for (x = -7; x < 7; x++)
          for (z = -7; z < 7; z++) {
            var hi = x === 0 && z === 0,
              cx = x * 0.6 + (z % 2 ? 0.3 : 0) + 0.3,
              cz = z * 0.56 + 0.3,
              h = 0.1 + r() * 0.28,
              sh = 0.42 + r() * 0.3;
            M.cyl(
              [cx, -0.8, cz],
              [cx, -0.4 + h, cz],
              [
                [0, 0.33],
                [1, 0.33]
              ],
              6,
              hi ? IC.lime : [sh, sh, sh + 0.03],
              hi ? 1 : 0
            );
          }
        return [M.done()];
      },
      labels: [
        [0.3, 0.1, 0.3, "One grain"],
        [-1.5, -0.1, 1.4, "Grain boundary"]
      ]
    },
    insIronStage()
  ];
}
function insSatModel(M, hi) {
  M.box(-1, 1, -1, 1, -1.4, 1.4, [0.79, 0.64, 0.29]);
  M.box(-0.7, 0.7, -0.7, 0.7, 1.4, 1.9, IC.l);
  [-1, 1].forEach(function (sx) {
    M.box(Math.min(sx, sx * 1.8), Math.max(sx, sx * 1.8), -0.08, 0.08, -0.08, 0.08, IC.l);
    for (var k = 0; k < 4; k++) {
      var x0 = sx * (1.8 + k * 1.85),
        x1 = sx * (1.8 + k * 1.85 + 1.75),
        h = hi && sx > 0 && k === 1;
      M.box(
        Math.min(x0, x1),
        Math.max(x0, x1),
        -0.04,
        0.04,
        -1.3,
        1.3,
        h ? IC.lime : k % 2 ? [0.14, 0.31, 0.62] : [0.11, 0.25, 0.56],
        h ? 0.9 : 0
      );
    }
  });
  M.cyl(
    [0, 1.05, 0],
    [0, 1.75, 0],
    [
      [0, 0.15],
      [1, 1.1]
    ],
    16,
    IC.l,
    0,
    false
  );
  M.box(-0.05, 0.05, 1, 2.2, -0.05, 0.05, IC.m);
  M.cyl(
    [0, -1, 0.6],
    [0, -1.9, 0.6],
    [
      [0, 0.12],
      [1, 0.3]
    ],
    10,
    IC.m
  );
}
function insSatStages(s) {
  var name = String((s && s.n) || "SATELLITE")
      .toUpperCase()
      .slice(0, 30),
    ill = "ILLUSTRATIVE GENERIC SATELLITE · NOT THIS SPACECRAFT'S ACTUAL DESIGN";
  return [
    {
      title: name,
      sub: "FROM THE WHOLE SPACECRAFT DOWN TO A SINGLE ATOM",
      sub2: ill + (s && s.alt ? " · ORBIT ≈ " + Math.round(s.alt) + " KM" : ""),
      fov: 19,
      bg: [0.015, 0.018, 0.028],
      cam: { t: [0, 0, 0], d: [24, 14], yaw: [0.5, 1.1], pit: [0.42, 0.3], f: [4.5, 0, 0] },
      build: function () {
        var M = insMesh();
        insSatModel(M, true);
        return [M.done()];
      },
      labels: [
        [0, 2.3, 0, "Antenna dish"],
        [0, 0, 1.95, "Instrument bay"],
        [-5.5, 0.1, 0, "Solar wing"],
        [4.5, 0.1, 0, "Solar panel"],
        [0, -1.95, 0.6, "Thruster"]
      ]
    },
    {
      title: "ONE SOLAR PANEL",
      sub: "HUNDREDS OF CELLS WIRED IN STRINGS TURN SUNLIGHT INTO THE CRAFT'S ONLY POWER",
      sub2: ill,
      fov: 2.6,
      bg: [0.03, 0.035, 0.045],
      cam: {
        t: [0, 0, 0],
        d: [3.6, 2.0],
        yaw: [0.4, 0.85],
        pit: [0.7, 0.5],
        f: [0.065, 0.02, 0.105]
      },
      build: function () {
        var M = insMesh(),
          x,
          z;
        M.box(-0.9, 0.9, -0.03, 0, -1.32, 1.32, IC.m);
        for (x = -6; x < 6; x++)
          for (z = -6; z < 6; z++) {
            var hi = x === 0 && z === 0;
            M.box(
              x * 0.145 + 0.008,
              x * 0.145 + 0.137,
              0,
              0.006,
              z * 0.215 + 0.008,
              z * 0.215 + 0.207,
              hi ? IC.lime : [0.1, 0.22 + ((x + z) & 1) * 0.04, 0.55],
              hi ? 1 : 0
            );
          }
        return [M.done()];
      },
      labels: [
        [0.07, 0.03, 0.1, "One solar cell"],
        [-0.85, 0.01, -1.2, "Honeycomb substrate"]
      ]
    },
    {
      title: "ONE SOLAR CELL",
      sub: "HAIR-THIN SILVER FINGERS COLLECT THE CURRENT WITHOUT SHADING THE CELL",
      sub2: "GENERIC SPACE-GRADE CELL · ILLUSTRATIVE",
      fov: 0.11,
      bg: [0.33, 0.34, 0.36],
      cam: {
        t: [0, 0, 0],
        d: [0.15, 0.085],
        yaw: [0.35, 0.8],
        pit: [0.72, 0.5],
        f: [0, 0.002, 0]
      },
      build: function () {
        var M = insMesh(),
          i;
        M.box(-0.04, 0.04, -0.002, 0, -0.02, 0.02, [0.1, 0.2, 0.5]);
        for (i = 0; i < 32; i++) {
          var x = -0.039 + i * 0.00252;
          M.box(
            x,
            x + 0.0004,
            0,
            0.0005,
            -0.019,
            0.019,
            i === 16 ? IC.lime : IC.l,
            i === 16 ? 1 : 0
          );
        }
        M.box(-0.04, 0.04, 0, 0.0007, -0.0195, -0.0178, IC.l);
        M.box(-0.04, 0.04, -0.004, -0.002, -0.02, 0.02, IC.m);
        return [M.done()];
      },
      labels: [
        [0.0015, 0.002, 0, "Grid finger"],
        [0, 0.002, -0.0186, "Busbar"],
        [-0.03, 0.001, 0.012, "Cell surface"]
      ]
    },
    {
      title: "LAYERS OF THE CELL",
      sub: "THREE STACKED JUNCTIONS EACH CATCH A DIFFERENT COLOUR OF SUNLIGHT",
      sub2: "GENERIC TRIPLE-JUNCTION CELL · PULLED APART · NOT TO SCALE",
      fov: 2.2e-4,
      bg: [0.45, 0.34, 0.34],
      cam: { t: [0, 1.5, 0], d: [8.5, 4.6], yaw: [0.5, 0.95], pit: [0.3, 0.2], f: [0, 2.0, 0] },
      unit: 1e-5,
      build: function () {
        var M = insMesh();
        [
          [IC.g, 0.3, 0],
          [IC.red, 0.5, 0],
          [IC.or, 0.2, 0],
          [IC.lime, 0.2, 1],
          [IC.bl, 0.14, 0],
          [IC.teal, 0.06, 0],
          [IC.l, 0.4, 0]
        ].forEach(function (l, i) {
          var y = i * 0.52;
          M.box(-1.6, 1.6, y, y + l[1], -1.6, 1.6, l[0], l[2]);
        });
        return [M.done()];
      },
      labels: [
        [1.6, 3.35, 1.6, "Cover glass"],
        [1.6, 2.65, 1.6, "Anti-reflective coating"],
        [1.6, 2.15, 1.6, "Top junction"],
        [1.6, 1.68, 1.6, "Middle junction: gallium arsenide"],
        [1.6, 1.14, 1.6, "Bottom junction"],
        [1.6, 0.75, 1.6, "Substrate"],
        [1.6, 0.15, 1.6, "Back contact"]
      ]
    },
    {
      title: "ATOMS 0.245 NM APART",
      sub: "GALLIUM AND ARSENIC ALTERNATE, EACH BONDED TO FOUR OF THE OTHER",
      sub2: "GALLIUM ARSENIDE · LATTICE CONSTANT 0.565 NM · ILLUSTRATIVE",
      fov: 3.6e-9,
      bg: [0.5, 0.5, 0.52],
      cam: { t: [0, 0, 0], d: [4.6, 2.6], yaw: [0.3, 0.75], pit: [0.5, 0.38] },
      unit: 1e-9,
      build: function () {
        var M = insMesh();
        this.hp = insLattice(M, "zb", 0.565, 5, 3, 5, 0.1, IC.g);
        return [M.done()];
      },
      labels: "atom:One gallium atom"
    }
  ];
}
function insObj(o) {
  if (!o) return false;
  INS.geo = null;
  if (o.kind === "plane") {
    note("Inspect", "Looking up this aircraft…");
    var go = function (ac) {
      var st = insPlaneStages(o);
      if (ac) {
        var F = [],
          add = function (k, v) {
            if (v) F.push([k, String(v).slice(0, 40)]);
          };
        add("TYPE", ac.type);
        add("MAKER", ac.manufacturer);
        add("ICAO TYPE", ac.icao_type);
        add("REGISTRATION", ac.registration);
        add("OPERATOR", ac.registered_owner);
        add("FLAG", ac.registered_owner_country_name);
        add("CALLSIGN", o.n);
        st[0].facts = F;
        st[0].sub = "THE AIRCRAFT AS IT IS ON THE PUBLIC REGISTER";
        st[0].sub2 =
          "REAL AIRCRAFT RECORD · 3D MODEL IS A GENERIC AIRLINER · MAKERS DO NOT PUBLISH THEIR DRAWINGS";
      }
      insOpen(st);
    };
    getJSON("https://api.adsbdb.com/v0/aircraft/" + encodeURIComponent(o.id), 7000)
      .then(function (j) {
        go(j && j.response && j.response.aircraft);
      })
      .catch(function () {
        go(null);
      });
    return true;
  }
  if (o.kind === "ship") {
    insOpen(insShipStages(o));
    return true;
  }
  if (o.kind === "sat") {
    insOpen(insSatStages(o));
    return true;
  }
  return false;
}
// ----- renderer -----
function insGL() {
  if (INS.gl) return true;
  var cv = $("inscv"),
    gl =
      cv.getContext("webgl", { antialias: true, alpha: false }) ||
      cv.getContext("experimental-webgl");
  if (!gl) return false;
  var sh = function (t, s) {
      var o = gl.createShader(t);
      gl.shaderSource(o, s);
      gl.compileShader(o);
      return o;
    },
    pr = gl.createProgram();
  gl.attachShader(
    pr,
    sh(
      gl.VERTEX_SHADER,
      "attribute vec3 aP;attribute vec3 aN;attribute vec3 aC;attribute float aE;uniform mat4 uVP;uniform mat4 uM;varying vec3 vN;varying vec3 vC;varying float vE;varying float vD;void main(){vec4 w=uM*vec4(aP,1.0);vN=mat3(uM)*aN;vC=aC;vE=aE;gl_Position=uVP*w;vD=gl_Position.w;}"
    )
  );
  gl.attachShader(
    pr,
    sh(
      gl.FRAGMENT_SHADER,
      "precision mediump float;varying vec3 vN;varying vec3 vC;varying float vE;varying float vD;uniform vec3 uBg;uniform vec2 uFog;uniform float uFade;uniform float uT;void main(){vec3 n=normalize(vN);float k=abs(dot(n,normalize(vec3(0.45,0.8,0.4))));float h=0.5+0.5*n.y;vec3 c=vC*(0.28+0.62*k+0.16*h);float p=0.75+0.25*sin(uT*3.0);c=mix(c,c*1.25+vC*0.35+vec3(0.06,0.1,0.0),vE*p);c=mix(c,uBg,clamp((vD-uFog.x)/(uFog.y-uFog.x),0.0,1.0)*(1.0-vE*0.6));gl_FragColor=vec4(mix(c,uBg,uFade),1.0);}"
    )
  );
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return false;
  gl.useProgram(pr);
  INS.gl = gl;
  INS.pr = pr;
  INS.u = {};
  ["uVP", "uM", "uBg", "uFog", "uFade", "uT"].forEach(function (n) {
    INS.u[n] = gl.getUniformLocation(pr, n);
  });
  INS.a = ["aP", "aN", "aC", "aE"].map(function (n) {
    return gl.getAttribLocation(pr, n);
  });
  gl.enable(gl.DEPTH_TEST);
  return true;
}
function insPersp(f, a, n, r) {
  var t = 1 / Math.tan(f / 2);
  return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (r + n) / (n - r), -1, 0, 0, (2 * r * n) / (n - r), 0];
}
function insLook(e, c) {
  var z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]],
    l = Math.hypot(z[0], z[1], z[2]) || 1;
  z = [z[0] / l, z[1] / l, z[2] / l];
  var x = [z[2], 0, -z[0]];
  l = Math.hypot(x[0], x[2]) || 1;
  x = [x[0] / l, 0, x[2] / l];
  var y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]),
    -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]),
    -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]),
    1
  ];
}
function insMul(a, b) {
  var o = [],
    i,
    j;
  for (i = 0; i < 4; i++)
    for (j = 0; j < 4; j++)
      o[i * 4 + j] =
        b[i * 4] * a[j] +
        b[i * 4 + 1] * a[4 + j] +
        b[i * 4 + 2] * a[8 + j] +
        b[i * 4 + 3] * a[12 + j];
  return o;
}
function insFmt(m) {
  var a = [
      [1, "m"],
      [1e-2, "cm"],
      [1e-3, "mm"],
      [1e-6, "µm"],
      [1e-9, "nm"]
    ],
    i;
  for (i = 0; i < a.length; i++)
    if (m >= a[i][0] * 0.95 || i === a.length - 1) {
      var v = m / a[i][0];
      return (
        "≈ " + (v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + " " + a[i][1]
      );
    }
}
function insLoad(i) {
  var gl = INS.gl,
    st = INS.st[i];
  INS.bufs.forEach(function (b) {
    gl.deleteBuffer(b.b);
  });
  INS.bufs = st.build().map(function (m) {
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, m.v, gl.STATIC_DRAW);
    return { b: b, n: m.n, spin: m.spin };
  });
  var L = st.labels;
  if (typeof L === "string") {
    var hp = st.hp || [0, 0, 0];
    L = [[hp[0], hp[1] + 0.16, hp[2], L.slice(5)]];
  }
  st.L = L || [];
  $("inslab").innerHTML = st.L.map(function (l) {
    return '<div class="inl">' + esc(l[3]) + "</div>";
  }).join("");
  var fx = $("insfacts");
  if (fx) {
    fx.innerHTML =
      st.facts && st.facts.length
        ? st.facts
            .map(function (f) {
              return "<div><span>" + esc(f[0]) + "</span><b>" + esc(f[1]) + "</b></div>";
            })
            .join("")
        : "";
    fx.style.display = st.facts && st.facts.length ? "block" : "none";
  }
  var rb = $("insreal");
  if (rb) rb.style.display = INS.geo && T4.on ? "" : "none";
  $("instt").textContent = st.title;
  $("inss1").textContent = st.sub;
  $("inss2").textContent = st.sub2 || "";
  $("insdots").innerHTML = INS.st
    .map(function (s, k) {
      return '<i class="' + (k === i ? "on" : "") + '" data-ins="g' + k + '"></i>';
    })
    .join("");
  var c = $("inscap");
  c.classList.remove("in");
  void c.offsetWidth;
  c.classList.add("in");
}
function insGo(i) {
  var n = INS.st.length;
  INS.i = ((i % n) + n) % n;
  INS.t = 0;
  INS.yaw = 0;
  insLoad(INS.i);
}
function insFrame(now) {
  if (!INS.on) return;
  INS.raf = requestAnimationFrame(insFrame);
  var gl = INS.gl,
    cv = $("inscv"),
    dt = Math.min(0.05, (now - (INS.last || now)) / 1000);
  INS.last = now;
  if (INS.play && !INS.drag) INS.t += dt;
  if (INS.t >= INS.DUR) {
    insGo(INS.i + 1);
  }
  var dpr = Math.min(2, window.devicePixelRatio || 1),
    w = Math.round(cv.clientWidth * dpr),
    h = Math.round(cv.clientHeight * dpr);
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  gl.viewport(0, 0, w, h);
  var st = INS.st[INS.i],
    nx = INS.st[(INS.i + 1) % INS.st.length],
    c = st.cam,
    u = INS.t / INS.DUR,
    e = u * u * (3 - 2 * u),
    pf = w / h < 0.8 ? 1.75 : 1.15,
    d = pf * c.d[0] * Math.pow(c.d[1] / c.d[0], e),
    yaw = c.yaw[0] + (c.yaw[1] - c.yaw[0]) * e + INS.yaw,
    pit = c.pit[0] + (c.pit[1] - c.pit[0]) * e,
    t = c.t.slice(),
    fade = 0,
    k = 0;
  if (u < 0.09) fade = 1 - u / 0.09;
  if (u > 0.86) {
    k = (u - 0.86) / 0.14;
    k = k * k;
    var f = c.f || c.t;
    t = [t[0] + (f[0] - t[0]) * k, t[1] + (f[1] - t[1]) * k, t[2] + (f[2] - t[2]) * k];
    d *= 1 - 0.8 * k;
    fade = Math.max(fade, k);
  }
  var eye = [
      t[0] + d * Math.cos(pit) * Math.sin(yaw),
      t[1] + d * Math.sin(pit),
      t[2] + d * Math.cos(pit) * Math.cos(yaw)
    ],
    VP = insMul(insPersp(0.66, w / h, d * 0.03, d * 40), insLook(eye, t)),
    bg = st.bg;
  if (w / h < 0.8) for (var ci = 0; ci < 4; ci++) VP[ci * 4 + 1] += 0.2 * (1 - k) * VP[ci * 4 + 3];
  gl.clearColor(bg[0], bg[1], bg[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(INS.u.uVP, false, new Float32Array(VP));
  gl.uniform3f(INS.u.uBg, bg[0], bg[1], bg[2]);
  gl.uniform2f(INS.u.uFog, d * 1.15, d * (st.unit ? 4.2 : 7));
  gl.uniform1f(INS.u.uFade, fade);
  gl.uniform1f(INS.u.uT, now / 1000);
  INS.bufs.forEach(function (b) {
    var a = b.spin ? (b.spin.w * now) / 1000 : 0,
      cs = Math.cos(a),
      sn = Math.sin(a);
    gl.uniformMatrix4fv(
      INS.u.uM,
      false,
      new Float32Array([cs, sn, 0, 0, -sn, cs, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, b.b);
    [
      [3, 0],
      [3, 12],
      [3, 24],
      [1, 36]
    ].forEach(function (s, q) {
      gl.enableVertexAttribArray(INS.a[q]);
      gl.vertexAttribPointer(INS.a[q], s[0], gl.FLOAT, false, 40, s[1]);
    });
    gl.drawArrays(gl.TRIANGLES, 0, b.n);
  });
  // labels
  var els = $("inslab").children,
    i,
    W2 = cv.clientWidth,
    H2 = cv.clientHeight;
  for (i = 0; i < els.length; i++) {
    var p = st.L[i],
      x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12],
      y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13],
      q = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15],
      sx = ((x / q) * 0.5 + 0.5) * W2,
      sy = (1 - ((y / q) * 0.5 + 0.5)) * H2,
      ok = q > 0 && sx > 20 && sx < W2 - 20 && sy > 70 && sy < H2 - 190;
    els[i].style.opacity = ok ? Math.max(0, 1 - fade * 1.6) * (u > 0.16 ? 1 : 0) : 0;
    els[i].style.transform =
      "translate(" + Math.round(sx) + "px," + Math.round(sy) + "px) translate(-50%,-130%)";
  }
  // field of view ruler
  var fov = (st.fov * d) / (c.d[0] * pf);
  if (u > 0.86) {
    fov = Math.exp(Math.log(fov) + (Math.log(nx.fov) - Math.log(fov)) * Math.min(1, k * 1.2));
  }
  var hi = Math.log(INS.st[0].fov * 1.2),
    lo = Math.log(INS.st[INS.st.length - 1].fov * 0.4),
    pos = Math.max(0, Math.min(1, (hi - Math.log(fov)) / (hi - lo)));
  $("insfv").textContent = insFmt(fov);
  $("insmk").style.top = pos * 100 + "%";
}
function insOpen(stages) {
  if (!stages || !stages.length) return;
  if (SET.real !== false) {
    var keep = stages.filter(function (x) {
      return !/ILLUSTRATIVE|TYPICAL|GENERIC|NOT SAMPLED/i.test(
        String(x.sub2 || "") + String(x.sub || "")
      );
    });
    stages = keep.length ? keep : stages.slice(0, 1);
  }
  INS.geoKeep = false;
  if (!$("ins")) {
    var d = document.createElement("div");
    d.id = "ins";
    d.innerHTML =
      '<canvas id="inscv"></canvas><div id="inslab"></div><div id="insbadge" class="mono">◆ INSPECT</div><div id="insfacts" class="mono"></div><div id="insrule"><span class="mono">FIELD OF VIEW</span><div id="instk"></div><div id="insmk"><b id="insfv" class="mono"></b></div></div><div id="inscap"><i></i><h2 id="instt"></h2><p id="inss1"></p><p id="inss2"></p></div><div id="insbar"><div id="insdots"></div><button data-ins="real" id="insreal" aria-label="See the real building in 3D" style="width:auto;padding:0 10px;font-size:10px;letter-spacing:.06em;display:none">REAL 3D</button><button data-ins="prev" aria-label="Previous">◀</button><button data-ins="play" id="insplay" aria-label="Pause">❚❚</button><button data-ins="next" aria-label="Next">▶</button><button data-ins="x" aria-label="Close">✕</button></div>';
    document.body.appendChild(d);
    var tk = "";
    for (var i = 0; i <= 40; i++)
      tk += '<i style="top:' + i * 2.5 + '%"' + (i % 5 ? "" : ' class="b"') + "></i>";
    $("instk").innerHTML = tk;
    var cv = $("inscv");
    cv.addEventListener("pointerdown", function (e) {
      INS.drag = { x: e.clientX, y0: INS.yaw, m: false };
    });
    window.addEventListener("pointermove", function (e) {
      if (!INS.drag) return;
      var dx = e.clientX - INS.drag.x;
      if (Math.abs(dx) > 6) INS.drag.m = true;
      INS.yaw = INS.drag.y0 - dx * 0.008;
    });
    window.addEventListener("pointerup", function () {
      if (!INS.drag) return;
      if (!INS.drag.m) insPlay(!INS.play);
      INS.drag = null;
    });
  }
  if (!insGL()) {
    note("Inspect", "This phone couldn't start the 3D viewer.");
    return;
  }
  INS.st = stages;
  INS.on = true;
  $("ins").style.display = "block";
  insPlay(true);
  insGo(0);
  INS.last = 0;
  cancelAnimationFrame(INS.raf);
  INS.raf = requestAnimationFrame(insFrame);
}
function insPlay(p) {
  INS.play = p;
  var b = $("insplay");
  if (b) b.textContent = p ? "❚❚" : "▶";
}
function insClose() {
  INS.on = false;
  INS.geo = INS.geoKeep ? INS.geo : null;
  cancelAnimationFrame(INS.raf);
  var e = $("ins");
  if (e) e.style.display = "none";
}
function insPlane(p) {
  insOpen(insPlaneStages(p));
}
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-ins]"),
    k;
  if (b) {
    k = b.getAttribute("data-ins");
    if (k === "real") {
      var g0 = INS.geo;
      insClose();
      if (g0 && T4.on) t4Orbit(g0.lat, g0.lon, g0.h, g0.H);
    } else if (k === "x") insClose();
    else if (k === "prev") insGo(INS.t > 1.2 ? INS.i : INS.i - 1);
    else if (k === "next") insGo(INS.i + 1);
    else if (k === "play") insPlay(!INS.play);
    else if (k.charAt(0) === "g") insGo(+k.slice(1));
    return;
  }
  b = e.target.closest("[data-insp]");
  if (!b) return;
  k = b.getAttribute("data-insp");
  if (insObj(selected)) return;
  if (T4.on && T4.v) {
    T4.pick = true;
    note("Inspect", "Now tap any building.");
  } else
    insBuilding(
      selected && selected.lat != null ? selected.lat : rot.lat,
      selected && selected.lon != null ? selected.lon : rot.lon
    );
});
