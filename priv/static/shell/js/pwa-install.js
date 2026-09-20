window.__manavaultAssetVersion =
  document.querySelector('meta[name="manavault-asset-version"]')?.content || ""

if (!window.__manavaultPwaInstallCapture) {
  window.__manavaultPwaInstallCapture = {
    prompt: null,
    fired: false,
    firedAt: null,
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    window.__manavaultPwaInstallCapture = {
      prompt: event,
      fired: true,
      firedAt: Date.now(),
    }
    window.dispatchEvent(new Event("manavault:pwa-install-available"))
  })
}
