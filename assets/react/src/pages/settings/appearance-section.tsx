import { Check, Droplets, Vault } from "lucide-react"
import { PageSection } from "../../components/app-shell"
import { useToast } from "../../components/ui/toast"
import { PALETTES, useTheme, type ThemeStyle } from "../../lib/theme"
import { cn } from "../../lib/utils"
import { errorMessage } from "./data"

const styleOptions: {
  value: ThemeStyle
  label: string
  description: string
  icon: typeof Vault
}[] = [
  {
    value: "classic",
    label: "Classic vault",
    description: "Solid, tactile surfaces with crisp borders and compact corners.",
    icon: Vault,
  },
  {
    value: "glass",
    label: "Liquid glass",
    description:
      "Translucent, blurred panels over an ambient backdrop, in the spirit of modern macOS.",
    icon: Droplets,
  },
]

const optionClassName = (selected: boolean) =>
  cn(
    "rounded-box border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
    selected
      ? "border-primary/50 bg-primary/10"
      : "border-base-300 bg-base-200/40 hover:border-primary/40",
  )

export function AppearanceSection() {
  const { palette, setPalette, resolvedTheme, themeStyle, setThemeStyle } = useTheme()
  const { showToast } = useToast()

  function save(change: Promise<void>) {
    change.catch((err: unknown) => showToast(`Appearance not saved: ${errorMessage(err)}`))
  }

  return (
    <PageSection title="Appearance" count="Palette and surface style">
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-6 p-6">
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-black tracking-normal">Palette</h2>
              <p className="mt-1 text-sm text-base-content/60">
                Every palette has light and dark variants. Light and dark modes stay on the toggle
                in the navigation.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PALETTES.map((option) => {
                const selected = palette === option.id

                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => save(setPalette(option.id))}
                    className={cn("flex flex-col gap-2 p-2", optionClassName(selected))}
                  >
                    <span
                      aria-hidden="true"
                      data-palette={option.id}
                      data-theme={resolvedTheme}
                      className="flex h-14 items-center justify-between rounded-field border border-base-content/10 bg-base-100 px-3 text-base-content"
                    >
                      <span className="text-lg font-black">Aa</span>
                      <span className="flex gap-1">
                        <span className="h-3 w-3 rounded-full bg-primary" />
                        <span className="h-3 w-3 rounded-full bg-secondary" />
                        <span className="h-3 w-3 rounded-full bg-accent" />
                      </span>
                    </span>
                    <span className="flex items-center gap-2 px-1 text-sm font-bold">
                      {option.label}
                      {selected ? <Check className="h-4 w-4 text-primary" /> : null}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-black tracking-normal">Surface style</h3>
              <p className="mt-1 text-sm text-base-content/60">
                Choose how surfaces render. Both styles work with every palette.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {styleOptions.map((option) => {
                const selected = themeStyle === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => save(setThemeStyle(option.value))}
                    className={cn("flex items-start gap-3 p-4", optionClassName(selected))}
                  >
                    <option.icon
                      className={cn(
                        "mt-0.5 h-5 w-5 shrink-0",
                        selected ? "text-primary" : "text-base-content/70",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-bold">
                        {option.label}
                        {selected ? <Check className="h-4 w-4 text-primary" /> : null}
                      </span>
                      <span className="mt-1 block text-sm text-base-content/60">
                        {option.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </PageSection>
  )
}
