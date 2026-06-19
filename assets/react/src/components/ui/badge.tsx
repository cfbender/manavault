import type { HTMLAttributes } from "react"
import { cn } from "../../lib/utils"

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "primary" | "success" | "warning" | "error"
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  const tones = {
    neutral: "badge-outline",
    primary: "badge-primary badge-outline",
    success: "badge-success badge-outline",
    warning: "badge-warning badge-outline",
    error: "badge-error badge-outline",
  }

  return <span className={cn("badge badge-sm font-medium", tones[tone], className)} {...props} />
}
