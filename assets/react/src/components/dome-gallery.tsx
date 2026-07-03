import { useGesture } from "@use-gesture/react"
import { X } from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { cn } from "../lib/utils"
import { CardTile } from "./card-tile"
import "./dome-gallery.css"

export type DomeGalleryCard = {
  id: string
  name: string
  artCropUrl?: string | null
  imageUrl?: string | null
  collectorNumber?: string | null
  finish?: string | null
  finishes?: readonly (string | null)[] | null
  ownedCount?: number | null
  priceText?: ReactNode
  rarity?: string | null
  setCode?: string | null
  setName?: string | null
  typeLine?: string | null
}

type FitBasis = "auto" | "min" | "max" | "width" | "height"

type DomeGalleryProps = {
  cards: readonly DomeGalleryCard[]
  className?: string
  emptyState?: ReactNode
  fit?: number
  fitBasis?: FitBasis
  minRadius?: number
  maxRadius?: number
  padFactor?: number
  overlayBlurColor?: string
  maxVerticalRotationDeg?: number
  dragSensitivity?: number
  enlargeTransitionMs?: number
  segments?: number
  dragDampening?: number
  openedImageWidth?: string
  openedImageHeight?: string
  imageBorderRadius?: string
  openedImageBorderRadius?: string
  grayscale?: boolean
}

type GalleryCard = DomeGalleryCard & {
  alt: string
  cropUrl: string
  setLabel: string | null
}

type DomeGalleryItem = GalleryCard & {
  x: number
  y: number
  sizeX: number
  sizeY: number
  slotKey: string
}

const DEFAULTS = {
  maxVerticalRotationDeg: 5,
  dragSensitivity: 20,
  enlargeTransitionMs: 300,
  segments: 35,
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const wrapAngleSigned = (degrees: number) => {
  const angle = (((degrees + 180) % 360) + 360) % 360
  return angle - 180
}

function normalizeGalleryCards(cards: readonly DomeGalleryCard[]): GalleryCard[] {
  return cards
    .map((card) => {
      const cropUrl = card.artCropUrl || card.imageUrl || ""
      if (!cropUrl) return null
      const setLabel = formatSetLabel(card)
      return {
        ...card,
        alt: [card.name, setLabel].filter(Boolean).join(" "),
        cropUrl,
        fullImageUrl: card.imageUrl || cropUrl,
        setLabel,
      }
    })
    .filter((card): card is GalleryCard => Boolean(card))
}

function formatSetLabel(card: Pick<DomeGalleryCard, "collectorNumber" | "setCode">) {
  const setCode = card.setCode?.toUpperCase()
  if (setCode && card.collectorNumber) return `${setCode} #${card.collectorNumber}`
  return setCode || card.collectorNumber || null
}

function firstFinish(card: Pick<DomeGalleryCard, "finish" | "finishes">) {
  return card.finish || card.finishes?.find((finish): finish is string => Boolean(finish)) || null
}

function buildItems(pool: readonly GalleryCard[], segmentCount: number): DomeGalleryItem[] {
  const xCols = Array.from({ length: segmentCount }, (_, index) => -37 + index * 2)
  const evenYs = [-4, -2, 0, 2, 4]
  const oddYs = [-3, -1, 1, 3, 5]

  const coords = xCols.flatMap((x, columnIndex) => {
    const ys = columnIndex % 2 === 0 ? evenYs : oddYs
    return ys.map((y) => ({ x, y, sizeX: 2, sizeY: 2 }))
  })

  const totalSlots = coords.length
  if (pool.length === 0) return []

  if (pool.length > totalSlots) {
    console.warn(
      `[DomeGallery] Provided card count (${pool.length}) exceeds available tiles (${totalSlots}). Some cards will not be shown.`,
    )
  }

  const usedCards = Array.from({ length: totalSlots }, (_, index) => pool[index % pool.length])

  for (let index = 1; index < usedCards.length; index += 1) {
    if (usedCards[index].cropUrl === usedCards[index - 1].cropUrl) {
      for (let swapIndex = index + 1; swapIndex < usedCards.length; swapIndex += 1) {
        if (usedCards[swapIndex].cropUrl !== usedCards[index].cropUrl) {
          const tmp = usedCards[index]
          usedCards[index] = usedCards[swapIndex]
          usedCards[swapIndex] = tmp
          break
        }
      }
    }
  }

  return coords.map((coord, index) => ({
    ...coord,
    ...usedCards[index],
    slotKey: `${coord.x},${coord.y},${usedCards[index].id},${index}`,
  }))
}

function getEventPoint(event: Event) {
  if ("clientX" in event && "clientY" in event) {
    return { x: Number(event.clientX), y: Number(event.clientY) }
  }

  const touchEvent = event as TouchEvent
  const touch = touchEvent.touches?.[0] || touchEvent.changedTouches?.[0]
  return touch ? { x: touch.clientX, y: touch.clientY } : null
}

export function DomeGallery({
  cards,
  className,
  emptyState,
  fit = 0.5,
  fitBasis = "auto",
  minRadius = 800,
  maxRadius = Number.POSITIVE_INFINITY,
  padFactor = 0.25,
  overlayBlurColor = "#120F17",
  maxVerticalRotationDeg = DEFAULTS.maxVerticalRotationDeg,
  dragSensitivity = DEFAULTS.dragSensitivity,
  enlargeTransitionMs = DEFAULTS.enlargeTransitionMs,
  segments = DEFAULTS.segments,
  dragDampening = 2,
  openedImageWidth = "250px",
  openedImageHeight = "350px",
  imageBorderRadius = "30px",
  openedImageBorderRadius = "30px",
  grayscale = true,
}: DomeGalleryProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const mainRef = useRef<HTMLDivElement | null>(null)
  const sphereRef = useRef<HTMLDivElement | null>(null)

  const rotationRef = useRef({ x: 0, y: 0 })
  const startRotRef = useRef({ x: 0, y: 0 })
  const startPosRef = useRef<{ x: number; y: number } | null>(null)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const inertiaRAF = useRef<number | null>(null)
  const lastDragEndAt = useRef(0)
  const openedCardRef = useRef<GalleryCard | null>(null)

  const [openedCard, setOpenedCard] = useState<GalleryCard | null>(null)
  const galleryCards = useMemo(() => normalizeGalleryCards(cards), [cards])
  const safeSegments = Math.max(
    1,
    Math.floor(Number.isFinite(segments) ? segments : DEFAULTS.segments),
  )
  const items = useMemo(() => buildItems(galleryCards, safeSegments), [galleryCards, safeSegments])

  const applyTransform = useCallback((xDeg: number, yDeg: number) => {
    const el = sphereRef.current
    if (!el) return
    el.style.transform = `translateZ(calc(var(--radius) * -1)) rotateX(${xDeg}deg) rotateY(${yDeg}deg)`
  }, [])

  const stopInertia = useCallback(() => {
    if (!inertiaRAF.current) return
    cancelAnimationFrame(inertiaRAF.current)
    inertiaRAF.current = null
  }, [])

  const closeOpenedCard = useCallback(() => {
    setOpenedCard(null)
  }, [])

  const openCard = useCallback(
    (card: GalleryCard) => {
      stopInertia()
      openedCardRef.current = card
      setOpenedCard(card)
    },
    [stopInertia],
  )

  const startInertia = useCallback(
    (vx: number, vy: number) => {
      const maxVelocity = 1.4
      let vX = clamp(vx, -maxVelocity, maxVelocity) * 80
      let vY = clamp(vy, -maxVelocity, maxVelocity) * 80
      let frames = 0
      const dampening = clamp(dragDampening ?? 0.6, 0, 1)
      const frictionMul = 0.94 + 0.055 * dampening
      const stopThreshold = 0.015 - 0.01 * dampening
      const maxFrames = Math.round(90 + 270 * dampening)

      const step = () => {
        vX *= frictionMul
        vY *= frictionMul
        if (Math.abs(vX) < stopThreshold && Math.abs(vY) < stopThreshold) {
          inertiaRAF.current = null
          return
        }
        if (frames + 1 > maxFrames) {
          inertiaRAF.current = null
          return
        }

        frames += 1
        const nextX = clamp(
          rotationRef.current.x - vY / 200,
          -maxVerticalRotationDeg,
          maxVerticalRotationDeg,
        )
        const nextY = wrapAngleSigned(rotationRef.current.y + vX / 200)
        rotationRef.current = { x: nextX, y: nextY }
        applyTransform(nextX, nextY)
        inertiaRAF.current = requestAnimationFrame(step)
      }

      stopInertia()
      inertiaRAF.current = requestAnimationFrame(step)
    },
    [applyTransform, dragDampening, maxVerticalRotationDeg, stopInertia],
  )

  useEffect(() => {
    openedCardRef.current = openedCard
  }, [openedCard])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const resizeObserver = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr) return

      const width = Math.max(1, cr.width)
      const height = Math.max(1, cr.height)
      const minDim = Math.min(width, height)
      const maxDim = Math.max(width, height)
      const aspect = width / height
      let basis: number

      switch (fitBasis) {
        case "min":
          basis = minDim
          break
        case "max":
          basis = maxDim
          break
        case "width":
          basis = width
          break
        case "height":
          basis = height
          break
        case "auto":
        default:
          basis = aspect >= 1.3 ? width : minDim
          break
      }

      const maxRadiusValue = Number.isFinite(maxRadius) ? maxRadius : Number.POSITIVE_INFINITY
      const heightGuard = height * 1.35
      const radius = Math.round(
        clamp(Math.min(basis * fit, heightGuard), minRadius, maxRadiusValue),
      )
      console.log(radius)
      const viewerPad = Math.max(8, Math.round(minDim * padFactor))

      root.style.setProperty("--radius", `${radius}px`)
      root.style.setProperty("--viewer-pad", `${viewerPad}px`)
      root.style.setProperty("--overlay-blur-color", overlayBlurColor)
      root.style.setProperty("--tile-radius", imageBorderRadius)
      root.style.setProperty("--enlarge-radius", openedImageBorderRadius)
      root.style.setProperty("--image-filter", grayscale ? "grayscale(1)" : "none")
      applyTransform(rotationRef.current.x, rotationRef.current.y)
    })

    resizeObserver.observe(root)
    return () => resizeObserver.disconnect()
  }, [
    applyTransform,
    fit,
    fitBasis,
    grayscale,
    imageBorderRadius,
    maxRadius,
    minRadius,
    openedImageBorderRadius,
    overlayBlurColor,
    padFactor,
  ])

  useEffect(() => {
    applyTransform(rotationRef.current.x, rotationRef.current.y)
  }, [applyTransform])

  useEffect(() => {
    return () => stopInertia()
  }, [stopInertia])

  useEffect(() => {
    if (!openedCard) return

    document.body.classList.add("dome-gallery-scroll-lock")
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeOpenedCard()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.classList.remove("dome-gallery-scroll-lock")
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [closeOpenedCard, openedCard])

  useGesture(
    {
      onDragStart: ({ event }) => {
        if (openedCardRef.current) return
        const point = getEventPoint(event as Event)
        if (!point) return

        stopInertia()
        draggingRef.current = true
        movedRef.current = false
        startRotRef.current = { ...rotationRef.current }
        startPosRef.current = point
      },
      onDrag: ({ event, last, velocity = [0, 0], direction = [0, 0], movement }) => {
        if (openedCardRef.current || !draggingRef.current || !startPosRef.current) return
        const point = getEventPoint(event as Event)
        if (!point) return

        const dxTotal = point.x - startPosRef.current.x
        const dyTotal = point.y - startPosRef.current.y
        if (!movedRef.current && dxTotal * dxTotal + dyTotal * dyTotal > 16) movedRef.current = true

        const nextX = clamp(
          startRotRef.current.x - dyTotal / dragSensitivity,
          -maxVerticalRotationDeg,
          maxVerticalRotationDeg,
        )
        const nextY = wrapAngleSigned(startRotRef.current.y + dxTotal / dragSensitivity)
        if (rotationRef.current.x !== nextX || rotationRef.current.y !== nextY) {
          rotationRef.current = { x: nextX, y: nextY }
          applyTransform(nextX, nextY)
        }

        if (last) {
          draggingRef.current = false
          let [velocityMagnitudeX, velocityMagnitudeY] = velocity
          const [directionX, directionY] = direction
          let vx = velocityMagnitudeX * directionX
          let vy = velocityMagnitudeY * directionY

          if (Math.abs(vx) < 0.001 && Math.abs(vy) < 0.001 && Array.isArray(movement)) {
            const [mx, my] = movement
            vx = clamp((mx / dragSensitivity) * 0.02, -1.2, 1.2)
            vy = clamp((my / dragSensitivity) * 0.02, -1.2, 1.2)
          }

          if (Math.abs(vx) > 0.005 || Math.abs(vy) > 0.005) startInertia(vx, vy)
          if (movedRef.current) lastDragEndAt.current = performance.now()
          movedRef.current = false
        }
      },
    },
    { target: mainRef, eventOptions: { passive: true } },
  )

  const rootStyle = {
    "--segments-x": safeSegments,
    "--segments-y": safeSegments,
    "--overlay-blur-color": overlayBlurColor,
    "--tile-radius": imageBorderRadius,
    "--enlarge-radius": openedImageBorderRadius,
    "--image-filter": grayscale ? "grayscale(1)" : "none",
    "--opened-image-width": openedImageWidth,
    "--opened-image-height": openedImageHeight,
    "--enlarge-transition-ms": `${enlargeTransitionMs}ms`,
  } as CSSProperties

  if (items.length === 0) {
    return (
      <div className={cn("dome-gallery-empty", className)}>
        {emptyState || "No card art available."}
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className={cn("dome-gallery-root", className)}
      data-card-open={openedCard ? "true" : undefined}
      style={rootStyle}
    >
      <div ref={mainRef} className="dome-gallery-main" aria-label="Card art dome gallery">
        <div className="dome-gallery-stage">
          <div ref={sphereRef} className="dome-gallery-sphere">
            {items.map((item) => (
              <div
                key={item.slotKey}
                className="dome-gallery-item"
                data-src={item.cropUrl}
                data-offset-x={item.x}
                data-offset-y={item.y}
                data-size-x={item.sizeX}
                data-size-y={item.sizeY}
                style={
                  {
                    "--offset-x": item.x,
                    "--offset-y": item.y,
                    "--item-size-x": item.sizeX,
                    "--item-size-y": item.sizeY,
                  } as CSSProperties
                }
              >
                <button
                  className="dome-gallery-item__image"
                  type="button"
                  aria-label={`Open ${item.alt || item.name}`}
                  onClick={() => {
                    if (movedRef.current) return
                    if (performance.now() - lastDragEndAt.current < 80) return
                    draggingRef.current = false
                    openCard(item)
                  }}
                >
                  <img src={item.cropUrl} draggable={false} alt={item.alt} loading="lazy" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="dome-gallery-overlay" />
        <div className="dome-gallery-overlay dome-gallery-overlay--blur" />
        <div className="dome-gallery-edge-fade dome-gallery-edge-fade--top" />
        <div className="dome-gallery-edge-fade dome-gallery-edge-fade--bottom" />

        <div className="dome-gallery-viewer">
          <button
            type="button"
            className="dome-gallery-scrim"
            aria-label="Close card preview"
            onClick={closeOpenedCard}
          />
          {openedCard ? (
            <div
              className="dome-gallery-card-preview"
              role="dialog"
              aria-modal="true"
              aria-label={`${openedCard.name} card preview`}
            >
              <button
                type="button"
                className="dome-gallery-close-button"
                aria-label="Close card preview"
                onClick={closeOpenedCard}
              >
                <X className="h-5 w-5" />
              </button>
              <CardTile
                className="dome-gallery-open-card !max-w-none"
                count={openedCard.ownedCount}
                countMin={1}
                finish={firstFinish(openedCard)}
                growOnHover={false}
                imageUrl={openedCard.fullImageUrl}
                name={openedCard.name}
                price={openedCard.priceText}
                rarity={openedCard.rarity}
                setCode={openedCard.setCode}
                setLabel={openedCard.setLabel || undefined}
                setName={openedCard.setName}
                showMenu={false}
                typeLine={openedCard.typeLine}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default DomeGallery
