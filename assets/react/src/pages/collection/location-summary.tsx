import { Download, Edit3, MoreVertical, Trash2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"

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
