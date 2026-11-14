# Changelog

Commit messages in this repository were made from a phone upload and are not descriptive, so the history is kept here.

## v48
- **Command mode**: an operations-room presentation. A status strip (alert state, UTC clock, live counts), a scrolling live ticker of alerts and headlines, corner brackets on the map and a short start-up sequence. It is a look and a layout only; every feed remains public, and the strip says so.
- **Command wall**: one screen with the alert state, live counts, four live cameras, official alerts, the watchlist, headlines and chatter.
- **Live chatter** tab in the News desk: public posts about a topic, newest first, refreshed every 30 seconds, each labelled with its network and handle. Bluesky and Mastodon need nothing; X needs the user's own API token. Posts are unverified and labelled so, and never feed the broadcast.
- **Search** understands flight numbers (AA 1482, UAL88) and ship names, and jumps to the live aircraft or vessel.
- **Compare**: two cameras one above the other, refreshed at the same instant.
- **Settings** screen: keys, map style, text size, options, live report and credits in one place. The Briefing keeps to the briefing.

## v47
- **Briefing**: one screen with what matters now, your watchlist and your saved places (weather, nearest cameras, three latest headlines each). Opens at launch once you have saved something.
- **Watchlist**: watch any aircraft or ship. Its live status shows in the Briefing and you are told when it takes off, lands, stops, gets under way or leaves its direct route.
- **Notifications**: watchlist changes and broadcasts raise a phone notification while the app is in the background (needs the updated workflow file, which adds the notification plugin). With the app fully closed nothing runs, so nothing is sent.
- **Replay**: scrub back through the aircraft and ship positions recorded since the app was opened, one frame a minute for up to an hour, with radar frames to match.
- **First-run guide**: four short screens, reachable again from the Briefing.
- **Map style**: satellite, streets, light or dark. **Text size**: standard, large, largest.
- **Share**: one tap makes a branded image of the current view with a caption, the time and the imagery credit.
- **Layers panel can be removed from the map entirely** (HIDE on the panel, or the switch in Briefing → Options).

## v46
- Design pass: one accent colour, one corner radius, one button height and one spacing scale across the app. Every chip in the top row is the same size and style; the Layers rail rows and toolbar sit on an even grid; News desk, Flight log, Inspect and the Photoreal bar share the same headers, margins and buttons.
- On phones the Layers rail starts folded, so the globe sits centred on the screen.

## v45
- **News desk**: latest headlines for the area in view, its country and the world, plus an Official alerts tab. Each headline links to its publisher.
- **Broadcast**: a bar across every view for nationwide or worldwide events. Sources: FAA NAS Status (ground stops, closures), US National Weather Service (extreme alerts), GDACS (red and orange disaster alerts), USGS (magnitude 6.5 and above). A news headline only reaches the broadcast when three or more separate outlets report the same nationwide-scale event. Dismissed broadcasts stay dismissed.
- **Flight log** (button on any aircraft): this flight's progress with an on-course check against the direct route and an arrival estimate; the airframe's completed flights over the last 12 days with its most-flown routes (OpenSky Network); and, with the user's own AeroDataBox key, the flights this aircraft is scheduled to operate with delay against schedule.
- **Layer control**: HIDE ALL and HIDE PANEL on the Layers rail; in Photoreal 3D, switches for cameras, tags, flights, ships, satellites and vehicles, and a HIDE BAR button.
- **Web version** documented: the app runs from GitHub Pages as well as the APK.

## v44
- **Static 3D view**: the Static button now opens the tilted photoreal city with the interface stripped back (needs the Google key). The dark flat version is still there as DARK on the Layers rail.
- Photoreal 3D: `CAM-` name tags on the cameras nearest the view, a landmark and city bar, visual presets (scan lines, night vision, mono), and camera points and tags placed at ground height.
- Photoreal 3D camera points no longer show through buildings or pile up into the distance: they are hidden behind what is in front of them, fade out beyond 5 km, and switch off while you pick or orbit a building. A CAMERAS ON/OFF button hides them completely.
- **Inspect, buildings**: rebuilt around the public record. Real shape from OpenStreetMap building parts where mapped, a facts panel (use, floors, height, year, architect, operator, address, facade, roof), a real indoor floor plan where one has been mapped, and a REAL 3D button that orbits the actual building in Photoreal 3D. The invented column grid, core and joint stages are gone; the two material stages that remain are labelled typical.
- **Inspect, aircraft**: shows the real register entry (type, maker, registration, operator) from adsbdb. The 3D model remains a generic airliner and says so.

## v43
- Photoreal 3D picks a model by type: airliner, wide-body, propeller plane or helicopter for aircraft (from the ADS-B emitter category, with a speed-and-height fallback), and container ship, tanker, cruise ship or tug for vessels (from the AIS ship type).
- Propellers and helicopter rotors turn.
- Aircraft and satellites leave a fading trail.
- Aircraft carry a light colour tint keyed to the airline code in the callsign (plain colours, no liveries or logos).
- New **Static view** button (top row and Layers rail): the whole world goes dark and muted, roads and place names stay bright, every camera is its own marker, and the interface drops away to the logo. Works at every zoom, from the full globe to street level. Tap the logo to exit.
- Ship names and types are filled in from Fintraffic's open vessel list and AISStream static reports.

## v42
- New **Photoreal 3D** view: real textured 3D cities, terrain and globe (Google Photorealistic 3D Tiles through CesiumJS). Needs the Google key with *Map Tiles API* enabled; falls back to the standard 3D view if Google refuses the key.
- Selected camera in Photoreal 3D: floating live screen above its location, pole to the ground, dashed footprint and sight lines.
- 3D engine is CesiumJS 1.146 (October 2026 release). Tilt/turn buttons sit on the left so the Layers panel never covers them.
- Photoreal 3D now shows **3D models**: aircraft, ships and satellites at their live positions with name tags (turn the flights, ships or satellites layer on). Models are original, generated for this app.
- Tap an aircraft in Photoreal 3D: the camera zooms in and follows it, the path already flown glows behind it, a dashed line runs on to its destination, and both airports are labelled. ✕ releases the plane.
- New **Inspect**: a continuous zoom from the whole object down to a single atom, six stages, with a field-of-view ruler, part labels and captions. Aircraft: airliner → wing and engine → turbofan cutaway → turbine blade → superalloy crystal → nickel atoms. Buildings: real OpenStreetMap footprint, height and floors → floors pulled apart → one floor plate → column and beam → reinforced concrete → iron atoms. Models are illustrative and say so on screen. Own WebGL renderer, no library.
- Inspect now also covers **ships** (ship → engine room → propeller → hull plate → steel grains → iron atoms) and **satellites** (spacecraft → solar panel → solar cell → cell layers → gallium arsenide atoms).
- **Live 3D twin**: with AI on, vehicles detected in the selected camera appear in Photoreal 3D as generic car, truck and bus models with anonymous VEH tags. Positions are estimated from the camera's footprint.
- Added `tests.js`: unit tests that run on every build.
- Security: private RSA-4096 release key held only in repository secrets; least-privilege workflow; Subresource Integrity for every pinned library; SHA-256 and signed build provenance on each release; CodeQL scan; `SECURITY.md`, `PRIVACY.md`, `THIRD-PARTY.md` and `LICENSE` added.
- Removed an unused chart library and code for an old hosted preview that the shipped app never runs.
- Layers rail 3D button opens Photoreal 3D when a Google key is saved.

## v41
- New brand: woven-diamond mark, wordmark and the line "Eyes open. Always." New app icon to match.
- Static view: each camera is a small arrow pointing the way it looks; dense areas stay crisp.
- Clean view: the map fills the screen with only the brand and the layers rail.
- Detection: more passes over each frame with agreement between passes; objects in video are followed
  from frame to frame for steady counts, anonymous numbered tags, and moving / stopped totals.
- 3D view: buildings are lit and shaded by height.

## v40
- Spain (DGT national road cameras) and Taiwan (Freeway Bureau, continuous motion-JPEG streams) added, both keyless.

## v39
- Windy webcams: the whole worldwide catalogue (about 65,000) is loaded in the background once a free key is added, and kept for a week.
- Community list of US DOT cameras fills states without their own feed, skipping spots already covered.

## v38
- 3D view (separate from the globe): tilt, rotate, terrain, 3D buildings, globe at low zoom, dark map style.
- Cameras, aircraft, ships, earthquakes and events in the 3D view; camera picture draped on the ground.
- Solid 3D models for aircraft and ships, at real altitude and heading.
- Layers and filters rail with live counts.

## v36
- In-app logo now matches the app icon.
- All-cameras view restyled: dimmed map, glowing points coloured by camera type, live count.
- Camera picture can be laid on the map where the camera looks, with a turnable aim.
- Detected vehicles and people get anonymous numbered tags on the map patch (counters, not identities).

## v35
- Every camera can be shown as its own dot, with no grouping.
- Nearby-camera tiles are now a movable dock: choose how many (1 to 9) and the size.
- Details sheet can be dragged taller or shorter, hidden, and reopened from a bar.
- New app icon: whole Earth, eye with a globe iris, fills the icon.
- Iowa moved to the working state feed; North Dakota removed (no public feed found).
- Faster grouping of cameras on screen; sharpness recovers when the phone keeps up.
- Sources split into `src-*` files with `build.py`; README and this changelog added.
- Release-signed APK when the signing secret is set.

## v34
- TxDOT live video through the DriveTexas stream service, with fresh links on every play.

## v33
- Street View back on Google's standard viewer by default, with a distance card; optional live guide.
- Texas pictures refresh every 2.5 seconds.

## v32
- Larger camera view, full-screen pinch zoom, swipeable buoy panoramas.
- Live video starts automatically at the best quality. Sharper map at rest.
- Adaptive app icon.

## v31
- Live report (PDF) that tests three cameras per network.

## v30
- Drive: route, cameras along it, hazards, weather, live GPS tracking.

## v29
- 32 more state, province and country camera networks by shared platform.

## v28
- TxDOT cameras. Street View guide. Ships, weather radar, voice control, smart alerts.
- Dead cameras hidden automatically. Status report. Permanent signing key support.

## v25 to v27
- Performance pass (sprites, culling, idle frame rate). Flat professional theme. Home screen removed.

## v1 to v24
- Globe renderer, satellite imagery, camera networks, multi-view wall, object detection, analytics,
  aircraft, satellites, earthquakes, events, Camera Web, property records, 3D buildings, Street View.
