import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react"

type Theme = "system" | "light" | "dark"

const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(null)
const storageKey = "phx:theme"

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? systemTheme() : theme
  document.documentElement.setAttribute("data-theme", resolved)
  document.documentElement.setAttribute("data-theme-source", theme === "system" ? "system" : "user")

  if (theme === "system") {
    localStorage.removeItem(storageKey)
  } else {
    localStorage.setItem(storageKey, theme)
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(storageKey) as Theme | null) || "system")

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handleSystemChange = () => {
      if ((localStorage.getItem(storageKey) || "system") === "system") applyTheme("system")
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) setTheme(((event.newValue as Theme | null) || "system"))
    }

    media.addEventListener("change", handleSystemChange)
    window.addEventListener("storage", handleStorage)

    return () => {
      media.removeEventListener("change", handleSystemChange)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  const value = useMemo(() => ({ theme, setTheme }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used inside ThemeProvider")
  return context
}
