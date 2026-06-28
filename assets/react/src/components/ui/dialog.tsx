import { X } from "lucide-react"
import { useEffect, type HTMLAttributes, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { registerNativeBackModal } from "../../lib/native-modal-stack"
import { cn } from "../../lib/utils"
import { Button } from "./button"

type DialogProps = {
  children: ReactNode
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function Dialog({ children, onOpenChange, open }: DialogProps) {
  useEffect(() => {
    if (!open) return

    return registerNativeBackModal(() => onOpenChange(false))
  }, [onOpenChange, open])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false)
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onOpenChange, open])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] flex items-stretch justify-center overflow-hidden bg-black/65 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] backdrop-blur-sm sm:items-center sm:overflow-y-auto sm:px-4 sm:pb-[calc(env(safe-area-inset-bottom)_+_2rem)] sm:pt-[calc(env(safe-area-inset-top)_+_2rem)]"
      role="presentation"
      onMouseDown={() => onOpenChange(false)}
    >
      {children}
    </div>,
    document.body,
  )
}

type DialogContentProps = HTMLAttributes<HTMLElement> & {
  labelledBy?: string
}

export function DialogContent({ children, className, labelledBy, ...props }: DialogContentProps) {
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className={cn(
        "flex h-full max-h-full min-h-0 w-full flex-col overflow-y-auto rounded-none border-y border-base-300 bg-base-100 shadow-2xl sm:h-auto sm:max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_4rem)] sm:rounded-box sm:border",
        className,
      )}
      onMouseDown={(event) => event.stopPropagation()}
      {...props}
    >
      {children}
    </section>
  )
}

export function DialogHeader({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-base-300 px-5 py-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function DialogTitle({ children, className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn("text-xl font-black tracking-normal", className)} {...props}>
      {children}
    </h2>
  )
}

export function DialogClose({ onClose }: { onClose: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label="Close dialog" onClick={onClose}>
      <X className="h-4 w-4" />
    </Button>
  )
}
