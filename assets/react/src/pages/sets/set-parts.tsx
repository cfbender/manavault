import type { CSSProperties } from "react"
import { cn } from "../../lib/utils"
import type { SetSection } from "./set-sections"

/** A set's symbol in the current text color. */
export function SetSymbol({ className, iconUrl }: { className?: string; iconUrl: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("set-symbol", className)}
      style={{ "--set-icon": `url("${iconUrl}")` } as CSSProperties}
    />
  )
}

/** Owned printings of a set as a count and a thin bar. */
export function SetCompletion({
  className,
  owned,
  total,
}: {
  className?: string
  owned: number
  total: number
}) {
  const percent = total ? Math.round((owned / total) * 100) : 0
  return (
    <div className={cn("space-y-1", className)}>
      <p className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-mono font-bold">
          {owned} / {total}
        </span>
        <span className="text-base-content/60">{owned ? `${percent}% owned` : "None owned"}</span>
      </p>
      <div
        className="h-1 overflow-hidden rounded-full bg-base-content/10"
        role="meter"
        aria-label="Printings owned"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={owned}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

/** Jump links to a set's treatment sections, like Scryfall's set page headings. */
export function SetSectionNav<P>({
  activeKey,
  onSelect,
  sections,
}: {
  activeKey?: string
  onSelect: (section: SetSection<P>) => void
  sections: readonly SetSection<P>[]
}) {
  if (sections.length < 2) return null
  return (
    <nav aria-label="Set sections" className="-mx-1 mb-4 overflow-x-auto px-1 pb-1">
      <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
        {sections.map((section) => {
          const active = section.key === activeKey
          return (
            <li key={section.key}>
              <button
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => onSelect(section)}
                className={cn(
                  "flex min-h-9 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  active
                    ? "border-primary bg-primary text-primary-content"
                    : "border-base-300 bg-base-100 hover:border-base-content/30",
                )}
              >
                {section.label}
                <span className={cn("font-mono text-xs", active ? "opacity-80" : "opacity-55")}>
                  {section.printings.length}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
