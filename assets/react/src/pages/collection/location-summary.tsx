import { Download, Edit3, MoreVertical, Trash2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { cn } from "../../lib/utils"

// The server names the virtual unfiled bucket by its relay global id
// (`Location:unfiled`); filters and older links use the raw `unfiled`.
const UNFILED_GLOBAL_ID = btoa("Location:unfiled")

export function isUnfiledLocationId(id: string) {
  return id === "unfiled" || id === UNFILED_GLOBAL_ID
}

export function isUnfiledLocation(location: { id: string }) {
  return isUnfiledLocationId(location.id)
}

export function SummaryActionMenu({
  className,
  label,
  onDelete,
  onEdit,
  onExportCsv,
  onExportText,
}: {
  className?: string
  label: string
  onDelete?: () => void
  onEdit: () => void
  onExportCsv?: () => void
  onExportText?: () => void
}) {
  return (
    <div
      className={cn("absolute right-3 top-3 z-40", className)}
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
