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
| Google Maps Platform (Map Tiles API, Street View, Routes) | Photoreal 3D cities (the default 3D close-up, with Google's required credit on screen), Street View, routing | Google Maps Platform Terms; user's own key |
| Google Cloud Vision | Where is this? landmark recognition, and a landmark for Help with a photo when the position is rough | Google Cloud Terms; user's own key only |
| Esri World Imagery, World Street Map, Light and Dark Gray Canvas, World Transportation and World Boundaries and Places | Globe imagery and map styles, road and label overlays | Esri terms of use; attribution required |
| OpenStreetMap, Nominatim, Overpass | Place search, building outlines | ODbL; attribution required; fair-use limits |
| OpenFreeMap | The dark globe (land, water, roads, buildings, borders and place names) and building shapes in the standard 3D view | OpenStreetMap data, ODbL; credited behind the map's ⓘ button |
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
| MBTA V3 API (Boston) | Live buses, subway, light rail, commuter rail and ferries | MassDOT Developers License Agreement |
| SEPTA TransitView (Philadelphia) | Live buses and trolleys | SEPTA open data terms |
| TTC via Umo public feed (Toronto) | Live buses and streetcars | TTC open data licence |
| King County Metro GTFS-Realtime (Seattle) | Live bus positions | King County open data terms |
| CapMetro GTFS-Realtime via data.texas.gov (Austin) | Live bus and rail positions | Texas Open Data Portal terms |
| HSL GTFS-Realtime (Helsinki) | Live bus, tram, metro and train positions | CC BY 4.0 |
| Metro Transit GTFS-Realtime (Minneapolis–St Paul) | Live bus and rail positions | Metro Transit open data terms |
| RTD GTFS-Realtime (Denver) | Live bus and rail positions | RTD open data terms |
| Calgary Transit GTFS-Realtime (City of Calgary) | Live bus and train positions | Open Government Licence – City of Calgary |
| ETS GTFS-Realtime (City of Edmonton) | Live bus and LRT positions | City of Edmonton Open Data Terms of Use |
| Halifax Transit GTFS-Realtime | Live bus and ferry positions | Halifax open data terms |
| Translink GTFS-Realtime (South East Queensland) | Live bus, train, tram and ferry positions | CC BY 4.0 |
| OVapi GTFS-Realtime (Netherlands) | Live public transport positions | OVapi terms |
| Entur GTFS-Realtime (Norway) | Live public transport positions | NLOD |
| Amtraker (public Amtrak data) | Live Amtrak trains | Community API over Amtrak's public train status |
| National Hurricane Center (NOAA) | Active hurricanes and tropical storms | US public domain |
| NOAA National Water Prediction Service | River levels, flood categories and forecasts | US public domain |
| NOAA Tides & Currents (CO-OPS) | Tide stations, water levels and high/low predictions | US public domain |
| US Tsunami Warning Centers (tsunami.gov) | Tsunami warnings, advisories, watches and statements | US public domain |
| National Interagency Fire Center (WFIGS) | Current wildfire perimeters | US public domain |
| NOAA Space Weather Prediction Center | Planetary K-index and aurora forecast | US public domain |
| CityBikes | Bike-share docks and available bikes | CityBikes API terms; data from each operator |
| MobilityData GBFS systems list and operators' public GBFS feeds | Available shared scooters and e-bikes | Systems list CC BY 4.0; feeds under each operator's terms |
| City of Austin open data | Traffic incidents and work zones (WZDx) | City of Austin open data terms |
| City of Calgary open data | Traffic incidents | Open Government Licence – City of Calgary |
| U.S. Customs and Border Protection | Land border wait times | US public domain |
| Bureau of Transportation Statistics (Border Crossing Entry Data) | Border port locations (bundled) | US public domain |
| OpenStreetMap via Overpass | Hospitals, fire and police stations, pharmacies, libraries, toilets, EV chargers, Wi-Fi, parks, national parks, ferry terminals, power plants, fuel stations, communication towers, wind farms outside the US, museums, historic sites, World Heritage sites and farm shops | ODbL |
| FEMA National Shelter System | Open emergency shelters | US public domain |
| IODA (Georgia Tech) | Internet outages by country | IODA terms of use; attribution required |
| OpenFEMA | Disaster declarations | US public domain; OpenFEMA terms |
| City of Seattle open data | Seattle Fire Department 911 dispatches | City of Seattle open data terms |
| Google DSPL canonical countries | Country centre points (bundled) | Apache License 2.0 |
| Radio Browser | Internet radio station directory | Public domain directory; streams belong to each station |
| National Weather Service NOAA Weather Radio listing | Transmitter sites, frequencies and status | US public domain |
| LiveATC | Air traffic audio (link only) | Opens LiveATC's own site |
| ExchangeRate-API open access (open.er-api.com) | Currencies against the US dollar, updated daily | Free with attribution ("Rates by Exchange Rate API", shown on each item) |
| GDELT 2.0 event files (data.gdeltproject.org) | Conflict reports: strikes, shelling and clashes from the last 24 hours, read by the data feed | Free and open; cite GDELT. Machine-coded from news and unverified; shown as such |
| NASA GIBS (VIIRS Corrected Reflectance, Day/Night Band, Black Marble) | Satellite views of the globe | NASA open data; no restrictions, attribution requested |
| NOAA Hazard Mapping System | Smoke plumes and fire detections | US public domain |
| Open-Meteo air quality (Copernicus CAMS) | Modelled air quality | CC BY 4.0 |
| WHO Disease Outbreak News | Outbreak reports | WHO terms of use |
| World Bank Open Data | Country positions, economic, country-fact and farming indicators | CC BY 4.0 |
| iNaturalist | Wildlife observations and photos | Observations CC licences chosen by each observer; photo licences vary |
| USGS Water Services | River and lake levels | US public domain |
| FAA National Airspace System status | Airport delays and closures | US public domain |
| aviationweather.gov (NOAA/NWS) | Airport positions | US public domain |
| US Department of State travel advisories | Advisory levels | US public domain |
| Smithsonian Global Volcanism Program | Volcanoes of the world | Smithsonian terms; attribution required |
| USGS Volcano Hazards Program (HANS) | US volcano alert levels | US public domain |
| U.S. Drought Monitor (NDMC, USDA, NOAA) | Drought areas | Free to use with credit to the U.S. Drought Monitor |
| Open-Meteo weather forecast API | Temperature grid | CC BY 4.0 |
| Wikidata | Place population and facts | CC0 |
| TeleGeography Submarine Cable Map | Undersea cable routes, owners, length, service dates and landing points | CC BY-NC-SA 3.0 (non-commercial); commercial use needs a TeleGeography data licence |
| U.S. Wind Turbine Database (USGS, LBNL, American Clean Power) | Wind farms in the US | US public domain |
| d3-celestial data (Olaf Frohn) | Star positions, constellation lines and names for the sky | BSD 3-Clause |
| JPL Approximate Positions of the Planets (Standish) | Planet positions | US public domain |
| us-atlas and world-atlas (TopoJSON) | State, county and country outlines for Focus mode and disaster declarations | ISC licence; data from the US Census Bureau and Natural Earth (public domain) |
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
| adsb.lol · adsb.fi (community ADS-B networks) | Aircraft positions for the area in view when OpenSky does not answer; flight lookup by callsign | ODbL / open data |
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

Windy Webcams (the app's shared key, or the user's own; Windy terms and attribution apply), the OpenTrafficCamMap community list, and public feeds published by: Caltrans, TxDOT and DriveTexas, NYC DOT, WSDOT, Oregon DOT, Ohio (OHGO), the state and provincial 511 systems (Georgia, Louisiana, Wisconsin, Arizona, Nevada, Alaska, Idaho, Utah, Florida, Connecticut, New England, Pennsylvania, New York, South Carolina, Alabama, Arkansas, North Carolina, Ontario, Alberta, Saskatchewan, Manitoba, New Brunswick, Nova Scotia, Prince Edward Island, Newfoundland and Labrador, Yukon), the Castle Rock state systems (Minnesota, Nebraska, Indiana, Kansas, Colorado, Massachusetts, South Dakota, Kentucky, Illinois, Iowa), DriveBC, Transport for London, Fintraffic, Hong Kong Transport Department, LTA Singapore, Transport for NSW, Queensland, NZ Transport Agency, Spain DGT, Taiwan Freeway Bureau, US National Park Service, USGS and ALERTCalifornia.

Each camera shows its source in the app. Agencies publish these for public viewing; reuse terms differ by agency.

## Original to this project

The globe renderer, camera connectors, clustering, Drive module, tracker, ground-mapping maths, Inspect renderer and all 3D models (aircraft, ship, satellite, vehicles) were written for this project. The models are generic illustrations, not copies of any manufacturer's design.
