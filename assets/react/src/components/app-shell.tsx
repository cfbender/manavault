import { Link, Outlet } from "@tanstack/react-router"
import { Archive, Boxes, Camera, Home, Layers, Monitor, Moon, Search, Sun } from "lucide-react"
import type { ReactNode } from "react"
import { useTheme } from "../lib/theme"
import { cn } from "../lib/utils"
import { Button } from "./ui/button"

const navItems = [
  { to: "/" as const, label: "Home", icon: Home },
  { to: "/cards" as const, label: "Cards", icon: Search },
  { to: "/collection" as const, label: "Collection", icon: Boxes },
  { to: "/decks" as const, label: "Decks", icon: Layers },
  { to: "/scan-sessions" as const, label: "Scans", icon: Camera },
]

function ThemeButton() {
  const { theme, setTheme } = useTheme()
  const nextTheme = theme === "system" ? "light" : theme === "light" ? "dark" : "system"
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor

  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(nextTheme)} title={`Theme: ${theme}`}>
      <Icon className="h-4 w-4" />
    </Button>
  )
}

export function AppShell() {
  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <header className="app-shell-header sticky top-0 z-30 border-b border-base-300 bg-base-100/95 backdrop-blur">
        <div className="flex h-16 items-center gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-2 font-semibold">
            <Archive className="h-5 w-5 text-primary" />
            <span className="truncate">ManaVault</span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {navItems.map(item => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                activeProps={{ className: "bg-base-200 text-primary" }}
                className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors hover:bg-base-200"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>

          <Button data-pwa-install className="hidden" size="sm" variant="outline">
            <span data-pwa-install-label>Install</span>
          </Button>
          <ThemeButton />
        </div>
      </header>

      <main className="app-shell-main overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl py-6">
          <Outlet />
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-base-300 bg-base-100 md:hidden">
        {navItems.map(item => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === "/" }}
            activeProps={{ className: "text-primary" }}
            inactiveProps={{ className: "text-base-content/70" }}
            className={cn("flex h-14 flex-col items-center justify-center gap-1 text-[0.7rem] font-medium")}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-base-content/70">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
