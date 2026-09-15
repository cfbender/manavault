import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import type { ComponentPropsWithoutRef } from "react"
import { cn } from "../../lib/utils"

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value

/** Radix Select reserves the empty string for "clear selection", so options
 * that mean "none" (no tag, unfiled, no location) use this sentinel value.
 * Map at the call site: `value={x || SELECT_NONE_VALUE}` and
 * `onValueChange={(v) => set(v === SELECT_NONE_VALUE ? "" : v)}`. */
export const SELECT_NONE_VALUE = "__none__"

type SelectTriggerProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
  size?: "default" | "sm"
}

/** Styled with daisyUI's `.select`, which draws the chevron via CSS, so the
 * trigger needs no icon and matches native selects across themes. */
export function SelectTrigger({ className, size = "default", ...props }: SelectTriggerProps) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "select select-bordered w-full justify-between bg-base-100 text-left font-normal text-base-content outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:pointer-events-none disabled:opacity-60 data-[placeholder]:text-base-content/50",
        size === "sm" && "select-sm",
        className,
      )}
      {...props}
    />
  )
}

export function SelectContent({
  children,
  className,
  collisionPadding = 12,
  position = "popper",
  sideOffset = 4,
  ...props
}: ComponentPropsWithoutRef<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-[1200] max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-box border border-base-300 bg-base-100 text-sm shadow-xl",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex h-6 cursor-default items-center justify-center bg-base-100 text-base-content/60">
          <ChevronUp className="h-4 w-4" />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="max-h-[min(24rem,var(--radix-select-content-available-height))] overflow-y-auto overscroll-contain p-1">
          {children}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex h-6 cursor-default items-center justify-center bg-base-100 text-base-content/60">
          <ChevronDown className="h-4 w-4" />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-field py-2 pl-8 pr-3 font-medium outline-none focus:bg-base-200 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex items-center">
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}
