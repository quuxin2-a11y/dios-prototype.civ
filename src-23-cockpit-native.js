/**
 * @file Native bridge.
 * The bridge to the Android plugin (widget, vibration, shortcuts, alerts, speech, visual positioning).
 * (The cockpit view that also lived here was removed in v97.)
 *
 * Module 23 of 45. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

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
  else if (a === "alert") amCheck(); // a background alert notification was tapped
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
