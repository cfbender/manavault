import { ChevronDown, ChevronUp } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "../../../components/ui/button"
import {
  COLOR_LABELS,
  LEVEL_LABELS,
  TYPE_LABELS,
  type BulkCleanOrder,
  type OrderLevel,
} from "./grouping"

function move<T>(values: readonly T[], index: number, offset: -1 | 1) {
  const next = [...values]
  const [value] = next.splice(index, 1)
  next.splice(index + offset, 0, value)
  return next
}

function orderSummary(order: BulkCleanOrder) {
  const levels = order.levels
    .filter((level) => level.enabled)
    .map((level) => LEVEL_LABELS[level.key].toLowerCase())
  return [...levels, "name"].join(", then ").replace(/^./, (first) => first.toUpperCase())
}

export function OrderSettings({
  onChange,
  order,
}: {
  onChange: (order: BulkCleanOrder) => void
  order: BulkCleanOrder
}) {
  const enabled = (key: OrderLevel) =>
    order.levels.some((level) => level.key === key && level.enabled)

  return (
    <details className="rounded-box border border-base-300 bg-base-100/70">
      <summary className="cursor-pointer px-4 py-3 marker:text-base-content/60">
        <span className="text-sm font-bold">Order within each location</span>
        <span className="ml-2 text-xs text-base-content/60">{orderSummary(order)}</span>
      </summary>
      <div className="grid gap-4 border-t border-base-300 p-4 sm:grid-cols-3">
        <ReorderList
          legend="Group by"
          hint="Match how your boxes are sorted. Cards are alphabetical within each group."
          items={order.levels.map((level) => level.key)}
          labelFor={(key) => LEVEL_LABELS[key]}
          onReorder={(keys) =>
            onChange({
              ...order,
              levels: keys.map((key) => ({ key, enabled: enabled(key) })),
            })
          }
          renderLabel={(key) => (
            <label className="flex flex-1 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="checkbox checkbox-sm checkbox-primary"
                checked={enabled(key)}
                onChange={(event) =>
                  onChange({
                    ...order,
                    levels: order.levels.map((level) =>
                      level.key === key ? { key, enabled: event.target.checked } : level,
                    ),
                  })
                }
              />
              {LEVEL_LABELS[key]}
            </label>
          )}
        />
        {enabled("color") ? (
          <ReorderList
            legend="Color order"
            hint="Cards with two or more colors are multicolor."
            items={order.colors}
            labelFor={(color) => COLOR_LABELS[color]}
            onReorder={(colors) => onChange({ ...order, colors })}
          />
        ) : null}
        {enabled("type") ? (
          <ReorderList
            legend="Type order"
            hint="Each card goes under the first type it matches. Anything else goes last."
            items={order.types}
            labelFor={(type) => TYPE_LABELS[type]}
            onReorder={(types) => onChange({ ...order, types })}
          />
        ) : null}
      </div>
    </details>
  )
}

function ReorderList<T extends string>({
  hint,
  items,
  labelFor,
  legend,
  onReorder,
  renderLabel,
}: {
  hint: string
  items: readonly T[]
  labelFor: (item: T) => string
  legend: string
  onReorder: (items: T[]) => void
  renderLabel?: (item: T) => ReactNode
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-bold">{legend}</legend>
      <p className="text-xs text-base-content/60">{hint}</p>
      <ol className="divide-y divide-base-300 rounded-box border border-base-300">
        {items.map((item, index) => (
          <li key={item} className="flex items-center gap-1 py-0.5 pl-3 pr-1 text-sm">
            {renderLabel ? renderLabel(item) : <span className="flex-1">{labelFor(item)}</span>}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="btn-square"
              aria-label={`Move ${labelFor(item)} up`}
              disabled={index === 0}
              onClick={() => onReorder(move(items, index, -1))}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="btn-square"
              aria-label={`Move ${labelFor(item)} down`}
              disabled={index === items.length - 1}
              onClick={() => onReorder(move(items, index, 1))}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ol>
    </fieldset>
  )
}
