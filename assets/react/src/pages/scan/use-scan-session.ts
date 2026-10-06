import { useApolloClient } from "@apollo/client/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { queueSharedImport } from "../../lib/native-shared-import"
import { useLocalStorageState } from "../../lib/use-local-storage"
import {
  printingOption,
  ScannerPrintingsDocument,
  ScannerSetIllustrationsDocument,
} from "./documents"
import {
  chooseFinish,
  choosePrinting,
  isSingleFacedToken,
  type Finish,
  type PrintingOption,
} from "./printing-choice"
import type { Identification } from "./recognition/messages"
import type { Candidate, Quad } from "./recognition/pipeline"
import { useRecognizer } from "./recognition/use-recognizer"
import {
  cardKey,
  evaluateFrame,
  evaluateTokenFrame,
  FRAME_PACING,
  frameInterval,
  forgetLastLogged,
  INITIAL_TRACKER,
  markLogged,
  type FrameOutcome,
  type ScanTracker,
} from "./scan-decision"
import {
  entryPriceCents,
  lastBackFor,
  normalizeScanList,
  scanListCsv,
  withPrinting,
  type ScanBackFace,
  type ScanEntry,
} from "./scan-list"
import {
  DEFAULT_SCAN_SETTINGS,
  normalizeScanSettings,
  SCAN_LIST_STORAGE_KEY,
  SCAN_SETTINGS_STORAGE_KEY,
  soundForPrice,
  type ScanSettings,
} from "./scan-settings"
import { playScanSound, unlockScanSounds } from "./scan-sounds"
import { IDLE_VIEW, nextView, type ScanView } from "./scan-view"
import { centredOutline } from "./outline-geometry"
import type { OutlineCheck } from "./outline-editor"
import {
  manualCapture,
  trainingCapture,
  trainingSample,
  uploadTrainingSample,
  withCheckedOutline,
} from "./scan-training"
import { FRAME_SIZE, useCamera } from "./use-camera"

const EMPTY_LIST: ScanEntry[] = []
const readSettings = (value: string) => normalizeScanSettings(JSON.parse(value))
const readList = (value: string) => normalizeScanList(JSON.parse(value))

function newEntryId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** The set lock as a candidate filter; `loading` while its illustrations are fetched. */
type SetLock =
  | { status: "off" }
  | { status: "loading" }
  | { status: "ready"; allow: (candidate: Candidate) => boolean }

/** What the camera saw when the user tapped "Identify". */
export interface FrameSnapshot {
  /** JPEG of the frame, only when training collection is on. */
  image: string | null
  quad: Quad | null
  candidate: Candidate | null
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

/**
 * The scanner's state machine: camera + recognizer → scan decision → list entry → catalog
 * printing lookup → sound. Entries and settings persist in localStorage.
 */
export function useScanSession({ paused }: { paused: boolean }) {
  const apollo = useApolloClient()
  const camera = useCamera()
  const recognizer = useRecognizer()
  const [settings, setSettings] = useLocalStorageState<ScanSettings>(
    SCAN_SETTINGS_STORAGE_KEY,
    DEFAULT_SCAN_SETTINGS,
    { deserialize: readSettings },
  )
  const [entries, setEntries] = useLocalStorageState<ScanEntry[]>(
    SCAN_LIST_STORAGE_KEY,
    EMPTY_LIST,
    {
      deserialize: readList,
    },
  )
  const [view, setView] = useState<ScanView>(IDLE_VIEW)
  const viewRef = useRef(view)
  viewRef.current = view

  const settingsRef = useRef(settings)
  settingsRef.current = settings
  // "Check outlines": the logged scan whose outline waits for the user; scanning pauses.
  const [outlineCheck, setOutlineCheck] = useState<OutlineCheck | null>(null)
  // A scanned single-faced token whose other side the user has not picked yet; scanning pauses.
  const [backFacePick, setBackFacePick] = useState<ScanEntry | null>(null)
  const pausedRef = useRef(paused)
  pausedRef.current = paused || outlineCheck !== null || backFacePick !== null
  const trackerRef = useRef<ScanTracker>(INITIAL_TRACKER)
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const lockRef = useRef<SetLock>({ status: "off" })
  // Tokens mode: the token in view, logged when the screen is tapped.
  const armedRef = useRef<{ candidate: Candidate; result: Identification } | null>(null)
  const bundleVersionRef = useRef<string | null>(null)
  bundleVersionRef.current = recognizer.state.status === "ready" ? recognizer.state.version : null

  /** Re-sends an uploaded capture's label; `null` marks it skipped. */
  const relabel = useCallback((entry: ScanEntry, label: string | null = entry.scryfallId) => {
    if (entry.training)
      void uploadTrainingSample(trainingSample(entry.training, label, entry.finish))
  }, [])
  const lockedSetsKey = settings.lockedSets.join(",")

  // A locked set restricts recognition to artwork printed in those sets. The browser only
  // knows each artwork's representative printing, so the server lists the illustrations.
  useEffect(() => {
    const sets = lockedSetsKey ? lockedSetsKey.split(",") : []
    if (sets.length === 0) {
      lockRef.current = { status: "off" }
      return
    }
    let cancelled = false
    lockRef.current = { status: "loading" }
    apollo
      .query({ query: ScannerSetIllustrationsDocument, variables: { setCodes: sets } })
      .then(({ data }) => {
        if (cancelled) return
        const illustrations = new Set(data?.scannerSetIllustrations ?? [])
        const codes = new Set(sets)
        lockRef.current = {
          status: "ready",
          allow: (candidate) =>
            codes.has(candidate.set.toLowerCase()) ||
            (candidate.illustration_id !== undefined &&
              illustrations.has(candidate.illustration_id)),
        }
      })
      .catch(() => {
        // Without the list, fall back to the representative printing's set.
        if (!cancelled) {
          const codes = new Set(sets)
          lockRef.current = { status: "ready", allow: (c) => codes.has(c.set.toLowerCase()) }
        }
      })
    return () => {
      cancelled = true
    }
  }, [apollo, lockedSetsKey])

  const updateEntry = useCallback(
    (id: string, update: (entry: ScanEntry) => ScanEntry) =>
      setEntries((list) => list.map((entry) => (entry.id === id ? update(entry) : entry))),
    [setEntries],
  )

  const resolveEntry = useCallback(
    async (entry: ScanEntry) => {
      let printing: PrintingOption | null = null
      try {
        const { data } = await apollo.query({
          query: ScannerPrintingsDocument,
          variables: { scryfallId: entry.scryfallId, illustrationId: entry.illustrationId },
          fetchPolicy: "cache-first",
        })
        printing = choosePrinting(
          (data?.scannerPrintings ?? []).map(printingOption),
          { illustrationId: entry.illustrationId },
          settingsRef.current,
        )
      } catch {
        // Offline or catalog error: keep the recognized gallery printing without a price.
      }
      if (!printing) {
        playScanSound(soundForPrice(null, settingsRef.current))
        return
      }
      const finish = chooseFinish(printing.finishes, settingsRef.current.preferFoil)
      let resolved = withPrinting(entry, printing, finish)
      // Scryfall knows both faces of a double-faced token; a single-faced one may still be
      // printed with another token on its back, which only the user can see. Tokens mode logs
      // a stack of the same token tap by tap, so the back settled on the previous copy carries
      // over and the picker asks once per token; the result bar's chip changes a stray copy.
      if (isSingleFacedToken(printing) && resolved.back === undefined) {
        const inherited = settingsRef.current.tokenMode
          ? lastBackFor(entriesRef.current, resolved)
          : undefined
        if (inherited !== undefined) {
          resolved = { ...resolved, back: inherited }
        } else {
          pausedRef.current = true
          setBackFacePick(resolved)
        }
      }
      const back = resolved.back
      updateEntry(entry.id, (current) => ({ ...withPrinting(current, printing, finish), back }))
      if (finish !== entry.finish) {
        // The outline may have been checked meanwhile; resend that, not the logged capture.
        const latest = entriesRef.current.find((candidate) => candidate.id === entry.id)
        relabel({ ...entry, training: latest?.training ?? entry.training, finish })
      }
      playScanSound(soundForPrice(printing.prices[finish], settingsRef.current))
    },
    [apollo, relabel, updateEntry],
  )

  const { lastFrameJpeg } = camera

  const logScan = useCallback(
    (candidate: Candidate, result: Identification) => {
      const key = cardKey(candidate.id)
      const entry: ScanEntry = {
        id: newEntryId(),
        cardKey: key,
        illustrationId: candidate.illustration_id ?? null,
        name: candidate.name,
        scryfallId: key,
        setCode: candidate.set,
        setName: null,
        collectorNumber: candidate.collector_number ?? "",
        rarity: null,
        finish: settingsRef.current.preferFoil ? "foil" : "nonfoil",
        finishes: [],
        language: candidate.lang ?? "en",
        quantity: 1,
        prices: { nonfoil: null, foil: null, etched: null },
        // The full card scan of the recognized printing, not its art crop, so the thumbnail
        // does not jump from landscape art to a card when the catalog lookup finishes.
        imageUrl: candidate.url?.replace("/art_crop/", "/normal/") ?? null,
        resolved: false,
        scannedAt: Date.now(),
      }
      // Training upload of the frame the recognizer just saw (the canvas still holds it).
      const version = bundleVersionRef.current
      const image = settingsRef.current.collectTraining && version ? lastFrameJpeg() : null
      if (image && version) {
        entry.training = trainingCapture(newEntryId(), candidate, result, FRAME_SIZE, version)
        void uploadTrainingSample(trainingSample(entry.training, candidate.id, entry.finish, image))
        if (settingsRef.current.checkOutlines && entry.training.quad) {
          // Set the ref now so the scan loop stops before the next frame, not after a render.
          pausedRef.current = true
          setOutlineCheck({ entryId: entry.id, name: entry.name, image, quad: result.quad })
        }
      }
      setEntries((list) => [entry, ...list])
      void resolveEntry(entry)
    },
    [lastFrameJpeg, resolveEntry, setEntries],
  )

  const running = camera.state.status === "live" && recognizer.state.status === "ready"
  const { grabFrame } = camera
  const { identify } = recognizer

  // Switched off to save the battery after a minute with no card in view; a tap resumes.
  const [asleep, setAsleep] = useState(false)
  const asleepRef = useRef(asleep)
  asleepRef.current = asleep
  /** When a card was last in view, or scanning last paused or resumed. */
  const lastActiveRef = useRef(0)
  const { start: startCamera, stop: stopCamera } = camera

  useEffect(() => {
    if (!running) return
    let cancelled = false
    lastActiveRef.current = performance.now()
    void (async () => {
      let wasPaused = pausedRef.current
      while (!cancelled) {
        if (pausedRef.current !== wasPaused) {
          wasPaused = pausedRef.current
          lastActiveRef.current = performance.now()
        }
        if (performance.now() - lastActiveRef.current >= FRAME_PACING.sleepMs) {
          setAsleep(true)
          stopCamera()
          return
        }
        if (pausedRef.current || document.visibilityState === "hidden") {
          await sleep(250)
          continue
        }
        const started = performance.now()
        const frame = grabFrame()
        if (!frame) {
          await sleep(100)
          continue
        }
        let interval: number = FRAME_PACING.activeMs
        try {
          const result = await identify(frame, settingsRef.current.tokenMode ? "tokens" : "all")
          if (cancelled || pausedRef.current) continue
          const lock = lockRef.current
          if (lock.status === "loading") {
            await sleep(100)
            continue
          }
          let outcome: FrameOutcome
          if (settingsRef.current.tokenMode) {
            outcome = evaluateTokenFrame(result)
            armedRef.current =
              outcome.type === "ready" ? { candidate: outcome.candidate, result } : null
          } else {
            armedRef.current = null
            const next = evaluateFrame(
              trackerRef.current,
              result,
              lock.status === "ready" ? lock.allow : undefined,
            )
            trackerRef.current = next.tracker
            outcome = next.outcome
            if (outcome.type === "accept") logScan(outcome.candidate, result)
          }
          const now = performance.now()
          if (outcome.type !== "empty") lastActiveRef.current = now
          interval = frameInterval(outcome.type, now - lastActiveRef.current)
          setView((current) => nextView(current, outcome, result, now))
        } catch {
          if (cancelled) return
          await sleep(250)
        }
        const elapsed = performance.now() - started
        await sleep(Math.max(FRAME_PACING.minGapMs, interval - elapsed))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [grabFrame, identify, logScan, running, stopCamera])

  const { start: startRecognizer, stop: stopRecognizer } = recognizer

  /** Must run from a tap: it unlocks audio and triggers the camera permission prompt. */
  const start = useCallback(() => {
    unlockScanSounds()
    startRecognizer({ threads: settingsRef.current.threads })
    void startCamera()
  }, [startCamera, startRecognizer])

  const wake = useCallback(() => {
    setAsleep(false)
    void startCamera()
  }, [startCamera])

  // The camera is off while the app or tab is in the background, not just unread.
  const cameraStatusRef = useRef(camera.state.status)
  cameraStatusRef.current = camera.state.status
  useEffect(() => {
    let stoppedHidden = false
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        const status = cameraStatusRef.current
        if (status !== "starting" && status !== "live") return
        stoppedHidden = true
        stopCamera()
      } else if (stoppedHidden) {
        stoppedHidden = false
        if (!asleepRef.current) void startCamera()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [startCamera, stopCamera])

  // The thread count is fixed when the runtime starts, so changing it restarts the worker.
  const recognizerRunning = recognizer.state.status !== "idle"
  const threads = settings.threads
  const startedThreadsRef = useRef(threads)
  useEffect(() => {
    if (!recognizerRunning) {
      startedThreadsRef.current = threads
      return
    }
    if (startedThreadsRef.current === threads) return
    startedThreadsRef.current = threads
    stopRecognizer()
    startRecognizer({ threads })
  }, [recognizerRunning, startRecognizer, stopRecognizer, threads])

  const stop = useCallback(() => {
    stopCamera()
    stopRecognizer()
    setView(IDLE_VIEW)
  }, [stopCamera, stopRecognizer])

  /** Tokens mode: a tap logs the token in view, even the same one again. */
  const logArmed = useCallback(() => {
    const armed = armedRef.current
    if (!armed) return
    logScan(armed.candidate, armed.result)
    const now = performance.now()
    setView((current) =>
      nextView(current, { type: "accept", candidate: armed.candidate }, armed.result, now),
    )
  }, [logScan])

  /** Explicitly logs another copy; this is how the same card is counted twice in a row. */
  const addCopy = useCallback(
    (id: string) => {
      const entry = entriesRef.current.find((candidate) => candidate.id === id)
      if (!entry) return
      updateEntry(id, (current) => ({ ...current, quantity: current.quantity + 1 }))
      playScanSound(soundForPrice(entryPriceCents(entry), settingsRef.current))
    },
    [updateEntry],
  )

  /** Removing the latest scan lets the same card be scanned again straight away. */
  const removeEntry = useCallback(
    (id: string) => {
      if (entriesRef.current[0]?.id === id) {
        trackerRef.current = forgetLastLogged(trackerRef.current)
      }
      // A deleted scan may have been a misrecognition, so its training label is not trusted.
      const entry = entriesRef.current.find((candidate) => candidate.id === id)
      if (entry) relabel(entry, null)
      setEntries((list) => list.filter((entry) => entry.id !== id))
    },
    [relabel, setEntries],
  )

  const setQuantity = useCallback(
    (id: string, quantity: number) => {
      if (quantity <= 0) removeEntry(id)
      else updateEntry(id, (entry) => ({ ...entry, quantity }))
    },
    [removeEntry, updateEntry],
  )

  const setFinish = useCallback(
    (id: string, finish: Finish) => {
      const entry = entriesRef.current.find((candidate) => candidate.id === id)
      if (entry && entry.finish !== finish) relabel({ ...entry, finish })
      updateEntry(id, (current) => ({ ...current, finish }))
    },
    [relabel, updateEntry],
  )

  const setLanguage = useCallback(
    (id: string, language: string) => updateEntry(id, (entry) => ({ ...entry, language })),
    [updateEntry],
  )

  /** `null` drops the user's price so the entry follows the market price again. */
  const setPurchasePrice = useCallback(
    (id: string, cents: number | null) =>
      updateEntry(id, (entry) => ({ ...entry, purchasePriceCents: cents ?? undefined })),
    [updateEntry],
  )

  const setPrinting = useCallback(
    (id: string, printing: PrintingOption) => {
      const entry = entriesRef.current.find((candidate) => candidate.id === id)
      if (!entry) return
      const next = withPrinting(
        entry,
        printing,
        printing.finishes.includes(entry.finish)
          ? entry.finish
          : chooseFinish(printing.finishes, settingsRef.current.preferFoil),
      )
      relabel(next)
      updateEntry(id, () => next)
    },
    [relabel, updateEntry],
  )

  /** Freezes what the camera sees now, before the Identify sheet pauses scanning. */
  const snapshotFrame = useCallback((): FrameSnapshot => {
    const { quad, candidate } = viewRef.current
    const image = settingsRef.current.collectTraining && grabFrame() ? lastFrameJpeg() : null
    return { image, quad, candidate }
  }, [grabFrame, lastFrameJpeg])

  /** "Identify": logs a card the scanner missed, as the user named it. */
  const logManual = useCallback(
    (printing: PrintingOption, snapshot: FrameSnapshot) => {
      const finish = chooseFinish(printing.finishes, settingsRef.current.preferFoil)
      const blank: ScanEntry = {
        id: newEntryId(),
        cardKey: printing.scryfallId,
        illustrationId: printing.illustrationId,
        name: printing.name,
        scryfallId: printing.scryfallId,
        setCode: printing.setCode,
        setName: printing.setName,
        collectorNumber: printing.collectorNumber,
        rarity: printing.rarity,
        finish,
        finishes: printing.finishes,
        language: printing.lang,
        quantity: 1,
        prices: printing.prices,
        imageUrl: printing.imageUrl,
        resolved: true,
        scannedAt: Date.now(),
      }
      const entry = withPrinting(blank, printing, finish)
      const version = bundleVersionRef.current
      if (snapshot.image && version) {
        entry.training = manualCapture(
          newEntryId(),
          snapshot.quad,
          snapshot.candidate,
          FRAME_SIZE,
          version,
        )
        void uploadTrainingSample(
          trainingSample(entry.training, printing.scryfallId, finish, snapshot.image),
        )
        // A card the scanner missed often had a bad outline, or none: a card-shaped start.
        if (settingsRef.current.checkOutlines) {
          pausedRef.current = true
          setOutlineCheck({
            entryId: entry.id,
            name: entry.name,
            image: snapshot.image,
            quad: snapshot.quad ?? centredOutline(FRAME_SIZE),
          })
        }
      }
      // Whatever the scanner was seeing is this card: do not auto-log it right after.
      trackerRef.current = markLogged(
        trackerRef.current,
        snapshot.candidate ? cardKey(snapshot.candidate.id) : null,
      )
      setEntries((list) => [entry, ...list])
      playScanSound(soundForPrice(printing.prices[finish], settingsRef.current))
    },
    [setEntries],
  )

  /** "Wrong card?": the entry becomes a different card; its capture is relabelled. */
  const replaceCard = useCallback(
    (id: string, printing: PrintingOption) => {
      const entry = entriesRef.current.find((candidate) => candidate.id === id)
      if (!entry) return
      const next: ScanEntry = {
        ...withPrinting(
          entry,
          printing,
          chooseFinish(printing.finishes, settingsRef.current.preferFoil),
        ),
        cardKey: printing.scryfallId,
        illustrationId: printing.illustrationId,
        training: entry.training ? { ...entry.training, face: "" } : entry.training,
      }
      relabel(next)
      updateEntry(id, () => next)
    },
    [relabel, updateEntry],
  )

  /** The user confirmed or corrected the outline: resend the capture as ground truth. */
  const saveOutline = useCallback(
    (quad: Quad) => {
      const entry = outlineCheck
        ? entriesRef.current.find((candidate) => candidate.id === outlineCheck.entryId)
        : undefined
      setOutlineCheck(null)
      if (!entry?.training) return
      const next = { ...entry, training: withCheckedOutline(entry.training, quad) }
      relabel(next)
      updateEntry(entry.id, () => next)
    },
    [outlineCheck, relabel, updateEntry],
  )

  /** Leaves the detector's outline as it was: still a label, not detector ground truth. */
  const skipOutline = useCallback(() => setOutlineCheck(null), [])

  /** Opens the back-face picker for a token entry, e.g. to change an earlier pick. */
  const pickBackFace = useCallback((id: string) => {
    const entry = entriesRef.current.find((candidate) => candidate.id === id)
    if (entry) setBackFacePick(entry)
  }, [])

  /** The user named the token's other side, or `null` for a single-sided token. */
  const setBackFace = useCallback(
    (back: ScanBackFace | null) => {
      const entry = backFacePick
      setBackFacePick(null)
      if (entry) updateEntry(entry.id, (current) => ({ ...current, back }))
    },
    [backFacePick, updateEntry],
  )

  /** Dismissing the picker leaves the back unknown; the chip offers it again. */
  const dismissBackFace = useCallback(() => setBackFacePick(null), [])

  const clear = useCallback(() => {
    trackerRef.current = forgetLastLogged(trackerRef.current)
    setEntries([])
  }, [setEntries])

  /** Queues the list as CSV for the collection import overlay and opens it. */
  const addToCollection = useCallback(() => {
    if (entriesRef.current.length === 0) return
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")
    queueSharedImport({
      text: scanListCsv(entriesRef.current),
      fileName: `manavault-scan-${stamp}.csv`,
      mimeType: "text/csv",
      source: "scanner",
    })
    stop()
    // A full page load leaves the cross-origin-isolated scanner document behind.
    window.location.assign("/collection?importFile=true")
  }, [stop])

  return {
    camera,
    recognizer,
    view,
    asleep,
    wake,
    entries,
    settings,
    setSettings,
    start,
    stop,
    logArmed,
    addCopy,
    setQuantity,
    setFinish,
    setLanguage,
    setPurchasePrice,
    setPrinting,
    replaceCard,
    snapshotFrame,
    logManual,
    outlineCheck,
    saveOutline,
    skipOutline,
    backFacePick,
    pickBackFace,
    setBackFace,
    dismissBackFace,
    removeEntry,
    clear,
    addToCollection,
  }
}

export type ScanSession = ReturnType<typeof useScanSession>
