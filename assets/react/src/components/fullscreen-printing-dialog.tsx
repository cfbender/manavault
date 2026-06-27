import { motion } from "motion/react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { useEffect, useState } from "react"
import ProfileCard from "./profile-card"
import { Button } from "./ui/button"
import { Dialog, DialogContent } from "./ui/dialog"
import { present, titleize } from "../lib/utils"

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

export type FullscreenPrintingCard = {
  name: string
}

export type FullscreenPrinting = {
  scryfallId: string
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
  const [showBackFace, setShowBackFace] = useState(false)
  const currentIndex = currentPrintingId
    ? printings.findIndex((printing) => printing.scryfallId === currentPrintingId)
    : -1
  const printing = currentIndex >= 0 ? printings[currentIndex] : null
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
    ? "linear-gradient(145deg,rgba(120,72,28,0.58) 0%,rgba(255,226,122,0.23) 42%,rgba(117,196,255,0.28) 100%)"
    : "linear-gradient(145deg,rgba(96,73,110,0.55) 0%,rgba(113,196,255,0.27) 100%)"
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
      const direction = event.key === "ArrowLeft" ? -1 : 1
      const nextIndex = (currentIndex + direction + printings.length) % printings.length
      const nextPrinting = printings[nextIndex]
      if (nextPrinting) onPrintingChange(nextPrinting.scryfallId)
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [canNavigate, currentIndex, onPrintingChange, printings])

  function flipCard() {
    if (!hasBackFace) return
    setShowBackFace((current) => !current)
  }

  function goToPrinting(direction: -1 | 1) {
    if (!canNavigate) return

    const nextIndex = (currentIndex + direction + printings.length) % printings.length
    const nextPrinting = printings[nextIndex]
    if (nextPrinting) onPrintingChange(nextPrinting.scryfallId)
  }

  return (
    <Dialog open={Boolean(printing)} onOpenChange={onOpenChange}>
      {printing ? (
        <DialogContent
          className="fullscreen-printing-dialog relative h-[100dvh] max-h-[100dvh] w-screen shrink-0 max-w-none overflow-hidden rounded-none border-0 shadow-2xl sm:h-[calc(100dvh-3rem)] sm:max-h-[calc(100dvh-3rem)] sm:w-full sm:shrink sm:max-w-[calc(100vw-2rem)] sm:rounded-box"
          labelledBy="fullscreen-card-title"
        >
          <motion.div
            className="relative z-10 flex h-full flex-col gap-3 pb-3 pl-[calc(env(safe-area-inset-left)+0.75rem)] pr-[calc(env(safe-area-inset-right)+0.75rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:gap-4 sm:p-6"
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
                  {card.name}
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
                onClick={() => onOpenChange(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="relative mb-0 flex min-h-0 flex-1 items-center justify-center pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:mb-12 sm:pb-0">
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

              <motion.div
                key={printing.scryfallId}
                className="relative max-h-full rounded-[4.75%] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                initial={{ opacity: 0, scale: 0.82, y: 36, rotateX: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                aria-label={
                  !hasBackFace && canNavigate ? `Show next printing of ${card.name}` : undefined
                }
                role={!hasBackFace && canNavigate ? "button" : undefined}
                tabIndex={!hasBackFace && canNavigate ? 0 : undefined}
                onClick={() => (hasBackFace ? flipCard() : goToPrinting(1))}
                onKeyDown={(event) => {
                  if (hasBackFace || !canNavigate || (event.key !== "Enter" && event.key !== " ")) {
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
                  name={showBackFace ? `${card.name} back face` : card.name}
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
                    aria-label={`Show ${showBackFace ? "front" : "back"} face of ${card.name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      flipCard()
                    }}
                  >
                    {showBackFace ? "Show front" : "Show back"}
                  </Button>
                ) : null}
              </motion.div>

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
          </motion.div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
