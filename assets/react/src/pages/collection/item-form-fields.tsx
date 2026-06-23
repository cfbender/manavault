import { Input } from "../../components/ui/input"
import { cn, titleize } from "../../lib/utils"
import { COLLECTION_FINISHES } from "./constants"
import { collectionFinishValue } from "./form-helpers"

export type CollectionFinishOption = (typeof COLLECTION_FINISHES)[number]

export function collectionQuantityValue(value: number) {
  return Math.max(1, Number.isFinite(value) ? value : 1)
}

export function CollectionQuantityField({
  autoFocus = false,
  onChange,
  value,
}: {
  autoFocus?: boolean
  onChange: (value: number) => void
  value: number
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-black uppercase tracking-[0.18em] text-accent">
        Quantity
      </legend>
      <div className="join w-full">
        <button
          type="button"
          className="btn btn-sm join-item h-9 min-h-9 px-3"
          aria-label="Decrease quantity"
          disabled={value <= 1}
          onClick={() => onChange(collectionQuantityValue(value - 1))}
        >
          −
        </button>
        <Input
          className="join-item h-9 min-h-9 w-16 flex-1 px-2 text-center sm:w-20"
          type="number"
          min={1}
          inputMode="numeric"
          aria-label="Quantity"
          value={value}
          onChange={(event) => onChange(collectionQuantityValue(Number(event.target.value)))}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          className="btn btn-sm join-item h-9 min-h-9 px-3"
          aria-label="Increase quantity"
          onClick={() => onChange(collectionQuantityValue(value + 1))}
        >
          +
        </button>
      </div>
    </fieldset>
  )
}

export function CollectionFinishField({
  onChange,
  options,
  value,
}: {
  onChange: (value: CollectionFinishOption) => void
  options: ReadonlyArray<CollectionFinishOption>
  value: CollectionFinishOption
}) {
  const finishOptions = options.length ? options : COLLECTION_FINISHES

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-black uppercase tracking-[0.18em] text-accent">Finish</legend>
      {finishOptions.length <= 3 ? (
        <div className="flex gap-1 rounded-btn border border-base-300 bg-base-100 p-1">
          {finishOptions.map((option) => {
            const selected = option === value

            return (
              <button
                key={option}
                type="button"
                className={cn(
                  "min-h-8 flex-1 rounded-btn px-2 text-xs font-black uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  selected
                    ? collectionFinishToggleClass(option)
                    : "text-base-content/65 hover:bg-base-200 hover:text-base-content",
                )}
                aria-pressed={selected}
                onClick={() => onChange(option)}
              >
                {titleize(option)}
              </button>
            )
          })}
        </div>
      ) : (
        <select
          className="select select-bordered h-9 min-h-9 w-full bg-base-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          value={value}
          onChange={(event) => onChange(collectionFinishValue(event.target.value))}
        >
          {finishOptions.map((option) => (
            <option key={option} value={option}>
              {titleize(option)}
            </option>
          ))}
        </select>
      )}
    </fieldset>
  )
}

export function collectionFinishToggleClass(finish: CollectionFinishOption) {
  if (finish === "foil")
    return "bg-gradient-to-r from-amber-200 via-primary/25 to-sky-200 text-base-content shadow-inner"
  if (finish === "etched")
    return "bg-gradient-to-r from-fuchsia-200 via-secondary/25 to-stone-200 text-base-content shadow-inner"
  return "bg-base-content text-base-100 shadow-inner"
}
