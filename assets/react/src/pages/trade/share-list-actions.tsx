import { Check, Copy, Download } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "../../components/ui/button"
import { copyTextToClipboard } from "../../lib/clipboard"
import { downloadTextFile } from "../../lib/deck-export"
import { shareListText, type ShareListExportEntry } from "./share-list-export"

// Copy/download actions for the public share pages (wants + binder). Uses
// local button state instead of toasts because these pages render outside
// the authed app shell.
export function ShareListActions({
  entries,
  filename,
}: {
  entries: readonly ShareListExportEntry[]
  filename: string
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")

  useEffect(() => {
    if (copyState === "idle") return
    const timer = setTimeout(() => setCopyState("idle"), 2000)
    return () => clearTimeout(timer)
  }, [copyState])

  if (!entries.length) return null

  async function copyList() {
    const copied = await copyTextToClipboard(shareListText(entries))
    setCopyState(copied ? "copied" : "failed")
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => void copyList()}>
        {copyState === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy list"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => downloadTextFile(filename, shareListText(entries))}
      >
        <Download className="h-4 w-4" />
        Download .txt
      </Button>
    </div>
  )
}
