# Ojos de Dios

[![Build, test and release](https://github.com/quuxin2-a11y/dios-prototype.civ/actions/workflows/apk.yml/badge.svg)](https://github.com/quuxin2-a11y/dios-prototype.civ/actions/workflows/apk.yml)
[![Latest release](https://img.shields.io/github/v/release/quuxin2-a11y/dios-prototype.civ?label=release)](https://github.com/quuxin2-a11y/dios-prototype.civ/releases/latest)
![Platform](https://img.shields.io/badge/platform-Android%20%7C%20Web-0f8f84)
![License](https://img.shields.io/badge/license-source--available-lightgrey)

**Eyes open. Always.**

Ojos de Dios is a situational-awareness app for Android and the web. It puts publicly published cameras, official warnings, aircraft, ships, satellites, 3D cities and public records on one interactive globe, and adds a State of Emergency mode that turns that data into clear next steps for the person holding the phone.

It runs entirely on the device: no accounts, no backend, no tracking.

**[Download for Android](https://github.com/quuxin2-a11y/dios-prototype.civ/releases/latest)** · **[Open the web version](https://quuxin2-a11y.github.io/dios-prototype.civ/)** · **[Interactive feature guide](https://quuxin2-a11y.github.io/dios-prototype.civ/guide.html)**

---

## Contents

- [Features](#features)
- [Platforms](#platforms)
- [Architecture](#architecture)
- [Project layout](#project-layout)
- [Building from source](#building-from-source)
- [Testing](#testing)
- [Continuous integration](#continuous-integration)
- [Security and privacy](#security-and-privacy)
- [Data sources](#data-sources)
- [Out of scope by design](#out-of-scope-by-design)
- [Known limitations](#known-limitations)
- [License](#license)

## Features

**Emergency response**
- **State of Emergency mode:** live position, official alerts for that exact point (US National Weather Service; 38 European national services via MeteoAlarm), nearby hazards, weather and air quality, and a one-tap call to the local emergency number.
- **Analyzer:** a rule-based assessment (no model, no guessing) that restates the official instruction, gives a threat level and the direction away from the hazard, and ranks the nearest hospitals, shelters and assembly points with its reasons.
- **Routing:** fastest, fewest cameras, back roads, or safest (scored against every reported hazard).
- **Family check-in, SOS signal (screen, tone and vibration) and an offline map pack.**

**Air, sea and orbit**
- **Finder:** flight number, callsign, tail number, ship name or MMSI, satellite or camera.
- **Flight log:** an aircraft's recent flights, schedule, delay and whether it is on course.
- **Cockpit view:** the real 3D world from a live aircraft's position and heading, with forecast-model weather at its altitude.
- Live aircraft, AIS vessels and satellites propagated from orbital elements; a watchlist with status alerts.
- Live public transit: buses, trains, trams, subways and ferries from operators' open data (MBTA, SEPTA, TTC, King County Metro, CapMetro, Metro Transit, RTD, Calgary Transit, Edmonton Transit, Halifax Transit, Translink in South East Queensland, the Netherlands, Norway, HSL and Amtrak), including GTFS-Realtime feeds decoded on the device.
- Emergency data: hurricanes and tropical storms, river flood gauges, tides, tsunami messages, wildfire perimeters, and space weather with the aurora forecast.
- Ground data: bike-share docks worldwide, shared scooters and e-bikes where operators publish open feeds, traffic incidents and work zones from city open data, and US land border wait times.
- Infrastructure: hospitals, fire and police stations, open emergency shelters, internet outages by country, federal disaster declarations by county, and Seattle fire and EMS calls.
- Radio: internet radio stations near the map view that play in the app, NOAA Weather Radio transmitters with frequency and status, and air traffic audio links (LiveATC) from aircraft details.
- Earth: NASA satellite views of the whole globe (yesterday in true colour, last night's lights, and the Black Marble city lights), wildfire smoke plumes and fire detections (NOAA), and modelled air quality.
- Health and public places: disease outbreak news by country, pharmacies, libraries, public toilets, EV chargers, free Wi-Fi and parks.
- Nature: national parks, recent wildlife sightings with photos, and live river and lake levels.
- Travel and economy: US airport delays and closures, State Department travel advisories, ferry terminals, and economic indicators by country.
- Energy, geology and climate: power plants, fuel stations, volcanoes with current US alert levels, the US Drought Monitor and live temperatures.
- Culture, area facts and farming: museums, historic sites, UNESCO World Heritage sites, population and facts for places and countries, farming indicators by country and farm shops.
- Networks and wind: undersea internet cables with owners, length, service date and landing points; cell and radio towers with their operators; and wind farms.
- Replica World (the default start since v69): the whole app as a 3D world with its own dashboard (top bar with live counts, search and the sky; dock with Layers, Cameras, Events, Planes, Ships, Trains and Settings), sharing every layer and setting with the globe. Five quick taps still open the signature; holding the logo opens the sky. One tap on the logo switches to the globe and back.
- Sky: the night sky right now over the place in view (stars, constellations such as Orion, the Moon and its phase, the Sun and planets), and the solar system on today's orbits.
- Replica 3D: a 3D globe from space with NASA imagery that builds a 3D model of whatever city is in view from OpenStreetMap (buildings at real height with mapped wall colours, materials and roof shapes including domes, building parts, trees, roads, water, parks) over US aerial photos and a 10 m Sentinel-2 mosaic elsewhere (non-commercial licence, credited on the map), with glowing country and state borders and names of countries, states, cities, neighbourhoods, streets and landmarks, with cameras, aircraft, ships, data layers and undersea cables drawn on the graphics chip. No third-party branding is shown; sources are behind the ⓘ button.
- Google 3D: one tap away, Google Photorealistic 3D Tiles in the same view (with Google's required logo). Briefing → Globe look also offers the clear and classic canvas globes, which are the fallback when the 3D engine cannot load.
- Focus mode: pick states, countries or city areas; they are lit and raised while the rest of the world dims, and cameras and data outside them pause.

**Cameras and 3D**
- 100,000+ public traffic, weather and city cameras on one globe, playing in-app; multi-view, compare and camera webs.
- Photoreal 3D cities (Google 3D Tiles), a key-free 3D terrain map, and Inspect for buildings and aircraft from the public record.

**Information**
- Area, national and world news; official alert feeds; a nationwide broadcast banner; a daily briefing.
- **Records:** property and organisation dossiers read directly from state and national business registers.
- **Country file:** travel advisory, leadership, emergency numbers, currency and World Bank indicators.

**Native Android**
- Home-screen **Emergency widget** that turns red while emergency mode is on.
- Long-press **app shortcuts** (Emergency, Finder, Briefing), keep-screen-awake and haptic SOS.

See the [interactive guide](https://quuxin2-a11y.github.io/dios-prototype.civ/guide.html) for every feature with walkthroughs.

## Platforms

| | Android app | Web (iPhone, iPad, desktop) |
|---|:---:|:---:|
| Emergency mode, routing, check-in, offline pack | ✓ | ✓ |
| Public cameras, Photoreal 3D, news, records, country file | ✓ | ✓ |
| Live aircraft, flight log, cockpit view | ✓ | — |
| Background alerts, widget, shortcuts, voice | ✓ | — |

Flight-position providers do not send CORS headers, so browsers cannot read them; the Android build makes those requests natively. The app is not yet listed on Google Play or the App Store.

## Architecture

```
            ┌────────────────────────────── Android (Capacitor 6) ──────────────────────────────┐
            │  MainActivity.java ── OjosNativePlugin.java ── EmergencyWidget.java                │
            │        │  shortcuts, widget, keep-awake, haptics           (Java, API 22+)        │
            │        ▼                                                                           │
            │  WebView ─ index.html ◄── build.py ◄── src-template.html + src-styles.css          │
            │                                       + src-NN-*.js + src-data-*.json              │
            └────────────────────────────────────────────────────────────────────────────────────┘
                     │ HTTPS (native HTTP on Android, fetch on the web)
                     ▼
     Public sources: transport-agency cameras · NWS · MeteoAlarm · USGS · NASA EONET · GDACS · OpenSky
                     AIS · transit open data (JSON, GTFS-Realtime) · CelesTrak · OpenStreetMap · Open-Meteo
                     state and national registers · World Bank
```

- **Client-only.** All logic runs on the device. User keys, saved places and contacts are kept in local storage and never transmitted except to the provider each key belongs to.
- **Rendering.** A custom Canvas 2D / WebGL globe for the default view; CesiumJS for photoreal 3D; MapLibre GL for the terrain map; a small WebGL renderer for Inspect.
- **Modules and bundle.** The application is 44 modules (`src-NN-*.js`), each a self-contained, syntax-checked and Prettier-formatted script with a header describing its responsibility. They share one scope: `build.py` concatenates them in order inside a single closure and resolves the `/*@include*/` markers in `src-template.html` (styles, modules and bundled JSON data) to produce `index.html`. The same file ships in the APK and on GitHub Pages, and CI fails if the committed bundle drifts from its sources.
- **Native layer.** `install_native.py` layers the Java sources and Android resources in this repo onto the Capacitor project generated in CI, and can roll them back.

## Project layout

| Path | Language | Purpose |
|---|---|---|
| `src-01-start.js` … `src-43-photo-help.js`, `src-99-start.js` | JavaScript | Application source in 44 modules by subsystem (renderer, camera networks, Photoreal 3D, Inspect, news, flight log, records, drive, emergency, cockpit, transit, emergency data, focus, ground data, infrastructure, radio, earth data, health/places/nature, travel/economy, energy/geology/climate/culture/farming, cables/towers/wind, Earth view, Replica, Replica World, sky, data feed, dark globe, photo help, start-up). Formatted with Prettier (`.prettierrc.json`) |
| `src-template.html` | HTML | Document structure, with `/*@include*/` markers filled in by `build.py` |
| `src-styles.css` | CSS | Design system and component styles |
| `src-data-*.json` | JSON | Bundled gazetteer, border port locations, country centre points, coastline points, fallback portal list and the generated 3D models |
| `MainActivity.java` | Java | Activity: plugin registration, launcher shortcuts, intent routing |
| `OjosNativePlugin.java` | Java | Capacitor plugin: launch actions, emergency state, keep-awake, vibration |
| `EmergencyWidget.java` | Java | `AppWidgetProvider` for the home-screen Emergency widget |
| `OjosNativePluginTest.java` | Java | JUnit tests for launch-action routing |
| `res-<type>--<name>.xml` | XML | Android resources (widget layout, provider info, drawables) |
| `build.py` | Python | Assembles `index.html`; `--check` verifies it matches the sources |
| `install_native.py` | Python | Installs / uninstalls the native sources into the generated Android project |
| `check_secrets.py` | Python | Fails CI on committed credentials or key files |
| `make_models.py` | Python | Generates the glTF models (NumPy) into `src-data-models.json` |
| `test_tools.py` | Python | `unittest` suite for the Python tooling |
| `test_browser.py` | Python | Headless-browser tests of the built app (Playwright) |
| `eslint.config.mjs`, `.prettierrc.json` | JavaScript, JSON | Lint and formatting rules |
| `tests.js` | JavaScript | Unit tests for the application logic, run against the real sources |
| `sw.js`, `manifest.webmanifest` | JavaScript, JSON | Service worker and web-app manifest |
| `index.html` | HTML | **Build output** of `build.py` (excluded from language statistics) |
| `guide.html`, `get.html` | HTML | Feature guide and download page |
| `.github/workflows/apk.yml` | YAML | CI: checks, tests, Android build, signing, release |

## Building from source

**Requirements:** Python 3.10+, Node.js 20, JDK 17, Android SDK (API 34).

```bash
# 1. Assemble the web bundle and verify it
python3 build.py
python3 build.py --check

# 2. Run the test suites
node tests.js
python3 -m unittest -v test_tools
python3 check_secrets.py .

# 3. Generate and build the Android project
mkdir -p app/www && cp index.html manifest.webmanifest sw.js *.png app/www/
cd app
npm init -y
npm install @capacitor/core@6 @capacitor/cli@6 @capacitor/android@6 \
            @capacitor/filesystem@6 @capacitor/share@6 @capacitor/local-notifications@6
echo '{"appId":"com.ojosdedios.app","appName":"Ojos de Dios","webDir":"www"}' > capacitor.config.json
npx cap add android
python3 ../install_native.py android
npx cap sync android
cd android && ./gradlew testDebugUnitTest assembleDebug
```

The debug APK is written to `app/android/app/build/outputs/apk/debug/`. Release builds are produced and signed only in CI.

## Testing

| Suite | Command | Covers |
|---|---|---|
| JavaScript | `node tests.js` | Detection and tracking, ground homography, geometry, flight progress, route scoring, warning matching, record matching, cockpit weather model, GTFS-Realtime decoding, hurricane and space-weather scales, TopoJSON outlines, GBFS and border-wait parsing, outage and disaster-declaration mapping, weather radio parsing, fire detections, air quality, outbreak and advisory placement, water gauges, economic indicators, volcano alerts, drought areas, place facts, cable details, wind farms, Replica buildings, colours and roofs, the data feed format, photo lookup protections, and sky positions (66 tests) |
| Browser | `python3 -m unittest -v test_browser` | Loads the built app in headless Chromium with every public source blocked: no script errors, embedded data, Finder, Records, Country file, the Emergency mode confirmation, the transit layer, the emergency data layers, border wait times, traffic incidents, internet outages, weather radio, smoke and fire, NASA views, airport delays, outbreaks, volcanoes, drought, undersea cables, the Earth view and Replica (against a stand-in 3D engine), start-up on the dark globe and switching to 3D, the dark globe's style and data layers (against a stand-in map engine), the shared data feed, cameras from the last session at start-up, Hide menus, start-up with saved settings and Focus mode, with sample data from each source (32 tests) |
| Python | `python3 -m unittest -v test_tools` | Secret scanner, native installer (install, idempotence, rollback) |
| Java | `./gradlew testDebugUnitTest` | Launch-action routing in the native plugin |
| Sources | `node --check`, `eslint`, `prettier --check`, `python3 build.py --check` | Every module parses on its own and passes ESLint's recommended rules (`eslint.config.mjs`, including undefined-name checks across modules), formatting is consistent, and the committed `index.html` matches its sources |
| On device | Settings → Testing → System check | Reachability of every public source; local error log with a shareable report |

## Continuous integration

Every push to `main` runs [`apk.yml`](.github/workflows/apk.yml):

1. Syntax-check and lint every module, check formatting with Prettier, and verify the bundle matches its sources.
2. Run the JavaScript, browser and Python test suites and the secret scan.
3. Generate the Capacitor project, install the native Java sources, pin third-party scripts with Subresource Integrity hashes.
4. Run the Java unit tests, then build and sign the release APK (falling back to the web-only build if the native layer fails to compile).
5. Publish the APK with its SHA-256 checksum and a signed build-provenance attestation.
6. Scan the JavaScript modules, Python tools and Java sources with CodeQL.

Every 20 minutes [`data.yml`](.github/workflows/data.yml) runs [`harvest.py`](harvest.py): it opens the built app in headless Chromium, lets every public camera network and every worldwide data layer load, and publishes the result as `cams.json`, `layers.json` and `meta.json` on the `data` branch (one commit, replaced each run). The app reads these at start-up (`src-41-feed.js`), so a phone gets everything in one download and does not ask the networks the feed covers while it is fresh (3 hours). A run that loads too few cameras publishes nothing, so a bad run never replaces a good feed. Networks needing a user's own key and the Windy catalogue (which the phone keeps itself) are not in the feed.

Workflows run with read-only permissions by default; only the release job and the data feed can write.

## Security and privacy

- Release signing key and password exist only as encrypted repository secrets.
- `check_secrets.py` blocks any commit containing a credential or key file.
- Two provider keys ship with the app so it works without setup. Each is restricted by its provider to this app's origins and to a single read-only service; they are documented in [SECURITY.md](SECURITY.md).
- No analytics, no accounts, no server. Details in [PRIVACY.md](PRIVACY.md).

Report a vulnerability as described in [SECURITY.md](SECURITY.md).

## Data sources

All data belongs to the agencies and projects that publish it. Libraries used: [CesiumJS](https://github.com/CesiumGS/cesium), [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js), [satellite.js](https://github.com/shashwatak/satellite-js), [hls.js](https://github.com/video-dev/hls.js), [TensorFlow.js COCO-SSD](https://github.com/tensorflow/tfjs-models) and [Capacitor](https://github.com/ionic-team/capacitor). Every source and library, with its licence or terms, is listed in [THIRD-PARTY.md](THIRD-PARTY.md).

## Out of scope by design

- No licence-plate reading, vehicle identification or tracking of individuals.
- No private or covert sources: only feeds that agencies publish for the public.
- Records show organisations and public bodies only; private individuals are never named.

## Known limitations

- Public feeds change without notice; the in-app System check shows which are down.
- The web build cannot show live aircraft (see [Platforms](#platforms)).
- Background alerts require the app to be running in the background.
- The iOS build is unsigned and needs an Apple Developer account to install.

## License

**Source-available. All rights reserved.** You may read the code and build it for personal evaluation; any other use requires written permission. See [LICENSE](LICENSE).

© 2026 Mark Joseph
