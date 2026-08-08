import { Hash } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="btn btn-outline min-w-44 justify-between gap-2"
          aria-label={`Group decks by ${active.label}`}
        >
          <span className="flex items-center gap-2">
            <Hash className="h-4 w-4" />
            Group
          </span>
          <span className="badge badge-ghost text-[0.65rem]">{active.label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-3 shadow-2xl">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as DeckGroupBy)}
          className="grid gap-1"
        >
          {DECK_GROUP_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="text-sm">
              <span className="font-semibold">{option.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
