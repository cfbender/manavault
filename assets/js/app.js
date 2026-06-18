// If you want to use Phoenix channels, run `mix help phx.gen.channel`
// to get started and then uncomment the line below.
// import "./user_socket.js"

// You can include dependencies in two ways.
//
// The simplest option is to put them in assets/vendor and
// import them using relative paths:
//
//     import "../vendor/some-package.js"
//
// Alternatively, you can `npm install some-package --prefix assets` and import
// them using a path starting with the package name:
//
//     import "some-package"
//
// If you have dependencies that try to import CSS, esbuild will generate a separate `app.css` file.
// To load it, simply add a second `<link>` to your `root.html.heex` file.

// Include phoenix_html to handle method=PUT/DELETE in forms and buttons.
import "phoenix_html"
// Establish Phoenix Socket and LiveView configuration.
import {Socket} from "phoenix"
import {LiveSocket} from "phoenix_live_view"
import {hooks as colocatedHooks} from "phoenix-colocated/manavault"
import ScannerCamera from "./scanner_camera"
import topbar from "../vendor/topbar"

const DeckPreview = {
  mounted() {
    this.el.addEventListener("manavault:close-card-menu", event => {
      event.target.classList.add("card-menu-closed")
      event.target.addEventListener("mouseleave", () => {
        event.target.classList.remove("card-menu-closed")
      }, {once: true})

      window.setTimeout(() => {
        const activeElement = document.activeElement

        if (activeElement && event.target.contains(activeElement)) {
          activeElement.blur()
        }
      }, 0)
    })

    this.el.addEventListener("click", event => {
      const actionsButton = event.target.closest("[data-card-actions-button]")
      if (!actionsButton || !this.el.contains(actionsButton)) return

      actionsButton.closest("[data-preview-card]")?.classList.remove("card-menu-closed")
    })

    this.el.addEventListener("mouseover", event => {
      const card = event.target.closest("[data-preview-card]")
      if (!card || !this.el.contains(card)) return

      const image = document.getElementById("deck-preview-image")
      const fallback = document.getElementById("deck-preview-fallback")
      const name = document.getElementById("deck-preview-name")
      const type = document.getElementById("deck-preview-type")
      const set = document.getElementById("deck-preview-set-label")
      const setIcon = document.getElementById("deck-preview-set-icon")
      const setFallback = document.getElementById("deck-preview-set-fallback")
      const finish = document.getElementById("deck-preview-finish")
      const quantity = document.getElementById("deck-preview-quantity")
      const imageUrl = card.dataset.previewImage

      if (image && fallback) {
        if (imageUrl) {
          image.src = imageUrl
          image.alt = card.dataset.previewName || ""
          image.hidden = false
          fallback.hidden = true
        } else {
          image.hidden = true
          fallback.hidden = false
        }
      }

      if (name) name.textContent = card.dataset.previewName || "No card selected"
      if (type) type.textContent = card.dataset.previewType || ""
      if (set) set.textContent = card.dataset.previewSet || "Unknown printing"
      if (setIcon && setFallback) {
        const setIconUrl = card.dataset.previewSetIcon

        if (setIconUrl) {
          const maskUrl = `url("${setIconUrl.replaceAll("\"", "%22")}")`

          setIcon.style.maskImage = maskUrl
          setIcon.style.webkitMaskImage = maskUrl
          setIcon.style.backgroundColor = card.dataset.previewSetColor || "currentColor"
          setIcon.hidden = false
          setFallback.hidden = true
        } else {
          setIcon.hidden = true
          setFallback.textContent = card.dataset.previewSetCode || "?"
          setFallback.hidden = false
        }
      }
      if (finish) finish.textContent = card.dataset.previewFinish || "Nonfoil"

      if (quantity) {
        const value = Number(card.dataset.previewQuantity || "1")
        quantity.textContent = `×${value}`
        quantity.hidden = value <= 1
      }
    })
  }
}

const ClipboardCopy = {
  mounted() {
    this.el.addEventListener("click", async () => {
      const target = document.querySelector(this.el.dataset.copyTarget)
      const text = target?.value ?? target?.textContent ?? ""
      if (!text) return

      try {
        await navigator.clipboard.writeText(text)
      } catch (_error) {
        const selection = document.getSelection()
        target.select?.()
        document.execCommand("copy")
        selection?.removeAllRanges()
      }

      this.el.dataset.copied = "true"
      window.setTimeout(() => delete this.el.dataset.copied, 1200)
    })
  }
}

const csrfToken = document.querySelector("meta[name='csrf-token']").getAttribute("content")
const liveSocket = new LiveSocket("/live", Socket, {
  longPollFallbackMs: 2500,
  params: {_csrf_token: csrfToken},
  hooks: {...colocatedHooks, ScannerCamera, DeckPreview, ClipboardCopy},
})

// Show progress bar on live navigation and form submits
topbar.config({barColors: {0: "#29d"}, shadowColor: "rgba(0, 0, 0, .3)"})
window.addEventListener("phx:page-loading-start", _info => topbar.show(300))
window.addEventListener("phx:page-loading-stop", _info => topbar.hide())

window.addEventListener("manavault:flash-mounted", event => {
  const flash = event.target

  window.setTimeout(() => {
    if (flash.isConnected) flash.click()
  }, 2000)
})

// connect if there are any LiveViews on the page
liveSocket.connect()

// expose liveSocket on window for web console debug logs and latency simulation:
// >> liveSocket.enableDebug()
// >> liveSocket.enableLatencySim(1000)  // enabled for duration of browser session
// >> liveSocket.disableLatencySim()
window.liveSocket = liveSocket

let deferredInstallPrompt = null
const pwaAssetVersion = "20260617-9"
const serviceWorkerUrl = `${window.location.origin}/sw.js?v=${pwaAssetVersion}`

function appDisplayMode() {
  if (window.matchMedia("(display-mode: standalone)").matches) return "standalone"
  if (window.navigator.standalone) return "standalone"
  return "browser"
}

function installButtons() {
  return Array.from(document.querySelectorAll("[data-pwa-install]"))
}

function diagnosticButtons() {
  return Array.from(document.querySelectorAll("[data-pwa-install-debug]"))
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

function updatePwaInstallState(state) {
  window.manavaultPwa = {...window.manavaultPwa, ...state}
}

function adoptInstallPrompt(prompt = window.__manavaultPwaInstallCapture?.prompt) {
  if (!prompt) return false

  deferredInstallPrompt = prompt
  updatePwaInstallState({
    installPromptAvailable: true,
    installPromptCapturedEarly: Boolean(window.__manavaultPwaInstallCapture?.fired),
    installPromptCapturedAt: window.__manavaultPwaInstallCapture?.firedAt || null,
  })
  setInstallButtonsVisible(true, true)
  return true
}

function pwaDiagnosticLabel() {
  const pwa = window.manavaultPwa

  if (pwa.displayMode === "standalone") return "Installed"
  if (!pwa.secureContext) return "HTTPS required"
  if (!pwa.serviceWorkerSupported) return "No SW support"
  if (pwa.serviceWorkerError) return "SW failed"
  if (!pwa.serviceWorkerRegistered) return "SW pending"
  if (!pwa.serviceWorkerControlled) return "Reload once"
  if (pwa.manifestError) return "Manifest failed"
  if (!pwa.manifestOk) return "Manifest pending"
  if (!pwa.iconsOk) return "Icon failed"
  if (!pwa.installPromptAvailable) return "Not installable"
  return "Install"
}

function setInstallButtonsVisible(visible, enabled = visible) {
  installButtons().forEach(button => {
    const shouldShow = visible && enabled

    button.classList.toggle("hidden", !shouldShow)
    button.disabled = false
    button.dataset.pwaInstallEnabled = enabled ? "true" : "false"
    button.setAttribute("aria-disabled", enabled ? "false" : "true")
    button.classList.toggle("btn-disabled", !enabled)

    const label = button.querySelector("[data-pwa-install-label]")
    if (label) label.textContent = pwaDiagnosticLabel()

    button.title = JSON.stringify(window.manavaultPwa)
  })

  diagnosticButtons().forEach(button => {
    button.classList.toggle("hidden", process.env.NODE_ENV !== "development" || enabled || !visible)
  })
}

async function refreshRelatedApps() {
  if (!navigator.getInstalledRelatedApps) return

  try {
    updatePwaInstallState({relatedApps: await navigator.getInstalledRelatedApps()})
  } catch (error) {
    updatePwaInstallState({relatedAppsError: error?.message || "related apps check failed"})
  }
}

async function validateManifestForInstall() {
  try {
    const response = await fetch(`/site.webmanifest?v=${pwaAssetVersion}`, {cache: "no-store"})
    if (!response.ok) throw new Error(`manifest HTTP ${response.status}`)

    const manifest = await response.json()
    const icons = Array.isArray(manifest.icons) ? manifest.icons : []

    const hasRequiredIcon = icons.some(icon => {
      const sizes = String(icon.sizes || "")
      const purpose = String(icon.purpose || "any")
      return icon.src && sizes.includes("192x192") && purpose.includes("any")
    })

    if (!hasRequiredIcon) throw new Error("missing 192x192 any icon")

    const iconResults = await Promise.all(
      icons
        .filter(icon => icon.src)
        .map(icon =>
          fetch(icon.src, {cache: "no-store"})
            .then(iconResponse => iconResponse.ok)
            .catch(() => false)
        )
    )

    updatePwaInstallState({
      manifestOk: true,
      manifestError: null,
      iconsOk: iconResults.length > 0 && iconResults.every(Boolean),
    })
  } catch (error) {
    updatePwaInstallState({
      manifestOk: false,
      manifestError: error?.message || "manifest validation failed",
      iconsOk: false,
    })
  }
}

function resolveManifestUrl(path) {
  try {
    return new URL(path || "/", window.location.origin).href
  } catch (_error) {
    return null
  }
}

async function responseSummary(url) {
  if (!url) return null

  try {
    const response = await fetch(url, {cache: "no-store"})

    return {
      ok: response.ok,
      status: response.status,
      type: response.type,
      contentType: response.headers.get("content-type"),
      cacheControl: response.headers.get("cache-control"),
    }
  } catch (error) {
    return {ok: false, error: error?.message || "fetch failed"}
  }
}

async function collectPwaInstallDiagnostics() {
  const manifestLink = document.querySelector("link[rel='manifest']")
  const registration =
    navigator.serviceWorker?.getRegistration ? await navigator.serviceWorker.getRegistration("/") : null
  const activeWorker = registration?.active || registration?.waiting || registration?.installing || null

  let manifest = null
  let manifestFetch = null

  try {
    const manifestHref = manifestLink?.href || resolveManifestUrl("/site.webmanifest")
    const response = await fetch(manifestHref, {cache: "no-store"})
    manifestFetch = {
      ok: response.ok,
      status: response.status,
      type: response.type,
      contentType: response.headers.get("content-type"),
      cacheControl: response.headers.get("cache-control"),
    }

    if (response.ok) manifest = await response.json()
  } catch (error) {
    manifestFetch = {ok: false, error: error?.message || "manifest fetch failed"}
  }

  const startUrl = resolveManifestUrl(manifest?.start_url)
  const scopeUrl = resolveManifestUrl(manifest?.scope)
  const iconUrls = Array.isArray(manifest?.icons)
    ? manifest.icons.filter(icon => icon.src).map(icon => resolveManifestUrl(icon.src))
    : []

  const iconFetches = await Promise.all(iconUrls.map(responseSummary))
  const cacheKeys = await caches?.keys?.().catch(error => [`cache keys failed: ${error?.message}`])

  updatePwaInstallState({
    displayMode: appDisplayMode(),
    serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
    serviceWorkerControllerScript: navigator.serviceWorker?.controller?.scriptURL || null,
    serviceWorkerRegistrationScope: registration?.scope || null,
    serviceWorkerRegistrationScript: activeWorker?.scriptURL || null,
    serviceWorkerRegistrationState: activeWorker?.state || null,
    manifestLinkHref: manifestLink?.href || null,
    manifestFetch,
    manifest,
    manifestStartUrlResolved: startUrl,
    manifestScopeResolved: scopeUrl,
    manifestCoversCurrentPage: Boolean(scopeUrl && window.location.href.startsWith(scopeUrl)),
    startUrlFetch: await responseSummary(startUrl),
    iconFetches,
    cacheKeys,
    isTopLevelWindow: window.top === window,
    cookiesEnabled: navigator.cookieEnabled,
    pwaAssetVersion,
    installPromptCapturedEarly: Boolean(window.__manavaultPwaInstallCapture?.fired),
    installPromptCapturedAt: window.__manavaultPwaInstallCapture?.firedAt || null,
  })
}

function refreshPwaInstallDiagnostics() {
  collectPwaInstallDiagnostics().finally(() => {
    if (!deferredInstallPrompt && window.manavaultPwa.displayMode !== "standalone") {
      setInstallButtonsVisible(true, false)
    }
  })
}

async function showPwaInstallDiagnostics() {
  await collectPwaInstallDiagnostics()

  const fullDiagnostics = JSON.stringify(window.manavaultPwa, null, 2)
  let copied = false

  try {
    await navigator.clipboard.writeText(fullDiagnostics)
    copied = true
  } catch (_error) {
    copied = false
  }

  const pwa = window.manavaultPwa
  const summary = {
    copiedToClipboard: copied,
    installPromptAvailable: pwa.installPromptAvailable,
    installPromptCapturedEarly: pwa.installPromptCapturedEarly,
    installPromptCapturedAt: pwa.installPromptCapturedAt,
    displayMode: pwa.displayMode,
    serviceWorkerControlled: pwa.serviceWorkerControlled,
    serviceWorkerRegistrationState: pwa.serviceWorkerRegistrationState,
    serviceWorkerRegistrationScope: pwa.serviceWorkerRegistrationScope,
    serviceWorkerRegistrationScript: pwa.serviceWorkerRegistrationScript,
    manifestLinkHref: pwa.manifestLinkHref,
    manifestFetchOk: pwa.manifestFetch?.ok,
    manifestCoversCurrentPage: pwa.manifestCoversCurrentPage,
    manifestStartUrlResolved: pwa.manifestStartUrlResolved,
    startUrlFetchOk: pwa.startUrlFetch?.ok,
    iconsOk: pwa.iconsOk,
    relatedApps: pwa.relatedApps,
    pwaAssetVersion: pwa.pwaAssetVersion,
  }

  window.alert(JSON.stringify(summary, null, 2))
}

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(serviceWorkerUrl, {scope: "/"})
      .then(() => {
        updatePwaInstallState({
          serviceWorkerRegistered: true,
          serviceWorkerControlled: Boolean(navigator.serviceWorker.controller),
          serviceWorkerError: null,
        })
      })
      .catch(error => {
        updatePwaInstallState({
          serviceWorkerRegistered: false,
          serviceWorkerError: error?.message || "registration failed",
        })
      })
      .finally(() => {
        Promise.all([validateManifestForInstall(), refreshRelatedApps()]).finally(() => {
          window.setTimeout(refreshPwaInstallDiagnostics, 8000)
        })
      })
  })
} else {
  Promise.all([validateManifestForInstall(), refreshRelatedApps()]).finally(() => {
    window.setTimeout(refreshPwaInstallDiagnostics, 500)
  })
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault()
  window.__manavaultPwaInstallCapture = {
    prompt: event,
    fired: true,
    firedAt: Date.now(),
  }
  adoptInstallPrompt(event)
})

window.addEventListener("manavault:pwa-install-available", () => {
  adoptInstallPrompt()
})

adoptInstallPrompt()

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null
  updatePwaInstallState({
    installPromptAvailable: false,
    displayMode: appDisplayMode(),
  })
  setInstallButtonsVisible(false)
})

window.addEventListener("click", async event => {
  const diagnosticButton = event.target.closest("[data-pwa-install-debug]")
  if (diagnosticButton) {
    showPwaInstallDiagnostics()
    return
  }

  const button = event.target.closest("[data-pwa-install]")
  if (!button) return

  if (button.dataset.pwaInstallEnabled !== "true" || !deferredInstallPrompt) {
    showPwaInstallDiagnostics()
    return
  }

  button.disabled = true
  deferredInstallPrompt.prompt()
  await deferredInstallPrompt.userChoice.catch(() => {})
  deferredInstallPrompt = null
  updatePwaInstallState({installPromptAvailable: false})
  refreshPwaInstallDiagnostics()
})

// The lines below enable quality of life phoenix_live_reload
// development features:
//
//     1. stream server logs to the browser console
//     2. click on elements to jump to their definitions in your code editor
//
if (process.env.NODE_ENV === "development") {
  window.addEventListener("phx:live_reload:attached", ({detail: reloader}) => {
    // Enable server log streaming to client.
    // Disable with reloader.disableServerLogs()
    reloader.enableServerLogs()

    // Open configured PLUG_EDITOR at file:line of the clicked element's HEEx component
    //
    //   * click with "c" key pressed to open at caller location
    //   * click with "d" key pressed to open at function component definition location
    let keyDown
    window.addEventListener("keydown", e => keyDown = e.key)
    window.addEventListener("keyup", _e => keyDown = null)
    window.addEventListener("click", e => {
      if(keyDown === "c"){
        e.preventDefault()
        e.stopImmediatePropagation()
        reloader.openEditorAtCaller(e.target)
      } else if(keyDown === "d"){
        e.preventDefault()
        e.stopImmediatePropagation()
        reloader.openEditorAtDef(e.target)
      }
    }, true)

    window.liveReloader = reloader
  })
}
