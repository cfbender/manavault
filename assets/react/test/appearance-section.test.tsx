import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { MockLink } from "@apollo/client/testing"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { ToastProvider } from "../src/components/ui/toast"
import { PALETTES, ThemeProvider, UpdateAppearanceSettingsDocument } from "../src/lib/theme"
import { AppearanceSection } from "../src/pages/settings/appearance-section"

const html = document.documentElement

// Node's experimental global localStorage shadows jsdom's and is undefined
// without --localstorage-file, so each test gets an in-memory Storage.
function memoryStorage(): Storage {
  const items = new Map<string, string>()

  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage())
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  for (const attribute of [
    "data-theme",
    "data-theme-source",
    "data-theme-style",
    "data-palette",
    "data-appearance-source",
  ]) {
    html.removeAttribute(attribute)
  }
})

function renderAppearance(mocks: ConstructorParameters<typeof MockLink>[0] = []) {
  const client = new ApolloClient({ cache: new InMemoryCache(), link: new MockLink(mocks) })

  render(
    <ApolloProvider client={client}>
      <ThemeProvider>
        <ToastProvider>
          <AppearanceSection />
        </ToastProvider>
      </ThemeProvider>
    </ApolloProvider>,
  )
}

function pressed(name: RegExp) {
  return screen.getByRole("button", { name }).getAttribute("aria-pressed")
}

function appearanceResult(palette: string, themeStyle: string) {
  return {
    data: { updateAppearanceSettings: { appearanceSettings: { palette, themeStyle } } },
  }
}

test("every palette renders a preview swatch in the current light or dark mode", () => {
  renderAppearance()

  for (const palette of PALETTES) {
    const button = screen.getByRole("button", { name: new RegExp(palette.label) })
    const swatch = button.querySelector(`[data-palette="${palette.id}"]`)

    expect(swatch?.getAttribute("data-theme")).toBe("dark")
    expect(swatch?.textContent).toContain("Aa")
  }
  expect(pressed(/Claret/)).toBe("true")
  expect(html.dataset.palette).toBe("claret")
})

test("anonymous visitors keep the palette and style in browser storage", async () => {
  localStorage.setItem("manavault:palette", "everforest")
  renderAppearance()

  expect(pressed(/Everforest/)).toBe("true")
  expect(html.dataset.palette).toBe("everforest")

  await userEvent.click(screen.getByRole("button", { name: /Tokyo Night/ }))
  await userEvent.click(screen.getByRole("button", { name: /Classic vault/ }))

  expect(pressed(/Tokyo Night/)).toBe("true")
  expect(pressed(/Everforest/)).toBe("false")
  expect(html.dataset.palette).toBe("tokyonight")
  expect(html.dataset.themeStyle).toBe("classic")
  expect(localStorage.getItem("manavault:palette")).toBe("tokyonight")
  expect(localStorage.getItem("manavault:theme-style")).toBe("classic")
})

test("the signed-in owner's appearance comes from the server and saves to the account", async () => {
  html.setAttribute("data-appearance-source", "account")
  html.setAttribute("data-palette", "nord")
  html.setAttribute("data-theme-style", "classic")
  localStorage.setItem("manavault:palette", "monochrome")

  renderAppearance([
    {
      request: { query: UpdateAppearanceSettingsDocument, variables: { palette: "gruvbox" } },
      result: appearanceResult("gruvbox", "classic"),
    },
    {
      request: { query: UpdateAppearanceSettingsDocument, variables: { themeStyle: "glass" } },
      result: appearanceResult("gruvbox", "glass"),
    },
  ])

  expect(pressed(/Nord/)).toBe("true")
  expect(pressed(/Classic vault/)).toBe("true")

  await userEvent.click(screen.getByRole("button", { name: /Gruvbox/ }))
  await userEvent.click(screen.getByRole("button", { name: /Liquid glass/ }))

  expect(pressed(/Gruvbox/)).toBe("true")
  expect(html.dataset.palette).toBe("gruvbox")
  expect(html.dataset.themeStyle).toBe("glass")
  expect(localStorage.getItem("manavault:palette")).toBe("monochrome")
  expect(localStorage.getItem("manavault:theme-style")).toBeNull()
  expect(screen.queryByText(/Appearance not saved/)).toBeNull()
})

test("a failed account save rolls the palette back and explains why", async () => {
  html.setAttribute("data-appearance-source", "account")
  html.setAttribute("data-palette", "kanagawa")

  renderAppearance([
    {
      request: { query: UpdateAppearanceSettingsDocument, variables: { palette: "catppuccin" } },
      error: new Error("Network down"),
    },
  ])

  await userEvent.click(screen.getByRole("button", { name: /Catppuccin/ }))

  expect(await screen.findByText("Appearance not saved: Network down")).toBeTruthy()
  await waitFor(() => expect(pressed(/Kanagawa/)).toBe("true"))
  expect(pressed(/Catppuccin/)).toBe("false")
  expect(html.dataset.palette).toBe("kanagawa")
})
