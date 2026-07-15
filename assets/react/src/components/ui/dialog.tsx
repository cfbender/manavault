import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { useCallback, useEffect, useRef, type HTMLAttributes, type ReactNode } from "react"
import { registerNativeBackModal } from "../../lib/native-modal-stack"
import { cn } from "../../lib/utils"
import { Button } from "./button"

type DialogProps = {
  children: ReactNode
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function Dialog({ children, onOpenChange, open }: DialogProps) {
  const closeRequested = useRef(false)
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange

  useEffect(() => {
    if (!open) closeRequested.current = false
  }, [open])

  const requestClose = useCallback(() => {
    if (closeRequested.current) return

    closeRequested.current = true
    onOpenChangeRef.current(false)
  }, [])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        closeRequested.current = false
        onOpenChangeRef.current(true)
        return
      }

      requestClose()
    },
    [requestClose],
  )

  useEffect(() => {
    if (!open) return

    return registerNativeBackModal(requestClose)
  }, [open, requestClose])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      {open ? children : null}
    </DialogPrimitive.Root>
  )
}

type DialogContentProps = HTMLAttributes<HTMLElement> & {
  describedBy?: string
  labelledBy?: string
}

export function DialogContent({
  children,
  className,
  describedBy,
  labelledBy,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[1100] bg-black/65 backdrop-blur-sm" />
      <div className="pointer-events-none fixed inset-0 z-[1100] flex items-stretch justify-center overflow-hidden pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] sm:items-center sm:overflow-y-auto sm:px-4 sm:pb-[calc(env(safe-area-inset-bottom)_+_2rem)] sm:pt-[calc(env(safe-area-inset-top)_+_2rem)]">
        <DialogPrimitive.Content
          aria-describedby={describedBy}
          {...(labelledBy ? { "aria-labelledby": labelledBy } : {})}
          asChild
        >
          <section
            className={cn(
              "pointer-events-auto flex h-full max-h-full min-h-0 w-full flex-col overflow-y-auto rounded-none border-y border-base-300 bg-base-100 shadow-2xl sm:h-auto sm:max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_4rem)] sm:rounded-box sm:border",
              className,
            )}
            {...props}
          >
            {children}
          </section>
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
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
    <DialogPrimitive.Title
      className={cn("text-xl font-black tracking-normal", className)}
      {...props}
    >
      {children}
    </DialogPrimitive.Title>
  )
}

export function DialogClose({ onClose }: { onClose: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label="Close dialog" onClick={onClose}>
      <X className="h-4 w-4" />
    </Button>
  )
}
