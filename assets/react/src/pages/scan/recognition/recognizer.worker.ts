/// <reference lib="webworker" />
/**
 * Loads the scanner bundle and identifies camera frames off the main thread.
 *
 * Inference runs on WASM threads when the `/scan` document is cross-origin isolated (see
 * `lib/cross-origin-isolation.ts`); without isolation there is no SharedArrayBuffer and the
 * runtime falls back to one thread, which still runs in the website, the installed PWA and the
 * Capacitor WebView alike. WebGPU was measured upstream and was slower and missing operators.
 */
import * as ort from "onnxruntime-web/wasm"
// The standalone runtime module rather than the factory embedded in the `onnxruntime-web/wasm`
// bundle: the pthread workers are spawned from this module's own URL, so it has to be a file.
import runtimeModuleUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url"
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url"
import { fetchBundleFile, pruneBundleCaches } from "./bundle-cache"
import type { BundleFile, BundleInfo, WorkerRequest, WorkerResponse } from "./messages"
import type { GalleryArt, RgbaImage } from "./pipeline"
import { createRecognizer, type Recognizer } from "./recognizer"

ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: runtimeModuleUrl }
ort.env.logLevel = "warning"

let recognizer: Recognizer | null = null

function reply(message: WorkerResponse) {
  self.postMessage(message)
}

async function load(bundle: BundleInfo, threads: number) {
  const started = performance.now()
  // `0` lets the runtime pick from the core count (it also picks 1 when not isolated).
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(0, Math.round(threads)) : 1
  void pruneBundleCaches(bundle.version)

  const names: BundleFile[] = ["detector.onnx", "embed.onnx", "search.onnx", "arts.json"]
  // Per file: bytes received and expected size (manifest size, else Content-Length).
  const progress = new Map<string, { loaded: number; total: number }>(
    names.map((name) => [name, { loaded: 0, total: bundle.sizes[name] ?? 0 }]),
  )
  let allCached = true
  const report = () => {
    let loaded = 0
    let total = 0
    for (const file of progress.values()) {
      loaded += file.loaded
      total += Math.max(file.total, file.loaded)
    }
    reply({ type: "progress", loaded, total, cached: allCached })
  }
  const download = async (key: string, url: string, size?: number) => {
    const { bytes, cached } = await fetchBundleFile(url, {
      version: bundle.version,
      size,
      onProgress: (loaded, total) => {
        progress.set(key, { loaded, total: total ?? size ?? 0 })
        report()
      },
    })
    allCached &&= cached
    return bytes
  }

  // The runtime binary is cached next to the models so a warm start makes no big requests.
  const [runtime, detector, embed, search, arts] = await Promise.all([
    download("runtime", wasmUrl),
    ...names.map((name) => download(name, bundle.files[name], bundle.sizes[name])),
  ])
  ort.env.wasm.wasmBinary = runtime

  const gallery = JSON.parse(new TextDecoder().decode(arts)) as GalleryArt[]
  recognizer = await createRecognizer(
    ort,
    { detector: detector!, embed: embed!, search: search! },
    bundle.constants,
    gallery,
  )
  reply({
    type: "ready",
    version: bundle.version,
    arts: gallery.length,
    masked: recognizer.masked,
    ms: performance.now() - started,
    threads: ort.env.wasm.numThreads ?? 1,
  })
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  try {
    if (request.type === "load") {
      await load(request.bundle, request.threads)
    } else if (request.type === "identify") {
      if (!recognizer) throw new Error("scanner bundle not loaded")
      const image: RgbaImage = {
        data: new Uint8ClampedArray(request.rgba),
        width: request.width,
        height: request.height,
      }
      reply({
        type: "identified",
        id: request.id,
        result: await recognizer.identify(image, request.scope ?? "all"),
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (request.type === "load") reply({ type: "load_failed", message })
    else reply({ type: "failed", id: request.id, message })
  }
}
