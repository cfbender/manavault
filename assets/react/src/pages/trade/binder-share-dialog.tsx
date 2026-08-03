import { useMutation } from "@apollo/client/react"
import { Clipboard, RotateCw, ShieldOff } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "../../components/ui/button"
import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import {
  DisableTradeBinderSharingDocument,
  EnsureTradeBinderShareTokenDocument,
  RotateTradeBinderShareTokenDocument,
} from "./documents"

export function BinderShareDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const { showToast } = useToast()
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const [confirmAction, setConfirmAction] = useState<"disable" | "rotate" | null>(null)
  const [managedToken, setManagedToken] = useState<string | null>(null)
  const hasEnsuredRef = useRef(false)
  const [ensureShareToken, ensureShare] = useMutation(EnsureTradeBinderShareTokenDocument)
  const [rotateShareToken, rotateShare] = useMutation(RotateTradeBinderShareTokenDocument)
  const [disableSharing, disableShare] = useMutation(DisableTradeBinderSharingDocument)

  const token = managedToken ?? ""
  const shareUrl =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/share/binder/${encodeURIComponent(token)}`
      : ""
  const mutationError = ensureShare.error || rotateShare.error || disableShare.error
  const error = mutationError instanceof Error ? mutationError.message : null
  const changingShare = ensureShare.loading || rotateShare.loading || disableShare.loading

  useEffect(() => {
    if (!open) {
      hasEnsuredRef.current = false
      setManagedToken(null)
      setCopyState("idle")
      return
    }

    if (hasEnsuredRef.current) return

    hasEnsuredRef.current = true
    void ensureShareToken({
      onCompleted: (data) => setManagedToken(data.ensureTradeBinderShareToken?.token ?? ""),
    })
  }, [ensureShareToken, open])

  function rotateLink() {
    void rotateShareToken({
      onCompleted: (data) => {
        setManagedToken(data.rotateTradeBinderShareToken?.token ?? "")
        setCopyState("idle")
        showToast("Binder link rotated")
      },
    })
  }

  function disableLink() {
    hasEnsuredRef.current = true
    void disableSharing({
      onCompleted: () => {
        setManagedToken("")
        showToast("Binder sharing disabled")
        onOpenChange(false)
      },
    })
  }

  async function copyShareUrl() {
    if (!shareUrl) return

    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopyState("copied")
      showToast("Binder link copied")
      onOpenChange(false)
    } catch {
      setCopyState("failed")
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) onOpenChange(true)
          else onOpenChange(false)
        }}
      >
        <DialogContent className="max-w-xl" labelledBy="share-binder-title">
          <DialogHeader>
            <div>
              <DialogTitle id="share-binder-title">Share binder</DialogTitle>
              <p className="mt-1 text-sm text-base-content/60">
                Anyone with this link can see your trade binder.
              </p>
            </div>
            <DialogClose onClose={() => onOpenChange(false)} />
          </DialogHeader>

          <div className="space-y-4 p-5">
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
                Public link
              </span>
              <Input readOnly value={shareUrl || "Generating link..."} />
            </label>

            {error ? (
              <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
                {error}
              </p>
            ) : null}
            {copyState === "failed" ? (
              <p className="text-sm text-error">Could not copy from this browser context.</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-base-300 pt-4">
              <Button
                type="button"
                variant="ghost"
                disabled={!shareUrl || changingShare}
                onClick={() => setConfirmAction("disable")}
              >
                <ShieldOff className="h-4 w-4" />
                Disable sharing
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={!shareUrl || changingShare}
                onClick={() => setConfirmAction("rotate")}
              >
                <RotateCw className="h-4 w-4" />
                Rotate link
              </Button>
              <span className="flex-1" />
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button type="button" disabled={!shareUrl || changingShare} onClick={copyShareUrl}>
                <Clipboard className="h-4 w-4" />
                {copyState === "copied" ? "Copied" : "Copy link"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmLabel={confirmAction === "disable" ? "Disable sharing" : "Rotate link"}
        destructive
        onConfirm={confirmAction === "disable" ? disableLink : rotateLink}
        onOpenChange={(nextOpen) => !nextOpen && setConfirmAction(null)}
        open={confirmAction !== null}
        title={confirmAction === "disable" ? "Disable binder sharing?" : "Rotate binder link?"}
      >
        {confirmAction === "disable"
          ? "The current link will stop working immediately. Opening Share again will create a new link."
          : "The current link will stop working immediately and be replaced with a new one."}
      </ConfirmDialog>
    </>
  )
}
