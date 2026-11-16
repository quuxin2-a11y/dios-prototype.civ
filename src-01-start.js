/**
 * @file Shared setup.
 * Snapshot of the page source and the camera category table (label and colour per type).
 *
 * Module 1 of 33. Modules share one scope: build.py concatenates them in order
 * inside a single closure. See README, "Architecture".
 */

var SRC = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
var L = {
  traffic: ["Traffic / Roads", "#ffb547"],
  hazard: ["Wildfire & Volcano", "#ff5d5d"],
  aviation: ["Aviation Weather", "#8fa8ff"],
  landmark: ["City & Landmark", "#4cc3ff"],
  nature: ["Nature & Wildlife", "#36f1b5"],
  ocean: ["Ocean & Marine", "#2ad4e6"],
  space: ["Space / Orbit", "#ffffff"]
};
var visLive = [];
