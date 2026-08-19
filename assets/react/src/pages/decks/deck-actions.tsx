import {
  ArrowLeftRight,
  Download,
  Edit3,
  MoreVertical,
  Share2,
  Scissors,
  ShoppingCart,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react"
import { type ReactNode } from "react"

import { CardTileOverlayButton } from "../../components/card-tile"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"

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
  analyzeLabel = "Analyze deck",
  analyzePending = false,
  label,
  onAnalyze,
  onCompare,
  onDelete,
  onDisassemble,
  onEdhrec,
  onEdit,
  onExport,
  onImport,
  onMissing,
  onOptimizePrintings,
  onShare,
}: {
  analyzeLabel?: string
  analyzePending?: boolean
  label: string
  onAnalyze?: () => void
  onCompare?: () => void
  onDelete?: () => void
  onDisassemble?: () => void
  onEdhrec?: () => void
  onEdit: () => void
  onExport?: () => void
  onImport?: () => void
  onMissing?: () => void
  onOptimizePrintings?: () => void
  onShare?: () => void
}) {
  return (
    <div
      className="absolute right-3 top-3 z-[80]"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <CardTileOverlayButton aria-label={label}>
            <MoreVertical />
          </CardTileOverlayButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent sideOffset={2} className="w-48 shadow-md">
          {onAnalyze ? (
            <DropdownMenuItem disabled={analyzePending} onSelect={onAnalyze}>
              <Sparkles className="h-4 w-4" />
              {analyzeLabel}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={onEdit}>
            <Edit3 className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
          {onShare ? (
            <DropdownMenuItem onSelect={onShare}>
              <Share2 className="h-4 w-4" />
              Share deck
            </DropdownMenuItem>
          ) : null}
          {onImport ? (
            <DropdownMenuItem onSelect={onImport}>
              <Upload className="h-4 w-4" />
              Import decklist
            </DropdownMenuItem>
          ) : null}
          {onMissing ? (
            <DropdownMenuItem onSelect={onMissing}>
              <ShoppingCart className="h-4 w-4" />
              Missing cards
            </DropdownMenuItem>
          ) : null}
          {onOptimizePrintings ? (
            <DropdownMenuItem onSelect={onOptimizePrintings}>
              <Sparkles className="h-4 w-4" />
              Optimize printings
            </DropdownMenuItem>
          ) : null}
          {onEdhrec ? (
            <DropdownMenuItem onSelect={onEdhrec}>
              <Sparkles className="h-4 w-4" />
              EDHREC
            </DropdownMenuItem>
          ) : null}
          {onExport ? (
            <DropdownMenuItem onSelect={onExport}>
              <Download className="h-4 w-4" />
              Export decklist
            </DropdownMenuItem>
          ) : null}
          {onCompare ? (
            <DropdownMenuItem onSelect={onCompare}>
              <ArrowLeftRight className="h-4 w-4" />
              Compare decklist
            </DropdownMenuItem>
          ) : null}
          {onDisassemble ? (
            <DropdownMenuItem destructive onSelect={onDisassemble}>
              <Scissors className="h-4 w-4" />
              Disassemble deck
            </DropdownMenuItem>
          ) : null}
          {onDelete ? (
            <DropdownMenuItem destructive onSelect={onDelete}>
              <Trash2 className="h-4 w-4" />
              Delete deck
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
