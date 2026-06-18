import type { InputHTMLAttributes } from "react"
import { cn } from "../../lib/utils"

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-base-300 bg-base-100 px-3 text-sm outline-none transition-colors placeholder:text-base-content/50 focus:border-primary focus:ring-2 focus:ring-primary/20",
        className
      )}
      {...props}
    />
  )
}
