import { useCallback, useEffect, useRef, useState } from "react"
import type { BundleInfo, Identification, WorkerRequest, WorkerResponse } from "./messages"
import type { RgbaImage, SearchScope } from "./pipeline"

export type RecognizerState =
  | { status: "idle" }
  | { status: "checking" }
  /** No bundle is installed on the server yet (`/api/scanner/bundle` → 404). */
  | { status: "unavailable" }
  | { status: "loading"; version: string; loaded: number; total: number; cached: boolean }
  | {
      status: "ready"
      version: string
      arts: number
      loadMs: number
      threads: number
      /** The bundle's `search.onnx` takes a gallery mask (see `Recognizer.masked`). */
      masked: boolean
    }
  | { status: "failed"; message: string }

export interface RecognizerOptions {
  /** WASM threads for inference; `0` lets the runtime choose. See `WorkerRequest`. */
  threads: number
}

interface Pending {
  resolve: (result: Identification) => void
  reject: (error: Error) => void
}

/**
 * Owns the recognition worker while the scanner page is open. `start` asks the server which
 * bundle is current (so a new model is picked up on the next scanner start), then the worker
 * loads it from Cache Storage or downloads it. `identify` resolves with one frame's result.
 */
export function useRecognizer() {
  const [state, setState] = useState<RecognizerState>({ status: "idle" })
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef(new Map<number, Pending>())
  const nextIdRef = useRef(0)

  const launch = useCallback((threads: number) => {
    setState({ status: "checking" })
    let worker: Worker
    try {
      worker = new Worker(new URL("./recognizer.worker.ts", import.meta.url), { type: "module" })
    } catch (error) {
      setState({ status: "failed", message: errorMessage(error) })
      return
    }
    workerRef.current = worker
    const pending = pendingRef.current
    // A runtime that failed to start with threads cannot be re-initialized in place; a fresh
    // worker on one thread keeps the scanner usable.
    const retryOnOneThread = (message: string) => {
      if (threads === 1 || workerRef.current !== worker) return false
      console.warn(
        `Scanner failed to start with ${threads || "auto"} threads; retrying with 1:`,
        message,
      )
      worker.terminate()
      workerRef.current = null
      launch(1)
      return true
    }

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      switch (message.type) {
        case "progress":
          setState((current) =>
            current.status === "loading"
              ? {
                  ...current,
                  loaded: message.loaded,
                  total: message.total,
                  cached: message.cached,
                }
              : current,
          )
          break
        case "ready":
          setState({
            status: "ready",
            version: message.version,
            arts: message.arts,
            loadMs: message.ms,
            threads: message.threads,
            masked: message.masked,
          })
          break
        case "load_failed":
          if (!retryOnOneThread(message.message))
            setState({ status: "failed", message: message.message })
          break
        case "identified":
          settle(pending, message.id)?.resolve(message.result)
          break
        case "failed":
          settle(pending, message.id)?.reject(new Error(message.message))
          break
      }
    }
    worker.onerror = (event) => {
      const message = event.message
        ? `${event.message} (${event.filename}:${event.lineno})`
        : "The scanner worker crashed"
      for (const id of pending.keys()) settle(pending, id)?.reject(new Error(message))
      if (!retryOnOneThread(message)) setState({ status: "failed", message })
    }

    fetch("/api/scanner/bundle", { credentials: "same-origin", cache: "no-cache" })
      .then(async (response) => {
        if (workerRef.current !== worker) return
        if (response.status === 404) {
          setState({ status: "unavailable" })
          return
        }
        if (!response.ok) throw new Error(`Scanner bundle: HTTP ${response.status}`)
        const { data } = (await response.json()) as { data: BundleInfo }
        setState({ status: "loading", version: data.version, loaded: 0, total: 0, cached: false })
        post(worker, { type: "load", bundle: data, threads })
      })
      .catch((error: unknown) => {
        if (workerRef.current !== worker) return
        setState({ status: "failed", message: errorMessage(error) })
      })
  }, [])

  const start = useCallback(
    ({ threads }: RecognizerOptions) => {
      if (workerRef.current) return
      launch(threads)
    },
    [launch],
  )

  const stop = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    const pending = pendingRef.current
    for (const id of pending.keys()) settle(pending, id)?.reject(new Error("Scanner closed"))
    setState({ status: "idle" })
  }, [])

  useEffect(() => stop, [stop])

  /** Transfers the frame's pixels to the worker; `image` is unusable afterwards. */
  const identify = useCallback((image: RgbaImage, scope: SearchScope = "all") => {
    return new Promise<Identification>((resolve, reject) => {
      const worker = workerRef.current
      if (!worker) return reject(new Error("Scanner not running"))
      const id = (nextIdRef.current += 1)
      pendingRef.current.set(id, { resolve, reject })
      const rgba = image.data.buffer as ArrayBuffer
      post(
        worker,
        { type: "identify", id, rgba, width: image.width, height: image.height, scope },
        [rgba],
      )
    })
  }, [])

  return { state, start, stop, identify }
}

function post(worker: Worker, message: WorkerRequest, transfer: Transferable[] = []) {
  worker.postMessage(message, transfer)
}

function settle(pending: Map<number, Pending>, id: number) {
  const entry = pending.get(id)
  pending.delete(id)
  return entry
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
