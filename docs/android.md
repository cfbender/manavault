# Android App Builds

ManaVault publishes the Android app (`dev.cfb.manavault`) on Google Play and as
an APK on GitHub releases. Both accept Android text/CSV shares and open-with
file intents, and can load any ManaVault server URL after first launch. They are
signed with different keys (see [Google Play](#google-play)), so a Play install
and a GitHub APK install cannot update each other; switching between them means
uninstalling first, which only loses the saved server URL.

Verified Android App Links are navigation intents: Android only opens
`https://...` links in an app when the APK declares that exact host and the
website publishes the APK signing certificate fingerprint at
`/.well-known/assetlinks.json`.

## Use The Official App

Install ManaVault from Google Play or use the release APK from ManaVault GitHub
releases when you only need:

- entering your self-hosted ManaVault URL in the app on first launch
- Android Share/Open with/Export file imports from apps like ManaBox
- `manavault://...` links
- verified links for `https://manavault.cfb.dev/...`

No custom Android build is needed for that flow.

## Import From ManaBox

In ManaBox, export the collection as CSV, custom text, or a TXT/CSV file, then
use Android's Share, Open with, or Export file flow and choose ManaVault with
the Import action label beneath the app name.
ManaVault accepts text/CSV Android shares and `content://` or `file://`
open-with file intents, then opens the collection import dialog with the shared
text or file contents and previews the import.

If ManaBox opens a ManaVault HTTPS page inside its own embedded browser, back
out and choose the Android resolver/share target instead. That WebView path is
not an `ACTION_SEND`, `ACTION_SEND_MULTIPLE`, or `ACTION_VIEW` intent delivered
to ManaVault, so ManaVault cannot ingest the export from there.

`manavault://collection?importFile=true`,
`manavault:///collection?importFile=true`, verified App Links, and hosted or
self-hosted `https://...` ManaVault URLs are navigation links. They can open the
app route, but they do not carry a ManaBox export file; use the Android
Share/Open with/Export file path for imports.

## Build An APK For A Custom Domain

Build your own APK when you want Android to open your own domain directly, for
example `https://vault.example.com/share/decks/...`.

1. Install toolchains and dependencies:

   ```sh
   mise install
   mise run setup:android-sdk
   aube install --frozen-lockfile
   ```

2. Add your host to `android/app/src/main/AndroidManifest.xml` in the
   `android:autoVerify="true"` `VIEW` intent filter:

   ```xml
   <data android:scheme="https" android:host="vault.example.com" />
   ```

   Keep or remove the default `manavault.cfb.dev` hosts depending on whether this
   APK should also open ManaVault's hosted links.

3. Create a signing key:

   ```sh
   mise run android:signing:setup
   ```

   Save the generated `.jks` file and passwords. The helper uses the same value
   for the keystore and key password by default. Losing the key or password means
   existing installs cannot update to future APKs signed by a new key.

4. Build a signed release APK with the generated values:

   ```sh
   MANAVAULT_ANDROID_KEYSTORE=/path/to/manavault-release.jks \
   MANAVAULT_ANDROID_KEYSTORE_PASSWORD='...' \
   MANAVAULT_ANDROID_KEY_ALIAS='manavault' \
   mise run android:build:release
   ```

   Add `MANAVAULT_ANDROID_KEY_PASSWORD` only if your key password differs from
   the keystore password.

   The APK is written to:

   ```text
   android/app/build/outputs/apk/release/app-release.apk
   ```

5. Configure your deployed ManaVault server with the fingerprint printed by the
   signing helper:

   ```sh
   MANAVAULT_ANDROID_CERT_FINGERPRINTS='AA:BB:...'
   ```

   The server defaults to the official ManaVault release fingerprint. Set this
   env var only when your APK is signed by your own key. Keep the package name
   as `dev.cfb.manavault` unless you also change the server's
   `assetlinks.json` package name in code.

   Verify the server response:

   ```sh
   curl https://vault.example.com/.well-known/assetlinks.json
   ```

   It must include package name `dev.cfb.manavault` and the SHA-256 fingerprint
   for the key that signed the APK.

6. Install the release APK on the device. Android verifies App Links after
   install; if links still open in the browser, check the domain's
   `assetlinks.json`, reinstall the APK, or inspect Android's app link settings
   for ManaVault.

## GitHub Actions Release Builds

The repository workflow builds debug APKs for branch and pull-request runs. Tag
pushes (`vX.Y.Z`) build a release APK signed with the ManaVault release key and
a release AAB signed with the Play upload key, attach the APK to the GitHub
release, and upload the AAB to Google Play (see
[Automated Play uploads](#automated-play-uploads)). Add these repository
secrets for the APK before cutting a release:

- `MANAVAULT_ANDROID_KEYSTORE_BASE64`
- `MANAVAULT_ANDROID_KEYSTORE_PASSWORD`
- `MANAVAULT_ANDROID_KEY_ALIAS`

`MANAVAULT_ANDROID_KEY_PASSWORD` is optional for local/custom builds and defaults
to the keystore password. The GitHub release workflow intentionally signs with
`MANAVAULT_ANDROID_KEYSTORE_PASSWORD` for both values because the generated
PKCS12 keystore uses one password.

`mise run android:signing:setup` prints the values for a new key. If you created
a key with an older helper version, set `MANAVAULT_ANDROID_KEY_PASSWORD` to the
same value as `MANAVAULT_ANDROID_KEYSTORE_PASSWORD` or regenerate the key before
shipping it.

## Google Play

The Play listing uses Play App Signing with a key that Google generated and
holds. Play-delivered APKs are signed with it (SHA-256
`74:0E:2B:CD:...:77:12:08:05`), not with the GitHub release key
(`6B:3F:13:D6:...:4E:13:89`). The server's default
`/.well-known/assetlinks.json` lists both, so verified App Links work for either
install. Self-hosted servers that set `MANAVAULT_ANDROID_CERT_FINGERPRINTS`
replace those defaults and must list every key whose builds should open their
links.

AABs uploaded to Play are signed with a separate upload key, alias `upload`,
kept at `android/release/manavault-upload.jks` (gitignored) and in the
`MANAVAULT_PLAY_UPLOAD_KEYSTORE_*` secrets. If it is lost or leaked, request an
upload key reset in Play Console (**Protected with Play > App signing**); the
app signing key is unaffected.

`versionCode` is `major * 10000 + minor * 100 + patch` (see
`android/app/build.gradle`), so every release tag has a higher code than the
last. Play rejects an upload whose `versionCode` it has already seen.

### Build A Release AAB Locally

```sh
MANAVAULT_ANDROID_KEYSTORE=android/release/manavault-upload.jks \
MANAVAULT_ANDROID_KEYSTORE_PASSWORD='...' \
MANAVAULT_ANDROID_KEY_ALIAS=upload \
mise run android:bundle:release
```

The bundle is written to
`android/app/build/outputs/bundle/release/app-release.aab`, and the R8
deobfuscation map to `android/app/build/outputs/mapping/release/mapping.txt`.
Like `assembleRelease`, `bundleRelease` fails unless the signing variables are
set. Check that the upload key signed it before uploading:

```sh
mise exec -- keytool -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab
```

### First Release In Play Console

The Play Developer API cannot create an app's first release, so the first AAB
is uploaded by hand in **Test and release > Testing > Internal testing > Create
new release**: upload `app-release.aab`, then add `mapping.txt` from **Latest
releases and bundles** and roll out the release. The key that signed this first
AAB becomes the app's upload key.

Before production, finish the **Dashboard** setup tasks (store listing, privacy
policy, sign in details, ads, content rating, target audience, data safety, and
the other declarations). Reviewers and testers sign in to the public demo server
described in the Sign in details declaration. Personal developer accounts
created after 13 November 2023 must also run a closed test with at least 12
testers opted in for 14 consecutive days before applying for production access
from the Dashboard.

### Automated Play Uploads

After the first release exists, the `play` job in
`.github/workflows/capacitor.yml` uploads each tag's AAB (and `mapping.txt`) to
Play with the [`r0adkll/upload-google-play`](https://github.com/r0adkll/upload-google-play)
action.

1. In Google Cloud Console, create (or pick) a project, enable the **Google Play
   Android Developer API**, create a service account with no project roles, and
   create a JSON key for it.
2. In Play Console, go to **Users and permissions > Invite new users**, enter the
   service account email, add the ManaVault app under **App permissions**, and
   grant **Release apps to testing tracks** (add **Release to production,
   exclude devices, and use Play App Signing** only if it should publish to
   production).
3. Save the JSON key and the upload key as repository secrets, then delete the
   local JSON key:

   ```sh
   gh secret set MANAVAULT_PLAY_SERVICE_ACCOUNT_JSON < manavault-play.json
   base64 -w0 android/release/manavault-upload.jks | gh secret set MANAVAULT_PLAY_UPLOAD_KEYSTORE_BASE64
   gh secret set MANAVAULT_PLAY_UPLOAD_KEYSTORE_PASSWORD
   ```

Optional repository variables:

- `MANAVAULT_PLAY_TRACK` - target track: `internal` (default), `alpha` (closed
  testing), `beta` (open testing), `production`, or a custom closed track name.
- `MANAVAULT_PLAY_RELEASE_STATUS` - `completed` (default) or `draft`. Use
  `draft` to finish each release in Play Console instead of rolling it out.

If the job fails with "Only releases with status draft may be created on draft
app", the app has never been rolled out on any track; roll out the first release
in Play Console, or set `MANAVAULT_PLAY_RELEASE_STATUS=draft`.
