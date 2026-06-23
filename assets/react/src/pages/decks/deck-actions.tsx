import {
  Download,
  Edit3,
  MoreVertical,
  Share2,
  ShoppingCart,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react"
import { type MouseEvent as ReactMouseEvent, type ReactNode } from "react"

export function blurFocusedMenuItem(event: ReactMouseEvent<HTMLElement>) {
  const activeElement = event.currentTarget.ownerDocument.activeElement

  if (activeElement instanceof HTMLElement && event.currentTarget.contains(activeElement)) {
    activeElement.blur()
  }
}

export function ShareModeHidden({
  children,
  shareMode,
}: {
  children: ReactNode
  shareMode?: boolean
}) {
  if (shareMode) return null
  return <>{children}</>
}

export function SummaryActionMenu({
  label,
  onDelete,
  onEdhrec,
  onEdit,
  onExport,
  onImport,
  onMissing,
  onShare,
}: {
  label: string
  onDelete?: () => void
  onEdhrec?: () => void
  onEdit: () => void
  onExport?: () => void
  onImport?: () => void
  onMissing?: () => void
  onShare?: () => void
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
        onClick={blurFocusedMenuItem}
      >
        <li>
          <button type="button" onClick={onEdit}>
            <Edit3 className="h-4 w-4" />
            Edit
          </button>
        </li>
        {onShare ? (
          <li>
            <button type="button" onClick={onShare}>
              <Share2 className="h-4 w-4" />
              Share deck
            </button>
          </li>
        ) : null}
        {onImport ? (
          <li>
            <button type="button" onClick={onImport}>
              <Upload className="h-4 w-4" />
              Import decklist
            </button>
          </li>
        ) : null}
        {onMissing ? (
          <li>
            <button type="button" onClick={onMissing}>
              <ShoppingCart className="h-4 w-4" />
              Missing cards
            </button>
          </li>
        ) : null}
        {onEdhrec ? (
          <li>
            <button type="button" onClick={onEdhrec}>
              <Sparkles className="h-4 w-4" />
              EDHREC
            </button>
          </li>
        ) : null}
        {onExport ? (
          <li>
            <button type="button" onClick={onExport}>
              <Download className="h-4 w-4" />
              Export decklist
            </button>
          </li>
        ) : null}
        {onDelete ? (
          <li>
            <button type="button" className="text-error" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
              Delete deck
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  )
}
