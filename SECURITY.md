# Security

## Reporting a problem

Please report security problems privately: on this repository open **Security → Report a vulnerability**. Do not open a public issue for something exploitable. You will get a reply, and credit in the changelog if you want it.

## What the app is

A client-only app. There is no server, no account system and no database belonging to this project. The app fetches public feeds directly from the agencies that publish them and draws them on the device.

## What is protected, and how

| Asset | Protection |
| --- | --- |
| Release signing key | Stored only as GitHub encrypted secrets (`KEYSTORE_B64`, `KEYSTORE_PASSWORD`). Never committed. RSA 4096, PKCS12. Written to the runner's temp disk for the build and discarded with the runner. |
| User's API keys (Google, Windy and others) | Typed into the app by the user, stored only in that device's app storage, masked in the interface, never written to logs or to the diagnostic report (which lists key names only), never sent anywhere except the service the key belongs to. |
| Build pipeline | Workflow default permission is `contents: read`. Only the final publishing job has `contents: write`. No third-party action receives the signing key. |
| Third-party code at run time | Libraries are pinned to exact versions. At build time the workflow downloads each one, computes its SHA-384 and bakes it into the app, and the app loads them with Subresource Integrity, so a file altered on the CDN is refused by the WebView. |
| What users download | Every release lists the APK's SHA-256 and carries a signed build-provenance attestation linking the file to the commit and workflow run that produced it (`gh attestation verify ojos-de-dios.apk --repo OWNER/REPO`). |
| Source | CodeQL scans the JavaScript on every push. Unit tests and a source/bundle consistency check gate the build. |

## Handling of outside data

Every feed is treated as untrusted input. Feed text goes through one HTML-escaping helper before it is displayed. Feed URLs are used as image, video or fetch targets, never evaluated as code, and the app does not execute anything received from a feed. This has not had an independent audit; reports are welcome.

## Android permissions

Internet; location (only for the Drive module and "near me", asked at the moment of use); microphone (only for voice search, asked at the moment of use). Nothing else. Nothing runs in the background.

## Known limits, stated plainly

- **Build dependencies are pinned by major version, without a lockfile.** The Capacitor packages are installed fresh on each build. A lockfile committed to the repository is the planned fix.
- **GitHub Actions are pinned by version tag, not commit hash.** Dependabot (`.github/dependabot.yml`) keeps them current; hash pinning is the planned fix.
- **CesiumJS loads its own worker and asset files** from the same pinned CDN path; the main script is integrity-checked, those secondary files are not.
- **No Content-Security-Policy yet.** The app talks to more than eighty agency hosts and the list changes; a policy that enumerates them is planned.
- **Sideloaded APK.** Android will still show its standard "unknown source" prompt for any app installed outside the Play Store, signed or not.
- **Camera positions and directions are estimates** where agencies do not publish them.

## What the app will not do

No licence-plate reading, no face or person identification, no tracking of individuals, no private cameras. See PRIVACY.md.
