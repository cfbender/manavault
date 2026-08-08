import { useQuery } from "@apollo/client/react"
import { Layers, Palette } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import {
  SELECT_NONE_VALUE,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select"
import type { DeckCardUpdateInput } from "../../gql/graphql"
import { cn, present, titleize } from "../../lib/utils"
import { ZoneIcon } from "./deck-card-display"
import type { DeckCardEntry, DeckCardPrinting, DeckCardTag, DeckZone } from "./deck-types"
import { connectionNodes, deckZoneDisplayLabel } from "./deck-types"
import { CardPrintingsDocument } from "./queries"
import {
  ADD_CARD_ZONES,
  DECK_CARD_FINISHES,
  DECK_CARD_TAGS,
  MOVE_TARGET_ZONES,
  NON_COMMANDER_ADD_CARD_ZONES,
} from "./deck-types"
import { ZoneToggle } from "./zone-toggle"

export function MoveDeckCardDialog({
  deckCard,
  error,
  isPending,
  onClose,
  onMove,
  zoneCounts,
}: {
  deckCard: DeckCardEntry | null
  error: string | null
  isPending: boolean
  onClose: () => void
  onMove: (zone: DeckZone) => void
  zoneCounts: Record<DeckZone, number>
}) {
  const zoneOptions = deckCard ? MOVE_TARGET_ZONES.filter((zone) => zone !== deckCard.zone) : []
  const [selectedZone, setSelectedZone] = useState<DeckZone>("considering")
  const activeZone = zoneOptions.includes(selectedZone) ? selectedZone : zoneOptions[0]

  return (
    <Dialog open={Boolean(deckCard)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg" labelledBy="move-deck-card-title">
        <DialogHeader>
          <div>
            <DialogTitle id="move-deck-card-title">Move to...</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deckCard?.card?.name}</p>
          </div>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="space-y-4 p-5">
          {activeZone ? (
            <fieldset className="space-y-1.5">
              <legend className="label-text mb-1 text-sm font-semibold">Zone</legend>
              <ZoneToggle
                zones={zoneOptions}
                value={activeZone}
                onChange={setSelectedZone}
                disabled={isPending}
              />
              <p className="mt-2 flex items-center gap-2 text-sm text-base-content/60">
                <ZoneIcon zone={activeZone} />
                {zoneCounts[activeZone] || 0} cards in {deckZoneDisplayLabel(activeZone)}
              </p>
            </fieldset>
          ) : null}

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" disabled={isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isPending || !activeZone}
              onClick={() => activeZone && onMove(activeZone)}
            >
              Move
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function EditDeckCardDialog({
  deckCard,
  deckFormat,
  error,
  isPending,
  onClose,
  onSave,
}: {
  deckCard: DeckCardEntry | null
  deckFormat: string
  error: string | null
  isPending: boolean
  onClose: () => void
  onSave: (input: DeckCardUpdateInput) => void
}) {
  const [quantity, setQuantity] = useState(1)
  const [quantityInput, setQuantityInput] = useState("1")
  const [zone, setZone] = useState<DeckZone>("mainboard")
  const [finish, setFinish] = useState("nonfoil")
  const [preferredPrintingId, setPreferredPrintingId] = useState("")
  const [tag, setTag] = useState<DeckCardTag | "">("")
  const zoneOptions = deckFormat === "commander" ? ADD_CARD_ZONES : NON_COMMANDER_ADD_CARD_ZONES
  const cardId = deckCard?.card?.id || null
  const { data: printingsData, loading: printingsLoading } = useQuery(CardPrintingsDocument, {
    variables: { id: cardId || "" },
    skip: !cardId,
  })
  const printings = connectionNodes(printingsData?.card?.printings).filter(present)
  const selectedPrinting = preferredPrintingId
    ? printings.find((printing) => printing.id === preferredPrintingId) ||
      deckCard?.preferredPrinting
    : null
  const finishOptions = preferredPrintingId
    ? printingFinishOptions(selectedPrinting?.finishes)
    : DECK_CARD_FINISHES

  useEffect(() => {
    if (!deckCard) {
      setQuantity(1)
      setQuantityInput("1")
      setZone("mainboard")
      setFinish("nonfoil")
      setPreferredPrintingId("")
      setTag("")
      return
    }

    setQuantity(deckCard.quantity)
    setQuantityInput(String(deckCard.quantity))
    setZone(deckCard.zone as DeckZone)
    setFinish(deckCard.finish || "nonfoil")
    setPreferredPrintingId(deckCard.preferredPrinting?.id || "")
    setTag((deckCard.tag as DeckCardTag | null) || "")
  }, [deckCard])

  useEffect(() => {
    if (!zoneOptions.includes(zone)) setZone("mainboard")
  }, [zone, zoneOptions])

  useEffect(() => {
    if (!finishOptions.includes(finish)) setFinish(finishOptions[0] || "nonfoil")
  }, [finish, finishOptions])

  function setClampedQuantity(nextQuantity: number) {
    const clampedQuantity = Math.max(
      1,
      Number.isFinite(nextQuantity) ? Math.floor(nextQuantity) : 1,
    )
    setQuantity(clampedQuantity)
    setQuantityInput(String(clampedQuantity))
  }

  function updateQuantityInput(nextQuantityInput: string) {
    setQuantityInput(nextQuantityInput)
    const parsedQuantity = Number.parseInt(nextQuantityInput, 10)
    if (Number.isFinite(parsedQuantity) && parsedQuantity >= 1) setQuantity(parsedQuantity)
  }

  function commitQuantityInput() {
    setClampedQuantity(Number.parseInt(quantityInput, 10))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsedQuantity = Number.parseInt(quantityInput, 10)
    const submittedQuantity = Math.max(
      1,
      Number.isFinite(parsedQuantity) ? parsedQuantity : quantity,
    )
    onSave({
      quantity: submittedQuantity,
      zone,
      finish,
      preferredPrintingId: preferredPrintingId || null,
      tag: tag || null,
    })
  }

  return (
    <Dialog open={Boolean(deckCard)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-xl" labelledBy="edit-deck-card-title">
        <DialogHeader>
          <div>
            <DialogTitle id="edit-deck-card-title">Edit card</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{deckCard?.card?.name}</p>
          </div>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <form className="space-y-4 p-5" onSubmit={submit}>
          <div className="space-y-2">
            <div className="text-sm font-semibold">Printing</div>
            <div className="max-h-80 max-w-full overflow-x-hidden overflow-y-auto rounded-box border border-base-300 p-2">
              <div className="grid gap-2">
                <button
                  type="button"
                  className={cn(
                    "flex w-full min-w-0 items-start gap-3 overflow-hidden rounded-box border p-3 text-left transition",
                    preferredPrintingId === ""
                      ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                      : "border-base-300 hover:border-primary/45 hover:bg-base-200",
                  )}
                  disabled={isPending}
                  onClick={() => setPreferredPrintingId("")}
                  aria-pressed={preferredPrintingId === ""}
                  autoFocus
                >
                  <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-base-200 text-base-content/50">
                    <Layers className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">Any printing</span>
                    <span className="block text-xs text-base-content/60 break-words">
                      Use any matching copy when allocating this card.
                    </span>
                  </span>
                </button>
                {printingsLoading ? (
                  <div className="flex items-center justify-center p-6 text-sm text-base-content/50">
                    Loading printings…
                  </div>
                ) : (
                  printings.map((printing) => (
                    <button
                      key={printing.id}
                      type="button"
                      className={cn(
                        "flex w-full min-w-0 items-start gap-3 overflow-hidden rounded-box border p-3 text-left transition",
                        preferredPrintingId === printing.id
                          ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                          : "border-base-300 hover:border-primary/45 hover:bg-base-200",
                      )}
                      disabled={isPending}
                      onClick={() => setPreferredPrintingId(printing.id)}
                      aria-pressed={preferredPrintingId === printing.id}
                    >
                      {printing.imageUrl ? (
                        <img
                          src={printing.imageUrl}
                          alt=""
                          className="h-16 w-12 shrink-0 rounded object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-base-200 text-base-content/50">
                          <Palette className="h-5 w-5" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {deckCardPrintingOptionLabel(printing)}
                        </span>
                        <span className="block truncate text-xs text-base-content/60">
                          {printingFinishOptions(printing.finishes).map(titleize).join(", ")}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Quantity</span>
              <div className="join w-full max-w-44">
                <Button
                  type="button"
                  variant="outline"
                  className="join-item px-3"
                  disabled={isPending || quantity <= 1}
                  aria-label="Decrease quantity"
                  onClick={() => setClampedQuantity(quantity - 1)}
                >
                  −
                </Button>
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={quantityInput}
                  disabled={isPending}
                  aria-label="Quantity"
                  className="join-item min-w-0 text-center"
                  onChange={(event) => updateQuantityInput(event.target.value)}
                  onBlur={commitQuantityInput}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="join-item px-3"
                  disabled={isPending}
                  aria-label="Increase quantity"
                  onClick={() => setClampedQuantity(quantity + 1)}
                >
                  +
                </Button>
              </div>
            </div>

            <fieldset className="form-control space-y-1.5">
              <legend className="label-text mb-1 text-sm font-semibold">Zone</legend>
              <ZoneToggle
                zones={zoneOptions}
                value={zone}
                onChange={setZone}
                disabled={isPending}
              />
            </fieldset>

            <label className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Finish</span>
              <Select value={finish} disabled={isPending} onValueChange={setFinish}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {finishOptions.map((finish) => (
                    <SelectItem key={finish} value={finish}>
                      {titleize(finish)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="form-control">
              <span className="label-text mb-1 text-sm font-semibold">Tag</span>
              <Select
                value={tag || SELECT_NONE_VALUE}
                disabled={isPending}
                onValueChange={(value) =>
                  setTag(value === SELECT_NONE_VALUE ? "" : (value as DeckCardTag))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SELECT_NONE_VALUE}>No tag</SelectItem>
                  {DECK_CARD_TAGS.map((tag) => (
                    <SelectItem key={tag.value} value={tag.value}>
                      {tag.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" disabled={isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !deckCard}>
              {isPending ? "Saving..." : "Save card"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function deckCardPrintingOptionLabel(printing: DeckCardPrinting) {
  return [
    printing?.setCode?.toUpperCase(),
    printing?.collectorNumber ? `#${printing.collectorNumber}` : null,
    printing?.setName,
    printing?.rarity ? titleize(printing.rarity) : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

export function printingFinishOptions(finishes?: Array<string | null> | null) {
  const options = (finishes || []).filter(
    (finish): finish is string => typeof finish === "string" && DECK_CARD_FINISHES.includes(finish),
  )

  return options.length ? options : DECK_CARD_FINISHES
}
