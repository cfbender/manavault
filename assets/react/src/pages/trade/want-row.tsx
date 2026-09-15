import { Trash2 } from "lucide-react"
import { Button } from "../../components/ui/button"
import type { TradeWant } from "./types"

export function WantRow({
  isRemoving = false,
  isUpdating = false,
  onChangeQuantity,
  onRemove,
  want,
}: {
  isRemoving?: boolean
  isUpdating?: boolean
  onChangeQuantity: (quantity: number) => void
  onRemove: () => void
  want: TradeWant
}) {
  const cardName = want.card?.name || "Unknown card"
  const printing = printingLabel(want)

  return (
    <div className="flex items-center gap-4 rounded-box border border-base-300 bg-base-100 p-3 shadow-sm">
      <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-base-200">
        {want.imageUrl ? (
          <img
            src={want.imageUrl}
            alt={cardName}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-center text-[0.6rem] text-base-content/50">
            No image
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold leading-tight">{cardName}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {want.card?.typeLine ? (
            <p className="truncate text-sm text-base-content/60">{want.card.typeLine}</p>
          ) : null}
          {printing ? (
            <span className="badge badge-sm badge-outline shrink-0 text-base-content/70">
              {printing}
            </span>
          ) : (
            <span className="shrink-0 text-[0.65rem] font-bold uppercase tracking-wide text-base-content/40">
              Any printing
            </span>
          )}
        </div>
      </div>

      <div className="join shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="join-item px-3"
          disabled={isUpdating || want.quantity <= 1}
          aria-label={`Decrease quantity of ${cardName}`}
          onClick={() => onChangeQuantity(want.quantity - 1)}
        >
          −
        </Button>
        <span className="join-item flex min-w-10 items-center justify-center border border-base-300 bg-base-100 px-2 text-sm font-bold tabular-nums">
          {want.quantity}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="join-item px-3"
          disabled={isUpdating}
          aria-label={`Increase quantity of ${cardName}`}
          onClick={() => onChangeQuantity(want.quantity + 1)}
        >
          +
        </Button>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0 text-error hover:bg-error/10"
        disabled={isRemoving}
        aria-label={`Remove ${cardName} from wants`}
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

function printingLabel(want: TradeWant) {
  const setCode = want.printing?.setCode?.toUpperCase()
  const collectorNumber = want.printing?.collectorNumber
  if (!setCode) return null
  return collectorNumber ? `${setCode} #${collectorNumber}` : setCode
}
