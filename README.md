# Ojos de Dios

**Eyes open. Always.**

A live globe of publicly published cameras and open world data, for Android (APK), with a web version.

**Designed and directed by Mark Joseph. The code was written with Claude (Anthropic) to his direction.**
It connects public feeds; it does not create them. Credit for the data belongs to the agencies listed below.

## What it does

- **Cameras:** about 39,000 public traffic, weather, wildfire, park and ocean cameras from 40+ agencies, on one globe. Tap one and it plays inside the app.
- **Live video** where the agency offers a stream (for example TxDOT and Caltrans); fast-refreshing pictures everywhere else.
- **Drive:** enter a start and a destination and see every camera along the route in driving order, with turn-by-turn tracking.
- **Street View:** opens at the nearest street to a camera and shows the distance and direction back to it.
- **World layers:** aircraft, satellites, ships, weather radar, earthquakes, fires and storms, day and night.
- **Photoreal 3D:** real textured 3D cities with live aircraft, ships, satellites and flight paths.
- **Inspect:** a guided zoom from a whole aircraft, ship, satellite or building down to a single atom. Buildings use the public record (real outline, mapped parts, facts, and an indoor plan where one exists); everything else is labelled as typical or generic on screen.
- **News desk:** the latest headlines for whatever area you are looking at, for its country and for the world, each linking to the original article.
- **Broadcast:** one bar across every view when something nationwide or worldwide is happening, such as widespread flight ground stops, a tsunami warning or a magnitude 7 earthquake. It is driven by official feeds (FAA, US National Weather Service, GDACS, USGS), and by news only when at least three separate outlets report the same event.
- **Flight log:** for any aircraft, where it has flown recently, whether it is on course right now, and (with an optional key) what it is scheduled to fly next and whether it is on time.
- **Briefing and watchlist:** saved places with weather, cameras and headlines; watched aircraft and ships with status changes announced.
- **Replay, map styles, text size, share card and a first-run guide.**
- **Command mode and Command wall:** an operations-room layout of the same public data.
- **Live chatter:** public posts from Bluesky and Mastodon (and X with your own token) about a topic, clearly marked unverified.
- **Search by flight number or ship name, camera compare, one Settings screen.**
- **Layer control:** hide any layer, hide them all at once, or hide the panel itself.
- **Smart alerts, voice search, multi-camera wall, anonymous object detection** (object classes only).
- **Live report:** one tap tests every network and exports a PDF.

## What it deliberately does not do

- No licence-plate reading, no vehicle or person identification, no tracking of individuals.
- No private cameras. Only feeds that agencies publish for the public.
- Property records show organisations and public bodies only; private owners' names are not shown.

## How it is built

| File | What it is |
| --- | --- |
| `index.html` | The built app: one self-contained file the phone loads. **Generated, do not edit.** |
| `src-template.html` | Page markup and styles. |
| `src-01-…` to `src-11-….js` | The app logic, split by area (renderer, camera networks, drive, layers, and so on). |
| `src-data-*.json` | Bundled data: place names, coastline dots, fallback portal list. |
| `build.py` | Joins the sources into `index.html`. `python3 build.py --check` verifies they match. |
| `.github/workflows/apk.yml` | Tests, builds, signs and publishes the Android APK (and an unsigned iPhone file) on every push. |
| `get.html` | Download page. |
| `tests.js` | Unit tests, run on every build. |
| `SECURITY.md` | Security model, how to report a problem, known limits. |
| `PRIVACY.md` | What the app does and does not do with data. |
| `THIRD-PARTY.md` | Every library and data source, with its licence or terms. |

The Android app is a Capacitor wrapper so requests go out natively (many agencies block browser requests).

### What is original and what is not

- **Written for this project:** the globe renderer (canvas and WebGL), the camera-network connectors, clustering, the Drive module, the vehicle tracker, the ground-mapping maths, the Inspect renderer and its models, and the build pipeline.
- **Existing libraries, used as intended and credited:** orbit maths is [satellite.js](https://github.com/shashwatak/satellite-js); object detection is [TensorFlow.js COCO-SSD](https://github.com/tensorflow/tfjs-models); video is [hls.js](https://github.com/video-dev/hls.js); the 3D city views are [CesiumJS](https://github.com/CesiumGS/cesium) and [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js).
- **Data:** none of it is ours. Every feed belongs to the agency that publishes it.

The full list, with each source's licence and terms, is in [THIRD-PARTY.md](THIRD-PARTY.md).

## Web version

The same app runs in a browser at `https://quuxin2-a11y.github.io/dios-prototype.civ/` once GitHub Pages is switched on for this repository (Settings → Pages → Deploy from a branch → `main`, `/ (root)`). Browsers block some agency feeds that the installed app can reach, so the Android app shows more.

## Build and install

1. Push to `main`. GitHub Actions runs the tests, then builds the APK in about five minutes.
2. Download `ojos-de-dios.apk` from the latest release. The release notes carry its SHA-256 so you can check the file you downloaded is the file that was built.
3. With the `KEYSTORE_B64` and `KEYSTORE_PASSWORD` repository secrets set, the APK is a release build signed with the project's private key. Without them the workflow says so and produces a debug build.

API keys are entered inside the app and stay on the device. None are stored in this repository.

## Security

- Signing key and its password live only in GitHub encrypted secrets, never in the repository.
- The workflow runs with read-only permissions; only the publishing job can write a release.
- Every pinned third-party script is loaded with a Subresource Integrity hash computed at build time, so an altered CDN file is refused.
- Each release carries a SHA-256 checksum and a signed build-provenance attestation, and the code is scanned by CodeQL on every push.

Details, the threat model and the known limits are in [SECURITY.md](SECURITY.md). Privacy is in [PRIVACY.md](PRIVACY.md).

## Testing

- CI rebuilds the app from the sources and stops the build if `index.html` is out of date or the JavaScript does not parse.
- The in-app live report tests three real cameras from every network on the device.
- `tests.js` holds unit tests for the detection, tracking, ground-mapping and geometry code. They run against the real source files on every build (`node tests.js`), and a failing test stops the APK from being built.

## Known limits

- Feeds change without notice; the live report shows which are down.
- iPhone: the workflow produces an unsigned `.ipa`, which needs an Apple Developer account or a sideloading tool to install.
- Alerts and tracking run only while the app is open.

© 2026 Mark Joseph. All rights reserved. See [LICENSE](LICENSE).
