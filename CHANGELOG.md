# Changelog

Commit messages in this repository were made from a phone upload and are not descriptive, so the history is kept here.

## v70
- Replica imagery outside the US is now the EOxCloudless Sentinel-2 mosaic (2024, 10 m per pixel, cloud-free), about 25 times sharper than the NASA imagery it replaces: city blocks, parks and main roads are clear. US aerial photos stay on top inside the US.
- The mosaic is licensed CC BY-NC-SA 4.0 (non-commercial use only) and its credit must be visible on the map, so a small text credit shows in the corner while it is in view: from high up anywhere, and close in outside the US. Noted in THIRD-PARTY.md.
- Guide updated for v70.

## v69
- **Replica World is now the start-up view.** The app opens straight into the 3D world from space, with every camera, layer and setting the globe has; one tap on the logo switches to the globe. Briefing → Globe look has Replica World first; the other looks still work.
- **A more realistic Replica:**
  - Buildings use their mapped wall colour, or a colour from their material (brick, stone, marble, glass and others), and their mapped roof: domes and onion domes as rounded caps, gabled, hipped and similar roofs as stepped pitched roofs, in the roof colour.
  - Mapped building parts replace the plain outline around them, so detailed landmarks show their real shape.
  - Mapped street trees.
  - Aerial photos under the city across the US (USDA NAIP via The National Map, public domain), over NASA imagery for the rest of the Earth.
- **Names and borders, from space to the street:** glowing country borders and fainter state lines, country and state names, city and town names for the region in view, then neighbourhoods, street names and the names of landmark buildings as you zoom in. Each set shows only at the distances where it is readable.
- No third-party logos appear in Replica; sources are in the ⓘ panel. Google 3D is still available from the GOOGLE switch.
- Guide updated for v69.
- Tests: 64 JavaScript tests (colours, roofs, building parts, trees, place names) and 27 browser tests (start-up in Replica World).

## v68 · guide
- Rebuilt `guide.html` for everything up to v68: the three worlds (Globe, Replica World, Sky), a working demo of the logo gestures, a searchable catalogue of every data pack with its source and coverage, tools, gestures, settings, privacy and an updated FAQ. Old screenshots were removed; the page is self-contained with no external requests.

## v68
- **Replica World** (`src-39-replica-world.js`): one tap on the logo switches the whole app into the 3D Replica with its own dashboard: a top bar with the brand, live camera, aircraft, ship and transit counts, the sky button and exit; a search bar; and a dock with Layers, Cameras, Events, Planes, Ships, Trains and Settings. It uses the same layers, settings and panels as the globe, so a change in one world shows in the other. Tapping the logo again returns to the globe; ◆ Replica in the button row does the same.
- **Logo gestures:** one tap switches worlds (after 420 ms, so it is not mistaken for the start of five), five quick taps still open the signature, and holding the logo opens the sky.
- **Sky** (`src-40-sky.js`): the night sky right now over the place in view, with about 5,000 stars, constellation lines and names (Orion and the rest), bright-star names, the Moon with its phase, the Sun, the planets and compass points; the sky colour follows the Sun. Drag to look around, pinch to zoom, tap anything to identify it, and step the time by an hour or a day. **Solar system** shows the eight planets on their orbits today. Positions are computed on the phone from the d3-celestial star catalogue (BSD) and JPL's published orbital elements; the catalogue is kept for offline use after the first load.
- The app opens on the globe again by default; Briefing → Globe look can still start in Replica 3D or Google 3D.
- Tests: 63 JavaScript tests (sidereal time, Polaris, the equinox Sun, full and new Moon dates) and 26 browser tests (logo tap into Replica World and back, five taps, holding for the sky).

## v67
- Fixed Replica not appearing for anyone who had used the Google view: start-up now follows Briefing → Globe look instead of reopening the last 3D view.
- Replica city data now falls back to public Overpass mirrors when the main server is busy (also used by the OpenStreetMap layers and wind farms), and retries after 8 s instead of giving up.
- Replica buildings are built on the main thread in batches of 700, so nothing has to be fetched from the CDN for them; a chip shows how many buildings loaded, or that there are none mapped here.
- Tests: 61 JavaScript tests and 24 browser tests, including the mirror fallback and start-up after using the Google view.

## v66
- **Replica is the new default view** (`src-38-replica.js`): a 3D globe from space with NASA true-colour imagery, and a clean 3D model of the city in view built from OpenStreetMap: buildings at their real footprint and height (coloured by use, tap for type and height), roads by class, water and parks. Loads about 2–3 km around the centre of the view, keeps the last four areas, and runs on the graphics chip. Google's tiles are not loaded in Replica, so no third-party logo appears; data sources are behind an ⓘ button.
- **Google 3D** is one tap away (GOOGLE 3D / REPLICA switch in the 3D view's side bar), and Google's tiles load only then.
- Briefing → Globe look: Replica 3D (default), Google 3D, Clear globe or Classic dark.
- Tests: 61 JavaScript tests and 23 browser tests, including Replica opening by default without loading Google tiles, and switching to Google 3D.

## v65
- Earth view is sharper and faster: Google 3D tiles now refine to more detail (tile detail error 10 instead of 18 on Balanced), with less detail spent on the horizon and screen edges, and tiles for a flight's destination load while flying. The view only redraws when something changes, and flights take 1.3 s instead of 2.2 s.
- Tapping the ground in the Earth view scans that spot for nearby cameras, as on the classic globe. Tapping a camera from space stops at city height first.
- The renderer's own logo is no longer shown (CesiumJS does not require it when Cesium ion is not used); Google's logo and data credits stay, smaller.

## v64
- **Earth view is now the start-up globe** (`src-37-earth-view.js`): the app opens from space on Google Photorealistic 3D Tiles in CesiumJS, the same engine as Photoreal 3D, and zooms all the way down to 3D cities. From high up every camera is shown at once as a point coloured by kind; data-layer items are points and undersea cables are lines, all drawn by the graphics chip. Tapping any of them opens its details. If the 3D engine or Google's tiles cannot load, the app stays on the canvas globe without a message.
- Briefing → Globe look: Google Earth 3D (default), Clear globe or Classic dark.
- Performance: the Earth view adds camera points only when the list changes (at most every 8 s while networks are still loading), and the canvas globe draws very large point counts as squares.
- Tests: 60 JavaScript tests and 22 browser tests, including the Earth view against a stand-in 3D engine and the classic look staying on the canvas globe.

## v63
- **Clear globe look, now the default:** satellite imagery at full brightness with a brighter atmosphere, every camera drawn as a round point coloured by kind (white-ringed when zoomed in), and round markers for data layers. Briefing → Globe look switches back to the classic dark look. Existing installs move to the new look once, with cables, daylight imagery and camera points switched on.
- **Undersea cables** (`src-36-cables-towers-wind.js`): every submarine cable route, drawn in its map colour; tap one for owners, builder, length, service date and landing points (TeleGeography).
- **Cell and radio towers** with what they are used for and who operates them (OpenStreetMap).
- **Wind farms:** US turbines grouped into projects with capacity, turbine count, year and models (USGS US Wind Turbine Database), and wind farms elsewhere from OpenStreetMap.
- **Camera count fixes:** a Windy sweep that was cut short was being cached as complete, so only part of the worldwide list came back; partial caches now resume the sweep. Camera networks that do not answer at start-up are retried after 2 and 8 minutes, and the status report keeps the app-side error. Data layers now load at most three at a time so they do not crowd out camera networks.
- Tests: 60 JavaScript tests and 20 browser tests.

## v62
- Fixed a start-up crash for anyone who had chosen a map style other than Satellite: the style was restored before the NASA views module had loaded, which stopped the app (introduced in v59).
- New browser test that starts the app with saved settings from earlier versions and every layer switched on.

## v61
- **Energy, geology, climate, culture, area facts and farming** (`src-35-energy-geology-culture.js`):
  - Power plants coloured by energy source with output, and fuel stations (OpenStreetMap).
  - Every Holocene volcano (Smithsonian Global Volcanism Program), with US volcanoes at elevated alert highlighted by aviation colour code and linked to the latest USGS notice.
  - The current US Drought Monitor map, drawn as areas by category, and live temperatures on a grid across the view in °C and °F (Open-Meteo).
  - Museums, historic sites and UNESCO World Heritage sites (OpenStreetMap).
  - Population, area, density, elevation and founding year for places in view (Wikidata), and population, life expectancy, urbanisation, internet use and electricity access by country (World Bank).
  - Farmland, cereal yield, irrigation and farming's share of the economy and jobs by country (World Bank), and farm shops (OpenStreetMap).
- The Layers list is now grouped under headings by pack.
- Tests: 58 JavaScript tests and 18 browser tests.

## v60
- **Health, public places and nature** (`src-33-health-places-nature.js`):
  - Disease outbreak news from the last 90 days, placed on each named country (WHO).
  - Pharmacies, libraries, public toilets, EV chargers, free Wi-Fi spots, parks and national parks (OpenStreetMap).
  - Research-grade wildlife sightings from the last 30 days with photos; observer details are not shown and protected species keep iNaturalist's blurred positions (iNaturalist).
  - Live river flow, gage height and lake levels (USGS).
- **Travel and economy** (`src-34-travel-economy.js`):
  - US airport ground stops, ground delays, departure and arrival delays and closures (FAA), placed using aviationweather.gov airport data.
  - Travel advisory levels for every country (US Department of State).
  - Ferry terminals (OpenStreetMap).
  - GDP per person, unemployment, inflation and GDP growth by country (World Bank).
- Details cards can show a photo.
- Tests: 55 JavaScript tests (tables are now read from the shipped modules too) and 17 browser tests.

## v59
- **Earth layers** (`src-32-earth.js`):
  - NASA satellite views that replace the globe imagery while on: yesterday's true-colour Earth (VIIRS), last night's lights (VIIRS Day/Night Band, useful for spotting power outages), and the Black Marble city lights. Only one view is on at a time; turning it off restores the chosen map style.
  - Wildfire smoke plumes by density (NOAA Hazard Mapping System), drawn as outlines at any zoom.
  - Fire detections from today's satellite passes, with repeats merged and fire power shown (NOAA HMS).
  - Air quality on a grid across the view: US AQI, PM2.5, PM10, ozone and nitrogen dioxide (Open-Meteo, modelled by Copernicus CAMS).
- The globe can now use tile servers with their own path layout and a lower maximum zoom.
- Info layers can draw areas without a centre marker, at any zoom a layer chooses.
- Tests: 50 JavaScript tests and 16 browser tests.

## v58
- **Infrastructure layers** (`src-30-infrastructure.js`): hospitals (with emergency room and beds where listed), fire stations and police stations from OpenStreetMap; open emergency shelters with capacity, occupancy and pet policy (FEMA); internet outages by country over the last 24 hours (IODA, Georgia Tech); federal disaster declarations from the last 90 days, drawn as county and state outlines (OpenFEMA); and Seattle Fire Department 911 dispatches.
- **Radio layers** (`src-31-radio.js`): internet radio stations near the map view that publish their location, playable in the details card (Radio Browser; secure streams only); and every NOAA Weather Radio transmitter with frequency, call sign, status, power, programming office and counties covered.
- **Air traffic audio:** aircraft details link to LiveATC for the origin and destination airports.
- Details cards can now carry an audio player and outside links.
- Fixed the version shown in the Briefing "About" section.
- Tests: 48 JavaScript tests and 14 browser tests.

## v57
- **Ground data layers** (`src-29-ground.js`): bike-share docks with available bikes, e-bikes and free docks from about 800 networks worldwide (CityBikes); shared scooters and e-bikes from operators that publish open GBFS feeds; traffic incidents and current work zones in Austin and Calgary; and US land border wait times for cars, NEXUS/SENTRI, trucks and pedestrians at every reporting port (CBP), placed from a bundled table of port locations (BTS).
- **More transit:** Minneapolis–St Paul, Denver, Calgary, Edmonton, Halifax, South East Queensland, the Netherlands and Norway, all from operators' GTFS-Realtime feeds.
- Work zones are drawn as lines along the affected road when zoomed in.
- Tests: 44 JavaScript tests (CSV and GBFS parsing, border lane statuses and port grouping) and 13 browser tests (border wait times and traffic incidents with sample data).

## v56
- **Emergency data layers:** active hurricanes and tropical storms (National Hurricane Center) with category, winds, pressure and movement; river gauges with flood category and forecast (NOAA); tide stations with the current water level and the next high and low tide (NOAA); tsunami warnings, advisories and statements from the last 72 hours (tsunami.gov); current wildfire perimeters with size and containment (NIFC); and space weather with the planetary K-index and aurora forecast (NOAA SWPC).
- **Focus mode:** pick US states, countries or city areas. They light up with a raised, glowing edge while the rest of the world dims; cameras, aircraft, ships, transit and data layers outside pause and cannot be tapped, and area-based layers load only for the focus. The choice is remembered between visits.
- **Info layer framework** (`src-27-hazards.js`): one loader, drawer and details card for public data layers, so later data packs plug in the same way.
- Tests: 38 JavaScript tests (hurricane and storm scales, TopoJSON decoding including the antimeridian) and 11 browser tests (emergency layers and Focus mode with sample data).

## v55
- **Public transit layer.** Live buses, trains, trams, subways and ferries for Boston (MBTA), Philadelphia (SEPTA), Toronto (TTC), Seattle (King County Metro), Austin (CapMetro), Helsinki (HSL) and Amtrak across the US. Vehicles appear as coloured markers with route labels when zoomed in; tapping one shows route, status and next stop, speed, heading, seats where published, schedule adherence and the time of the last report. Shown in Photoreal 3D as well.
- **GTFS-Realtime support.** A small protobuf reader decodes operators' VehiclePosition feeds on the device, with tests against a hand-encoded feed.
- Feeds load only for cities near the map view and refresh every 30 seconds while the layer is on.
- **Start-up module.** Application start-up now runs in its own last module (`src-99-start.js`), so every module's state exists before the first render.
- Tests: 35 JavaScript and 9 browser tests; `tests.js` is now Prettier-formatted.

## v54
- **Self-contained modules.** Each of the 25 `src-NN-*.js` files is now a complete script that parses and is checked on its own, with a header describing what it does. Behaviour is unchanged.
- **Simpler build.** `build.py` now fills `/*@include*/` markers in `src-template.html` (styles, modules, bundled data) instead of patching markup, and embeds all JSON data compactly.
- **Linting.** ESLint's recommended rules run on every module, including undefined-name checks across modules (`eslint.config.mjs`). Fixing its findings removed dead code and unused variables, and renamed two variables that shadowed others in the globe renderer.
- **Browser tests.** `test_browser.py` loads the built app in headless Chromium with every public source blocked and checks start-up, embedded data, Finder, Records, Country file and the Emergency mode confirmation.
- **CI:** every module is syntax-checked, linted and Prettier-checked on each push, and the browser tests run before the build; CodeQL now scans the modules directly and skips the generated `index.html`.

## v53
- **Security hardening (code scanning):** toast messages are now built node by node, allowing only bold text and line breaks; layer status text and dossier labels are escaped; coordinates written into buttons are forced to numbers; colours are checked against a hex pattern.
- **Media addresses are validated** before reaching an image or video element: only https, http, blob and inline PNG/JPEG/GIF/WebP images are accepted.
- **Vessel ids and camera headings are kept in `Map`s** instead of plain objects, so an identifier from a live feed can never be read as an object property such as `__proto__`.
- **CI:** CodeQL now scans JavaScript, Python and Java (no build needed), skipping the generated source fragments; runners are pinned to `ubuntu-24.04` and `macos-15-intel`. A final job keeps the ten newest finished workflow runs and deletes older ones.
- `SECURITY.md` wording on the shared keys corrected.
- **Readable source:** the application code is now formatted with Prettier (one statement per line, `.prettierrc.json` included) and split into 25 modules by subsystem instead of 11.
- **3D models moved out of the code** into `src-data-models.json`, which `make_models.py` now writes directly and `build.py` embeds.

## v52
- **Native Android layer (Java):** a Capacitor plugin, a home-screen Emergency widget that turns red while emergency mode is on, long-press app shortcuts (Emergency, Finder, Briefing), keep-screen-awake in emergency mode, and vibration for the SOS signal. Covered by JUnit tests.
- **Build tooling (Python):** `install_native.py` installs and rolls back the native sources in CI; `check_secrets.py` blocks committed credentials; `make_models.py` generates the embedded 3D models; `test_tools.py` tests the tooling.
- **Styles moved to `src-styles.css`**, separate from the document template.
- **README rewritten** with architecture, project layout, build-from-source instructions and test matrix.

## v51
- **Interactive guide** (`guide.html`): every feature with how to open it and what it does, five step-by-step walkthroughs with app screens, a switch between the Android app and the web version that marks what each can do, search, and answers to common questions.
- **Aircraft are Android-only, and the app says so**: live aircraft services do not allow web browsers to read their data, so the web version now shows "Android app only" for aircraft instead of "offline", and Finder explains it. When the main aircraft service does not answer on Android, the app falls back to two community ADS-B networks for the area in view, and Finder looks a flight up by callsign there.
- **Works without setup**: the app now includes a shared Windy webcams key, so everyone sees webcams around wherever they are looking without adding a key. Cameras near the view appear first, and the whole-world list loads in the background over about half an hour, then is kept on the device for 30 days. A shared Google key, limited to the Map Tiles service, turns on Photoreal 3D, Static 3D and Cockpit view for everyone; Street View and Google routing still need a personal key. A key entered in Settings always takes precedence.

## v50
- **Cockpit view**: on any live aircraft, see the real world in 3D from its position, height and heading, moving with it. The weather is simulated from the forecast model for that exact position and height: in cloud, a cloud deck below, overcast above, rain, snow, night, haze, plus outside air temperature and wind aloft. Drag to look around. Needs the Google Maps key, like Photoreal 3D.
- **Speed pass**: live blur effects are gone (they were redrawn over the map on every frame), buttons respond the instant they are pressed, the globe no longer changes resolution each time it is touched, it idles at a lower frame rate once left alone, Photoreal 3D is capped at 45 frames a second on Balanced, and long lists only lay out what is on screen. Settings → Speed still offers Smooth, Balanced and Sharp.
- **Cockpit view fills the screen**: the search bar, buttons, side rail and bottom sheet are all hidden while you are in the cockpit; only the view, other aircraft and the cockpit readouts remain. A second ✕ sits beside the flight name.
- **Official warnings in Europe**: Emergency mode now reads the national weather service warnings for your position in 38 European countries through MeteoAlarm, alongside the US National Weather Service.
- **Family check-in**: choose up to eight contacts. "I am safe" or "I need help" opens a ready text to all of them with your position. Numbers stay on the phone.
- **Offline pack**: saves the map around you, with safe places and emergency numbers, so Emergency mode still shows them with no signal.
- **System check**: Settings → Testing asks every public source for one small answer, lists any errors the app recorded on the phone, and shares a report that contains no location, key values or searches.

## v49
- **State of Emergency mode**: asks for confirmation, then turns the map and accents red, shows and follows your live position (kept on the phone), and opens a situation screen: the local emergency number with a call button, official alerts for your exact position, hazards nearby with distance and direction, weather, air quality, the nearest hospital, shelter, assembly point, fire station, police, pharmacy, fuel and water, the nearest live cameras, local headlines, a destination check, location sharing, an SOS screen-and-tone signal, public radio links and a checklist. The last situation is saved for when the connection drops.
- **Analyzer**: a fixed set of rules, not a prediction. It states a threat level, repeats the official instruction, gives the direction away from the nearest hazard and ranks the best reachable safe places with its reasons.
- **Drive route choices**: Fastest, Fewest cameras, Back roads (no motorways) and Safest (stays farthest from reported hazards). Several routes are fetched and compared; the panel says what each would cost.
- **Finder**: one search for a flight number, callsign, tail number, ship name or MMSI, satellite or camera. A flight shows its route, whether it is in the air or on the ground, progress and course; with an AeroDataBox key it also shows gate, delay and every leg from yesterday to three days ahead. One tap opens the aircraft's full flight log.
- **Plans on record**: lists every building in view that has an indoor floor plan in OpenStreetMap, most detailed first, each opening in Inspect.
- **Records**: type an address or a company. Shows the property record (Texas statewide; elsewhere a link to the county), and for an owning organisation its register entry: legal name, status, jurisdiction, registration number, addresses, and officers where an open source lists them, each labelled with its source. Private individuals are never named.
- **State business registers read directly**: Texas, Colorado, New York, Oregon and Connecticut publish theirs as open data, so Records shows registration status, state file number, formation date and address from the state itself. In Texas it also shows the right to do business, and with a free Comptroller key the officers, directors and registered agent from the public report. Other states open their official search.
- **People and contact on the business record**: Records lists the people named on the public filing with their role (owners or members, officers, directors, registered agent) where the state publishes them: Oregon directly, New York and Colorado in part, Texas with the Comptroller key, others with the OpenCorporates key. It also shows the business phone and website the business itself publishes. Personal phone numbers are not on these filings and are not collected.
- **Company registers in other countries**: France, Norway and Finland are read directly from the national register (status, number, dates, address; France and Norway also name the officers). The United Kingdom works with a free Companies House key and adds owners with significant control. Every other country gets a link to its official register, and the OpenCorporates key covers about 140 jurisdictions.
- **Country file**: for any country, in view or typed: the US travel advisory level, capital, population, head of state and government, languages, dialling code, emergency numbers, currency with today's rate, and World Bank figures for the economy, inflation, unemployment, life expectancy and people online, with buttons for news there and the company register. Emergency mode now uses these emergency numbers in every country.
- **Inspect** now shows recorded facts only by default; the illustrative zoom to the atom is a setting.
- **Speed**: the globe stops drawing behind full-screen panels, Photoreal 3D only builds the camera points near you, and a Smooth / Balanced / Sharp setting controls 3D detail.

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
