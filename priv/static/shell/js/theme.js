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

  const styleStorageKey = "manavault:theme-style"

  const storedThemeStyle = () => {
    try {
      return localStorage.getItem(styleStorageKey) === "classic" ? "classic" : "glass"
    } catch {
      return "glass"
    }
  }

  const setThemeStyle = (style) => {
    document.documentElement.setAttribute(
      "data-theme-style",
      style === "classic" ? "classic" : "glass",
    )
  }

  setThemeStyle(storedThemeStyle())
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey) setTheme(event.newValue || "system")
    if (event.key === styleStorageKey) setThemeStyle(event.newValue)
  })

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (document.documentElement.getAttribute("data-theme-source") === "system") {
      document.documentElement.setAttribute("data-theme", systemTheme())
    }
  })
})()
