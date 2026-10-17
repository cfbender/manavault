import { useDrag } from "@use-gesture/react"
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { useArtPalette } from "../lib/art-colors"
import { PrintingFilmstrip } from "./printing-filmstrip"
import ProfileCard from "./profile-card"
import { Button } from "./ui/button"
import { Dialog, DialogContent } from "./ui/dialog"
import { CARD_MORPH_NAME, cardMorphUpdating, morphCardBack } from "../lib/card-morph"
import { cn, present, titleize } from "../lib/utils"

const MOBILE_INTERACTION_QUERY =
  "(pointer: coarse), (any-pointer: coarse), (hover: none), (any-hover: none)"

function getMobileInteractionMedia() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null
  return window.matchMedia(MOBILE_INTERACTION_QUERY)
}

function useFullscreenTiltEnabled() {
  const [enabled, setEnabled] = useState(() => !getMobileInteractionMedia()?.matches)

  useEffect(() => {
    const media = getMobileInteractionMedia()
    if (!media) return

    const update = () => setEnabled(!media.matches)
    update()

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update)
      return () => media.removeEventListener("change", update)
    }

    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  return enabled
}

// Arrow keys and swipes slide the next card in from that side; picking from
// the filmstrip deals it up from the strip while the old card falls back.
const DEAL_VARIANTS: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction * 180,
    y: direction === 0 ? 240 : 10,
    scale: direction === 0 ? 0.4 : 0.9,
    rotate: direction * 6,
  }),
  center: { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction * -180,
    y: direction === 0 ? -16 : 10,
    scale: direction === 0 ? 0.86 : 0.9,
    rotate: direction * -6,
  }),
}

const FADE_VARIANTS: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
}

export type FullscreenPrintingCard = {
  name: string
}

export type FullscreenPrinting = {
  scryfallId: string
  // Overrides the dialog's card name when browsing printings of different cards.
  name?: string | null
  artCropUrl?: string | null
  collectorNumber?: string | null
  finishes?: readonly (string | null)[] | null
  imageUrl?: string | null
  backImageUrl?: string | null
  ownedCount?: number | null
  priceText?: string | null
  rarity?: string | null
  setCode?: string | null
  setName?: string | null
}

export function FullscreenPrintingDialog({
  card,
  currentPrintingId,
  printings,
  onOpenChange,
  onPrintingChange,
}: {
  card: FullscreenPrintingCard
  currentPrintingId: string | null
  printings: readonly FullscreenPrinting[]
  onOpenChange: (open: boolean) => void
  onPrintingChange: (printingId: string) => void
}) {
  const fullscreenTiltEnabled = useFullscreenTiltEnabled()
  const reduceMotion = useReducedMotion()
  const [showBackFace, setShowBackFace] = useState(false)
  // Where the next card comes from: -1 the left, 1 the right, 0 the filmstrip.
  const [direction, setDirection] = useState<-1 | 0 | 1>(0)
  const swipedAt = useRef(0)
  const currentIndex = currentPrintingId
    ? printings.findIndex((printing) => printing.scryfallId === currentPrintingId)
    : -1
  const printing = currentIndex >= 0 ? printings[currentIndex] : null
  const cardName = printing?.name || card.name
  const palette = useArtPalette(printing?.artCropUrl || printing?.imageUrl)
  const ambient = palette
    ? ({
        "--art-primary": `rgb(${palette.primary})`,
        "--art-secondary": `rgb(${palette.secondary})`,
      } as CSSProperties)
    : undefined
  const finish = (printing?.finishes || []).filter(present)[0]
  const foil = finish === "foil" || finish === "etched"
  const setLabel = printing?.setCode
    ? `${printing.setCode.toUpperCase()}${printing.collectorNumber ? ` #${printing.collectorNumber}` : ""}`
    : printing?.collectorNumber
      ? `#${printing.collectorNumber}`
      : ""
  const subtitle = [
    setLabel || null,
    printing?.setName || null,
    printing?.rarity ? titleize(printing.rarity) : null,
  ]
    .filter(present)
    .join(" · ")
  const profileInnerGradient = foil
    ? "linear-gradient(145deg,color-mix(in oklch, var(--color-accent), transparent 42%) 0%,color-mix(in oklch, var(--color-accent), transparent 77%) 42%,color-mix(in oklch, var(--color-info), transparent 72%) 100%)"
    : "linear-gradient(145deg,color-mix(in oklch, var(--color-primary), transparent 45%) 0%,color-mix(in oklch, var(--color-info), transparent 73%) 100%)"
  const profileGlowColor = foil ? "rgba(255, 219, 122, 0.62)" : "rgba(125, 190, 255, 0.55)"
  const backImageUrl = printing?.backImageUrl || null
  const hasBackFace = Boolean(backImageUrl)
  const visibleImageUrl = showBackFace && backImageUrl ? backImageUrl : printing?.imageUrl || ""
  const visibleFaceLabel = showBackFace ? "Back face" : "Front face"
  const canNavigate = printings.length > 1 && currentIndex >= 0
  const positionLabel = canNavigate ? `${currentIndex + 1} / ${printings.length}` : null

  useEffect(() => {
    setShowBackFace(false)
  }, [printing?.scryfallId])

  useEffect(() => {
    if (!canNavigate) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return

      event.preventDefault()
      const step = event.key === "ArrowLeft" ? -1 : 1
      const nextIndex = (currentIndex + step + printings.length) % printings.length
      const nextPrinting = printings[nextIndex]
      if (!nextPrinting) return
      setDirection(step)
      onPrintingChange(nextPrinting.scryfallId)
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [canNavigate, currentIndex, onPrintingChange, printings])

  function close(open: boolean) {
    if (open) return
    morphCardBack(printing?.scryfallId ?? null, () => onOpenChange(false))
  }

  function flipCard() {
    if (!hasBackFace) return
    setShowBackFace((current) => !current)
  }

  function goToPrinting(direction: -1 | 1) {
    if (!canNavigate) return

    const nextIndex = (currentIndex + direction + printings.length) % printings.length
    const nextPrinting = printings[nextIndex]
    if (!nextPrinting) return
    setDirection(direction)
    onPrintingChange(nextPrinting.scryfallId)
  }

  function pickPrinting(printingId: string) {
    setDirection(0)
    onPrintingChange(printingId)
  }

  const bindSwipe = useDrag(
    ({ swipe: [swipeX] }) => {
      if (!swipeX || !canNavigate) return
      swipedAt.current = performance.now()
      goToPrinting(swipeX < 0 ? 1 : -1)
    },
    { axis: "x", filterTaps: true, swipe: { distance: 40 } },
  )

  return (
    <Dialog open={Boolean(printing)} onOpenChange={close}>
      {printing ? (
        <DialogContent
          style={ambient}
          data-art={palette ? "" : undefined}
          className={cn(
            "fullscreen-printing-dialog relative h-[100dvh] max-h-[100dvh] w-screen shrink-0 max-w-none overflow-hidden rounded-none border-0 shadow-2xl sm:h-[calc(100dvh-3rem)] sm:max-h-[calc(100dvh-3rem)] sm:w-full sm:shrink sm:max-w-[calc(100vw-2rem)] sm:rounded-box",
            canNavigate && "fullscreen-printing-dialog--strip",
          )}
          labelledBy="fullscreen-card-title"
        >
          <motion.div
            className="relative z-10 flex h-full flex-col gap-3 pb-3 pl-[calc(var(--safe-left)+0.75rem)] pr-[calc(var(--safe-right)+0.75rem)] pt-[calc(var(--safe-top)+0.75rem)] sm:gap-4 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2
                  id="fullscreen-card-title"
                  className="truncate text-xl font-black tracking-normal sm:text-3xl"
                >
                  {cardName}
                </h2>
                {subtitle ? (
                  <p className="fullscreen-printing-dialog__muted mt-1 line-clamp-1 text-xs sm:line-clamp-2 sm:text-sm">
                    {subtitle}
                  </p>
                ) : null}
                {finish ||
                printing.priceText ||
                printing.ownedCount ||
                positionLabel ||
                hasBackFace ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[0.65rem] sm:mt-3 sm:gap-2 sm:text-xs">
                    {hasBackFace ? (
                      <span className="fullscreen-printing-dialog__badge badge">
                        {visibleFaceLabel}
                      </span>
                    ) : null}
                    {finish ? (
                      <span className="fullscreen-printing-dialog__badge badge">
                        {titleize(finish)}
                      </span>
                    ) : null}
                    {printing.priceText ? (
                      <span className="fullscreen-printing-dialog__badge badge font-mono">
                        {printing.priceText}
                      </span>
                    ) : null}
                    {printing.ownedCount ? (
                      <span className="fullscreen-printing-dialog__badge badge">
                        {printing.ownedCount} owned
                      </span>
                    ) : null}
                    {positionLabel ? (
                      <span className="fullscreen-printing-dialog__badge badge font-mono">
                        {positionLabel}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="fullscreen-printing-dialog__icon-button"
                aria-label="Close full-screen card"
                onClick={() => close(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div
              {...bindSwipe()}
              className="relative mb-0 flex min-h-0 flex-1 touch-pan-y items-center justify-center"
            >
              {canNavigate ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="fullscreen-printing-dialog__icon-button absolute left-0 top-1/2 z-20 -translate-y-1/2 border backdrop-blur sm:left-4"
                  aria-label="Previous printing"
                  onClick={() => goToPrinting(-1)}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              ) : null}

              <AnimatePresence initial={false} custom={direction} mode="popLayout">
                <motion.div
                  key={printing.scryfallId}
                  className="relative max-h-full rounded-[4.75%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                  // Its own layer, so dealing the card moves an image instead
                  // of repainting the dialog every frame.
                  style={{ viewTransitionName: CARD_MORPH_NAME, willChange: "transform, opacity" }}
                  custom={direction}
                  variants={reduceMotion ? FADE_VARIANTS : DEAL_VARIANTS}
                  initial={cardMorphUpdating() ? false : "enter"}
                  animate="center"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  aria-label={
                    !hasBackFace && canNavigate ? `Show next printing of ${cardName}` : undefined
                  }
                  role={!hasBackFace && canNavigate ? "button" : undefined}
                  tabIndex={!hasBackFace && canNavigate ? 0 : undefined}
                  onClick={() => {
                    // A swipe ends in a click; it already changed the card.
                    if (performance.now() - swipedAt.current < 400) return
                    if (hasBackFace) flipCard()
                    else goToPrinting(1)
                  }}
                  onKeyDown={(event) => {
                    if (
                      hasBackFace ||
                      !canNavigate ||
                      (event.key !== "Enter" && event.key !== " ")
                    ) {
                      return
                    }
                    event.preventDefault()
                    goToPrinting(1)
                  }}
                >
                  <ProfileCard
                    avatarUrl={visibleImageUrl}
                    innerGradient={profileInnerGradient}
                    behindGlowColor={profileGlowColor}
                    behindGlowSize={foil ? "72%" : "58%"}
                    className={
                      foil
                        ? "manavault-printing-profile-card manavault-printing-profile-card--foil"
                        : "manavault-printing-profile-card"
                    }
                    enableTilt={fullscreenTiltEnabled}
                    enableMobileTilt={false}
                    disableTiltOnCoarsePointer
                    name={showBackFace ? `${cardName} back face` : cardName}
                    title={subtitle}
                    handle={setLabel || printing.setCode?.toUpperCase() || "printing"}
                    status={[
                      hasBackFace ? visibleFaceLabel : null,
                      finish ? titleize(finish) : titleize(printing.rarity),
                    ]
                      .filter(present)
                      .join(" · ")}
                    showUserInfo={false}
                  />
                  {visibleImageUrl ? null : (
                    <div className="fullscreen-printing-dialog__muted absolute inset-0 z-20 flex items-center justify-center rounded-[4.75%] p-8 text-center text-sm">
                      No image
                    </div>
                  )}
                  {hasBackFace ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="fullscreen-printing-dialog__icon-button absolute bottom-3 left-1/2 z-30 -translate-x-1/2 border px-4 text-xs font-black backdrop-blur sm:bottom-4"
                      aria-label={`Show ${showBackFace ? "front" : "back"} face of ${cardName}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        flipCard()
                      }}
                    >
                      {showBackFace ? "Show front" : "Show back"}
                    </Button>
                  ) : null}
                </motion.div>
              </AnimatePresence>

              {canNavigate ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="fullscreen-printing-dialog__icon-button absolute right-0 top-1/2 z-20 -translate-y-1/2 border backdrop-blur sm:right-4"
                  aria-label="Next printing"
                  onClick={() => goToPrinting(1)}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              ) : null}
            </div>

            {canNavigate ? (
              <PrintingFilmstrip
                cardName={card.name}
                currentIndex={currentIndex}
                printings={printings}
                onSelect={pickPrinting}
              />
            ) : null}
          </motion.div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
