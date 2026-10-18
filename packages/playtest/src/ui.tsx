import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import { clsx, type ClassValue } from "clsx"
import type { ButtonHTMLAttributes, ComponentPropsWithoutRef, ReactNode } from "react"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Popovers and menus portal to the body. Hosts that stack the playtester in a high layer (a
// full-screen overlay, say) raise this with `--playtest-floating-z`.
const FLOATING_LAYER = { zIndex: "var(--playtest-floating-z, 1200)" } as const

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger

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
          "rounded-box border border-base-300 bg-base-100 p-4 text-base-content shadow-2xl outline-none",
          className,
        )}
        style={{ ...style, ...FLOATING_LAYER }}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

export function DropdownMenuContent({
  align = "end",
  className,
  sideOffset = 4,
  style,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "min-w-48 rounded-box border border-base-300 bg-base-100 p-2 text-sm text-base-content shadow-xl outline-none",
          className,
        )}
        style={{ ...style, ...FLOATING_LAYER }}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export function DropdownMenuItem({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { children: ReactNode }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-field px-3 py-2 font-medium outline-none transition-colors focus:bg-base-200 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
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

/** Radix Switch styled with daisyUI's `.toggle`, which keys its checked state off `aria-checked`. */
export function Switch({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root className={cn("toggle toggle-primary toggle-sm", className)} {...props} />
  )
}

const BUTTON_VARIANTS = {
  default: "btn-primary",
  ghost: "btn-ghost",
  outline: "btn-outline",
}

export function Button({
  className,
  size,
  variant = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "sm"
  variant?: keyof typeof BUTTON_VARIANTS
}) {
  return (
    <button
      className={cn(
        "btn inline-flex items-center justify-center gap-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50",
        BUTTON_VARIANTS[variant],
        size === "sm" && "btn-sm text-xs",
        className,
      )}
      {...props}
    />
  )
}
