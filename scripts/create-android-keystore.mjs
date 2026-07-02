import { randomBytes } from "node:crypto"
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"

// Passwords are handed to keytool via the environment (-storepass:env / -keypass:env)
// so they never appear in the process argument list.
const STOREPASS_ENV = "MANAVAULT_KEYTOOL_STOREPASS"
const KEYPASS_ENV = "MANAVAULT_KEYTOOL_KEYPASS"

const keystorePath = resolve(
  process.env.MANAVAULT_ANDROID_KEYSTORE || "android/release/manavault-release.jks",
)
const alias = process.env.MANAVAULT_ANDROID_KEY_ALIAS || "manavault"
const storePassword = process.env.MANAVAULT_ANDROID_KEYSTORE_PASSWORD || randomSecret()
const keyPassword = process.env.MANAVAULT_ANDROID_KEY_PASSWORD || storePassword
const force = process.argv.includes("--force")

function randomSecret() {
  return randomBytes(24).toString("base64url")
}

function run(command, args, extraEnv) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
  })
  if (result.status === 0) return result.stdout

  const detail = [result.stdout, result.stderr].filter(Boolean).join("\n")
  throw new Error(`${command} failed${detail ? `:\n${detail}` : ""}`)
}

if (existsSync(keystorePath) && !force) {
  throw new Error(
    `${keystorePath} already exists. Re-run with --force only if you mean to replace the release signing key.`,
  )
}

await mkdir(dirname(keystorePath), { recursive: true })

run(
  "keytool",
  [
    "-genkeypair",
    "-v",
    "-storetype",
    "PKCS12",
    "-keystore",
    keystorePath,
    "-alias",
    alias,
    "-keyalg",
    "RSA",
    "-keysize",
    "4096",
    "-validity",
    "10000",
    "-storepass:env",
    STOREPASS_ENV,
    "-keypass:env",
    KEYPASS_ENV,
    "-dname",
    "CN=ManaVault, OU=ManaVault, O=ManaVault, L=Local, ST=Local, C=US",
  ],
  { [STOREPASS_ENV]: storePassword, [KEYPASS_ENV]: keyPassword },
)

const certificate = run(
  "keytool",
  ["-list", "-v", "-keystore", keystorePath, "-alias", alias, "-storepass:env", STOREPASS_ENV],
  { [STOREPASS_ENV]: storePassword },
)
const fingerprint = certificate.match(/SHA256:\s*([^\n]+)/)?.[1]?.trim()

if (!fingerprint)
  throw new Error("Could not read SHA-256 certificate fingerprint from generated keystore.")

const keystoreBase64 = readFileSync(keystorePath).toString("base64")

// The keystore + passwords are secrets, so write them to a 0600 dotenv file
// instead of printing them to stdout (terminal scrollback and CI logs persist
// stdout). The file lives beside the keystore in the gitignored release dir.
const secretsPath = resolve(dirname(keystorePath), "github-actions-secrets.env")
const secretsFile =
  [
    `MANAVAULT_ANDROID_KEYSTORE_BASE64=${keystoreBase64}`,
    `MANAVAULT_ANDROID_KEYSTORE_PASSWORD=${storePassword}`,
    `MANAVAULT_ANDROID_KEY_ALIAS=${alias}`,
    `MANAVAULT_ANDROID_KEY_PASSWORD=${keyPassword}`,
  ].join("\n") + "\n"

writeFileSync(secretsPath, secretsFile, { mode: 0o600 })
// writeFileSync only applies mode when creating the file; force it in case a
// --force re-run overwrote a pre-existing (possibly looser-permissioned) file.
chmodSync(secretsPath, 0o600)

console.log(`Created Android release keystore: ${keystorePath}`)
console.log(`Wrote GitHub Actions secrets (mode 0600) to: ${secretsPath}`)
console.log("")
console.log("Upload them to the repository, then delete the file:")
console.log(`  gh secret set -f ${secretsPath}`)
console.log(`  rm ${secretsPath}`)
console.log("")
console.log("Set this in the deployment environment for Android App Links (not secret):")
console.log(`MANAVAULT_ANDROID_CERT_FINGERPRINTS=${fingerprint}`)
console.log("")
console.log(
  "Keep the .jks file and passwords. Losing them means installed users cannot update to future release APKs signed by a new key.",
)
