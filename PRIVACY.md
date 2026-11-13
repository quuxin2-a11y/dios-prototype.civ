# Privacy

## Data about you

- **No account, no sign-in, no analytics, no advertising, no tracking code.** This project has no server, so there is nowhere for your data to go.
- **Location** is used only on the device, only when you use Drive or "near me", to place you on the map and find cameras along your route. If you choose Google routing, your start and destination go to Google under your own key; otherwise to the public OSRM router.
- **Microphone** is used only while you hold voice search. Speech recognition is done by the phone's own service.
- **API keys, favourites and settings** stay in the app's storage on your device. Uninstalling the app removes them.
- **The diagnostic report** is created only when you ask, contains feed status and key names (never key values), and goes only where you send it.

Requests for cameras, map tiles and world data go directly from your device to the agency or provider that publishes them. Those providers see your IP address, as any website does.

## Data about other people

- **Only publicly published cameras.** Every camera is one an agency has put on the public internet for the public to view. No private, hacked, default-password or unlisted cameras.
- **No identification.** The app does not read licence plates, recognise faces, or identify the make, model or owner of a vehicle.
- **Object detection is by class only** (car, truck, bus, person). It runs on the device. Nothing is uploaded.
- **Vehicle tags are throwaway counters.** A tag like `VEH-04127` is a number assigned for the current viewing so a box can be followed across frames. It is not derived from the vehicle, is not stored, and resets when the view closes.
- **Nothing is recorded.** The app does not save video or images from cameras.
- **Property layer** shows organisations and public bodies only; private owners' names are not shown.
- **Aircraft and ships** come from open transponder data (ADS-B and AIS) that the craft broadcast publicly.
