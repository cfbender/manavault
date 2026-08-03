import { useMutation, useQuery } from "@apollo/client/react"
import { Clipboard } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { useToast } from "../../components/ui/toast"
import { EnsureTradeBinderShareTokenDocument, TradeBinderShareTokenDocument } from "./documents"

export function BinderShareDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const { showToast } = useToast()
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")
  const hasEnsuredRef = useRef(false)
  const tokenQuery = useQuery(TradeBinderShareTokenDocument, {
    skip: !open,
    fetchPolicy: "cache-and-network",
  })
  const [ensureShareToken, ensureShare] = useMutation(EnsureTradeBinderShareTokenDocument)

  const existingToken = tokenQuery.data?.tradeBinderShareToken || ""
  const generatedToken = ensureShare.data?.ensureTradeBinderShareToken?.token || ""
  const token = existingToken || generatedToken
  const shareUrl =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/share/binder/${encodeURIComponent(token)}`
      : ""
  const error = ensureShare.error instanceof Error ? ensureShare.error.message : null

  useEffect(() => {
    if (!open) {
      hasEnsuredRef.current = false
      setCopyState("idle")
      return
    }

    // Only ensure a token once we know there isn't one already: the query
    // above is the source of truth, so wait for it before minting a new one.
    if (tokenQuery.loading || existingToken || hasEnsuredRef.current) return

    hasEnsuredRef.current = true
    void ensureShareToken()
  }, [ensureShareToken, existingToken, open, tokenQuery.loading])

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

          <div className="flex flex-wrap justify-end gap-2 border-t border-base-300 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="button" disabled={!shareUrl} onClick={copyShareUrl}>
              <Clipboard className="h-4 w-4" />
              {copyState === "copied" ? "Copied" : "Copy link"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
