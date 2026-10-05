import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react"
import { cn } from "../../lib/utils"
import { inImage, previewRect, type PreviewFraming, type Rect, type Size } from "./preview-framing"
import type { Quad } from "./recognition/pipeline"
import { frameGeometry } from "./use-camera"
import type { ScanView } from "./scan-view"

/**
 * Camera preview filling the whole screen, with the controls floating over it. The video and
 * the SVG overlay share one box sized to the whole camera image, positioned so the `framing`
 * crop lands on screen; the recognizer still scans the parts off screen. The SVG uses the
 * video's pixel space, so detected quads line up with the card; the brackets frame the part
 * that is on screen.
 */
/** Transparent poster: without one, Android WebView shows a large play icon before playback. */
const BLANK_POSTER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

export function ScanViewfinder({
  videoRef,
  view,
  framing,
  onFocusAt,
  onTap,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  view: ScanView
  framing: PreviewFraming
  /** Tap to focus: the tapped point of the camera image, 0–1 from the top left. */
  onFocusAt?: (x: number, y: number) => void
  /** Any tap on the preview, after focusing; tokens mode logs the token in view. */
  onTap?: () => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const safeAreaRef = useRef<HTMLDivElement | null>(null)
  const size = useVideoSize(videoRef)
  const container = useElementBox(containerRef)
  const safeArea = useElementBox(safeAreaRef)
  const visible = size && container ? previewRect(size, container, framing) : null
  const scale = visible && container ? container.width / visible.width : 1
  // The brackets frame what is on screen, clear of the status and gesture bars.
  const framed = visible && container && safeArea ? inImage(safeArea, visible, container) : visible
  const [focus, setFocus] = useState<{ x: number; y: number; key: number } | null>(null)

  function handlePointerDown(event: PointerEvent<HTMLVideoElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return
    onFocusAt?.((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height)
    onTap?.()
    setFocus({ x: event.clientX, y: event.clientY, key: event.timeStamp })
  }

  useEffect(() => {
    if (!focus) return
    const timeout = window.setTimeout(() => setFocus(null), 900)
    return () => window.clearTimeout(timeout)
  }, [focus])

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-base-100">
      {/* Sized to the camera image's own aspect ratio, so there is no letterbox area: Android
          WebView paints a video's letterbox bars above overlapping page content. */}
      <div
        className={cn("absolute", !visible && "invisible inset-0")}
        style={
          size && visible
            ? {
                left: -visible.x * scale,
                top: -visible.y * scale,
                width: size.width * scale,
                height: size.height * scale,
              }
            : undefined
        }
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full"
          poster={BLANK_POSTER}
          onPointerDown={handlePointerDown}
          autoPlay
          muted
          playsInline
          aria-label="Camera preview"
        />
        {size && framed ? <Overlay {...size} framed={framed} view={view} /> : null}
      </div>
      <div
        ref={safeAreaRef}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[var(--safe-bottom)] left-[var(--safe-left)] right-[var(--safe-right)] top-[var(--safe-top)]"
      />
      {focus ? (
        <span
          key={focus.key}
          aria-hidden="true"
          className="scan-focus-ring pointer-events-none fixed h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90"
          style={{ left: focus.x, top: focus.y }}
        />
      ) : null}
    </div>
  )
}

function Overlay({
  width,
  height,
  framed,
  view,
}: {
  width: number
  height: number
  framed: Rect
  view: ScanView
}) {
  const { scale, offsetX, offsetY } = frameGeometry(width, height)
  const short = Math.min(framed.width, framed.height)
  const inset = short * 0.03
  const corner = short * 0.12
  const stroke = Math.max(3, short * 0.006)
  const toVideo = (quad: Quad) =>
    quad.map(([x, y]) => `${(x - offsetX) / scale},${(y - offsetY) / scale}`).join(" ")
  const tone =
    view.outcome === "accept"
      ? "text-success"
      : view.outcome === "duplicate"
        ? "text-base-content"
        : view.outcome === "outside-lock"
          ? "text-error"
          : view.outcome === "ready"
            ? "text-info"
            : "text-warning"
  const [l, t, r, b] = [
    framed.x + inset,
    framed.y + inset,
    framed.x + framed.width - inset,
    framed.y + framed.height - inset,
  ]

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        className="text-white/70"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        d={[
          `M ${l} ${t + corner} V ${t} H ${l + corner}`,
          `M ${r - corner} ${t} H ${r} V ${t + corner}`,
          `M ${r} ${b - corner} V ${b} H ${r - corner}`,
          `M ${l + corner} ${b} H ${l} V ${b - corner}`,
        ].join(" ")}
      />
      {view.quad ? (
        <polygon
          key={view.outcome === "accept" ? `logged-${view.logged}` : "tracking"}
          className={cn(tone, view.outcome === "accept" && "scan-quad-logged")}
          points={toVideo(view.quad)}
          fill="currentColor"
          fillOpacity={view.outcome === "accept" ? 0.18 : 0.06}
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  )
}

/** An element's box relative to its offset parent, kept current as it resizes. */
function useElementBox(ref: RefObject<HTMLElement | null>) {
  const [box, setBox] = useState<Rect | null>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      const { offsetLeft: x, offsetTop: y, offsetWidth: width, offsetHeight: height } = element
      setBox(width && height ? { x, y, width, height } : null)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return box
}

function useVideoSize(videoRef: RefObject<HTMLVideoElement | null>) {
  const [size, setSize] = useState<Size | null>(null)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const update = () =>
      setSize(video.videoWidth ? { width: video.videoWidth, height: video.videoHeight } : null)
    update()
    video.addEventListener("loadedmetadata", update)
    video.addEventListener("resize", update)
    video.addEventListener("emptied", update)
    return () => {
      video.removeEventListener("loadedmetadata", update)
      video.removeEventListener("resize", update)
      video.removeEventListener("emptied", update)
    }
  }, [videoRef])
  return size
}
