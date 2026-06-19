import { Link, Outlet } from "@tanstack/react-router"
import { Boxes, Camera, Home, Layers, Menu, Monitor, Moon, Search, Sun } from "lucide-react"
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

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const options = [
    { value: "system" as const, label: "System", icon: Monitor },
    { value: "light" as const, label: "Light", icon: Sun },
    { value: "dark" as const, label: "Dark", icon: Moon },
  ]

  return (
    <div className="relative grid h-11 w-36 grid-cols-3 rounded-full border border-base-300 bg-base-200 p-1 shadow-sm">
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-primary/15 ring-1 ring-primary/25 transition-transform",
          theme === "system" && "translate-x-0",
          theme === "light" && "translate-x-full",
          theme === "dark" && "translate-x-[200%]",
        )}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "relative z-10 flex h-full w-full items-center justify-center rounded-full transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
            theme === option.value ? "text-primary" : "text-base-content/70",
          )}
          aria-pressed={theme === option.value}
          title={option.label}
          onClick={() => setTheme(option.value)}
        >
          <option.icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  )
}

export function AppShell() {
  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <header className="app-shell-header sticky top-0 z-30 bg-base-100/95 backdrop-blur">
        <div className="navbar min-h-16 px-0">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-3 text-2xl font-black tracking-normal"
          >
            <img src="/images/logo.svg" alt="" className="h-7 w-7 shrink-0" />
            <span className="hidden truncate sm:inline">ManaVault</span>
          </Link>

          <nav className="ml-auto hidden items-center gap-4 lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" }}
                activeProps={{ className: "text-primary" }}
                className="btn btn-ghost btn-sm font-bold"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Button data-pwa-install className="ml-auto hidden lg:inline-flex" size="sm">
            <span data-pwa-install-label>Install</span>
          </Button>
          <div className="ml-2 hidden lg:block">
            <ThemeToggle />
          </div>

          <div className="dropdown dropdown-end ml-auto lg:hidden">
            <button className="btn btn-ghost btn-square" type="button" aria-label="Open navigation">
              <Menu className="h-8 w-8" />
            </button>
            <div className="dropdown-content z-50 mt-3 w-64 rounded-box border border-base-300 bg-base-100 p-3 shadow-xl">
              <nav className="grid gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: item.to === "/" }}
                    activeProps={{ className: "bg-base-200 text-primary" }}
                    className="btn btn-ghost justify-start"
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-base-300 pt-3">
                <Button data-pwa-install className="hidden" size="sm">
                  <span data-pwa-install-label>Install</span>
                </Button>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="app-shell-main overflow-y-auto">
        <div className="mx-auto w-full max-w-[105rem] py-8 sm:py-12 lg:py-16">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export function PageHeader({
  title,
  bottomActions,
  description,
  actions,
  eyebrow,
}: {
  title: string
  bottomActions?: ReactNode
  description?: string
  actions?: ReactNode
  eyebrow?: string
}) {
  return (
    <section className="card relative mb-7 border border-base-300 bg-base-200 shadow-xl">
      <div className="card-body gap-5 p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <div className="badge badge-primary badge-outline mb-4 uppercase">{eyebrow}</div>
            ) : null}
            <h1 className="text-4xl font-black tracking-normal sm:text-5xl">{title}</h1>
            {description ? (
              <p className="mt-4 max-w-4xl text-lg text-base-content/70">{description}</p>
            ) : null}
            {bottomActions ? (
              <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                {bottomActions}
              </div>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export function PageSection({
  title,
  count,
  children,
}: {
  title?: string
  count?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      {title || count ? (
        <div className="flex items-center justify-between gap-3">
          {title ? <h2 className="text-2xl font-black tracking-normal">{title}</h2> : <span />}
          {count ? (
            <span className="badge border-transparent bg-base-200 text-sm">{count}</span>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function ActionCard({
  to,
  icon,
  badge,
  badgeTone = "primary",
  title,
  description,
}: {
  to: string
  icon: ReactNode
  badge: ReactNode
  badgeTone?: "primary" | "secondary" | "accent"
  title: string
  description: string
}) {
  const badgeClass = {
    primary: "badge-primary",
    secondary: "badge-secondary",
    accent: "badge-accent",
  }[badgeTone]

  return (
    <Link
      to={to}
      className="card group h-full border border-base-300 bg-base-100 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
    >
      <div className="card-body min-h-64 justify-between p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="text-5xl leading-none">{icon}</div>
          <span className={cn("badge badge-lg badge-outline", badgeClass)}>{badge}</span>
        </div>
        <div>
          <h2 className="text-3xl font-black tracking-normal">{title}</h2>
          <p className="mt-3 text-lg leading-8 text-base-content/70">{description}</p>
        </div>
      </div>
    </Link>
  )
}

export function EmptyPanel({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-8 text-center">
      <div className="min-w-0">
        <h2 className="text-xl font-black">{title}</h2>
        {description ? <p className="mt-2 text-base-content/70">{description}</p> : null}
      </div>
    </div>
  )
}
