import { Capacitor, registerPlugin } from "@capacitor/core"

export type NativeShellSettings = {
  serverUrl?: string | null
  appVersion?: string | null
  releaseRepository?: string | null
}

export type NativeShellUpdateCheck = {
  appVersion: string
  latestVersion?: string | null
  releaseUrl?: string | null
  updateAvailable: boolean
}

type NativeShellPlugin = {
  getSettings: () => Promise<NativeShellSettings>
  saveServer: (options: { serverUrl: string }) => Promise<NativeShellSettings>
  clearServer: () => Promise<NativeShellSettings>
}

const fallbackReleaseRepository = "cfbender/manavault"
const fallbackVersion = "0.0.0"
const NativeShell = registerPlugin<NativeShellPlugin>("NativeShell")

export function isNativeShell() {
  return Capacitor.isNativePlatform()
}

export function normalizeServerUrl(rawValue: string) {
  const trimmed = rawValue.trim()
  if (!trimmed) {
    throw new Error("Enter a ManaVault URL.")
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withScheme)
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("ManaVault URL must start with http:// or https://.")
  }

  return url.origin
}

export function parseSemver(version: string) {
  const match = String(version)
    .trim()
    .replace(/^v/i, "")
    .match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null

  return match.slice(1).map((part) => Number.parseInt(part, 10))
}

export function compareSemver(left: string, right: string) {
  const leftParts = parseSemver(left)
  const rightParts = parseSemver(right)
  if (!leftParts || !rightParts) return 0

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1
    }
  }

  return 0
}

export async function getNativeShellSettings() {
  if (!isNativeShell()) return null

  return NativeShell.getSettings()
}

export async function saveNativeServerUrl(rawValue: string) {
  const serverUrl = normalizeServerUrl(rawValue)
  await NativeShell.saveServer({ serverUrl })
  return serverUrl
}

export async function clearNativeServerUrl() {
  await NativeShell.clearServer()
}

export async function checkNativeShellUpdate(settings?: NativeShellSettings | null) {
  const appVersion = settings?.appVersion?.replace(/^v/i, "") || fallbackVersion
  const releaseRepository = settings?.releaseRepository?.trim() || fallbackReleaseRepository
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 3_000)

  try {
    const response = await fetch(`https://api.github.com/repos/${releaseRepository}/releases/latest`, {
      cache: "no-store",
      headers: { accept: "application/vnd.github+json" },
      signal: controller.signal,
    })
    if (!response.ok) {
      return { appVersion, updateAvailable: false } satisfies NativeShellUpdateCheck
    }

    const release = (await response.json()) as { html_url?: string; tag_name?: string }
    const latestVersion = release.tag_name?.replace(/^v/i, "")
    const updateAvailable = Boolean(
      release.html_url && latestVersion && compareSemver(latestVersion, appVersion) > 0,
    )

    return {
      appVersion,
      latestVersion,
      releaseUrl: release.html_url,
      updateAvailable,
    } satisfies NativeShellUpdateCheck
  } catch (_error) {
    return { appVersion, updateAvailable: false } satisfies NativeShellUpdateCheck
  } finally {
    window.clearTimeout(timeout)
  }
}
