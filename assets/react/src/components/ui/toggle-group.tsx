import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
import type { ComponentPropsWithoutRef } from "react"
import { cn } from "../../lib/utils"

/** Single-select segmented control. Radix supplies roving focus, arrow-key
 * navigation, and pressed-state semantics; visual style stays at call sites.
 * Radix allows deselecting the pressed item, so callers that need an
 * always-selected segment must ignore empty values in onValueChange. */
export function ToggleGroup({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>) {
  return <ToggleGroupPrimitive.Root className={cn(className)} {...props} />
}

export function ToggleGroupItem({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>) {
  return <ToggleGroupPrimitive.Item className={cn(className)} {...props} />
}
