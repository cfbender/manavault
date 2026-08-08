import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { cn } from "../../lib/utils"

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

export function DropdownMenuContent({
  align = "end",
  className,
  sideOffset = 4,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-48 rounded-box border border-base-300 bg-base-100 p-2 text-sm shadow-xl outline-none",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export function DropdownMenuItem({
  children,
  className,
  destructive = false,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
  destructive?: boolean
  children: ReactNode
}) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-field px-3 py-2 font-medium outline-none transition-colors focus:bg-base-200 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        destructive && "text-error focus:bg-error/10",
        className,
      )}
      {...props}
    >
      {children}
    </DropdownMenuPrimitive.Item>
  )
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn("px-3 py-2 text-xs font-black text-base-content/60", className)}
      {...props}
    />
  )
}

export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

export function DropdownMenuRadioItem({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      className={cn(
        "flex cursor-pointer select-none items-center gap-3 rounded-field px-3 py-2 font-medium outline-none transition-colors focus:bg-base-200 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[state=checked]:bg-primary/15 data-[state=checked]:text-primary",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="h-4 w-4 shrink-0 rounded-full border-2 border-base-content/25 [[data-state=checked]>&]:border-4 [[data-state=checked]>&]:border-primary"
      />
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn("my-1 h-px bg-base-300", className)}
      {...props}
    />
  )
}
