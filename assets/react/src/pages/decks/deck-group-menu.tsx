import { Hash, Sparkles } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { DECK_GROUP_OPTIONS, type DeckGroupBy, type DeckGroupOption } from "../../lib/deck-grouping"

function OptionLabel({ option }: { option: DeckGroupOption }) {
  return (
    <span className="flex items-center gap-1.5">
      {option.value === "role" ? <Sparkles aria-hidden className="h-3.5 w-3.5 shrink-0" /> : null}
      {option.label}
    </span>
  )
}

export function DeckGroupMenu({
  onChange,
  options = DECK_GROUP_OPTIONS,
  value,
}: {
  onChange: (value: DeckGroupBy) => void
  /** Defaults to the options every deck has (no AI Tag). */
  options?: DeckGroupOption[]
  value: DeckGroupBy
}) {
  const active = options.find((option) => option.value === value) || options[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="btn btn-outline btn-sm min-w-44 justify-between gap-2"
          aria-label={`Group decks by ${active.label}`}
        >
          <span className="flex items-center gap-2">
            <Hash className="h-4 w-4" />
            Group
          </span>
          <span className="badge badge-ghost text-xs">
            <OptionLabel option={active} />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        collisionPadding={12}
        className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-[min(26rem,calc(100vw-1.5rem))] overflow-y-auto p-3 shadow-2xl"
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as DeckGroupBy)}
          className="grid grid-cols-2 gap-1"
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="text-sm">
              <span className="font-semibold">
                <OptionLabel option={option} />
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
