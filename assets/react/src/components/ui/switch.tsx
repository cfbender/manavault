import * as SwitchPrimitive from "@radix-ui/react-switch"
import type { ComponentPropsWithoutRef } from "react"
import { cn } from "../../lib/utils"

/** Radix Switch styled with daisyUI's `.toggle`, whose checked styling keys
 * off `[aria-checked="true"]`, so it looks identical to a toggle checkbox
 * while exposing proper `role="switch"` semantics. The thumb is drawn by
 * daisyUI's `::before`, so no Thumb element is needed. */
export function Switch({
  className,
  size = "default",
  ...props
}: ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & {
  size?: "default" | "sm"
}) {
  return (
    <SwitchPrimitive.Root
      className={cn("toggle toggle-primary", size === "sm" && "toggle-sm", className)}
      {...props}
    />
  )
}
