import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core"
import { StatusBar } from "@capacitor/status-bar"

/**
 * The native shells draw the page behind transparent system bars, so their icons must contrast
 * with the page: light icons on a dark page, dark icons on a light one.
 */
export function setNativeSystemBarsTheme(theme: "light" | "dark") {
  if (!Capacitor.isNativePlatform()) return
  SystemBars.setStyle({
    style: theme === "dark" ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
  }).catch(() => {
    // Older native shells without the SystemBars plugin keep their fixed style.
  })
}

/** The system bar style for the page's current theme. */
export function restoreNativeSystemBarsTheme() {
  setNativeSystemBarsTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark")
}

/** Typical Android gesture-bar height, used only when the shell reports no bottom inset. */
const FALLBACK_BOTTOM_INSET = 24

/**
 * The Android shell draws the page edge to edge and sets --safe-area-inset-* itself. If those
 * values never arrive (0 on some devices), take the status bar height from the StatusBar plugin
 * instead, so fixed headers never sit under the status bar. A reported value always wins.
 */
export function initNativeSafeAreaFallback() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return
  const root = document.documentElement
  const reported = (name: string) =>
    Number.parseFloat(getComputedStyle(root).getPropertyValue(`--safe-area-inset-${name}`)) || 0
  const apply = async () => {
    try {
      const { height } = await StatusBar.getInfo()
      // A top inset means the shell's values arrived, so a 0 bottom is real: the keyboard is
      // open and covers the gesture bar.
      if (reported("top") > 0) return
      if (height > 0) {
        root.style.setProperty("--safe-area-inset-top", `${height}px`)
      }
      if (reported("bottom") === 0) {
        root.style.setProperty("--safe-area-inset-bottom", `${FALLBACK_BOTTOM_INSET}px`)
      }
    } catch {
      // Shells without the StatusBar plugin keep whatever the page already has.
    }
  }
  void apply()
  // Give the shell's own values a moment to arrive, and follow rotation.
  window.setTimeout(() => void apply(), 1500)
  window.addEventListener("resize", () => void apply())
}
