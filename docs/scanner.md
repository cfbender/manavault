# Card scanner

The scanner (`/scan`) identifies cards entirely in the browser. Phoenix serves the model bundle
and resolves recognized artwork to catalog printings; it runs no inference. User-facing behavior is
in [features.md](features.md#card-scanner).

## Models and releases

Models are trained and exported in [cfbender/oracle](https://github.com/cfbender/oracle), which
also serves The Gathering. A ManaVault model is a GitHub release in this repository tagged
`scanner-bundle-<version>`, published but never marked latest (the Android shell treats the
latest release as the newest app version). When a new set is released, refresh the gallery on the
training box and publish; no retraining is needed. One command does it for ManaVault and The
Gathering, each with its own published models and held-out gate:

```sh
cd oracle
mise run new-set                           # or: mise run new-set -- --profile manavault
```

Servers install the newest published release within six hours (or on restart); browsers switch
the next time the scanner opens. To roll back, unpublish or delete the newest release.

## Bundles (server)

ManaVault serves browser card-recognition models from `DATA_DIR/scanner`. Each version is a
directory containing `manifest.json`, `arts.json`, the three ONNX models, `SHA256SUMS`, and
optionally `printings.json`. `current` and `previous` are relative symlinks to version directories.
The server creates `arts.json.gz` during installation (or lazily for an older bundle) and serves it
when the client accepts gzip; the compressed filename is not a directly fetchable bundle file.

`GET /api/scanner/bundle` describes the current version: versioned file URLs, decoded byte sizes,
gallery metadata and the pipeline constants (`Cache-Control: private, no-cache`). Files are served
from `GET /api/scanner/bundles/:version/:name` as immutable. Both require the signed-in session.
`printings.json` (about 125 MB) is verified during installation but never sent to browsers.

Scanner matches resolve through `scannerPrintings(scryfallId: ID!, illustrationId: ID)`. The server
removes a numeric face suffix that follows a complete UUID (`<uuid>-1`), falls back to the
illustration ID when needed, and returns the catalog printings for the matched card with
same-illustration printings first, including `ownedCount`, `promo` and
`priceCents(finish:)` (the selected price source with finish fallback). The Scryfall import stores
`illustration_id` and `promo` on `scryfall_printings`; a catalog resync fills them for existing
data.

`SCANNER_BUNDLE_SOURCE` controls automatic updates. The default, `github`, selects the newest
published `scanner-bundle-*` release from `cfbender/manavault`; draft releases are ignored and no
published release is not an error. Set it to an HTTP(S) URL ending in `manifest.json` to use a
plain bundle directory, or to `off`, `disabled`, or an empty value to disable updates. The server
checks at startup and every six hours, verifies manifest sizes and SHA-256 hashes, and atomically
switches `current`.

For a manual installation, copy a complete bundle directory to `DATA_DIR/scanner/<version>` and
atomically point the relative `current` symlink at `<version>`, or call
`Manavault.Scanner.Bundle.install(manifest, directory)` from a remote console, which verifies and
activates it. Version names may contain letters, digits, dots, underscores, and hyphens, and may
not be `current` or `previous`.

## Browser pipeline

Code lives in `assets/react/src/pages/scan/`.

- `recognition/use-recognizer.ts` fetches `/api/scanner/bundle` each time the scanner opens, so a
  new model is picked up without a redeploy, and starts `recognition/recognizer.worker.ts`.
- The worker loads files through `recognition/bundle-cache.ts`: Cache Storage named
  `manavault-scanner-<version>`, one download per version, older versions deleted. The
  onnxruntime-web WASM binary is cached alongside. The PWA service worker only prunes its own
  `manavault-pwa-*` caches.
- Inference is onnxruntime-web 1.30 on WASM, multi-threaded when the browser allows it. The CSP
  allows `'wasm-unsafe-eval'`. Threads need `SharedArrayBuffer`, so `GET /scan` alone is served
  cross-origin isolated (`Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Embedder-Policy: require-corp`; `ManavaultWeb.Plugs.CrossOriginIsolation`).
  Consequences, all handled in code: links into and out of `/scan` are full page loads
  (`lib/cross-origin-isolation.ts`, `reloadDocument`), the scanner's Scryfall `<img>`s request
  with `crossorigin` (Scryfall sends `Access-Control-Allow-Origin: *`), the shared-import
  handoff to the collection is kept in `sessionStorage` across the reload, and every script
  Vite or `Plug.Static` serves carries `Cross-Origin-Embedder-Policy: require-corp`, because a
  dedicated worker only starts inside an isolated document when its own script does. The rest
  of the app is not isolated: it embeds EDHREC and other third-party images plainly, and
  Safari has no `credentialless` COEP. The worker uses the standalone
  `ort-wasm-simd-threaded.mjs` (`wasmPaths.mjs`) so the pthread workers spawn from a real URL.
  The **Threads** setting (Auto/1/2/4; Auto lets the runtime pick `min(4, ceil(cores / 2))`)
  is shown only on an isolated page; changing it restarts the worker, and if a threaded start
  fails the worker is restarted on one thread. Without isolation (for example an old
  Capacitor WebView) recognition runs on one thread as before. Measured in headless Chrome on
  the 2026-09-29 bundle, card frames: 1 thread 182 ms, 2 threads 108 ms, 4 threads 64 ms.
- Each frame is the whole camera image fitted into a 640 px square, so a card anywhere in view is
  found, including off-centre under a scanner stand's lens. The preview fills the screen behind
  the floating controls and may crop the image: **Camera preview** zoom and pan (scanner
  settings, `preview-framing.ts`) move only the preview, for example to centre the card on a
  stand, never what is scanned. `recognition/recognizer.ts` runs the detector twice (coarse, then refined around the
  card), embeds the card's art-frame crops and searches the gallery (top 5).
- Two shortcuts keep the live loop fast. A detector pass whose upright vote is below 0.25 ends
  the frame (no refined pass, embedding or search), which makes empty frames about three times
  cheaper than card frames. While a card is in view, the next frame's first pass looks at the
  previous frame's refined window instead of the whole scene; if the card barely moved (under a
  tenth of the window, size within 0.8–1.25×) that pass is the refined one and the whole-scene
  pass is skipped. Otherwise, and on every eighth tracked frame, the whole-scene pass runs so
  tracking never sticks to a wrong window. Measured on the 2026-09-29 bundle in single-threaded
  WASM: card frames 264 → 190 ms, empty frames 264 → 87 ms, with identical matches.
- `scan-decision.ts` decides when to log. A card is in view when the detector's upright vote is at
  least 0.5 and its short side at least 60 px. A match is logged on one frame at a score of 0.75
  or more with a 0.08 lead over the runner-up, otherwise after two agreeing frames scoring at least
  0.6. The same card (both faces count as one) is not logged again until a different card is.
  With locked sets, only artwork printed in those sets can be logged
  (`scannerSetIllustrations(setCodes)` lists their illustration IDs); a card that clearly
  matches something outside them is reported as "Not in locked sets" instead. Tokens mode
  (`tokenMode` in `scan-settings.ts`, toggled in the settings sheet; `evaluateTokenFrame`)
  instead takes the best candidate whose gallery `layout` is `token` or `double_faced_token`,
  reports it as `ready` once it scores 0.6, and logs it only when the viewfinder is tapped
  (`logArmed` in `use-scan-session.ts`), with no duplicate rule. The tap is the `click`, not
  `pointerdown`: logging can open the back picker, and a sheet mounting under a finger still
  on the screen would take the pointerup as a pick. The back settled on the newest other copy
  of the same token in the list (`lastBackFor`, including "single-sided") carries over to the
  new copy, so the picker asks once per token and the result bar's Back and finish chips change
  a copy that differs. In this mode each frame is
  identified with `scope: "tokens"` (see the gallery mask below); with a bundle that has no mask
  input the browser can only filter the recognizer's top five results, so a token that does not
  make the top five at all needs **Identify**.
- Gallery mask (`pipeline.ts` `galleryMask`, `recognizer.ts`): a bundle exported by Oracle with
  `--search-mask` (`CARDID_SEARCH_MASK=1`; manifest `search_mask: true`) has a `search.onnx` with
  inputs `embeddings (F, 128) float32` and `mask [N] float32`, N = `manifest.gallery.arts` in
  `arts.json` order. The recognizer checks the session's `inputNames` for `mask` rather than the
  manifest, builds the all-ones and tokens-only masks once at load, and feeds the one for the
  frame's scope; `mask > 0` keeps an art. Oracle scores excluded arts -3 before top-k, so when
  fewer than k arts are kept the tail is padding: rows scoring below -1 are dropped
  (`isPaddedResult`). An older bundle without the input gets `{ embeddings }` only, so the
  client works with either. The settings sheet shows "token search" under **Recognition model**
  when the mask is available. Token arts in masked bundles also use the new `token` and
  `token_tall` frame cuts (`frame_names` grew from 14 to 16; `arts.json` `frame` can be either).
  Oracle's measurements: Scryfall's current token `art_crop` was being filed as `old`/`tall`,
  covering only ~65%/83% of the art, so clean token scans scored ~0.88 against 0.99 for cards
  and fell to the hub art Funeral Room // Awakening Hall (in the top five of 12% of all
  queries). The token frames lifted synthetic token top-1 from 0.81 to 0.87 with other cards
  unchanged; a tokens-only mask returned only tokens at 729/800 top-1.
- Hub penalty (Oracle `cardid/hubs.py`): at export, each gallery art's mean similarity to its
  ten nearest cuts from up to 3000 real card scans (never its own card) is compared with the
  gallery median, and `0.25 × (r − median)` clipped to `[0, 0.1]` is baked into `search.onnx`
  next to the frame penalty. Scores only ever go down, so the client's thresholds and padding
  cut are unaffected; the manifest records what was applied under `gallery.hub_penalty`
  (`weight, neighbours, cap, cards, cards_fingerprint, median_r, penalised, max`), or `null`
  when the export had fewer than 200 scans and shipped none. Measured on the same synthetic
  scenes: Funeral Room in the top five 11.6% → 3.1%, other-card top-1 0.913 → 0.917, token
  top-1 unchanged at 0.870, with correct answers scoring ≥ 0.75 about half a point rarer.
- `printing-choice.ts` picks the default printing and finish; `scan-list.ts` builds the import
  CSV (`name,set_code,collector_number,quantity,finish,language,scryfall_id,back_scryfall_id`),
  which is handed to the collection import through `queueSharedImport` in
  `lib/native-shared-import.ts`. `back_scryfall_id` is the user-picked reverse of a single-faced
  token (`token-back-sheet.tsx`); the import files token rows as token items. The sheet's
  candidates come from `tokenBackOptions(scryfallId)`: `known` are backs recorded on owned token
  items with that face on either side (`Manavault.Catalog.Tokens.BackOptions`, most-owned first),
  then the backs Wizards' galleries show printed with it (`priv/data/token_backs.json`, keyed by
  Scryfall set/collector number and loaded at compile time by
  `Manavault.Catalog.Tokens.KnownBacks`); `sameSet` is every other token in the set. The sheet
  adds backs picked on other entries of the current scan list (`sessionBacks` in `scan-list.ts`)
  ahead of both, since those are not owned yet. `known` is a hint, not a filter: the galleries publish one pairing per
  face and other products pair differently (FRA Jace is listed with Spirit but also ships with
  Cadet), so the UI always shows `sameSet` too. Regenerate the data file after new sets with
  `WOTC_CONTENTFUL_TOKEN=... mise exec -- mix run scripts/token_backs.exs`; the script header
  explains where the token comes from. Coverage starts at Modern Horizons 3, the first set whose
  gallery publishes back images.

The thresholds were calibrated with bundle `retrain-20260925T043526910942Z` on synthetic phone
frames (real card scans composited with rotation, perspective, blur and noise): 60 of 60 cards
identified correctly with a median of 267 ms per frame on single-threaded WASM, while empty tables
and blank paper had upright votes of 0.17 or less.

## Training data

With **Collect training data** on (scanner settings, off by default), every logged scan uploads
the 640 px frame the recognizer saw, its detected quad, the recognized card, scores and bundle
version to `POST /api/scanner/corrections` (signed-in session and CSRF). Changing the entry's
printing or finish, or choosing **Wrong card?** in the printing sheet, relabels the capture
without re-sending the image; deleting a scan marks it skipped, since its label is not trusted.
**Identify** covers scans the recognizer never logs (unrecognized foils, cards stuck on "Hold
steady"): it freezes the frame, the user names the card (`cards(q, tokens: INCLUDE)`, or `ONLY`
in tokens mode), and that frame is uploaded with the label plus the detected quad and the
recognizer's guess when there were any. Without a quad the capture stays pending in Oracle until
its geometry is fixed. The last label per capture wins.
Oracle trains each app's model on its own captures with `CARDID_SOURCES=manavault-scanner`.

**Check outlines** (below it, only with collection on) makes those outlines detector training
data. The detector's own outline cannot teach the detector, so each logged or identified scan
pauses on its frozen frame (`outline-editor.tsx`): the user confirms the outline (**Looks
right**) or drags its corners onto the card, with a loupe for precision and arrow keys on a
focused corner, and the capture is resent with the new `quad` and `quad_source: "manual"`.
**Skip** leaves it as the detector's. An **Identify** frame without a detected card starts from
a card-shaped outline in the middle of the frame. Oracle trains and scores the detector only on
these manual outlines (see Oracle's README, "Trusted outlines for the detector").

The server stores them in `DATA_DIR/scanner/corrections/` (`labels.jsonl` plus
`<capture_id>/crop.jpg`, the same layout as The Gathering's table corrections) and exports them at
`GET /api/scanner/corrections?cursor=N` and `GET /api/scanner/corrections/:id/crop` for the
owner's session or `Authorization: Bearer $SCANNER_CORRECTIONS_TOKEN` (32+ characters; export is
disabled without it). On the training box, Oracle imports them with
`CARDID_SERVER=https://<host>/api/scanner/corrections` and that token as
`CARDID_CORRECTIONS_TOKEN`; see Oracle's README, "Real phone captures from ManaVault".

## Improving recognition

Anyone can train a better model, test it in a local ManaVault, or contribute scans and outlines:
see Oracle's [CONTRIBUTING.md](https://github.com/cfbender/oracle/blob/main/CONTRIBUTING.md).
It covers setup, the gallery, measuring a change, installing your own bundle here with
`SCANNER_BUNDLE_SOURCE=off`, and how Collect training data and Check outlines feed training.
Changes to this app's recognition code (`assets/react/src/pages/scan/recognition/`) must stay
compatible with the bundle format; Oracle's contract test checks them.

## Testing without a phone

Chromium can use a video file as the camera, which exercises the whole pipeline:

```sh
ffmpeg -loop 1 -t 5 -i card-scene.png -vf "fps=8,format=yuv420p" /tmp/fake-camera.y4m
chromium --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  --use-file-for-fake-video-capture=/tmp/fake-camera.y4m http://localhost:4000/scan
```

The camera needs a secure context: HTTPS, or `localhost` during development.
