import { useCallback, useEffect, useRef, useState } from "react"
import type { RgbaImage } from "./recognition/pipeline"

export type CameraState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "live"; width: number; height: number }
  | {
      status: "error"
      reason: "insecure" | "unsupported" | "denied" | "missing" | "failed"
      message: string
    }

/**
 * What the camera is actually delivering, shown in the scanner settings to diagnose blur and
 * sudden zooms: a lens switch or a resolution change shows up here.
 */
export interface CameraDiagnostics {
  /** The device label, e.g. "camera2 0, facing back" on Android. */
  label: string
  width: number
  height: number
  frameRate: number | null
  focusMode: string | null
  zoom: number | null
  zoomRange: { min: number; max: number } | null
  /** Times the delivered resolution changed since the camera started. */
  resolutionChanges: number
}

/** Frames sent to the recognizer are this many pixels square. */
export const FRAME_SIZE = 640
const FRAME_BACKGROUND = "rgb(18, 18, 18)"

/**
 * How the whole video fits into the square frame (like `object-fit: contain`): the frame shows
 * the camera's full field of view, so a card anywhere in view is found, for example one that
 * sits off-centre under a scanner stand's lens. `scale` maps video pixels to frame pixels.
 */
export function frameGeometry(videoWidth: number, videoHeight: number) {
  const scale = FRAME_SIZE / Math.max(videoWidth, videoHeight)
  return {
    scale,
    offsetX: (FRAME_SIZE - videoWidth * scale) / 2,
    offsetY: (FRAME_SIZE - videoHeight * scale) / 2,
  }
}

/**
 * The rear camera through getUserMedia, which the website, the PWA and the Capacitor
 * WebView all support (the native shells declare the camera permission).
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [state, setState] = useState<CameraState>({ status: "idle" })
  const [diagnostics, setDiagnostics] = useState<CameraDiagnostics | null>(null)
  // Bumped by every start and stop, so a getUserMedia call that resolves after a newer
  // start or a stop (for example React StrictMode's mount/unmount/mount) releases its stream.
  const generationRef = useRef(0)

  const stop = useCallback(() => {
    generationRef.current += 1
    for (const track of streamRef.current?.getTracks() ?? []) track.stop()
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setState({ status: "idle" })
  }, [])

  const start = useCallback(async () => {
    if (streamRef.current) return
    if (!window.isSecureContext) {
      setState({
        status: "error",
        reason: "insecure",
        message: "The camera needs a secure (HTTPS) connection to ManaVault.",
      })
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({
        status: "error",
        reason: "unsupported",
        message: "This browser has no camera access.",
      })
      return
    }
    const generation = (generationRef.current += 1)
    setState({ status: "starting" })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // More than 30 fps only costs battery: frames are identified a few times a second.
          frameRate: { ideal: 30, max: 30 },
        },
      })
      if (generation !== generationRef.current) {
        for (const track of stream.getTracks()) track.stop()
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error("Camera view is not mounted")
      video.srcObject = stream
      await video.play()
      if (generation !== generationRef.current) return
      await applyFocus(stream, { focusMode: "continuous" })
      setState({ status: "live", width: video.videoWidth, height: video.videoHeight })
    } catch (error) {
      if (generation !== generationRef.current) return
      for (const track of streamRef.current?.getTracks() ?? []) track.stop()
      streamRef.current = null
      setState(cameraError(error))
    }
  }, [])

  useEffect(() => stop, [stop])

  const live = state.status === "live"
  useEffect(() => {
    const video = videoRef.current
    const track = streamRef.current?.getVideoTracks()[0]
    if (!live || !video || !track) {
      setDiagnostics(null)
      return
    }
    let changes = 0
    let last = `${video.videoWidth}x${video.videoHeight}`
    const update = () => {
      const size = `${video.videoWidth}x${video.videoHeight}`
      if (size !== last) changes += 1
      last = size
      const next = cameraDiagnostics(track, video, changes)
      setDiagnostics((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      )
    }
    update()
    video.addEventListener("resize", update)
    // Focus and zoom can change without a resize; a slow poll keeps the readout honest.
    const poll = window.setInterval(update, 2000)
    return () => {
      video.removeEventListener("resize", update)
      window.clearInterval(poll)
    }
  }, [live])

  /** The whole current video frame fitted into the square frame, or null before video. */
  const grabFrame = useCallback((): RgbaImage | null => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || !video.videoWidth) return null
    canvasRef.current ??= document.createElement("canvas")
    const canvas = canvasRef.current
    // Assigning a size reallocates the canvas even when it is unchanged.
    if (canvas.width !== FRAME_SIZE) canvas.width = FRAME_SIZE
    if (canvas.height !== FRAME_SIZE) canvas.height = FRAME_SIZE
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) return null
    const { scale, offsetX, offsetY } = frameGeometry(video.videoWidth, video.videoHeight)
    context.fillStyle = FRAME_BACKGROUND
    context.fillRect(0, 0, FRAME_SIZE, FRAME_SIZE)
    context.drawImage(video, offsetX, offsetY, video.videoWidth * scale, video.videoHeight * scale)
    const pixels = context.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE)
    return { data: pixels.data, width: FRAME_SIZE, height: FRAME_SIZE }
  }, [])

  /**
   * The last grabbed frame as a JPEG data URL within the server's 190 KB limit, for training
   * uploads. The canvas still holds that frame until the next `grabFrame`.
   */
  const lastFrameJpeg = useCallback((): string | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    for (const quality of [0.9, 0.8, 0.7, 0.55, 0.4]) {
      const url = canvas.toDataURL("image/jpeg", quality)
      if (url.length - "data:image/jpeg;base64,".length <= 190_000) return url
    }
    return null
  }, [])

  /**
   * Focuses at a point of the camera image (0–1 from the top left), then returns to
   * continuous autofocus. Only where the camera supports it (Chrome on Android); a no-op
   * elsewhere.
   */
  const focusAt = useCallback(async (x: number, y: number) => {
    const stream = streamRef.current
    if (!stream) return
    const point = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
    if (await applyFocus(stream, { pointsOfInterest: [point], focusMode: "single-shot" })) {
      window.setTimeout(() => {
        if (streamRef.current === stream) void applyFocus(stream, { focusMode: "continuous" })
      }, 2500)
    }
  }, [])

  return { videoRef, state, diagnostics, start, stop, grabFrame, lastFrameJpeg, focusAt }
}

/** Focus constraints from the Image Capture spec, not yet in TypeScript's DOM types. */
interface FocusConstraints {
  focusMode?: "continuous" | "single-shot" | "manual"
  pointsOfInterest?: { x: number; y: number }[]
}

/** Applies focus constraints the camera supports; false when it supports none of them. */
async function applyFocus(stream: MediaStream, wanted: FocusConstraints): Promise<boolean> {
  const track = stream.getVideoTracks()[0]
  const capabilities = (track?.getCapabilities?.() ?? {}) as { focusMode?: string[] }
  const modes = capabilities.focusMode ?? []
  if (!track || (wanted.focusMode && !modes.includes(wanted.focusMode))) return false
  try {
    await track.applyConstraints({ advanced: [wanted as MediaTrackConstraintSet] })
    return true
  } catch {
    return false
  }
}

function cameraDiagnostics(
  track: MediaStreamTrack,
  video: HTMLVideoElement,
  resolutionChanges: number,
): CameraDiagnostics {
  // `zoom` and `focusMode` come from the Image Capture spec, not yet in TypeScript's DOM types.
  const settings = track.getSettings() as MediaTrackSettings & { zoom?: number; focusMode?: string }
  const capabilities = (track.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number } }
  return {
    label: track.label,
    width: video.videoWidth,
    height: video.videoHeight,
    frameRate: settings.frameRate ?? null,
    focusMode: settings.focusMode ?? null,
    zoom: settings.zoom ?? null,
    zoomRange: capabilities.zoom
      ? { min: capabilities.zoom.min, max: capabilities.zoom.max }
      : null,
    resolutionChanges,
  }
}

function cameraError(error: unknown): CameraState {
  const name = error instanceof DOMException ? error.name : ""
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      status: "error",
      reason: "denied",
      message: "Camera access was blocked. Allow the camera for ManaVault and try again.",
    }
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { status: "error", reason: "missing", message: "No camera was found on this device." }
  }
  return {
    status: "error",
    reason: "failed",
    message: error instanceof Error ? error.message : "The camera could not start.",
  }
}
