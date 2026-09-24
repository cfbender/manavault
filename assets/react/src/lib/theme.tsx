import { useMutation } from "@apollo/client/react"
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { graphql } from "../gql"

type Theme = "system" | "light" | "dark"
export type ThemeStyle = "classic" | "glass"

export const PALETTES = [
  { id: "claret", label: "Claret" },
  { id: "nord", label: "Nord" },
  { id: "catppuccin", label: "Catppuccin" },
  { id: "tokyonight", label: "Tokyo Night" },
  { id: "gruvbox", label: "Gruvbox" },
  { id: "everforest", label: "Everforest" },
  { id: "kanagawa", label: "Kanagawa" },
  { id: "nightowl", label: "Night Owl" },
  { id: "dracula", label: "Dracula" },
  { id: "rosepine", label: "Rosé Pine" },
  { id: "solarized", label: "Solarized" },
  { id: "monochrome", label: "Monochrome" },
] as const

export type Palette = (typeof PALETTES)[number]["id"]

export const UpdateAppearanceSettingsDocument = graphql(`
  mutation UpdateAppearanceSettings($palette: String, $themeStyle: String) {
    updateAppearanceSettings(palette: $palette, themeStyle: $themeStyle) {
      appearanceSettings {
        palette
        themeStyle
      }
    }
  }
`)

const ThemeContext = createContext<{
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: "light" | "dark"
  themeStyle: ThemeStyle
  setThemeStyle: (style: ThemeStyle) => Promise<void>
  palette: Palette
  setPalette: (palette: Palette) => Promise<void>
} | null>(null)
const storageKey = "manavault:theme"
const styleStorageKey = "manavault:theme-style"
const paletteStorageKey = "manavault:palette"

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function resolveTheme(theme: Theme) {
  return theme === "system" ? systemTheme() : theme
}

// The server renders data-appearance-source="account" on <html> for the
// signed-in owner, along with the account's palette and surface style. Only
// anonymous visitors fall back to browser storage.
function accountAppearance() {
  return document.documentElement.dataset.appearanceSource === "account"
}

function parseThemeStyle(value: string | null | undefined): ThemeStyle {
  return value === "classic" ? "classic" : "glass"
}

function parsePalette(value: string | null | undefined): Palette {
  return PALETTES.find((palette) => palette.id === value)?.id ?? "claret"
}

function readStorage(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // Storage can be unavailable or full. The DOM attribute still applies for this page load.
  }
}

function storedTheme() {
  return (readStorage(storageKey) as Theme | null) || "system"
}

function initialThemeStyle(): ThemeStyle {
  return parseThemeStyle(
    accountAppearance()
      ? document.documentElement.dataset.themeStyle
      : readStorage(styleStorageKey),
  )
}

function initialPalette(): Palette {
  return parsePalette(
    accountAppearance() ? document.documentElement.dataset.palette : readStorage(paletteStorageKey),
  )
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", resolveTheme(theme))
  document.documentElement.setAttribute("data-theme-source", theme === "system" ? "system" : "user")

  writeStorage(storageKey, theme === "system" ? null : theme)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [account] = useState(accountAppearance)
  const [theme, setTheme] = useState<Theme>(storedTheme)
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => resolveTheme(theme))
  const [themeStyle, setThemeStyleState] = useState<ThemeStyle>(initialThemeStyle)
  const [palette, setPaletteState] = useState<Palette>(initialPalette)
  const [updateAppearance] = useMutation(UpdateAppearanceSettingsDocument)

  useEffect(() => {
    applyTheme(theme)
    setResolvedTheme(resolveTheme(theme))
  }, [theme])

  useEffect(() => {
    document.documentElement.setAttribute("data-theme-style", themeStyle)
    if (!account) writeStorage(styleStorageKey, themeStyle === "glass" ? null : themeStyle)
  }, [account, themeStyle])

  useEffect(() => {
    document.documentElement.setAttribute("data-palette", palette)
    if (!account) writeStorage(paletteStorageKey, palette === "claret" ? null : palette)
  }, [account, palette])

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handleSystemChange = () => {
      if (storedTheme() === "system") {
        applyTheme("system")
        setResolvedTheme(systemTheme())
      }
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) setTheme((event.newValue as Theme | null) || "system")
      if (account) return
      if (event.key === styleStorageKey) setThemeStyleState(parseThemeStyle(event.newValue))
      if (event.key === paletteStorageKey) setPaletteState(parsePalette(event.newValue))
    }

    media.addEventListener("change", handleSystemChange)
    window.addEventListener("storage", handleStorage)

    return () => {
      media.removeEventListener("change", handleSystemChange)
      window.removeEventListener("storage", handleStorage)
    }
  }, [account])

  const value = useMemo(() => {
    // Applies the change immediately. For the signed-in owner it is then saved
    // to the account; if saving fails the change is rolled back and the error
    // rethrown so the caller can report it.
    async function changeAppearance<T>(
      setState: Dispatch<SetStateAction<T>>,
      previous: T,
      next: T,
      variables: { palette?: string; themeStyle?: string },
    ) {
      setState(next)
      if (!account) return

      try {
        await updateAppearance({ variables })
      } catch (error) {
        setState((current) => (current === next ? previous : current))
        throw error
      }
    }

    return {
      theme,
      setTheme,
      resolvedTheme,
      themeStyle,
      setThemeStyle: (next: ThemeStyle) =>
        changeAppearance(setThemeStyleState, themeStyle, next, { themeStyle: next }),
      palette,
      setPalette: (next: Palette) =>
        changeAppearance(setPaletteState, palette, next, { palette: next }),
    }
  }, [account, palette, resolvedTheme, theme, themeStyle, updateAppearance])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used inside ThemeProvider")
  return context
}
