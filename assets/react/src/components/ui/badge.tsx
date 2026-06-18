import type { HTMLAttributes } from "react"
import { cn } from "../../lib/utils"

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "primary" | "success" | "warning" | "error"
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  const tones = {
    neutral: "border-base-300 bg-base-200 text-base-content",
    primary: "border-primary/30 bg-primary/10 text-primary",
    success: "border-success/30 bg-success/10 text-success",
    warning: "border-warning/30 bg-warning/10 text-warning",
    error: "border-error/30 bg-error/10 text-error",
  }

  return <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...props} />
}
