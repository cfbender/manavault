# Mobile Scanner

## HTTPS testing from a phone

Phone browsers require a secure context for camera access. `http://localhost:4000`
works only on the same device running Phoenix. A phone visiting
`http://<computer-lan-ip>:4000` will load the app but will not expose the camera.

Use one of these paths for phone testing:

- Preferred quick path: run a trusted HTTPS tunnel, such as Cloudflare Tunnel or ngrok, to `localhost:4000`.
- Local-network path: serve Phoenix with HTTPS using a certificate trusted by the phone.
- Device-local path: run ManaVault on the phone or tablet itself and open `localhost`.

The scanner reports the secure-context problem in the camera panel when the page
is opened from an insecure phone URL.

## Supported browser expectations

- iPhone and iPad: Safari is the primary supported browser. Installed web apps use Safari's WebKit camera behavior.
- Android: Chrome is the primary supported browser. Other Chromium browsers may work, but are not the baseline.
- Desktop: Chrome and Safari are useful for development. Desktop camera testing is not a substitute for phone testing because camera selection, torch, zoom, and permission behavior differ by device.

Known limitations:

- Camera access requires HTTPS, except for same-device `localhost`.
- Torch and zoom controls are device and browser dependent. The scanner hides or disables controls when the active camera does not advertise support.
- iOS browser engines share Safari/WebKit camera constraints, so switching browsers on iPhone is unlikely to fix scanner capability issues.
- Installed PWA mode does not remove the HTTPS requirement and should be validated separately from normal browser mode.

## Mobile scanner ergonomics

The scanner is designed around a phone held above a card:

- It defaults to the environment-facing camera when no specific camera has been selected.
- It keeps the camera preview within the visible viewport on small screens.
- It keeps routine scanner status below the camera preview and shows actionable errors there.
- It supports camera switching, torch, and zoom where the browser exposes those capabilities.
- It provides scanner-only options for preferring foil and locking recognition to selected sets.
- It auto-captures frames and treats tapping the preview as a forced rescan of the current card.

## Capacitor direction

Pursue Capacitor native shells alongside the web PWA. Android Chrome accepts the
PWA manifest and service worker but may still withhold install UI on the target
device. A native shell also aligns with the expected product needs:

- explicit camera and lens selection beyond what mobile browsers reliably expose
- mobile backup and restore through native file picker/share/storage APIs
- a stable install path that does not depend on Chrome PWA prompt heuristics

The Android shell now boots into bundled setup assets, lets the user choose a
ManaVault server URL, checks GitHub releases for newer APKs, and opens the
configured server inside the WebView. The iOS shell still syncs from the same
Capacitor project and requires macOS/Xcode to build or run. Native bridges
should be added incrementally, starting with camera/lens selection and then
backup/restore file workflows.
