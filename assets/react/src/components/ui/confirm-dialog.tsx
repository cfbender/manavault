import type { ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "./dialog"
import { Button } from "./button"

type ConfirmDialogProps = {
  cancelLabel?: string
  children?: ReactNode
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  title: string
}

export function ConfirmDialog({
  cancelLabel = "Cancel",
  children,
  confirmLabel = "Confirm",
  destructive = false,
  onConfirm,
  onOpenChange,
  open,
  title,
}: ConfirmDialogProps) {
  function close() {
    onOpenChange(false)
  }

  function handleConfirm() {
    close()
    onConfirm()
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-w-lg" labelledBy="confirm-dialog-title">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="mt-1 rounded-full bg-warning/15 p-2 text-warning">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
              {children ? <div className="mt-2 text-sm text-base-content/65">{children}</div> : null}
            </div>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <div className="flex justify-end gap-2 border-t border-base-300 p-5">
          <Button type="button" variant="ghost" onClick={close}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={destructive ? "destructive" : "default"} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
