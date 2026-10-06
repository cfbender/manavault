import { Volume2 } from "lucide-react"
import { useId, type ReactNode } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { Switch } from "../../components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group"
import { isCrossOriginIsolated } from "../../lib/cross-origin-isolation"
import { cn } from "../../lib/utils"
import { SetCombobox } from "../collection/set-combobox"
import type { RecognizerState } from "./recognition/use-recognizer"
import type { CameraDiagnostics } from "./use-camera"
import {
  DEFAULT_SCAN_SETTINGS,
  normalizeScanSettings,
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  THREAD_OPTIONS,
  type ScanSettings,
} from "./scan-settings"
import { playScanSound, unlockScanSounds } from "./scan-sounds"

export function ScanSettingsSheet({
  open,
  settings,
  recognizer,
  camera,
  lastMs,
  onChange,
  onClose,
}: {
  open: boolean
  settings: ScanSettings
  recognizer: RecognizerState
  camera: CameraDiagnostics | null
  lastMs: number | null
  onChange: (settings: ScanSettings) => void
  onClose: () => void
}) {
  const update = (patch: Partial<ScanSettings>) =>
    onChange(normalizeScanSettings({ ...settings, ...patch }))

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="scan-sheet sm:max-w-lg" labelledBy="scan-settings-title">
        <DialogHeader>
          <DialogTitle id="scan-settings-title">Scanner settings</DialogTitle>
          <DialogClose onClose={onClose} />
        </DialogHeader>

        <div className="divide-y divide-base-300 overflow-y-auto">
          <section className="space-y-2 px-5 py-4">
            <h3 className="text-sm font-bold">Lock sets</h3>
            <p className="text-sm text-base-content/70">
              Scans prefer printings from these sets. Useful when sorting a pile from one release.
            </p>
            <SetCombobox
              values={settings.lockedSets}
              onValuesChange={(lockedSets) => update({ lockedSets })}
            />
          </section>

          <section className="px-5 py-2">
            <ToggleRow
              label="Tokens mode"
              description="Match only tokens and add one each time you tap the screen, so a stack of tokens with the same art but different backs or finishes logs every copy."
              checked={settings.tokenMode}
              onChange={(tokenMode) => update({ tokenMode })}
            />
            <ToggleRow
              label="Ignore promos"
              description="Never pick a promo printing automatically."
              checked={settings.ignorePromos}
              onChange={(ignorePromos) => update({ ignorePromos })}
            />
            <ToggleRow
              label="Prefer foil"
              description="Log cards as foil when the printing has a foil version."
              checked={settings.preferFoil}
              onChange={(preferFoil) => update({ preferFoil })}
            />
          </section>

          <section className="space-y-3 px-5 py-4">
            <div>
              <h3 className="text-sm font-bold">Total value</h3>
              <p className="text-sm text-base-content/70">
                Cards priced below the minimum are left out of the total, so bulk does not add up.
                $0.00 counts every card.
              </p>
            </div>
            <ToggleRow
              label="Show total value"
              description="Keep the running value of the scanned list on screen."
              checked={settings.showTotal}
              onChange={(showTotal) => update({ showTotal })}
            />
            <ThresholdField
              label="Count from"
              cents={settings.totalMinCents}
              onChange={(totalMinCents) => update({ totalMinCents })}
            />
          </section>

          <section className="space-y-3 px-5 py-4">
            <div>
              <h3 className="text-sm font-bold">Camera preview</h3>
              <p className="text-sm text-base-content/70">
                Zoom and pan the preview to where cards sit, for example with the phone on a
                scanning stand. Scanning still uses the whole camera image.
              </p>
            </div>
            <RangeField
              label="Zoom"
              value={settings.previewZoom}
              min={PREVIEW_ZOOM_MIN}
              max={PREVIEW_ZOOM_MAX}
              step={0.05}
              format={(zoom) => `${zoom.toFixed(2)}×`}
              onChange={(previewZoom) => update({ previewZoom })}
            />
            <RangeField
              label="Pan across"
              value={settings.previewPanX}
              min={0}
              max={1}
              step={0.01}
              format={formatPan}
              onChange={(previewPanX) => update({ previewPanX })}
            />
            <RangeField
              label="Pan down"
              value={settings.previewPanY}
              min={0}
              max={1}
              step={0.01}
              format={formatPan}
              onChange={(previewPanY) => update({ previewPanY })}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                update({
                  previewZoom: DEFAULT_SCAN_SETTINGS.previewZoom,
                  previewPanX: DEFAULT_SCAN_SETTINGS.previewPanX,
                  previewPanY: DEFAULT_SCAN_SETTINGS.previewPanY,
                })
              }
            >
              Reset preview
            </Button>
          </section>

          <section className="space-y-3 px-5 py-4">
            <ToggleRow
              label="Sounds"
              description="A click for every scan, a ding for valuable cards."
              checked={settings.soundsEnabled}
              onChange={(soundsEnabled) => update({ soundsEnabled })}
            />
            <ThresholdField
              label="Ding at"
              cents={settings.dingThresholdCents}
              disabled={!settings.soundsEnabled}
              onChange={(dingThresholdCents) => update({ dingThresholdCents })}
              onTest={() => testSound("ding")}
            />
            <ThresholdField
              label="Big ding at"
              cents={settings.bigDingThresholdCents}
              disabled={!settings.soundsEnabled}
              onChange={(bigDingThresholdCents) => update({ bigDingThresholdCents })}
              onTest={() => testSound("big-ding")}
            />
          </section>

          <section className="px-5 py-2">
            <ToggleRow
              label="Collect training data"
              description="Upload each scan's camera frame and its card to your server so future models recognize your cards better. Deleting a scan discards its label."
              checked={settings.collectTraining}
              onChange={(collectTraining) => update({ collectTraining })}
            />
            <ToggleRow
              label="Check outlines"
              description="After each scan, pause to confirm the card's outline or drag its corners onto the card. Checked outlines teach the scanner to find cards."
              checked={settings.collectTraining && settings.checkOutlines}
              disabled={!settings.collectTraining}
              onChange={(checkOutlines) => update({ checkOutlines })}
            />
          </section>

          <section className="px-5 py-4 text-sm text-base-content/70">
            <h3 className="mb-1 text-sm font-bold text-base-content">Recognition model</h3>
            <RecognizerSummary state={recognizer} lastMs={lastMs} />
            {isCrossOriginIsolated() ? (
              <ThreadsField value={settings.threads} onChange={(threads) => update({ threads })} />
            ) : (
              <p className="mt-2 text-xs text-base-content/60">
                Recognition runs on one thread: this page is not cross-origin isolated.
              </p>
            )}
          </section>

          {camera ? (
            <section className="px-5 py-4 text-sm text-base-content/70">
              <h3 className="mb-1 text-sm font-bold text-base-content">Camera</h3>
              <CameraSummary camera={camera} />
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Pan as an offset from the middle of the camera image: -50% to +50%. */
function formatPan(pan: number) {
  const offset = Math.round((pan - 0.5) * 100)
  return offset > 0 ? `+${offset}%` : `${offset}%`
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-24 shrink-0 text-sm font-bold">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number.parseFloat(event.target.value))}
        className="range range-primary range-sm flex-1"
      />
      <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-base-content/70">
        {format(value)}
      </span>
    </div>
  )
}

function testSound(sound: "ding" | "big-ding") {
  unlockScanSounds()
  playScanSound(sound)
}

function ToggleRow({
  label,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className={cn("flex items-center justify-between gap-4 py-2.5", disabled && "opacity-60")}>
      <label
        htmlFor={id}
        className={cn("min-w-0", disabled ? "cursor-not-allowed" : "cursor-pointer")}
      >
        <span className="block text-sm font-bold">{label}</span>
        <span className="block text-sm text-base-content/70">{description}</span>
      </label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

/** A dollar amount stored in cents; `onTest` adds a button that plays the matching sound. */
function ThresholdField({
  label,
  cents,
  disabled = false,
  onChange,
  onTest,
}: {
  label: string
  cents: number
  disabled?: boolean
  onChange: (cents: number) => void
  onTest?: () => void
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-24 shrink-0 text-sm font-bold">
        {label}
      </label>
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-base-content/60">
          $
        </span>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={0.5}
          disabled={disabled}
          // Uncontrolled so a half-typed value is not reformatted mid-edit.
          defaultValue={(cents / 100).toFixed(2)}
          onBlur={(event) => {
            const dollars = Number.parseFloat(event.target.value)
            if (Number.isFinite(dollars) && dollars >= 0) onChange(Math.round(dollars * 100))
            else event.target.value = (cents / 100).toFixed(2)
          }}
          className="pl-7 font-mono"
        />
      </div>
      {onTest ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={onTest}
          aria-label={`Play ${label.toLowerCase()} sound`}
        >
          <Volume2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}

/** WASM threads for recognition; changing it restarts the model. */
function ThreadsField({ value, onChange }: { value: number; onChange: (threads: number) => void }) {
  const id = useId()
  return (
    <div className="mt-3 flex items-center gap-3">
      <label id={id} className="w-24 shrink-0 text-sm font-bold text-base-content">
        Threads
      </label>
      <ToggleGroup
        type="single"
        aria-labelledby={id}
        value={String(value)}
        onValueChange={(option) => {
          if (option) onChange(Number(option))
        }}
        className="flex flex-1 gap-1 rounded-btn border border-base-300 bg-base-100 p-1"
      >
        {THREAD_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option}
            value={String(option)}
            className={cn(
              "min-h-8 flex-1 rounded-btn px-2 text-xs font-black uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              option === value
                ? "bg-primary text-primary-content"
                : "text-base-content/65 hover:bg-base-200 hover:text-base-content",
            )}
          >
            {option === 0 ? "Auto" : option}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/** What the camera delivers, to tell a lens switch or resolution drop from focus trouble. */
function CameraSummary({ camera }: { camera: CameraDiagnostics }) {
  const parts = [
    `${camera.width}×${camera.height}`,
    camera.frameRate !== null ? `${Math.round(camera.frameRate)} fps` : null,
    camera.focusMode !== null ? `focus ${camera.focusMode}` : null,
    camera.zoom !== null
      ? `zoom ${camera.zoom}×${camera.zoomRange ? ` (${camera.zoomRange.min}–${camera.zoomRange.max}×)` : ""}`
      : null,
  ].filter((part) => part !== null)
  return (
    <p>
      {camera.label ? <span className="font-mono">{camera.label}</span> : "Camera"} ·{" "}
      <span className="font-mono">{parts.join(" · ")}</span> · resolution changed{" "}
      <span className="font-mono">{camera.resolutionChanges}</span>{" "}
      {camera.resolutionChanges === 1 ? "time" : "times"}
    </p>
  )
}

function RecognizerSummary({
  state,
  lastMs,
}: {
  state: RecognizerState
  lastMs: number | null
}): ReactNode {
  switch (state.status) {
    case "ready":
      return (
        <p>
          <span className="font-mono">{state.version}</span> · {state.arts.toLocaleString()}{" "}
          artworks · loaded in{" "}
          <span className="font-mono">{(state.loadMs / 1000).toFixed(1)} s</span> · {state.threads}{" "}
          {state.threads === 1 ? "thread" : "threads"}
          {state.masked ? " · token search" : null}
          {lastMs !== null ? (
            <>
              {" "}
              · last scan <span className="font-mono">{Math.round(lastMs)} ms</span>
            </>
          ) : null}
        </p>
      )
    case "loading":
      return (
        <p>
          Loading <span className="font-mono">{state.version}</span>…
        </p>
      )
    case "unavailable":
      return <p>No recognition model is installed on this server yet.</p>
    case "failed":
      return <p className="text-error">{state.message}</p>
    default:
      return <p>Loads when you start scanning. New models are picked up automatically.</p>
  }
}
