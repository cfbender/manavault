import { Hash } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { DECK_GROUP_OPTIONS, type DeckGroupBy } from "../../lib/deck-grouping"

export function DeckGroupMenu({
  onChange,
  value,
}: {
  onChange: (value: DeckGroupBy) => void
  value: DeckGroupBy
}) {
  const active =
    DECK_GROUP_OPTIONS.find((option) => option.value === value) || DECK_GROUP_OPTIONS[0]
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function closeOnOutsideClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener("mousedown", closeOnOutsideClick)
    return () => document.removeEventListener("mousedown", closeOnOutsideClick)
  }, [open])

  return (
    <div ref={ref} className="dropdown dropdown-start sm:dropdown-end">
      <button
        type="button"
        className="btn btn-outline min-w-44 justify-between gap-2"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex items-center gap-2">
          <Hash className="h-4 w-4" />
          Group
        </span>
        <span className="badge badge-ghost text-[0.65rem]">{active.label}</span>
      </button>
      {open ? (
        <div className="dropdown-content z-50 mt-2 w-64 rounded-box border border-base-300 bg-base-100 p-3 shadow-2xl">
          <div className="grid gap-1">
            {DECK_GROUP_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={[
                  "flex items-center gap-3 rounded-btn px-3 py-2 text-left text-sm transition-colors",
                  value === option.value
                    ? "bg-primary/15 text-primary"
                    : "text-base-content/75 hover:bg-base-200",
                ].join(" ")}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                <span
                  className={
                    value === option.value
                      ? "h-4 w-4 rounded-full border-4 border-primary"
                      : "h-4 w-4 rounded-full border-2 border-base-content/25"
                  }
                />
                <span className="font-semibold">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
