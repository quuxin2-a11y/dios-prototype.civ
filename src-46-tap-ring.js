/*
 * Tap ring: tapping an aircraft, ship, satellite or event first circles it and offers its choices
 * (Select, Pilot view for aircraft, Deselect), so a small moving target is easy to catch and nothing
 * opens by accident.
 *
 * Each view reports a tap with ringTap(o, pos, go):
 *   o    the object tapped
 *   pos  returns its current [x, y] in window pixels, or null when it is off screen
 *   go   what Select does in that view (select it and fly to it)
 * Taps are forgiving: ringNearest finds the closest object within RING_SLOP pixels, not only an exact hit.
 * Tapping the circled object again selects it; tapping empty ground clears the ring.
 */
var RING = { o: null, pos: null, go: null, raf: 0 };
var RING_SLOP = 44;
var RING_KIND = {
  plane: "AIRCRAFT",
  ship: "VESSEL",
  sat: "SATELLITE",
  quake: "EARTHQUAKE",
  event: "EVENT",
  info: "PLACE",
  transit: "VEHICLE"
};

// The closest of [x, y, obj] entries to (x, y) within r pixels, or null.
function ringNearest(pts, x, y, r) {
  var best = null,
    bd = r * r;
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    if (!p || !p[2]) continue;
    var d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
    if (d <= bd) {
      bd = d;
      best = p[2];
    }
  }
  return best;
}

// Aircraft and ships are replaced on every refresh; follow the newest copy of the same one.
function ringFresh(o) {
  var a = o && { plane: PLANES, ship: SHIPS }[o.kind];
  if (!a || o.id == null) return o;
  for (var i = 0; i < a.length; i++) if (a[i].id === o.id) return a[i];
  return o;
}

function ringSub(o) {
  if (o.kind === "plane")
    return o.alt != null ? Math.round(o.alt * 3.281).toLocaleString() + " FT" : "IN FLIGHT";
  if (o.kind === "ship") return o.v != null ? Math.round(o.v * 1.944) + " KT" : "AT SEA";
  if (o.kind === "sat" && o.alt != null) return Math.round(o.alt).toLocaleString() + " KM UP";
  return "";
}

function ringTap(o, pos, go) {
  if (RING.o && (RING.o === o || (o.id != null && RING.o.id === o.id && RING.o.kind === o.kind))) {
    ringSelect();
    return;
  }
  RING.o = o;
  RING.pos = pos;
  RING.go = go;
  var el = $("tring");
  if (!el) {
    el = document.createElement("div");
    el.id = "tring";
    document.body.appendChild(el);
  }
  var sub = ringSub(o);
  el.innerHTML =
    '<i class="trc"></i><div class="trchip"><b>' +
    esc(
      String(o.n || RING_KIND[o.kind] || "Object")
        .toUpperCase()
        .slice(0, 30)
    ) +
    '</b><span class="mono">' +
    esc(RING_KIND[o.kind] || "OBJECT") +
    (sub ? " · " + esc(sub) : "") +
    '</span><div class="trb"><button data-tr="sel">SELECT ▸</button>' +
    (o.kind === "plane" ? '<button data-tr="pilot">✈ PILOT VIEW</button>' : "") +
    '<button class="ghost" data-tr="x">DESELECT</button></div></div>';
  el.className = "on";
  if (!RING.raf) RING.raf = requestAnimationFrame(ringFrame);
}

function ringFrame() {
  RING.raf = 0;
  var el = $("tring");
  if (!RING.o || !el) return;
  var q = null;
  try {
    q = RING.pos();
  } catch (x) {}
  if (q && isFinite(q[0]) && isFinite(q[1])) {
    var W2 = window.innerWidth,
      H2 = window.innerHeight,
      ch = el.querySelector(".trchip"),
      cw = ch ? ch.offsetWidth : 220,
      cx = Math.max(8, Math.min(W2 - cw - 8, q[0] - cw / 2)),
      cy = q[1] + 44 + 110 > H2 ? q[1] - 44 - (ch ? ch.offsetHeight : 90) : q[1] + 44;
    el.style.setProperty("--tx", q[0] + "px");
    el.style.setProperty("--ty", q[1] + "px");
    el.style.setProperty("--cx", cx + "px");
    el.style.setProperty("--cy", cy + "px");
    el.classList.remove("off");
  } else el.classList.add("off");
  RING.raf = requestAnimationFrame(ringFrame);
}

function ringClose() {
  RING.o = null;
  RING.pos = null;
  RING.go = null;
  if (RING.raf) cancelAnimationFrame(RING.raf);
  RING.raf = 0;
  var el = $("tring");
  if (el) el.className = "";
}

// Select: run the view's own action, then raise the details so its options are in reach.
function ringSelect() {
  var o = RING.o,
    go = RING.go;
  ringClose();
  if (!o) return;
  if (go) go(ringFresh(o));
  else select(ringFresh(o));
  if (window.innerWidth < 1000 && typeof sheetSet === "function" && SHH < 46) sheetSet(46, true);
}

function ringDeselect() {
  var o = RING.o;
  ringClose();
  if (o && selected && selected.kind === o.kind && selected.id === o.id) {
    selected = null;
    if (typeof t4FlightOff === "function") t4FlightOff();
    setButtons();
    render();
  }
}

document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-tr]");
  if (!b) return;
  var a = b.getAttribute("data-tr");
  if (a === "sel") ringSelect();
  else if (a === "x") ringDeselect();
  else if (a === "pilot") {
    var o = ringFresh(RING.o);
    ringClose();
    if (!o) return;
    select(o);
    ckpOpen(o);
  }
});
