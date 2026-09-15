import * as TabsPrimitive from "@radix-ui/react-tabs"
import type { ComponentPropsWithoutRef } from "react"
import { cn } from "../../lib/utils"

export const Tabs = TabsPrimitive.Root

export function TabsList({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("mb-7 flex flex-wrap gap-2 border-b border-base-300", className)}
      {...props}
    />
  )
}

export function TabsTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative flex items-center gap-2 px-4 pb-3 pt-1 text-sm font-bold text-base-content/60 transition-colors after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-full hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary data-[state=active]:text-primary data-[state=active]:after:bg-primary",
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn(
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
        className,
      )}
      {...props}
    />
  )
}
