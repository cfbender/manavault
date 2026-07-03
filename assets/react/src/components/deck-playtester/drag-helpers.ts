import type { DragEvent } from "react"
import type { PlaytestCard, PlaytestZone } from "../../lib/deck-playtest"
import { DRAG_MIME, DRAG_PREVIEW_MAX_WIDTH, DRAG_PREVIEW_MIN_WIDTH } from "./constants"
import type { BattlefieldCardPosition, DragPayload } from "./types"

export function encodeDragPayload(
  cardId: string,
  from: PlaytestZone,
  dragOffset?: BattlefieldCardPosition,
) {
  return JSON.stringify({
    cardId,
    from,
    ...(dragOffset ? { offsetX: dragOffset.x, offsetY: dragOffset.y } : {}),
  } satisfies DragPayload)
}

export function decodeDragPayload(value: string): DragPayload | null {
  try {
    const payload = JSON.parse(value) as Partial<DragPayload>
    if (!payload.cardId || !payload.from) return null
    const hasDragOffset = typeof payload.offsetX === "number" && typeof payload.offsetY === "number"

    return {
      cardId: payload.cardId,
      from: payload.from,
      ...(hasDragOffset ? { offsetX: payload.offsetX, offsetY: payload.offsetY } : {}),
    }
  } catch {
    return null
  }
}

function dragPreviewDimensions(sourceElement: HTMLElement) {
  const sourceWidth =
    sourceElement.offsetWidth ||
    sourceElement.getBoundingClientRect().width ||
    DRAG_PREVIEW_MIN_WIDTH
  const width = Math.min(DRAG_PREVIEW_MAX_WIDTH, Math.max(DRAG_PREVIEW_MIN_WIDTH, sourceWidth))

  return { height: width * (7 / 5), width }
}

export function dragImageOffset(
  event: DragEvent<HTMLElement>,
  sourceElement: HTMLElement,
  width: number,
  height: number,
) {
  const rect = sourceElement.getBoundingClientRect()
  if (!rect.width || !rect.height) return { x: width / 2, y: height / 2 }

  return {
    x: Math.min(width, Math.max(0, ((event.clientX - rect.left) / rect.width) * width)),
    y: Math.min(height, Math.max(0, ((event.clientY - rect.top) / rect.height) * height)),
  }
}

export function createCardDragPreview(card: PlaytestCard, sourceElement: HTMLElement) {
  const { height, width } = dragPreviewDimensions(sourceElement)
  const preview = document.createElement("div")

  preview.setAttribute("aria-hidden", "true")
  preview.setAttribute("aria-label", card.name)
  preview.style.position = "fixed"
  preview.style.left = "-10000px"
  preview.style.top = "0"
  preview.style.zIndex = "9999"
  preview.style.width = `${width}px`
  preview.style.height = `${height}px`
  preview.style.aspectRatio = "5 / 7"
  preview.style.pointerEvents = "none"
  preview.style.opacity = "1"
  preview.style.overflow = "hidden"
  preview.style.border = "1px solid rgb(255 255 255 / 0.16)"
  preview.style.borderRadius = "var(--radius-box)"
  preview.style.background = "var(--color-base-200)"
  preview.style.boxShadow = "0 1.5rem 3rem rgb(0 0 0 / 0.45)"

  if (card.imageUrl) {
    const image = document.createElement("img")
    image.src = card.imageUrl
    image.alt = card.name
    image.draggable = false
    image.decoding = "sync"
    image.style.display = "block"
    image.style.width = "100%"
    image.style.height = "100%"
    image.style.objectFit = "cover"
    preview.appendChild(image)
  } else {
    const fallback = document.createElement("div")
    fallback.textContent = card.name
    fallback.style.display = "flex"
    fallback.style.alignItems = "center"
    fallback.style.justifyContent = "center"
    fallback.style.width = "100%"
    fallback.style.height = "100%"
    fallback.style.padding = "0.75rem"
    fallback.style.textAlign = "center"
    fallback.style.fontSize = "0.875rem"
    fallback.style.fontWeight = "700"
    fallback.style.lineHeight = "1.2"
    fallback.style.color = "var(--color-base-content)"
    fallback.style.background =
      "linear-gradient(135deg, var(--color-base-200), var(--color-base-100))"
    preview.appendChild(fallback)
  }

  document.body.appendChild(preview)

  return { element: preview, height, width }
}

export function removeDragPreviewAfterDragStart(element: HTMLElement) {
  window.setTimeout(() => element.remove(), 0)
}

export { DRAG_MIME }
