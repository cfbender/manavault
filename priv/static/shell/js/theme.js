;(() => {
  const systemTheme = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  const storageKey = "manavault:theme"

  const storedTheme = () => {
    try {
      return localStorage.getItem(storageKey) || "system"
    } catch {
      return "system"
    }
  }

  const persistTheme = (theme) => {
    try {
      if (theme === "system") {
        localStorage.removeItem(storageKey)
      } else {
        localStorage.setItem(storageKey, theme)
      }
    } catch {
      // Storage can be unavailable or full. The DOM theme still applies for this page load.
    }
  }

  const setTheme = (theme) => {
    persistTheme(theme)
    if (theme === "system") {
      document.documentElement.setAttribute("data-theme", systemTheme())
      document.documentElement.setAttribute("data-theme-source", "system")
    } else {
      document.documentElement.setAttribute("data-theme", theme)
      document.documentElement.setAttribute("data-theme-source", "user")
    }
  }

  if (!document.documentElement.hasAttribute("data-theme")) {
    setTheme(storedTheme())
  }

  // A signed-in owner's palette and surface style come from the account and
  // are already rendered on <html> by the server. Browser storage only backs
  // anonymous visitors, such as people opening a public share link.
  const accountAppearance =
    document.documentElement.getAttribute("data-appearance-source") === "account"
  const styleStorageKey = "manavault:theme-style"
  const paletteStorageKey = "manavault:palette"

  const storedThemeStyle = () => {
    try {
      return localStorage.getItem(styleStorageKey) === "classic" ? "classic" : "glass"
    } catch {
      return "glass"
    }
  }

  const storedPalette = () => {
    try {
      return localStorage.getItem(paletteStorageKey) || "claret"
    } catch {
      return "claret"
    }
  }

  const setThemeStyle = (style) => {
    document.documentElement.setAttribute(
      "data-theme-style",
      style === "classic" ? "classic" : "glass",
    )
  }

  // Unknown palette ids match no palette block, so they fall back to Claret.
  const setPalette = (palette) => {
    document.documentElement.setAttribute("data-palette", palette || "claret")
  }

  if (!accountAppearance) {
    setThemeStyle(storedThemeStyle())
    setPalette(storedPalette())
  }

  window.addEventListener("storage", (event) => {
    if (event.key === storageKey) setTheme(event.newValue || "system")
    if (accountAppearance) return
    if (event.key === styleStorageKey) setThemeStyle(event.newValue)
    if (event.key === paletteStorageKey) setPalette(event.newValue)
  })

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (document.documentElement.getAttribute("data-theme-source") === "system") {
      document.documentElement.setAttribute("data-theme", systemTheme())
    }
  })
})()
