import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

const versionFile = resolve("native_www/version.json")
const packageFile = resolve("package.json")
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+].+)?$/

function normalizeVersion(version) {
  return version.trim().replace(/^v/i, "")
}

async function projectVersion() {
  if (process.env.MANAVAULT_VERSION?.trim()) {
    return normalizeVersion(process.env.MANAVAULT_VERSION)
  }

  const { version } = JSON.parse(await readFile(packageFile, "utf8"))
  if (typeof version !== "string" || !versionPattern.test(version)) {
    throw new Error(`Could not find semver project version in ${packageFile}`)
  }

  return normalizeVersion(version)
}

const version = await projectVersion()
const releaseRepository = process.env.MANAVAULT_RELEASE_REPOSITORY || "cfbender/manavault"
const payload = `${JSON.stringify({ version, releaseRepository }, null, 2)}\n`

await mkdir(dirname(versionFile), { recursive: true })
await writeFile(versionFile, payload)
console.log(`Prepared native web metadata for ManaVault ${version}`)
