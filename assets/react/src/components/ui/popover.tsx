import * as PopoverPrimitive from "@radix-ui/react-popover"
import type { ComponentPropsWithoutRef } from "react"
import { cn } from "../../lib/utils"
import { overlayLayers } from "./overlay-layers"

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverClose = PopoverPrimitive.Close

export function PopoverContent({
  align = "center",
  className,
  collisionPadding = 12,
  sideOffset = 8,
  style,
  ...props
}: ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "rounded-box border border-base-300 bg-base-100 p-4 shadow-2xl outline-none",
          className,
        )}
        style={{ ...style, zIndex: overlayLayers.floating }}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}
