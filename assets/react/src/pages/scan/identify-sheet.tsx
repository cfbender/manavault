import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { CardNameSearch } from "./printing-sheet"
import type { PrintingOption } from "./printing-choice"
import type { ScanSettings } from "./scan-settings"

/**
 * "Identify": name the card in view when the scanner does not log it. With training collection
 * on, the frame it missed is uploaded with that label, the most useful training sample.
 */
export function IdentifySheet({
  open,
  settings,
  onIdentify,
  onClose,
}: {
  open: boolean
  settings: ScanSettings
  onIdentify: (printing: PrintingOption) => void
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="scan-sheet sm:max-w-xl" labelledBy="scan-identify-title">
        <DialogHeader>
          <div className="min-w-0">
            <DialogTitle id="scan-identify-title">
              {settings.tokenMode ? "Identify token" : "Identify card"}
            </DialogTitle>
            <p className="mt-1 text-sm text-base-content/70">
              {settings.collectTraining
                ? `Name the ${settings.tokenMode ? "token" : "card"} in view. Its photo is saved for training so the scanner learns it.`
                : `Name the ${settings.tokenMode ? "token" : "card"} in view to add it to the list.`}
            </p>
          </div>
          <DialogClose onClose={onClose} />
        </DialogHeader>
        <CardNameSearch settings={settings} onChoose={onIdentify} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  )
}
