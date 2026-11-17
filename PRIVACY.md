# Privacy

## Data about you

- **No account, no sign-in, no analytics, no advertising, no tracking code.** This project has no server that receives anything from you. The shared data feed is a public file of public camera and layer data that the app downloads; nothing is sent to it.
- **Location** is used only on the device, only when you use Drive or "near me", to place you on the map and find cameras along your route. If you choose Google routing, your start and destination go to Google under your own key; otherwise to the public OSRM router.
- **Microphone** is used only while you hold voice search. Speech recognition is done by the phone's own service.
- **API keys, favourites and settings** stay in the app's storage on your device. Uninstalling the app removes them.
- **Live chatter** shows public posts exactly as their authors published them, with their public handle and a link to the original. The topic you type is sent to Bluesky and Mastodon (and X if you add a token) as a search. The app does not build profiles of the people posting and stores none of it.
- **State of Emergency mode** reads your position continuously while it is on. The position stays on the phone. To fetch alerts, weather and nearby safe places it is sent, rounded to about ten metres, to the US National Weather Service, Open-Meteo, OpenStreetMap's Nominatim and Overpass. "Share my location" sends it only where you choose, through your phone's own share sheet. The last situation is saved on the phone so it can be shown offline, and is replaced each time.
- **Records** sends the address or company name you type to Nominatim, the Texas parcel service, GLEIF, Wikidata and, if you added a key, OpenCorporates. It reports organisations only. When a property belongs to a private individual the name is not shown.
- **People on a business record** are shown only in their business role as it appears on the public filing, with the source named. The phone number shown is the business line the business publishes. The app does not look up personal phone numbers or home addresses.
- **Help with a photo** (Emergency mode) uses the photo you take and your phone's position, and only builds a message. Nothing is sent until you choose who gets it and press send: your check-in contacts, anyone through the share sheet, or 911 by text where offered. The photo is shrunk and its embedded location tags are removed first. If your position is missing or rough and you added a Cloud Vision key, the photo is also sent to Google to recognise a landmark.
- **Where is this?** sends the photo you choose, shrunk and without its location tags, to Google Cloud Vision under your own key, to recognise well-known public landmarks. Photos with a face or a person as the subject, and photos of homes, hotel rooms or other interiors, are not looked up: the app shows a notice instead of a location. The app does not keep the photo.
- **Family check-in** stores the names and numbers you enter on the phone only. The app opens your own messaging app with a ready text; you send it.
- **Offline pack** stores map tiles and the last situation on the phone.
- **System check** records app errors on the phone. The report is shared only when you tap share, and holds no location, key values or searches.
- **Shared keys.** When you have not entered your own key, requests for webcams near the area you are viewing go to Windy, and requests for 3D map tiles go to Google, using the app's shared keys. Those providers see the request and the area, as they would with your own key. Nothing about you is attached.
- **Finder** sends the flight number or registration you type to adsbdb and, if you added a key, AeroDataBox.
- **Saved places, watchlist and settings** are stored on the device only. Notifications are created on the device; there is no push server.
- **The diagnostic report** is created only when you ask, contains feed status and key names (never key values), and goes only where you send it.

- **News desk.** To find headlines, the app sends the coordinates of the map view to OpenStreetMap's Nominatim to get a place name, then sends that place name to GDELT and Google News. Nothing about you is attached. Dismissed broadcasts are remembered on the device only.

- **Data layers** (transit, emergency, ground, infrastructure and radio) send only the area being viewed or focused to the agency or directory that publishes the data. Playing a radio station connects your phone directly to that station's stream server.

Requests for cameras, map tiles and world data go directly from your device to the agency or provider that publishes them. Those providers see your IP address, as any website does.

## Data about other people

- **Only publicly published cameras.** Every camera is one an agency has put on the public internet for the public to view. No private, hacked, default-password or unlisted cameras.
- **No identification.** The app does not read licence plates, recognise faces, or identify the make, model or owner of a vehicle. Where is this? only checks whether a photo contains a face or a person, so that it can refuse to look it up; it never identifies anyone.
- **Object detection is by class only** (car, truck, bus, person). It runs on the device. Nothing is uploaded.
- **Vehicle tags are throwaway counters.** A tag like `VEH-04127` is a number assigned for the current viewing so a box can be followed across frames. It is not derived from the vehicle, is not stored, and resets when the view closes.
- **Nothing is recorded.** The app does not save video or images from cameras.
- **Property layer** shows organisations and public bodies only; private owners' names are not shown.
- **Shared scooters** are shown without their vehicle IDs, which operators rotate so trips cannot be followed.
- **Seattle fire and EMS calls** are shown exactly as the City of Seattle publishes them: call type and block-level address, with no names or patient details.
- **Aircraft and ships** come from open transponder data (ADS-B and AIS) that the craft broadcast publicly.
