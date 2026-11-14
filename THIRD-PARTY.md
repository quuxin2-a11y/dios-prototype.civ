# Third-party software and data

This project connects existing libraries and public data. It does not claim them. Credit and rights stay with their owners.

## Libraries (loaded at run time, pinned, integrity-checked)

| Library | Used for | Licence |
| --- | --- | --- |
| [CesiumJS](https://github.com/CesiumGS/cesium) 1.146.0 | Photoreal 3D view | Apache-2.0 |
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) 5.6.0 | Standard 3D view | BSD-3-Clause |
| [TensorFlow.js](https://github.com/tensorflow/tfjs) 4.22.0 and [COCO-SSD](https://github.com/tensorflow/tfjs-models) 2.2.3 | Object detection | Apache-2.0 |
| [satellite.js](https://github.com/shashwatak/satellite-js) 4.1.4 | Satellite orbit maths (SGP4) | MIT |
| [hls.js](https://github.com/video-dev/hls.js) 1.5.17 | Live video playback | Apache-2.0 |

## Build tools

| Tool | Licence |
| --- | --- |
| [Capacitor](https://github.com/ionic-team/capacitor) 6 and its Filesystem and Share plugins | MIT |
| [Capacitor Local Notifications](https://github.com/ionic-team/capacitor-plugins) | MIT |
| [capacitor-community/speech-recognition](https://github.com/capacitor-community/speech-recognition) | MIT |

## Maps and imagery

| Source | Used for | Terms |
| --- | --- | --- |
| Google Maps Platform (Map Tiles API, Street View, Routes) | Photoreal 3D cities, Street View, routing | Google Maps Platform Terms; user's own key |
| Esri World Imagery, World Street Map, Light and Dark Gray Canvas, World Transportation and World Boundaries and Places | Globe imagery and map styles, road and label overlays | Esri terms of use; attribution required |
| OpenStreetMap, Nominatim, Overpass | Place search, building outlines | ODbL; attribution required; fair-use limits |
| OpenFreeMap | Building shapes in the standard 3D view | OpenStreetMap data, ODbL |
| Terrain tiles on AWS | Terrain in the standard 3D view | Open data; attribution required |
| OSRM public router | Routing without a Google key | Demo server; fair use only |

## World data

| Source | Used for | Terms |
| --- | --- | --- |
| OpenSky Network | Live aircraft and flown tracks | OpenSky Network terms of use |
| adsbdb | Flight origin and destination, aircraft register | Free public API |
| AeroDataBox (optional, user's key) | An aircraft's scheduled flights and delays | AeroDataBox terms |
| CelesTrak | Satellite orbital elements | Free public data |
| Digitraffic (Fintraffic) | Ships, Finnish cameras | CC BY 4.0 |
| AISStream | Ships (optional, user's key) | Provider terms |
| RainViewer | Weather radar | Free API; attribution required |
| Open-Meteo | Weather | CC BY 4.0; Open-Meteo terms |
| USGS | Earthquakes, volcano cameras | US public domain |
| NASA EONET | Fires, storms and other events | US public domain |
| NOAA NDBC | Ocean buoy cameras | US public domain |

## News and alerts

| Source | Used for | Terms |
| --- | --- | --- |
| GDELT Project | Headlines by area | Open data; attribution |
| Google News RSS | Headlines (fallback and top stories) | Google terms; headlines link to the publisher |
| FAA NAS Status | US ground stops and airport closures | US public domain |
| US National Weather Service | Extreme weather and civil alerts | US public domain |
| GDACS | Global disaster alerts | Free use with attribution |
| OpenStreetMap Nominatim | Naming the area in view | ODbL; fair-use limits |
| Bluesky public API | Live chatter: public posts | Bluesky terms; posts belong to their authors |
| State open-data portals: Texas, Colorado, New York, Oregon, Connecticut | Records: business registration status, number, formation date | Public record |
| Texas Comptroller public data API (optional, user's key) | Records: officers, directors and registered agent of Texas entities | Public record |
| France: API Recherche d'entreprises (data.gouv.fr) | Records: company status, SIREN, officers | Licence Ouverte 2.0 |
| Norway: Enhetsregisteret (Brønnøysund Register Centre) | Records: company status, number, roles | NLOD |
| Finland: PRH / YTJ open data | Records: company status, business ID, address | CC BY 4.0 |
| United Kingdom: Companies House API (optional, user's key) | Records: company status, owners with significant control, officers | Open Government Licence |
| Wikidata query service | Country file: capital, population, leaders, languages, emergency numbers, currency | CC0 |
| World Bank Open Data | Country file: economy and population indicators | CC BY 4.0 |
| US Department of State travel advisories | Country file: advisory level | US Government work |
| Frankfurter (European Central Bank rates) | Country file: exchange rate | Open data |
| MeteoAlarm (EUMETNET, national weather services) | Emergency mode: official weather warnings in Europe | CC BY 4.0 |
| GLEIF LEI register | Records: legal name, status, jurisdiction and addresses of organisations | CC0 |
| Wikidata | Records: founding year, officers and parent of well-known organisations | CC0 |
| OpenCorporates (optional, user's key) | Records: state company register entry and status | OpenCorporates terms |
| US National Weather Service point alerts | Emergency mode: alerts for the user's position | US Government work |
| Open-Meteo air quality | Emergency mode: air quality index | CC BY 4.0 |
| OpenStreetMap via Overpass | Emergency mode: hospitals, shelters, assembly points, fire, police, fuel, water. Plans directory: indoor maps | ODbL |
| OSRM demo server | Drive: alternative routes and routes without motorways | ODbL data |
| Mastodon (mastodon.social public timelines) | Live chatter: public posts | Instance terms; posts belong to their authors |
| X API (optional, user's token) | Live chatter: public posts | X developer terms |

Headlines are shown with their source and open at the publisher. The app does not copy or summarise article text.

## Cameras

Windy Webcams (user's key; Windy terms and attribution apply), the OpenTrafficCamMap community list, and public feeds published by: Caltrans, TxDOT and DriveTexas, NYC DOT, WSDOT, Oregon DOT, Ohio (OHGO), the state and provincial 511 systems (Georgia, Louisiana, Wisconsin, Arizona, Nevada, Alaska, Idaho, Utah, Florida, Connecticut, New England, Pennsylvania, New York, South Carolina, Alabama, Arkansas, North Carolina, Ontario, Alberta, Saskatchewan, Manitoba, New Brunswick, Nova Scotia, Prince Edward Island, Newfoundland and Labrador, Yukon), the Castle Rock state systems (Minnesota, Nebraska, Indiana, Kansas, Colorado, Massachusetts, South Dakota, Kentucky, Illinois, Iowa), DriveBC, Transport for London, Fintraffic, Hong Kong Transport Department, LTA Singapore, Transport for NSW, Queensland, NZ Transport Agency, Spain DGT, Taiwan Freeway Bureau, US National Park Service, USGS and ALERTCalifornia.

Each camera shows its source in the app. Agencies publish these for public viewing; reuse terms differ by agency.

## Original to this project

The globe renderer, camera connectors, clustering, Drive module, tracker, ground-mapping maths, Inspect renderer and all 3D models (aircraft, ship, satellite, vehicles) were written for this project. The models are generic illustrations, not copies of any manufacturer's design.
