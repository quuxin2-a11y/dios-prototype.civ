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
| [capacitor-community/speech-recognition](https://github.com/capacitor-community/speech-recognition) | MIT |

## Maps and imagery

| Source | Used for | Terms |
| --- | --- | --- |
| Google Maps Platform (Map Tiles API, Street View, Routes) | Photoreal 3D cities, Street View, routing | Google Maps Platform Terms; user's own key; paid beyond free tier |
| Esri World Imagery | Globe imagery | Esri Master Agreement; attribution required; commercial use needs a licence |
| OpenStreetMap, Nominatim, Overpass | Place search, building outlines | ODbL; attribution required; fair-use limits |
| OpenFreeMap | Building shapes in the standard 3D view | OpenStreetMap data, ODbL |
| Terrain tiles on AWS | Terrain in the standard 3D view | Open data; attribution required |
| OSRM public router | Routing without a Google key | Demo server; fair use only |

## World data

| Source | Used for | Terms |
| --- | --- | --- |
| OpenSky Network | Live aircraft and flown tracks | Research and non-commercial use; commercial use needs a licence |
| adsbdb | Flight origin and destination | Free public API |
| CelesTrak | Satellite orbital elements | Free public data |
| Digitraffic (Fintraffic) | Ships, Finnish cameras | CC BY 4.0 |
| AISStream | Ships (optional, user's key) | Provider terms |
| RainViewer | Weather radar | Free API; attribution required |
| Open-Meteo | Weather | CC BY 4.0; non-commercial free tier |
| USGS | Earthquakes, volcano cameras | US public domain |
| NASA EONET | Fires, storms and other events | US public domain |
| NOAA NDBC | Ocean buoy cameras | US public domain |

## Cameras

Windy Webcams (user's key; free tier restricts commercial use), the OpenTrafficCamMap community list, and public feeds published by: Caltrans, TxDOT and DriveTexas, NYC DOT, WSDOT, Oregon DOT, Ohio (OHGO), the state and provincial 511 systems (Georgia, Louisiana, Wisconsin, Arizona, Nevada, Alaska, Idaho, Utah, Florida, Connecticut, New England, Pennsylvania, New York, South Carolina, Alabama, Arkansas, North Carolina, Ontario, Alberta, Saskatchewan, Manitoba, New Brunswick, Nova Scotia, Prince Edward Island, Newfoundland and Labrador, Yukon), the Castle Rock state systems (Minnesota, Nebraska, Indiana, Kansas, Colorado, Massachusetts, South Dakota, Kentucky, Illinois, Iowa), DriveBC, Transport for London, Fintraffic, Hong Kong Transport Department, LTA Singapore, Transport for NSW, Queensland, NZ Transport Agency, Spain DGT, Taiwan Freeway Bureau, US National Park Service, USGS and ALERTCalifornia.

Each camera shows its source in the app. Agencies publish these for public viewing; reuse terms differ by agency and should be checked before commercial use.

## Original to this project

The globe renderer, camera connectors, clustering, Drive module, tracker, ground-mapping maths, Inspect renderer and all 3D models (aircraft, ship, satellite, vehicles) were written for this project. The models are generic illustrations, not copies of any manufacturer's design.
