export {}

function markNativeShell() {
  const capacitor = (
    window as Window & {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string }
    }
  ).Capacitor
  const nativeShell = Boolean(
    capacitor?.isNativePlatform?.() ||
    (capacitor?.getPlatform && capacitor.getPlatform() !== "web") ||
    window.location.protocol === "capacitor:",
  )

  document.documentElement.classList.toggle("native-shell", nativeShell)
  document.body?.classList.toggle("native-shell", nativeShell)
}

markNativeShell()
window.addEventListener("DOMContentLoaded", markNativeShell)

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null
const pwaAssetVersion =
  typeof window.__manavaultAssetVersion === "string" && window.__manavaultAssetVersion.trim()
    ? window.__manavaultAssetVersion
    : "dev"
const serviceWorkerUrl = `${window.location.origin}/sw.js?v=${pwaAssetVersion}`

const chunkReloadKey = "manavault:chunk-reload"
const chunkReloadParam = "mv-fresh-assets"
const chunkReloadCooldownMs = 30_000
const dynamicImportErrorPattern =
  /Failed to fetch dynamically imported module|Failed to load dynamically loaded module|Importing a module script failed|error loading dynamically imported module|module script load failed/i

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return String(error ?? "")
}

function reloadForFreshAssets(error: unknown) {
  if (document.documentElement.classList.contains("native-shell")) return false
  if (!dynamicImportErrorPattern.test(errorMessage(error))) return false

  let lastReloadAt = 0
  try {
    lastReloadAt = Number(sessionStorage.getItem(chunkReloadKey) || 0)
    if (Date.now() - lastReloadAt < chunkReloadCooldownMs) return false
    sessionStorage.setItem(chunkReloadKey, String(Date.now()))
  } catch {
    // Storage can be unavailable. A single location replacement is still the safest recovery.
  }

  const url = new URL(window.location.href)
  url.searchParams.set(chunkReloadParam, String(Date.now()))
  window.location.replace(url.href)
  return true
}

window.addEventListener("vite:preloadError", (event) => {
  if (reloadForFreshAssets((event as Event & { payload?: unknown }).payload)) event.preventDefault()
})

window.addEventListener("unhandledrejection", (event) => {
  if (reloadForFreshAssets(event.reason)) event.preventDefault()
})

window.setTimeout(() => {
  try {
    sessionStorage.removeItem(chunkReloadKey)
  } catch {
    // Storage can be unavailable.
  }
}, chunkReloadCooldownMs)

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<unknown>
}

type PwaState = {
  installPromptAvailable: boolean
  displayMode: string
  secureContext: boolean
  serviceWorkerSupported: boolean
  serviceWorkerRegistered: boolean
  serviceWorkerControlled: boolean
  serviceWorkerError: string | null
  manifestOk: boolean
  manifestError: string | null
  iconsOk: boolean
  relatedApps: unknown[]
  userAgent: string
}

declare global {
  interface Window {
    manavaultPwa: PwaState
    __manavaultAssetVersion?: string
    __manavaultPwaInstallCapture?: {
      prompt: BeforeInstallPromptEvent | null
      fired: boolean
      firedAt: number | null
    }
  }
}

function appDisplayMode() {
  if (window.matchMedia("(display-mode: standalone)").matches) return "standalone"
  if ("standalone" in window.navigator && window.navigator.standalone) return "standalone"
  return "browser"
}

function installButtons() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("[data-pwa-install]"))
}

window.manavaultPwa = {
  installPromptAvailable: false,
  displayMode: appDisplayMode(),
  secureContext: window.isSecureContext,
  serviceWorkerSupported: "serviceWorker" in navigator,
  serviceWorkerRegistered: false,
  serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
  serviceWorkerError: null,
  manifestOk: false,
  manifestError: null,
  iconsOk: false,
  relatedApps: [],
  userAgent: navigator.userAgent,
}

function updatePwaInstallState(state: Partial<PwaState>) {
  window.manavaultPwa = { ...window.manavaultPwa, ...state }
}

function pwaDiagnosticLabel() {
  const pwa = window.manavaultPwa
  if (pwa.displayMode === "standalone") return "Installed"
  if (!pwa.secureContext) return "HTTPS required"
  if (pwa.serviceWorkerError) return "SW failed"
  if (!pwa.serviceWorkerRegistered) return "SW pending"
  if (!pwa.serviceWorkerControlled) return "Reload once"
  if (pwa.manifestError) return "Manifest failed"
  if (!pwa.manifestOk) return "Manifest pending"
  if (!pwa.iconsOk) return "Icon failed"
  if (!pwa.installPromptAvailable) return "Not installable"
  return "Install"
}

function setInstallButtonsVisible(visible: boolean, enabled = visible) {
  installButtons().forEach((button) => {
    const shouldShow = visible && enabled
    button.classList.toggle("hidden", !shouldShow)
    button.disabled = false
    button.dataset.pwaInstallEnabled = enabled ? "true" : "false"
    button.setAttribute("aria-disabled", enabled ? "false" : "true")

    const label = button.querySelector("[data-pwa-install-label]")
    if (label) label.textContent = pwaDiagnosticLabel()
  })
}

function adoptInstallPrompt(prompt = window.__manavaultPwaInstallCapture?.prompt) {
  if (!prompt) return false

  deferredInstallPrompt = prompt
  updatePwaInstallState({ installPromptAvailable: true })
  setInstallButtonsVisible(true, true)
  return true
}

async function validateManifestForInstall() {
  try {
    const response = await fetch(`/site.webmanifest?v=${pwaAssetVersion}`, {
      cache: "no-store",
      credentials: "include",
    })
    if (!response.ok) throw new Error(`manifest HTTP ${response.status}`)

    const manifest = await response.json()
    const icons = Array.isArray(manifest.icons) ? manifest.icons : []
    const hasRequiredIcon = icons.some(
      (icon: { sizes?: string; src?: string }) =>
        String(icon.sizes || "").includes("192x192") && icon.src,
    )

    if (!hasRequiredIcon) throw new Error("missing 192x192 icon")

    updatePwaInstallState({ manifestOk: true, manifestError: null, iconsOk: true })
  } catch (error) {
    updatePwaInstallState({
      manifestOk: false,
      manifestError: error instanceof Error ? error.message : "manifest validation failed",
      iconsOk: false,
    })
  }
}

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(serviceWorkerUrl, { scope: "/" })
      .then(() =>
        updatePwaInstallState({
          serviceWorkerRegistered: true,
          serviceWorkerControlled: Boolean(navigator.serviceWorker.controller),
        }),
      )
      .catch((error) =>
        updatePwaInstallState({
          serviceWorkerRegistered: false,
          serviceWorkerError: error?.message || "registration failed",
        }),
      )
      .finally(validateManifestForInstall)
  })
} else {
  validateManifestForInstall()
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault()
  window.__manavaultPwaInstallCapture = {
    prompt: event as BeforeInstallPromptEvent,
    fired: true,
    firedAt: Date.now(),
  }
  adoptInstallPrompt(event as BeforeInstallPromptEvent)
})

window.addEventListener("manavault:pwa-install-available", () => adoptInstallPrompt())
adoptInstallPrompt()

window.addEventListener("click", async (event) => {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-pwa-install]")
  if (!button || button.dataset.pwaInstallEnabled !== "true" || !deferredInstallPrompt) return

  button.disabled = true
  await deferredInstallPrompt.prompt()
  await deferredInstallPrompt.userChoice.catch(() => {})
  deferredInstallPrompt = null
  updatePwaInstallState({ installPromptAvailable: false })
  setInstallButtonsVisible(false)
})
