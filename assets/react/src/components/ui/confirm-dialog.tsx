import { AlertTriangle } from "lucide-react"
import { useId, type ReactNode } from "react"
import { Button } from "./button"
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "./dialog"

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
  const descriptionId = useId()
  const titleId = useId()

  function close() {
    onOpenChange(false)
  }

  function handleConfirm() {
    close()
    onConfirm()
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent
        className="max-w-lg"
        describedBy={children ? descriptionId : undefined}
        labelledBy={titleId}
        role={destructive ? "alertdialog" : "dialog"}
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="mt-1 rounded-full bg-warning/15 p-2 text-warning" aria-hidden="true">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle id={titleId}>{title}</DialogTitle>
              {children ? (
                <div id={descriptionId} className="mt-2 text-sm text-base-content/65">
                  {children}
                </div>
              ) : null}
            </div>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>

        <div className="flex justify-end gap-2 border-t border-base-300 p-5">
          <Button type="button" variant="ghost" onClick={close}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
