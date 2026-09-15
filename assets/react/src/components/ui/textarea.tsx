import type { TextareaHTMLAttributes } from "react"
import { cn } from "../../lib/utils"

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "textarea textarea-bordered w-full bg-base-100 outline-none transition-colors placeholder:text-base-content/50 focus:border-primary focus:ring-2 focus:ring-primary/20",
        className,
      )}
      {...props}
    />
  )
}
