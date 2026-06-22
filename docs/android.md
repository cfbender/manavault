# Android App Builds

ManaVault publishes an Android APK from GitHub releases. That official APK is
signed with the ManaVault release key, accepts shared TXT/CSV files, and can load
any ManaVault server URL after first launch.

Verified Android App Links are different: Android only opens `https://...` links
in an app when the APK declares that exact host and the website publishes the
APK signing certificate fingerprint at `/.well-known/assetlinks.json`.

## Use The Official APK

Use the release APK from ManaVault GitHub releases when you only need:

- entering your self-hosted ManaVault URL in the app on first launch
- Android share-sheet imports from apps like ManaBox
- `manavault://...` links
- verified links for `https://manavault.cfb.dev/...`

No custom Android build is needed for that flow.

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

## GitHub Actions Release APK

The repository workflow builds debug APKs for branch and pull-request runs. Tag
pushes (`vX.Y.Z`) build signed release APKs and attach them to the GitHub
release. Add these repository secrets before cutting a release:

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
