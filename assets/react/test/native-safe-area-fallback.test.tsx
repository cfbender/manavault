import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
  SystemBars: { setStyle: () => Promise.resolve() },
  SystemBarsStyle: { Dark: "DARK", Light: "LIGHT" },
}))
vi.mock("@capacitor/status-bar", () => ({
  StatusBar: { getInfo: () => Promise.resolve({ height: 30 }) },
}))

const { initNativeSafeAreaFallback } = await import("../src/lib/native-system-bars.ts")

const style = document.documentElement.style
const inset = (name: string) => style.getPropertyValue(`--safe-area-inset-${name}`)

afterEach(() => {
  style.removeProperty("--safe-area-inset-top")
  style.removeProperty("--safe-area-inset-bottom")
})

describe("initNativeSafeAreaFallback", () => {
  it("fills in both insets when the shell reports none", async () => {
    initNativeSafeAreaFallback()

    await vi.waitFor(() => expect(inset("bottom")).toBe("24px"))
    expect(inset("top")).toBe("30px")
  })

  it("keeps the shell's 0 bottom inset while the keyboard is open", async () => {
    style.setProperty("--safe-area-inset-top", "52.0px")
    style.setProperty("--safe-area-inset-bottom", "0.0px")

    initNativeSafeAreaFallback()
    window.dispatchEvent(new Event("resize"))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(inset("top")).toBe("52.0px")
    expect(inset("bottom")).toBe("0.0px")
  })
})
