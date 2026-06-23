import { Boxes, Download, Edit3, MoreVertical, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import { Badge } from "../../components/ui/badge"
import { Card } from "../../components/ui/card"
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
      className="dropdown dropdown-end absolute right-3 top-3 z-[80]"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="btn btn-circle btn-xs border-0 bg-neutral/85 text-neutral-content shadow backdrop-blur transition hover:bg-neutral"
        tabIndex={0}
        aria-label={label}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      <ul
        tabIndex={0}
        className="menu dropdown-content z-50 mt-1 w-48 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-2xl"
      >
        <li>
          <button type="button" onClick={onEdit}>
            <Edit3 className="h-4 w-4" />
            Edit
          </button>
        </li>
        {onExportCsv ? (
          <li>
            <button type="button" onClick={onExportCsv}>
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </li>
        ) : null}
        {onExportText ? (
          <li>
            <button type="button" onClick={onExportText}>
              <Download className="h-4 w-4" />
              Export TXT
            </button>
          </li>
        ) : null}
        {onDelete ? (
          <li>
            <button type="button" className="text-error" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
              Delete location
            </button>
          </li>
        ) : null}
      </ul>
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
