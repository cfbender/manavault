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
- It shows scanner status directly over the preview.
- It supports camera switching, torch, and zoom where the browser exposes those capabilities.
- It auto-captures frames and treats tapping the preview as a forced rescan of the current card.

## Capacitor recommendation

Do not pursue a Capacitor wrapper yet. The current web scanner already covers the
core requirements when served over HTTPS, and the remaining high-risk questions
are camera quality, torch/zoom availability, and scanner throughput on real
phones. Those should be measured in the web PWA first.

Revisit a native wrapper only if HTTPS PWA testing shows a browser limitation
that blocks the workflow, such as unacceptable camera focus behavior, missing
torch control on the target device, or a need for native-only offline/background
behavior.
