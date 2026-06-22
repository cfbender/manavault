import { randomBytes } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const keystorePath = resolve(process.env.MANAVAULT_ANDROID_KEYSTORE || "android/release/manavault-release.jks")
const alias = process.env.MANAVAULT_ANDROID_KEY_ALIAS || "manavault"
const storePassword = process.env.MANAVAULT_ANDROID_KEYSTORE_PASSWORD || randomSecret()
const keyPassword = process.env.MANAVAULT_ANDROID_KEY_PASSWORD || randomSecret()
const force = process.argv.includes("--force")

function randomSecret() {
  return randomBytes(24).toString("base64url")
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" })
  if (result.status === 0) return result.stdout

  const detail = [result.stdout, result.stderr].filter(Boolean).join("\n")
  throw new Error(`${command} failed${detail ? `:\n${detail}` : ""}`)
}

if (existsSync(keystorePath) && !force) {
  throw new Error(`${keystorePath} already exists. Re-run with --force only if you mean to replace the release signing key.`)
}

await mkdir(dirname(keystorePath), { recursive: true })

run("keytool", [
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
  "-storepass",
  storePassword,
  "-keypass",
  keyPassword,
  "-dname",
  "CN=ManaVault, OU=ManaVault, O=ManaVault, L=Local, ST=Local, C=US",
])

const certificate = run("keytool", [
  "-list",
  "-v",
  "-keystore",
  keystorePath,
  "-alias",
  alias,
  "-storepass",
  storePassword,
])
const fingerprint = certificate.match(/SHA256:\s*([^\n]+)/)?.[1]?.trim()

if (!fingerprint) throw new Error("Could not read SHA-256 certificate fingerprint from generated keystore.")

const keystoreBase64 = readFileSync(keystorePath).toString("base64")

console.log(`Created Android release keystore: ${keystorePath}`)
console.log("")
console.log("Add these GitHub Actions secrets:")
console.log(`MANAVAULT_ANDROID_KEYSTORE_BASE64=${keystoreBase64}`)
console.log(`MANAVAULT_ANDROID_KEYSTORE_PASSWORD=${storePassword}`)
console.log(`MANAVAULT_ANDROID_KEY_ALIAS=${alias}`)
console.log(`MANAVAULT_ANDROID_KEY_PASSWORD=${keyPassword}`)
console.log("")
console.log("Set this in the deployment environment for Android App Links:")
console.log(`MANAVAULT_ANDROID_CERT_FINGERPRINTS=${fingerprint}`)
console.log("")
console.log("Keep the .jks file and passwords. Losing them means installed users cannot update to future release APKs signed by a new key.")
