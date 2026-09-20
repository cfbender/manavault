import type { FormEvent } from "react"
import { Upload } from "lucide-react"
import { Button } from "../../../components/ui/button"
import {
  SELECT_NONE_VALUE,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select"
import { Textarea } from "../../../components/ui/textarea"
import { titleize } from "../../../lib/utils"
import { isUnfiledLocation } from "../location-summary"
import type { CollectionImportFormat, CollectionImportPurchaseMode } from "../types"
import type { CollectionImportState } from "./use-collection-import"

type ImportLocation = { id: string; kind: string; name: string }

export function CollectionImportForm({
  chooseFile,
  close,
  locations,
  previewPending,
  state,
  submitPreview,
  update,
}: {
  chooseFile: (file: File | undefined) => Promise<void>
  close: () => void
  locations: ImportLocation[]
  previewPending: boolean
  state: CollectionImportState
  submitPreview: () => void
  update: (values: Partial<CollectionImportState>) => void
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submitPreview()
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block space-y-2">
        <FieldLabel>Import location</FieldLabel>
        <Select
          value={state.locationId || SELECT_NONE_VALUE}
          onValueChange={(value) =>
            update({ locationId: value === SELECT_NONE_VALUE ? "" : value })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_NONE_VALUE}>No location</SelectItem>
            {locations
              .filter((location) => !isUnfiledLocation(location))
              .map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name} ({titleize(location.kind)})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </label>

      <label className="block space-y-2">
        <FieldLabel>Purchase pricing</FieldLabel>
        <Select
          value={state.purchaseMode}
          onValueChange={(value) =>
            update({ error: null, purchaseMode: value as CollectionImportPurchaseMode })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="per_card">Price per card</SelectItem>
            <SelectItem value="total_spend">Total amount spent</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <label className="block space-y-2">
        <FieldLabel>
          {state.purchaseMode === "total_spend" ? "Total amount spent" : "Purchase price per card"}
        </FieldLabel>
        <input
          type="text"
          inputMode="decimal"
          className="input input-bordered w-full bg-base-100"
          value={state.purchasePrice}
          onChange={(event) => update({ purchasePrice: event.target.value })}
          placeholder={state.purchaseMode === "total_spend" ? "$439.00" : "$1.00"}
        />
        <p className="text-sm text-base-content/55">
          {state.purchaseMode === "total_spend"
            ? "Divided by the quantity of exact cards in the import and rounded to the nearest cent."
            : "Optional default for rows without a purchase price column."}
        </p>
      </label>

      <label className="block space-y-2">
        <FieldLabel>CSV or TXT file</FieldLabel>
        <input
          type="file"
          accept=".csv,.txt,text/csv,text/plain,text/comma-separated-values,application/vnd.ms-excel"
          className="file-input file-input-bordered w-full bg-base-100"
          onChange={(event) => void chooseFile(event.target.files?.[0])}
        />
        {state.sharedFileName ? (
          <p className="rounded-box border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            Opened from another app: “{state.sharedFileName}”. Review the preview below before
            importing — nothing is added to your collection until you choose Import. (The Android
            file picker may still say no file chosen; the shared text is in the box below.)
          </p>
        ) : state.fileName ? (
          <p className="text-sm text-base-content/55">{state.fileName}</p>
        ) : null}
      </label>

      <label className="block space-y-2">
        <FieldLabel>File type</FieldLabel>
        <Select
          value={state.format}
          onValueChange={(value) => update({ format: value as CollectionImportFormat })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto-detect</SelectItem>
            <SelectItem value="csv">CSV</SelectItem>
            <SelectItem value="txt">TXT list</SelectItem>
          </SelectContent>
        </Select>
      </label>

      <label className="block space-y-2">
        <FieldLabel>Import text</FieldLabel>
        <Textarea
          className="min-h-40 font-mono text-sm"
          value={state.importText}
          onChange={(event) => update({ importText: event.target.value })}
          placeholder={"1x Jund Charm (C13) 195\n1x Zuko's Exile (TLA) 3 *F*"}
        />
      </label>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button type="submit" disabled={previewPending}>
          <Upload className="h-4 w-4" />
          {previewPending ? "Previewing..." : "Preview import"}
        </Button>
      </div>
    </form>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">{children}</span>
}
