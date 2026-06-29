import { Boxes, Download, Edit3, MoreVertical, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import { Badge } from "../../components/ui/badge"
import { Card } from "../../components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { cn, titleize } from "../../lib/utils"
import type { LocationDetail, LocationSummary } from "./types"

export function isUnfiledLocation(location: { id: string }) {
  return location.id === "unfiled"
}

export function SummaryActionMenu({
  label,
  onDelete,
  onEdit,
  onExportCsv,
  onExportText,
}: {
  label: string
  onDelete?: () => void
  onEdit: () => void
  onExportCsv?: () => void
  onExportText?: () => void
}) {
  return (
    <div
      className="absolute right-3 top-3 z-40"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="btn btn-circle btn-sm min-h-11 w-11 border-0 bg-neutral/85 text-neutral-content shadow backdrop-blur transition hover:bg-neutral"
            aria-label={label}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onEdit}>
            <Edit3 className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
          {onExportCsv ? (
            <DropdownMenuItem onSelect={onExportCsv}>
              <Download className="h-4 w-4" />
              Export CSV
            </DropdownMenuItem>
          ) : null}
          {onExportText ? (
            <DropdownMenuItem onSelect={onExportText}>
              <Download className="h-4 w-4" />
              Export TXT
            </DropdownMenuItem>
          ) : null}
          {onDelete ? (
            <DropdownMenuItem destructive onSelect={onDelete}>
              <Trash2 className="h-4 w-4" />
              Delete location
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function UnfiledLocationCard({
  countLine,
  detailLine,
  interactive = true,
  location,
  priceLine,
}: {
  countLine?: ReactNode
  detailLine?: ReactNode
  interactive?: boolean
  location: LocationSummary | LocationDetail
  priceLine?: ReactNode
}) {
  return (
    <Card
      className={cn(
        "group relative min-h-52 overflow-hidden transition-all",
        interactive &&
          "hover:-translate-y-0.5 hover:border-primary/40 hover:bg-base-100 hover:shadow-xl",
      )}
    >
      <div className="relative z-10 flex min-h-52 flex-col justify-between gap-8 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-box border border-base-300 bg-base-200 text-base-content/60">
            <Boxes className="h-5 w-5" />
          </span>
          <Badge>{titleize(location.kind)}</Badge>
          {countLine ? (
            <span className="text-sm font-bold text-base-content/70">{countLine}</span>
          ) : null}
          {priceLine ? (
            <span className="text-sm font-bold text-base-content/70">{priceLine}</span>
          ) : null}
        </div>
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-3xl font-black tracking-normal">{location.name}</h3>
          {detailLine ? (
            <div className="mt-3 max-w-2xl text-sm text-base-content/65">{detailLine}</div>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
