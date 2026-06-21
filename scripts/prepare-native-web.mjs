import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

const versionFile = resolve("native_www/version.json")
const mixFile = resolve("mix.exs")
const versionPattern = /version:\s*"([0-9]+\.[0-9]+\.[0-9]+(?:[-+][^"]+)?)"/

function normalizeVersion(version) {
  return version.trim().replace(/^v/i, "")
}

async function projectVersion() {
  if (process.env.MANAVAULT_VERSION?.trim()) {
    return normalizeVersion(process.env.MANAVAULT_VERSION)
  }

  const mixSource = await readFile(mixFile, "utf8")
  const match = mixSource.match(versionPattern)
  if (!match) {
    throw new Error(`Could not find semver project version in ${mixFile}`)
  }

  return normalizeVersion(match[1])
}

const version = await projectVersion()
const releaseRepository = process.env.MANAVAULT_RELEASE_REPOSITORY || "cfbender/manavault"
const payload = `${JSON.stringify({ version, releaseRepository }, null, 2)}\n`

await mkdir(dirname(versionFile), { recursive: true })
await writeFile(versionFile, payload)
console.log(`Prepared native web metadata for ManaVault ${version}`)
