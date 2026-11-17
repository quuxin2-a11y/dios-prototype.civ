/**
 * @file Photo help: "I need help" with a photo and your position, and "Where is this?".
 * Help: take a photo of where you are; the app adds your phone's position (with its accuracy) and
 * opens a ready message to your check-in contacts, the share sheet (so the photo goes too), or a
 * text to 911 where text-to-911 is offered. The phone's position is the main answer; a landmark
 * in the photo is only looked up when the position is missing or rough.
 * Where is this?: recognises well-known public landmarks in a photo (Google Cloud Vision, with
 * the user's own key, kept on the phone) and shows the best matches with how sure it is.
 * Protections: photos with a face or a person as the subject, and photos of homes, hotel rooms
 * or other interiors, are never looked up, so a picture can't be used to find where someone is.
 *
 * Module 42 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

var PH = { busy: false, last: null };
var PH_VISION = "https://vision.googleapis.com/v1/images:annotate?key=";
var PH_GOOD_M = 150; // a position at least this accurate is the answer on its own
var PH_PERSON_AREA = 0.06; // a person filling more of the photo than this is its subject
var PH_PRIVATE =
  /\b(bedroom|living room|kitchen|bathroom|bed|bed frame|interior design|home|house|apartment|condominium|hotel|room|suite|furniture|couch|sofa|backyard|yard|porch|residential area|hallway|ceiling|floor)\b/i;

// ---------- Reading a photo ----------
// The photo as a JPEG at most 1280 px across: small to send, and any location tags in the
// original file are dropped on the way.
function phShrink(file) {
  return new Promise(function (res, rej) {
    var url = URL.createObjectURL(file),
      img = new Image();
    img.onload = function () {
      var k = Math.min(1, 1280 / Math.max(img.width, img.height)),
        c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(
        function (b) {
          if (!b) return rej(new Error("photo could not be read"));
          var fr = new window.FileReader();
          fr.onload = function () {
            res({
              blob: b,
              b64: String(fr.result).split(",")[1],
              url: c.toDataURL("image/jpeg", 0.8)
            });
          };
          fr.readAsDataURL(b);
        },
        "image/jpeg",
        0.85
      );
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      rej(new Error("photo could not be read"));
    };
    img.src = url;
  });
}

function phPick(capture) {
  return new Promise(function (res) {
    var inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    if (capture) inp.setAttribute("capture", "environment");
    inp.onchange = function () {
      res(inp.files && inp.files[0]);
    };
    inp.click();
  });
}

// ---------- Landmark lookup with protections ----------
// Decides from Vision's answer whether the photo may be looked up, and what it shows.
// Returns {blocked: reason} or {matches: [{name, lat, lon, pct, radiusM}]}.
function phVerdict(r) {
  r = r || {};
  if ((r.faceAnnotations || []).length) return { blocked: "person" };
  var big = (r.localizedObjectAnnotations || []).some(function (o) {
    if (!/^person$/i.test(o.name || "") || (o.score || 0) < 0.6) return false;
    var v = (o.boundingPoly && o.boundingPoly.normalizedVertices) || [],
      xs = v.map(function (p) {
        return p.x || 0;
      }),
      ys = v.map(function (p) {
        return p.y || 0;
      });
    if (!xs.length) return false;
    return (
      (Math.max.apply(0, xs) - Math.min.apply(0, xs)) *
        (Math.max.apply(0, ys) - Math.min.apply(0, ys)) >
      PH_PERSON_AREA
    );
  });
  if (big) return { blocked: "person" };
  var priv = (r.labelAnnotations || []).some(function (l) {
    return (l.score || 0) >= 0.6 && PH_PRIVATE.test(l.description || "");
  });
  if (priv) return { blocked: "private" };
  var matches = (r.landmarkAnnotations || [])
    .map(function (l) {
      var ll = l.locations && l.locations[0] && l.locations[0].latLng;
      if (!ll || typeof ll.latitude !== "number") return null;
      var s = l.score || 0;
      return {
        name: l.description || "Landmark",
        lat: ll.latitude,
        lon: ll.longitude,
        pct: Math.round(s * 100),
        radiusM: s >= 0.9 ? 150 : s >= 0.75 ? 400 : s >= 0.6 ? 1000 : 3000
      };
    })
    .filter(Boolean)
    .sort(function (a, b) {
      return b.pct - a.pct;
    });
  return { matches: matches };
}

function phVision(b64) {
  var key = KEYS.vision;
  if (!key) return Promise.reject(new Error("no key"));
  return fetch(PH_VISION + encodeURIComponent(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: b64 },
          features: [
            { type: "LANDMARK_DETECTION", maxResults: 5 },
            { type: "FACE_DETECTION", maxResults: 3 },
            { type: "OBJECT_LOCALIZATION", maxResults: 10 },
            { type: "LABEL_DETECTION", maxResults: 15 }
          ]
        }
      ]
    })
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (j) {
      var r = j && j.responses && j.responses[0];
      if (!r || r.error || j.error)
        throw new Error(((r && r.error) || j.error || {}).message || "no answer");
      return phVerdict(r);
    });
}

var PH_BLOCKED = {
  person:
    "This photo shows a person, so Ojos de Dios won't look up where it was taken. That protects people from being found through their pictures.",
  private:
    "This looks like a home, a hotel room or another private interior, so Ojos de Dios won't look up where it was taken."
};

// ---------- Your position ----------
function phPosition() {
  if (EMG.pos && Date.now() - EMG.pos.t < 120000) return Promise.resolve(EMG.pos);
  return new Promise(function (res) {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(
      function (p) {
        res({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          acc: p.coords.accuracy,
          t: Date.now()
        });
      },
      function () {
        res(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

// ---------- The panel ----------
function phPanel(html) {
  var el = $("php");
  if (!el) {
    el = document.createElement("div");
    el.id = "php";
    el.className = "pn";
    document.body.appendChild(el);
  }
  el.innerHTML =
    '<div class="nh"><div><b class="mono">' +
    (PH.mode === "help" ? "⚠ HELP WITH A PHOTO" : "◎ WHERE IS THIS?") +
    '</b></div><button data-ph="x" aria-label="Close">✕</button></div><div class="nl">' +
    html +
    "</div>";
  el.style.display = "flex";
}

function phClose() {
  var el = $("php");
  if (el) el.style.display = "none";
}

function phMapLink(p) {
  return "https://maps.google.com/?q=" + p.lat.toFixed(5) + "," + p.lon.toFixed(5);
}

function phMatchHTML(m, i) {
  return (
    '<div class="brh"><span style="flex:1"><b>' +
    esc(m.name) +
    '</b><br><i class="mono">' +
    m.pct +
    "% SURE · WITHIN ABOUT " +
    (m.radiusM >= 1000 ? m.radiusM / 1000 + " KM" : m.radiusM + " M") +
    '</i></span><button class="mini" data-ph="go-' +
    i +
    '">Show</button></div>'
  );
}

// Fly the current view to a point and open it, whichever map is showing.
function phShow(o) {
  var it = {
    kind: "info",
    layer: "where",
    id: "where:" + o.lat.toFixed(5) + "," + o.lon.toFixed(5),
    n: o.name,
    lat: o.lat,
    lon: o.lon,
    color: "#36f1b5",
    tag: o.tag || "PHOTO LOOKUP",
    rows: o.rows || []
  };
  phClose();
  if (RW.on && RW.mode === "globe" && T3.map)
    T3.map.flyTo({ center: [o.lon, o.lat], zoom: 15.5, duration: 1600 });
  else if (T4.on && T4.v) t4Fly(o.lon, o.lat, 1500, 0);
  else target = { lon: o.lon, lat: o.lat, z: clampZ((zoom * viewKm()) / 3) };
  rot.lon = o.lon;
  rot.lat = o.lat;
  select(it);
}

// ---------- Help: photo + position ----------
function phHelp() {
  PH.mode = "help";
  phPick(true).then(function (file) {
    if (!file) return;
    phPanel('<p class="bre">Reading your position…</p>');
    Promise.all([phShrink(file), phPosition()])
      .then(function (r) {
        var photo = r[0],
          pos = r[1];
        PH.last = { photo: photo, pos: pos, near: null };
        phHelpDraw();
        // A landmark only helps when the phone can't say where it is.
        if ((!pos || pos.acc > PH_GOOD_M) && KEYS.vision)
          phVision(photo.b64)
            .then(function (v) {
              if (v.matches && v.matches[0] && v.matches[0].pct >= 60) {
                PH.last.near = v.matches[0];
                phHelpDraw();
              }
            })
            .catch(function () {});
      })
      .catch(function () {
        phPanel('<p class="bre">That photo could not be read. Try taking it again.</p>');
      });
  });
}

function phHelpText() {
  var L = PH.last,
    p = L.pos,
    t = "I need help.";
  if (p)
    t +=
      " I'm here (within " +
      Math.max(5, Math.round(p.acc)) +
      " m): " +
      p.lat.toFixed(5) +
      ", " +
      p.lon.toFixed(5) +
      " " +
      phMapLink(p) +
      ".";
  if (L.near) t += " Near " + L.near.name + " (" + L.near.pct + "% match from my photo).";
  if (!p && !L.near) t += " My phone can't find my position. I'm sending a photo of where I am.";
  return (
    t +
    " Sent from Ojos de Dios at " +
    new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
    "."
  );
}

function phHelpDraw() {
  var L = PH.last,
    p = L.pos,
    S = EMG.sit,
    tel = (((S && S.num) || emgNum(S && S.cc)).match(/\d+/) || ["112"])[0],
    fam = famList(),
    h = '<img class="phimg" src="' + L.photo.url + '" alt="Your photo">';
  h += p
    ? '<p><b>Your position</b><br><span class="mono">' +
      p.lat.toFixed(5) +
      ", " +
      p.lon.toFixed(5) +
      "</span> · within " +
      Math.max(5, Math.round(p.acc)) +
      " m</p>"
    : '<p class="bre">Your phone couldn\'t get a position. Turn on location, or step outside, and try again. The photo still helps people find you.</p>';
  if (L.near)
    h += "<p><b>Near " + esc(L.near.name) + "</b> · " + L.near.pct + "% match from your photo</p>";
  h +=
    '<div class="brt c1"><a class="emcall" href="tel:' +
    tel +
    '">☎ Call ' +
    tel +
    "</a></div>" +
    '<div class="brt"><button data-ph="share">➤ Send photo + location</button>' +
    (fam.length ? '<button data-ph="fam">✉ Text my contacts</button>' : "") +
    (S && S.cc && S.cc !== "US" ? "" : '<button data-ph="911">✉ Text 911</button>') +
    (p ? '<button data-ph="me">◎ Show me on the map</button>' : "") +
    "</div>" +
    '<p class="mono" style="font-size:11px;opacity:.75">Calling is fastest. Text 911 works only where your area offers it. Nothing is sent until you press send.</p>';
  phPanel(h);
}

function phSend(kind) {
  var L = PH.last,
    tx = phHelpText();
  if (kind === "share") {
    var f = new window.File([L.photo.blob], "where-i-am.jpg", { type: "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [f] }))
      navigator.share({ files: [f], text: tx, title: "I need help" }).catch(function () {});
    else if (navigator.share)
      navigator.share({ text: tx, title: "I need help" }).catch(function () {});
    else location.href = "sms:?body=" + encodeURIComponent(tx);
  } else if (kind === "fam")
    location.href =
      "sms:" +
      famList()
        .map(function (x) {
          return x.p.replace(/[^\d+]/g, "");
        })
        .join(",") +
      "?body=" +
      encodeURIComponent(tx);
  else if (kind === "911") location.href = "sms:911?body=" + encodeURIComponent(tx);
}

// ---------- Where is this? ----------
function phWhere() {
  PH.mode = "where";
  if (!KEYS.vision) {
    phPanel(
      '<p>Where is this? recognises well-known public landmarks in a photo and shows where they are, with how sure it is.</p><p>It needs a free Google Cloud Vision key of your own. Add it under <b>Layers → Sources &amp; keys</b>; it stays on this phone.</p><p class="mono" style="font-size:11px;opacity:.75">Photos showing a person, a home, a hotel room or another private interior are never looked up.</p>'
    );
    return;
  }
  phPick(false).then(function (file) {
    if (!file) return;
    phPanel('<p class="bre">Looking for a landmark…</p>');
    phShrink(file)
      .then(function (photo) {
        return phVision(photo.b64).then(function (v) {
          var h = '<img class="phimg" src="' + photo.url + '" alt="Your photo">';
          if (v.blocked) h += '<p class="bre">' + PH_BLOCKED[v.blocked] + "</p>";
          else if (!v.matches.length)
            h +=
              "<p>No well-known landmark was recognised. Where is this? only names famous public places, so it makes no guess here.</p>";
          else {
            PH.matches = v.matches;
            h += v.matches.slice(0, 5).map(phMatchHTML).join("");
          }
          phPanel(h);
        });
      })
      .catch(function (e) {
        phPanel(
          '<p class="bre">The lookup failed: ' +
            esc(String((e && e.message) || e).slice(0, 120)) +
            ". Check the Vision key in Sources &amp; keys and that Cloud Vision API is turned on for it.</p>"
        );
      });
  });
}

document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-ph]");
  if (!b) return;
  var k = b.getAttribute("data-ph");
  if (k === "help") phHelp();
  else if (k === "where") phWhere();
  else if (k === "x") phClose();
  else if (k === "share" || k === "fam" || k === "911") phSend(k);
  else if (k === "me" && PH.last && PH.last.pos)
    phShow({
      name: "You are here",
      tag: "MY POSITION",
      lat: PH.last.pos.lat,
      lon: PH.last.pos.lon,
      rows: [["ACCURACY", "within " + Math.max(5, Math.round(PH.last.pos.acc)) + " m"]]
    });
  else if (k.indexOf("go-") === 0 && PH.matches) {
    var m = PH.matches[+k.slice(3)];
    if (m)
      phShow({
        name: m.name,
        lat: m.lat,
        lon: m.lon,
        tag: "PHOTO LOOKUP",
        rows: [
          ["MATCH", m.pct + "% sure"],
          [
            "RADIUS",
            "within about " + (m.radiusM >= 1000 ? m.radiusM / 1000 + " km" : m.radiusM + " m")
          ],
          ["SOURCE", "Google Cloud Vision landmark recognition"]
        ]
      });
  }
});
