/*
 * Visual positioning (VPS): the phone's camera view is matched against Google's Street View imagery (ARCore
 * Geospatial API, in VpsActivity.java) to find exactly where the phone is and which way it faces, often to a
 * metre or two where GPS is off by tens of metres between tall buildings.
 *
 *   📍 Pinpoint me     Emergency mode: hold the phone up; "Use this position" makes the precise fix the one
 *                      the app sends in check-ins, help messages and routes
 *   ⬆ AR arrows        while a route is followed: a large arrow over the camera view points the way
 *   ◎ What's around me labels over the camera view for live cameras, safe places and the destination
 *
 * While the screen is open, every good fix (±8 m or better) also comes back as a vpsFix event. It only locates
 * this phone's own live camera view; no picture is kept or sent anywhere by the app.
 */
var VPS = { fix: null, heard: false };

// What the camera screen should name: live cameras within 2 km and the safe places Emergency mode found.
function vpsPoints(lat, lon) {
  var out = [];
  visLive.forEach(function (c) {
    if (out.length < 120 && hav(lat, lon, c.lat, c.lon) <= 2)
      out.push({ lat: c.lat, lon: c.lon, name: "📷 " + String(c.n || "Camera").slice(0, 40) });
  });
  var S = typeof EMG === "object" && EMG.sit;
  ((S && S.places) || []).slice(0, 40).forEach(function (p) {
    out.push({ lat: p.lat, lon: p.lon, name: "⛨ " + String(p.n || "Safe place").slice(0, 40) });
  });
  return out;
}

// A route's points thinned to at most 400, keeping the first and last.
function vpsThin(pts) {
  if (!pts || pts.length < 2) return null;
  var step = Math.max(1, Math.ceil(pts.length / 400)),
    out = [];
  for (var i = 0; i < pts.length; i += step) out.push([+pts[i][0], +pts[i][1]]);
  var last = pts[pts.length - 1];
  if (out[out.length - 1][0] !== last[0] || out[out.length - 1][1] !== last[1])
    out.push([+last[0], +last[1]]);
  return out;
}

function vpsWhere() {
  if (typeof DRV === "object" && DRV.pos) return [DRV.pos.lat, DRV.pos.lon];
  if (typeof EMG === "object" && EMG.pos) return [EMG.pos.lat, EMG.pos.lon];
  return [rot.lat, rot.lon];
}

function vpsOpen(mode) {
  var p = natv();
  if (!p) {
    note(
      "Visual positioning",
      "This uses the phone's camera and Google's Street View imagery, so it works in the Android app only."
    );
    return;
  }
  if (!VPS.heard && p.addListener) {
    VPS.heard = true;
    try {
      p.addListener("vpsFix", vpsFix);
    } catch (x) {}
  }
  var here = vpsWhere(),
    R = typeof DRV === "object" && DRV.R,
    data = { mode: mode, points: vpsPoints(here[0], here[1]) };
  if (R && R.b && R.b.lat != null) {
    data.route = vpsThin(R.pts);
    data.target = { lat: R.b.lat, lon: R.b.lon, name: R.b.name || "Destination" };
  } else if (mode === "route") {
    note("AR arrows", "Start a route first: Emergency mode → Start route, or Drive.");
    return;
  }
  natCall("vpsOpen", data);
}

function vpsFix(f) {
  if (!f || !isFinite(f.lat) || !isFinite(f.lon)) return;
  VPS.fix = { lat: +f.lat, lon: +f.lon, acc: +f.acc, hdg: +f.heading, t: Date.now() };
  if (typeof EMG === "object" && EMG.on) {
    emgFix({
      vps: true,
      coords: {
        latitude: VPS.fix.lat,
        longitude: VPS.fix.lon,
        accuracy: VPS.fix.acc,
        heading: VPS.fix.hdg
      }
    });
    emgDraw();
  }
  if (f.done)
    note(
      "Visual positioning",
      "Position pinned to ±" +
        Math.max(1, Math.round(VPS.fix.acc)) +
        " m, facing " +
        Math.round(VPS.fix.hdg) +
        "°. It is used for check-ins, help messages and routes for the next two minutes."
    );
}

// While a visual fix is fresh, a rougher GPS reading near it does not replace it.
function vpsKeeps(lat, lon, acc) {
  var v = VPS.fix;
  return !!(
    v &&
    Date.now() - v.t < 120000 &&
    (acc || 99) > v.acc &&
    hav(lat, lon, v.lat, v.lon) * 1000 < Math.max(40, acc || 0)
  );
}

document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-vps]");
  if (b) vpsOpen(b.getAttribute("data-vps"));
});
