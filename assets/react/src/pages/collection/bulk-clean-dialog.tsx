import { useMutation, useQuery } from "@apollo/client/react"
import { Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "../../components/ui/button"
import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { Switch } from "../../components/ui/switch"
import { useToast } from "../../components/ui/toast"
import { useLocalStorageState } from "../../lib/use-local-storage"
import { cn, pluralize } from "../../lib/utils"
import { CardNamePreview, FinishBadge } from "./auto-sort-summary-dialog"
import { CollectionBulkCleanDocument, RemoveBulkCleanPullsDocument } from "./bulk-clean/documents"
import {
  DEFAULT_ORDER,
  deserializeOrder,
  groupPulls,
  type BulkCleanPull,
} from "./bulk-clean/grouping"
import { OrderSettings } from "./bulk-clean/order-settings"
import { formatCents } from "./sell-cards-list"
import {
  COLLECTION_BULK_CLEAN_KEPT_STORAGE_KEY,
  COLLECTION_BULK_CLEAN_ORDER_STORAGE_KEY,
  COLLECTION_BULK_CLEAN_PULLED_STORAGE_KEY,
  COLLECTION_BULK_CLEAN_SETTINGS_STORAGE_KEY,
} from "./storage-keys"

const SETTINGS_DEBOUNCE_MS = 300
const DEFAULT_INPUTS = { maxPrice: "0.20", minCopies: "10", keepCopies: "4", preferKeepFoils: true }

type BulkCleanSettings = {
  maxPriceCents: number
  minCopies: number
  keepCopies: number
  preferKeepFoils: boolean
  kept: { collectionItemId: string; quantity: number }[]
}
export function BulkCleanDialog({
  onDone,
  onOpenChange,
  open,
}: {
  onDone: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const { showToast } = useToast()
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [removePulls, removeStatus] = useMutation(RemoveBulkCleanPullsDocument)
  const [inputs, setInputs] = useLocalStorageState(
    COLLECTION_BULK_CLEAN_SETTINGS_STORAGE_KEY,
    DEFAULT_INPUTS,
  )
  const { maxPrice, minCopies, keepCopies, preferKeepFoils } = { ...DEFAULT_INPUTS, ...inputs }
  const setInput =
    <Field extends keyof typeof DEFAULT_INPUTS>(field: Field) =>
    (value: (typeof DEFAULT_INPUTS)[Field]) =>
      setInputs((current) => ({ ...DEFAULT_INPUTS, ...current, [field]: value }))
  // Collection item id -> copies of that stack to keep; the server pulls the
  // card's other stacks instead.
  const [kept, setKept] = useLocalStorageState<Record<string, number>>(
    COLLECTION_BULK_CLEAN_KEPT_STORAGE_KEY,
    {},
  )
  const keptEntries = Object.entries(kept).map(([collectionItemId, quantity]) => ({
    collectionItemId,
    quantity,
  }))
  const keptCount = keptEntries.reduce((total, entry) => total + entry.quantity, 0)
  const parsedSettings = parseSettings(maxPrice, minCopies, keepCopies, preferKeepFoils)
  const settings = parsedSettings ? { ...parsedSettings, kept: keptEntries } : null
  const [variables, setVariables] = useState<BulkCleanSettings>(
    settings ?? {
      maxPriceCents: 20,
      minCopies: 10,
      keepCopies: 4,
      preferKeepFoils: true,
      kept: keptEntries,
    },
  )
  const settingsKey = settings ? JSON.stringify(settings) : null

  useEffect(() => {
    if (!settingsKey) return
    const timeout = window.setTimeout(
      () => setVariables(JSON.parse(settingsKey) as BulkCleanSettings),
      SETTINGS_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [settingsKey])

  const { data, error, loading, previousData, refetch } = useQuery(CollectionBulkCleanDocument, {
    variables,
    skip: !open,
    fetchPolicy: "network-only",
  })
  const [order, setOrder] = useLocalStorageState(
    COLLECTION_BULK_CLEAN_ORDER_STORAGE_KEY,
    DEFAULT_ORDER,
    { deserialize: deserializeOrder },
  )
  const result = (data ?? previousData)?.collectionBulkClean
  const groups = result ? groupPulls(result.cards, order) : []
  // Collection item id -> quantity checked off. A check only counts while the
  // suggested quantity is unchanged, so a different plan starts unchecked.
  const [pulled, setPulled] = useLocalStorageState<Record<string, number>>(
    COLLECTION_BULK_CLEAN_PULLED_STORAGE_KEY,
    {},
  )
  const isPulled = (pull: BulkCleanPull) => pulled[pull.collectionItemId] === pull.quantity
  const pulledPulls = (result?.cards ?? []).flatMap((card) => card.pulls).filter(isPulled)
  const pulledCount = pulledCopies(pulledPulls)

  async function removePulled() {
    setRemoveError(null)
    try {
      const response = await removePulls({
        variables: {
          pulls: pulledPulls.map(({ collectionItemId, quantity }) => ({
            collectionItemId,
            quantity,
          })),
        },
      })
      const removedCount = response.data?.removeBulkCleanPulls?.removedCount ?? 0
      const removedIds = new Set(pulledPulls.map((pull) => pull.collectionItemId))
      setPulled((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => !removedIds.has(id))),
      )
      showToast(`${pluralize(removedCount, "card")} removed from your collection`)
      await refetch()
      onDone()
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : "Could not remove pulled cards")
    }
  }

  function keepOne(pull: BulkCleanPull) {
    setKept((current) => ({
      ...current,
      [pull.collectionItemId]: (current[pull.collectionItemId] ?? 0) + 1,
    }))
  }

  function setPulledFor(pulls: readonly BulkCleanPull[], checked: boolean) {
    setPulled((current) => {
      const next = { ...current }
      for (const pull of pulls) {
        if (checked) next[pull.collectionItemId] = pull.quantity
        else delete next[pull.collectionItemId]
      }
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" labelledBy="bulk-clean-title">
        <DialogHeader>
          <div>
            <DialogTitle id="bulk-clean-title">Bulk clean</DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">
              Pull surplus copies of cheap cards you own in bulk. Deck-allocated and list cards are
              left alone.
            </p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="sr-only">Bulk clean thresholds</legend>
            <SettingField
              id="bulk-clean-max-price"
              label="Worth under"
              prefix="$"
              hint="Per copy, current market price"
              min={0}
              step={0.01}
              value={maxPrice}
              onChange={setInput("maxPrice")}
            />
            <SettingField
              id="bulk-clean-min-copies"
              label="Own at least"
              suffix="copies"
              hint="Loose copies across printings"
              min={1}
              step={1}
              value={minCopies}
              onChange={setInput("minCopies")}
            />
            <SettingField
              id="bulk-clean-keep-copies"
              label="Keep"
              suffix="copies"
              hint="Left in your collection"
              min={0}
              step={1}
              value={keepCopies}
              onChange={setInput("keepCopies")}
            />
          </fieldset>

          <label className="flex cursor-pointer items-center gap-3">
            <Switch
              checked={preferKeepFoils}
              aria-describedby="bulk-clean-prefer-foils-hint"
              onCheckedChange={setInput("preferKeepFoils")}
            />
            <span>
              <span className="block text-sm font-bold">Prefer to keep foils</span>
              <span
                id="bulk-clean-prefer-foils-hint"
                className="block text-xs text-base-content/60"
              >
                Pull nonfoil copies first
              </span>
            </span>
          </label>

          <OrderSettings order={order} onChange={setOrder} />

          {!settings ? (
            <p role="alert" className="text-sm text-error">
              Enter a price of $0 or more, at least 1 copy, and 0 or more to keep.
            </p>
          ) : null}

          <dl className="grid gap-3 sm:grid-cols-3" aria-busy={loading}>
            <CountCard label="Cards" value={result ? String(result.cardCount) : "–"} />
            <CountCard label="Copies to pull" value={result ? String(result.pullQuantity) : "–"} />
            <CountCard
              label="Pull value"
              value={result ? formatCents(result.pullValueCents) : "–"}
            />
          </dl>

          {result?.pullQuantity ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-base-content/70" aria-live="polite">
                <span className="font-bold text-base-content">
                  {pulledCount} of {result.pullQuantity}
                </span>{" "}
                copies pulled · saved in this browser
              </p>
              <div className="flex flex-wrap gap-2">
                {keptCount ? (
                  <Button type="button" variant="ghost" onClick={() => setKept({})}>
                    Reset kept ({keptCount})
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!Object.keys(pulled).length}
                  onClick={() => setPulled({})}
                >
                  Clear checks
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!pulledCount || removeStatus.loading}
                  onClick={() => setConfirmRemoveOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  {removeStatus.loading ? "Removing..." : "Remove pulled"}
                </Button>
              </div>
            </div>
          ) : null}

          {removeError ? (
            <p
              role="alert"
              className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
            >
              {removeError}
            </p>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error"
            >
              {error.message}
            </p>
          ) : !result ? (
            <p className="text-sm text-base-content/70">Finding bulk to pull...</p>
          ) : groups.length ? (
            <div className="space-y-4">
              {groups.map((group, index) => {
                const headingId = `bulk-clean-location-${index}`

                return (
                  <details
                    key={group.key}
                    open
                    className="rounded-box border border-base-300 bg-base-100/70"
                    aria-labelledby={headingId}
                  >
                    <summary className="cursor-pointer px-4 py-3 marker:text-base-content/60">
                      <div className="inline-flex w-[calc(100%-1.5rem)] flex-wrap items-start justify-between gap-3 align-top">
                        <div>
                          <h3 id={headingId} className="font-black tracking-normal">
                            {group.locationName}
                          </h3>
                          <p className="text-xs text-base-content/60">
                            {pluralize(group.cardCount, "card")}
                          </p>
                        </div>
                        <span className="badge badge-outline shrink-0">
                          {progressLabel(
                            group.sections.flatMap((section) =>
                              section.cards.flatMap((card) => card.pulls),
                            ),
                            isPulled,
                          )}
                        </span>
                      </div>
                    </summary>
                    <div className="divide-y divide-base-300 border-t border-base-300">
                      {group.sections.map((section) => (
                        <section key={section.key} aria-label={section.label ?? undefined}>
                          {section.label ? (
                            <h4 className="bg-base-200/60 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-base-content/70">
                              {section.label}
                            </h4>
                          ) : null}
                          <ul className="divide-y divide-base-300">
                            {section.cards.map((card) => {
                              const allPulled = card.pulls.every(isPulled)

                              return (
                                <li key={card.cardId}>
                                  <details open>
                                    <summary className="cursor-pointer px-4 py-3 marker:text-base-content/60">
                                      <div className="inline-flex w-[calc(100%-1.5rem)] flex-wrap items-center justify-between gap-2 align-top">
                                        <div>
                                          <CardNamePreview move={card.pulls[0]} />
                                          <p className="text-xs text-base-content/60">
                                            {pluralize(
                                              card.totalCopies,
                                              "loose copy",
                                              "loose copies",
                                            )}{" "}
                                            owned · pulling {card.pullQuantity} across your
                                            collection
                                          </p>
                                        </div>
                                        <span className="flex items-center gap-2">
                                          <span className="text-sm font-bold">
                                            {progressLabel(card.pulls, isPulled)}
                                          </span>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            aria-label={`${allPulled ? "Unmark" : "Pull"} all ${card.cardName} from ${group.locationName}`}
                                            onClick={(event) => {
                                              // Keep the click from toggling the surrounding <details>.
                                              event.preventDefault()
                                              setPulledFor(card.pulls, !allPulled)
                                            }}
                                          >
                                            {allPulled ? "Unmark all" : "Pull all"}
                                          </Button>
                                        </span>
                                      </div>
                                    </summary>
                                    <ul className="mx-4 mb-3 space-y-1 border-l-2 border-base-300 pl-3">
                                      {card.pulls.map((pull) => {
                                        const checked = isPulled(pull)
                                        const printing = `${pull.setCode.toUpperCase()} #${pull.collectorNumber}`
                                        // Copies of this stack already left in place absorb a keep
                                        // without changing anything; only other stacks can swap in.
                                        const unpulledHere =
                                          pull.ownedQuantity -
                                          (kept[pull.collectionItemId] ?? 0) -
                                          pull.quantity
                                        const canKeep = card.swappableCopies - unpulledHere > 0

                                        return (
                                          <li
                                            key={pull.collectionItemId}
                                            className="flex flex-wrap items-center justify-between gap-2 text-sm text-base-content/70"
                                          >
                                            <label
                                              className={cn(
                                                "flex min-h-11 cursor-pointer items-center gap-3 transition-opacity",
                                                checked && "opacity-60",
                                              )}
                                            >
                                              <input
                                                type="checkbox"
                                                className="checkbox checkbox-sm checkbox-primary"
                                                checked={checked}
                                                aria-label={`Pulled ${pull.quantity} ${card.cardName} ${printing} from ${group.locationName}`}
                                                onChange={(event) =>
                                                  setPulledFor([pull], event.target.checked)
                                                }
                                              />
                                              <span className={cn(checked && "line-through")}>
                                                <span className="font-mono text-xs">
                                                  {printing}
                                                </span>
                                                {" · "}
                                                {formatCents(pull.priceCents)} each
                                                {kept[pull.collectionItemId] ? (
                                                  <span className="text-base-content/60">
                                                    {" · "}keeping {kept[pull.collectionItemId]}
                                                  </span>
                                                ) : null}
                                              </span>
                                            </label>
                                            <span className="flex flex-wrap items-center gap-2">
                                              <span
                                                className={cn(
                                                  "font-bold text-base-content",
                                                  checked && "opacity-60",
                                                )}
                                              >
                                                Pull {pull.quantity}
                                                {pull.quantity < pull.ownedQuantity
                                                  ? ` of ${pull.ownedQuantity}`
                                                  : ""}
                                              </span>
                                              <FinishBadge finish={pull.finish} />
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                disabled={!canKeep}
                                                title={
                                                  canKeep
                                                    ? "Keep one copy of this printing and pull one from another stack"
                                                    : "No other stack of this card has copies left to pull instead"
                                                }
                                                aria-label={`Keep one ${card.cardName} ${printing} from ${group.locationName}`}
                                                onClick={() => keepOne(pull)}
                                              >
                                                Keep 1
                                              </Button>
                                            </span>
                                          </li>
                                        )
                                      })}
                                    </ul>
                                  </details>
                                </li>
                              )
                            })}
                          </ul>
                        </section>
                      ))}
                    </div>
                  </details>
                )
              })}
            </div>
          ) : (
            <div className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-4">
              <p className="text-sm font-bold text-base-content/80">Nothing to pull.</p>
              <p className="mt-1 text-sm text-base-content/70">
                No card under that price has enough loose copies. Raise the price or lower the copy
                count.
              </p>
            </div>
          )}

          <div className="flex justify-end border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
      <ConfirmDialog
        destructive
        open={confirmRemoveOpen}
        title={`Remove ${pluralize(pulledCount, "pulled card")}?`}
        confirmLabel="Remove from collection"
        onConfirm={() => void removePulled()}
        onOpenChange={setConfirmRemoveOpen}
      >
        Checked copies are deleted from your collection. Stacks you pulled completely are removed;
        partly pulled stacks keep their remaining copies.
      </ConfirmDialog>
    </Dialog>
  )
}

function SettingField({
  hint,
  id,
  label,
  min,
  onChange,
  prefix,
  step,
  suffix,
  value,
}: {
  hint: string
  id: string
  label: string
  min: number
  onChange: (value: string) => void
  prefix?: string
  step: number
  suffix?: string
  value: string
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <div className="flex items-center gap-2">
        {prefix ? <span className="text-base-content/70">{prefix}</span> : null}
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={value}
          aria-describedby={`${id}-hint`}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <span className="text-sm text-base-content/70">{suffix}</span> : null}
      </div>
      <p id={`${id}-hint`} className="text-xs text-base-content/60">
        {hint}
      </p>
    </div>
  )
}

function CountCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-box border border-base-300 bg-base-200/50 p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-base-content/60">{label}</dt>
      <dd className="mt-1 text-2xl font-black tracking-tight">{value}</dd>
    </div>
  )
}

function parseSettings(
  maxPrice: string,
  minCopies: string,
  keepCopies: string,
  preferKeepFoils: boolean,
): Omit<BulkCleanSettings, "kept"> | null {
  const maxPriceCents = Math.round(Number(maxPrice) * 100)
  const min = Number(minCopies)
  const keep = Number(keepCopies)
  if (maxPrice.trim() === "" || !Number.isFinite(maxPriceCents) || maxPriceCents < 0) return null
  if (minCopies.trim() === "" || !Number.isInteger(min) || min < 1) return null
  if (keepCopies.trim() === "" || !Number.isInteger(keep) || keep < 0) return null
  return { maxPriceCents, minCopies: min, keepCopies: keep, preferKeepFoils }
}

function progressLabel(
  pulls: readonly BulkCleanPull[],
  isPulled: (pull: BulkCleanPull) => boolean,
) {
  const total = pulledCopies(pulls)
  const done = pulledCopies(pulls.filter(isPulled))
  if (done === total) return `Pulled ${total}`
  return done ? `Pulled ${done} of ${total}` : `Pull ${total}`
}

function pulledCopies(pulls: readonly BulkCleanPull[]) {
  return pulls.reduce((total, pull) => total + pull.quantity, 0)
}
