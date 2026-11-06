import { useApolloClient } from "@apollo/client/react"
import { Check, type LucideIcon } from "lucide-react"
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { graphql } from "../gql"
import type { CardDropPrintingQuery } from "../gql/graphql"
import { cardDropReference, isCardDrag, type CardDropReference } from "../lib/card-drop"
import { cn } from "../lib/utils"
import { overlayLayers } from "./ui/overlay-layers"
import { useToast } from "./ui/toast"

export const CardDropPrintingDocument = graphql(`
  query CardDropPrinting(
    $scryfallId: ID
    $setCode: String
    $collectorNumber: String
    $name: String
  ) {
    printingByReference(
      scryfallId: $scryfallId
      setCode: $setCode
      collectorNumber: $collectorNumber
      name: $name
    ) {
      id
      scryfallId
      finishes
      card {
        id
        name
      }
    }
  }
`)

export type DroppedPrinting = NonNullable<CardDropPrintingQuery["printingByReference"]>

export type CardDropZone<Zone extends string> = {
  id: Zone
  title: string
  hint: string
  icon?: LucideIcon
  /** Drawn in place of the icon; `open` while a card hovers the zone. */
  art?: (state: { open: boolean; landing: boolean }) => ReactNode
}

type Phase = "idle" | "dragging" | "landing"

// The zone that took the card holds for a beat, then the overlay fades out
// (`.card-drop-overlay--landing` in app.css).
const LANDING_MS = 480

/** The finish to add a dropped printing in: nonfoil when it has one. */
export function droppedPrintingFinish(printing: DroppedPrinting) {
  const finishes = printing.finishes ?? []
  return finishes.includes("nonfoil") ? "nonfoil" : finishes[0] || "nonfoil"
}

/**
 * Drop zones over the whole page while a card is dragged in from another
 * page (Scryfall, EDHREC, Moxfield, or another ManaVault tab). Dropping on a
 * zone resolves the card to a catalog printing and hands it to `onDropCard`.
 * Drags that start on this page are left alone unless they start in a dialog.
 */
export function CardDropOverlay<Zone extends string>({
  enabled,
  onDropCard,
  zones,
}: {
  enabled: boolean
  onDropCard: (zone: Zone, printing: DroppedPrinting) => Promise<unknown>
  zones: readonly CardDropZone<Zone>[]
}) {
  const client = useApolloClient()
  const { showToast } = useToast()
  const [phase, setPhase] = useState<Phase>("idle")
  const [activeZone, setActiveZone] = useState<Zone | null>(null)
  const landingTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!enabled) return

    let depth = 0
    let pageDrag = false
    const stopDragging = () => {
      depth = 0
      setPhase((current) => (current === "dragging" ? "idle" : current))
    }
    // Cards on the page are already where they would be dropped; a card in a
    // dialog over it (EDHREC, search results) can still be dropped in.
    const handleDragStart = (event: globalThis.DragEvent) => {
      pageDrag = !(event.target instanceof Element && event.target.closest("[role='dialog']"))
    }
    const handleDragEnd = () => {
      pageDrag = false
    }
    const handleDragEnter = (event: globalThis.DragEvent) => {
      if (pageDrag || !isCardDrag([...(event.dataTransfer?.types ?? [])])) return
      depth += 1
      setPhase((current) => (current === "idle" ? "dragging" : current))
    }
    const handleDragLeave = () => {
      if (depth === 0) return
      depth -= 1
      if (depth === 0) stopDragging()
    }
    // Accepting the drag anywhere on the page keeps the browser from opening
    // a card dropped beside the zones.
    const handleDragOver = (event: globalThis.DragEvent) => {
      if (depth > 0) event.preventDefault()
    }
    const handleDrop = (event: globalThis.DragEvent) => {
      if (depth === 0) return
      event.preventDefault()
      stopDragging()
    }
    // Pointer events pause during a drag, so one arriving means the drag
    // ended without a drop or leave reaching this page.
    const handlePointerMove = () => {
      if (depth > 0) stopDragging()
    }

    document.addEventListener("dragstart", handleDragStart)
    document.addEventListener("dragend", handleDragEnd)
    window.addEventListener("dragenter", handleDragEnter)
    window.addEventListener("dragleave", handleDragLeave)
    window.addEventListener("dragover", handleDragOver)
    window.addEventListener("drop", handleDrop)
    window.addEventListener("pointermove", handlePointerMove)
    return () => {
      document.removeEventListener("dragstart", handleDragStart)
      document.removeEventListener("dragend", handleDragEnd)
      window.removeEventListener("dragenter", handleDragEnter)
      window.removeEventListener("dragleave", handleDragLeave)
      window.removeEventListener("dragover", handleDragOver)
      window.removeEventListener("drop", handleDrop)
      window.removeEventListener("pointermove", handlePointerMove)
      setPhase("idle")
    }
  }, [enabled])

  useEffect(() => {
    if (phase === "idle") setActiveZone(null)
  }, [phase])

  useEffect(() => () => window.clearTimeout(landingTimer.current), [])

  function land(zone: Zone) {
    setActiveZone(zone)
    setPhase("landing")
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    window.clearTimeout(landingTimer.current)
    landingTimer.current = window.setTimeout(() => setPhase("idle"), reduceMotion ? 0 : LANDING_MS)
  }

  async function dropCard(zone: Zone, reference: CardDropReference | null) {
    try {
      const printing = reference
        ? (await client.query({ query: CardDropPrintingDocument, variables: reference })).data
            ?.printingByReference
        : null
      if (!printing) {
        showToast("No card found in what was dropped", { tone: "error" })
        return
      }
      await onDropCard(zone, printing)
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not add the dropped card", {
        tone: "error",
      })
    }
  }

  function zoneHandlers(zone: Zone) {
    return {
      onDragOver(event: DragEvent<HTMLDivElement>) {
        event.preventDefault()
        event.dataTransfer.dropEffect = "copy"
        setActiveZone(zone)
      },
      onDragLeave(event: DragEvent<HTMLDivElement>) {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        setActiveZone((current) => (current === zone ? null : current))
      },
      onDrop(event: DragEvent<HTMLDivElement>) {
        event.preventDefault()
        const reference = cardDropReference(event.dataTransfer)
        land(zone)
        void dropCard(zone, reference)
      },
    }
  }

  if (phase === "idle" || typeof document === "undefined") return null

  const landing = phase === "landing"
  return createPortal(
    <div
      data-testid="card-drop-overlay"
      className={cn(
        "card-drop-overlay pointer-events-auto fixed inset-0 flex bg-black/65 p-4 pb-[calc(var(--safe-bottom)_+_1rem)] pl-[calc(var(--safe-left)_+_1rem)] pr-[calc(var(--safe-right)_+_1rem)] pt-[calc(var(--safe-top)_+_1rem)] backdrop-blur-sm sm:p-8",
        landing && "card-drop-overlay--landing pointer-events-none",
      )}
      style={{ zIndex: overlayLayers.floating }}
    >
      <div
        className={cn(
          "mx-auto grid w-full max-w-6xl flex-1 gap-4",
          zones.length > 1 && "grid-rows-2 sm:grid-cols-2 sm:grid-rows-1 sm:gap-6",
        )}
      >
        {zones.map((zone) => {
          const open = activeZone === zone.id
          const Icon = landing && open ? Check : zone.icon
          return (
            <div
              key={zone.id}
              role="region"
              aria-label={`Drop to add to ${zone.title}`}
              data-open={open || undefined}
              className={cn(
                "flex min-h-0 flex-col items-center justify-center gap-3 rounded-box border-2 px-6 py-8 text-center transition-[background-color,border-color,box-shadow,opacity] duration-150",
                open
                  ? "border-solid border-primary bg-base-100 ring-4 ring-primary/25"
                  : "border-dashed border-base-content/30 bg-base-100/90",
                landing && !open && "opacity-0",
              )}
              {...zoneHandlers(zone.id)}
            >
              {zone.art ? (
                zone.art({ open, landing: landing && open })
              ) : Icon ? (
                <span
                  className={cn(
                    "grid size-16 place-items-center rounded-box border-[1.5px] transition-[background-color,border-color,color,transform] duration-150",
                    open
                      ? "-translate-y-1 border-primary bg-primary text-primary-content"
                      : "border-base-300 bg-base-200 text-base-content/70",
                  )}
                >
                  <Icon className="size-8" aria-hidden="true" />
                </span>
              ) : null}
              <p
                className={cn(
                  "text-balance text-3xl font-black leading-tight transition-colors duration-150",
                  open && "text-primary",
                )}
              >
                {zone.title}
              </p>
              <p className="max-w-sm text-pretty text-sm text-base-content/70">{zone.hint}</p>
            </div>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
