import { Check, Droplets, Vault } from "lucide-react"
import { PageSection } from "../../components/app-shell"
import { useTheme, type ThemeStyle } from "../../lib/theme"
import { cn } from "../../lib/utils"

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

export function AppearanceSection() {
  const { themeStyle, setThemeStyle } = useTheme()

  return (
    <PageSection title="Appearance" count="Interface style">
      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-4 p-6">
          <div>
            <h2 className="text-2xl font-black tracking-normal">Interface style</h2>
            <p className="mt-1 text-sm text-base-content/60">
              Choose how surfaces render. Light and dark modes stay on the toggle in the navigation
              and apply to both styles.
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
                  onClick={() => setThemeStyle(option.value)}
                  className={cn(
                    "flex items-start gap-3 rounded-box border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
                    selected
                      ? "border-primary/50 bg-primary/10"
                      : "border-base-300 bg-base-200/40 hover:border-primary/40",
                  )}
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
    </PageSection>
  )
}
