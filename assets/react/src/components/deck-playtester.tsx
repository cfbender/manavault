import { Link } from "@tanstack/react-router"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Dices,
  Eye,
  EyeOff,
  Flame,
  Hand,
  Library,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  Skull,
  Sparkles,
  Swords,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react"
import {
  createPlaytestState,
  drawCards,
  exileFromLibrary,
  millCards,
  movePlaytestCard,
  mulliganPlaytest,
  shuffleLibrary,
  type PlaytestCard,
  type PlaytestState,
  type PlaytestZone,
} from "../lib/deck-playtest"
import { cn } from "../lib/utils"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"

type DeckPlaytesterProps = {
  deckId: string
  deckName: string
  initialState: PlaytestState
}

type CardAction = {
  label: string
  to: PlaytestZone
  icon?: LucideIcon
  placement?: "top" | "bottom"
}

type CardStatus = {
  faceDown?: boolean
  markers: number
  minusOneCounters: number
  plusOneCounters: number
  power?: string
  toughness?: string
}

type ContextMenuState = {
  cardId: string
  zone: PlaytestZone
  x: number
  y: number
} | null

type CardHoverTarget = {
  cardId: string
  zone: PlaytestZone
}

type PeekMode = "Library" | "Look" | "Scry" | "Surveil"

type PeekState = {
  count: number
  mode: PeekMode
} | null

type TokenFormValues = {
  name: string
  power: string
  toughness: string
  typeLine: string
}

type DragPayload = {
  cardId: string
  from: PlaytestZone
  offsetX?: number
  offsetY?: number
}

type BattlefieldCardPosition = {
  x: number
  y: number
}

type BattlefieldPointerDrag = {
  cardId: string
  frame: number | null
  latestClientX: number
  latestClientY: number
  offset: BattlefieldCardPosition
  pointerId: number
  surface: HTMLDivElement
}

type PlaytestSnapshot = {
  battlefieldCardPositions: Record<string, BattlefieldCardPosition>
  cardStatuses: Record<string, CardStatus>
  state: PlaytestState
  tappedCardIds: string[]
  turn: number
  lifeTotal: number
  openingHand: boolean
}

const STARTING_LIFE_TOTAL = 40
const MAX_HISTORY = 40
const BATTLEFIELD_CARD_WIDTH_REM = 9
const BATTLEFIELD_CARD_ASPECT_HEIGHT = 7 / 5
const BATTLEFIELD_DEFAULT_X = 96
const BATTLEFIELD_DEFAULT_Y = 92
const BATTLEFIELD_DEFAULT_OFFSET_X = 32
const BATTLEFIELD_DEFAULT_OFFSET_Y = 24
const MIN_ZOOM = 0.7
const MAX_ZOOM = 1.35
const ZOOM_STEP = 0.1
const DRAG_MIME = "application/x-manavault-playtest-card"
const DRAG_PREVIEW_MIN_WIDTH = 112
const DRAG_PREVIEW_MAX_WIDTH = 168
const HOVER_PREVIEW_DELAY_MS = 450

const ZONE_LABELS: Record<PlaytestZone, string> = {
  battlefield: "Battlefield",
  command: "Command",
  exile: "Exile",
  graveyard: "Graveyard",
  hand: "Hand",
  library: "Library",
}

const ZONE_ACTIONS: Partial<Record<PlaytestZone, CardAction[]>> = {
  battlefield: [
    { icon: Hand, label: "Hand", to: "hand" },
    { icon: Skull, label: "Graveyard", to: "graveyard" },
    { icon: Flame, label: "Exile", to: "exile" },
    { icon: ArrowUpFromLine, label: "Top", placement: "top", to: "library" },
    { icon: ArrowDownToLine, label: "Bottom", placement: "bottom", to: "library" },
  ],
  command: [
    { icon: Sparkles, label: "Cast", to: "battlefield" },
    { icon: Hand, label: "Hand", to: "hand" },
  ],
  exile: [
    { icon: Hand, label: "Hand", to: "hand" },
    { icon: Skull, label: "Graveyard", to: "graveyard" },
    { icon: Sparkles, label: "Battlefield", to: "battlefield" },
  ],
  graveyard: [
    { icon: Hand, label: "Hand", to: "hand" },
    { icon: Sparkles, label: "Battlefield", to: "battlefield" },
    { icon: Flame, label: "Exile", to: "exile" },
  ],
  hand: [
    { icon: Sparkles, label: "Play", to: "battlefield" },
    { icon: Skull, label: "Discard", to: "graveyard" },
    { icon: Flame, label: "Exile", to: "exile" },
    { icon: ArrowUpFromLine, label: "Top", placement: "top", to: "library" },
    { icon: ArrowDownToLine, label: "Bottom", placement: "bottom", to: "library" },
  ],
}

const PEEK_LIBRARY_ACTIONS = [
  { icon: Hand, label: "Hand", shortcut: "H", title: "Add to Hand", to: "hand" },
  { icon: Sparkles, label: "Play", shortcut: "B", title: "Play / Battlefield", to: "battlefield" },
  { icon: Skull, label: "Graveyard", shortcut: "G", title: "Move to Graveyard", to: "graveyard" },
  { icon: Flame, label: "Exile", shortcut: "E", title: "Move to Exile", to: "exile" },
] satisfies Array<CardAction & { icon: LucideIcon; shortcut: string; title: string }>

function initialSnapshot(initialState: PlaytestState): PlaytestSnapshot {
  return {
    battlefieldCardPositions: defaultBattlefieldPositions(initialState.battlefield),
    cardStatuses: {},
    state: initialState,
    tappedCardIds: [],
    turn: 1,
    lifeTotal: STARTING_LIFE_TOTAL,
    openingHand: true,
  }
}

function defaultBattlefieldPosition(index: number): BattlefieldCardPosition {
  const safeIndex = Math.max(0, index)

  return {
    x: BATTLEFIELD_DEFAULT_X + (safeIndex % 8) * BATTLEFIELD_DEFAULT_OFFSET_X,
    y: BATTLEFIELD_DEFAULT_Y + (safeIndex % 6) * BATTLEFIELD_DEFAULT_OFFSET_Y,
  }
}

function defaultBattlefieldPositions(cards: PlaytestCard[]) {
  return Object.fromEntries(cards.map((card, index) => [card.id, defaultBattlefieldPosition(index)]))
}

function battlefieldCardDimensions(surface: HTMLElement, zoom: number) {
  const fontSize = Number.parseFloat(getComputedStyle(surface).fontSize) || 16
  const width = BATTLEFIELD_CARD_WIDTH_REM * zoom * fontSize

  return { height: width * BATTLEFIELD_CARD_ASPECT_HEIGHT, width }
}

function clampBattlefieldPosition(position: BattlefieldCardPosition, surface: HTMLElement, zoom: number): BattlefieldCardPosition {
  const { height, width } = battlefieldCardDimensions(surface, zoom)
  const maxX = Math.max(0, surface.clientWidth - width)
  const maxY = Math.max(0, surface.clientHeight - height)

  return {
    x: Math.min(Math.max(0, position.x), maxX),
    y: Math.min(Math.max(0, position.y), maxY),
  }
}

function battlefieldPositionFromDrop(
  event: DragEvent<HTMLElement>,
  surface: HTMLElement,
  zoom: number,
  dragOffset?: BattlefieldCardPosition,
): BattlefieldCardPosition {
  const rect = surface.getBoundingClientRect()
  const { height, width } = battlefieldCardDimensions(surface, zoom)
  const offset = dragOffset || { x: width / 2, y: height / 2 }

  return clampBattlefieldPosition(
    {
      x: event.clientX - rect.left - offset.x,
      y: event.clientY - rect.top - offset.y,
    },
    surface,
    zoom,
  )
}

function battlefieldPositionFromPointer(
  clientX: number,
  clientY: number,
  surface: HTMLElement,
  zoom: number,
  offset: BattlefieldCardPosition,
): BattlefieldCardPosition {
  const rect = surface.getBoundingClientRect()

  return clampBattlefieldPosition(
    {
      x: clientX - rect.left - offset.x,
      y: clientY - rect.top - offset.y,
    },
    surface,
    zoom,
  )
}

function shuffledOpeningState(initialState: PlaytestState) {
  return createPlaytestState(
    [
      ...initialState.library,
      ...initialState.hand,
      ...initialState.battlefield,
      ...initialState.graveyard,
      ...initialState.exile,
    ],
    initialState.command,
  )
}

function defaultCardStatus(): CardStatus {
  return { markers: 0, minusOneCounters: 0, plusOneCounters: 0 }
}

function hasClearableCardStatus(status: CardStatus) {
  return status.plusOneCounters > 0 || status.minusOneCounters > 0 || status.markers > 0 || Boolean(status.power) || Boolean(status.toughness)
}

function statusFor(statuses: Record<string, CardStatus>, cardId: string) {
  return statuses[cardId] || defaultCardStatus()
}

function encodeDragPayload(cardId: string, from: PlaytestZone, dragOffset?: BattlefieldCardPosition) {
  return JSON.stringify({
    cardId,
    from,
    ...(dragOffset ? { offsetX: dragOffset.x, offsetY: dragOffset.y } : {}),
  } satisfies DragPayload)
}

function decodeDragPayload(value: string): DragPayload | null {
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
  const sourceWidth = sourceElement.offsetWidth || sourceElement.getBoundingClientRect().width || DRAG_PREVIEW_MIN_WIDTH
  const width = Math.min(DRAG_PREVIEW_MAX_WIDTH, Math.max(DRAG_PREVIEW_MIN_WIDTH, sourceWidth))

  return { height: width * (7 / 5), width }
}

function dragImageOffset(event: DragEvent<HTMLElement>, sourceElement: HTMLElement, width: number, height: number) {
  const rect = sourceElement.getBoundingClientRect()
  if (!rect.width || !rect.height) return { x: width / 2, y: height / 2 }

  return {
    x: Math.min(width, Math.max(0, ((event.clientX - rect.left) / rect.width) * width)),
    y: Math.min(height, Math.max(0, ((event.clientY - rect.top) / rect.height) * height)),
  }
}

function createCardDragPreview(card: PlaytestCard, sourceElement: HTMLElement) {
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
  preview.style.borderRadius = "0.75rem"
  preview.style.background = "rgb(30 41 59)"
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
    fallback.style.color = "rgb(248 250 252)"
    fallback.style.background = "linear-gradient(135deg, rgb(30 41 59), rgb(15 23 42))"
    preview.appendChild(fallback)
  }

  document.body.appendChild(preview)

  return { element: preview, height, width }
}

function removeDragPreviewAfterDragStart(element: HTMLElement) {
  window.setTimeout(() => element.remove(), 0)
}

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 10) / 10))
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest("input, textarea, select") || target.isContentEditable || target.closest("[role='textbox']"),
  )
}

function cardZone(state: PlaytestState, cardId: string): PlaytestZone | null {
  const zones: PlaytestZone[] = ["hand", "battlefield", "graveyard", "exile", "command", "library"]
  return zones.find((zone) => state[zone].some((card) => card.id === cardId)) || null
}

export function DeckPlaytester({ deckId, deckName, initialState }: DeckPlaytesterProps) {
  const [snapshot, setSnapshot] = useState(() => initialSnapshot(initialState))
  const [history, setHistory] = useState<PlaytestSnapshot[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [hoveredCard, setHoveredCard] = useState<CardHoverTarget | null>(null)
  const [hoverPreviewCardId, setHoverPreviewCardId] = useState<string | null>(null)
  const [draggingBattlefieldCardId, setDraggingBattlefieldCardId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [peek, setPeek] = useState<PeekState>(null)
  const [actionCount, setActionCount] = useState(1)
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const battlefieldSurfaceRef = useRef<HTMLDivElement>(null)
  const battlefieldPointerDragRef = useRef<BattlefieldPointerDrag | null>(null)
  const hoverPreviewTimeoutRef = useRef<number | null>(null)
  const [lastAction, setLastAction] = useState("Opening hand ready")

  useEffect(() => {
    setSnapshot(initialSnapshot(initialState))
    setHistory([])
    setSelectedCardId(null)
    setHoveredCard(null)
    setHoverPreviewCardId(null)
    setDraggingBattlefieldCardId(null)
    setContextMenu(null)
    setPeek(null)
    setTokenDialogOpen(false)
    setLastAction("Opening hand ready")
  }, [initialState])

  const { battlefieldCardPositions, cardStatuses, state, tappedCardIds, turn, lifeTotal, openingHand } = snapshot
  const tappedCards = useMemo(() => new Set(tappedCardIds), [tappedCardIds])
  const selectedCard = useMemo(
    () =>
      [state.hand, state.battlefield, state.command, state.graveyard, state.exile]
        .flat()
        .find((card) => card.id === selectedCardId) || null,
    [selectedCardId, state],
  )
  const selectedZone = selectedCardId ? cardZone(state, selectedCardId) : null
  const selectedStatus = selectedCard ? statusFor(cardStatuses, selectedCard.id) : null
  const hoverPreviewCard = useMemo(() => {
    if (!hoverPreviewCardId) return null
    return [...state.hand, ...state.command, ...state.battlefield].find((card) => card.id === hoverPreviewCardId) || null
  }, [hoverPreviewCardId, state.battlefield, state.command, state.hand])

  useEffect(() => {
    if (hoverPreviewTimeoutRef.current) {
      window.clearTimeout(hoverPreviewTimeoutRef.current)
      hoverPreviewTimeoutRef.current = null
    }

    setHoverPreviewCardId(null)

    if (draggingBattlefieldCardId || (hoveredCard?.zone !== "hand" && hoveredCard?.zone !== "command" && hoveredCard?.zone !== "battlefield")) return

    hoverPreviewTimeoutRef.current = window.setTimeout(() => {
      setHoverPreviewCardId(hoveredCard.cardId)
      hoverPreviewTimeoutRef.current = null
    }, HOVER_PREVIEW_DELAY_MS)

    return () => {
      if (hoverPreviewTimeoutRef.current) {
        window.clearTimeout(hoverPreviewTimeoutRef.current)
        hoverPreviewTimeoutRef.current = null
      }
    }
  }, [draggingBattlefieldCardId, hoveredCard])

  const commit = useCallback(
    (recipe: (current: PlaytestSnapshot) => PlaytestSnapshot, message: string) => {
      setSnapshot((current) => {
        const next = recipe(current)
        if (next === current) return current
        setHistory((items) => [current, ...items].slice(0, MAX_HISTORY))
        setLastAction(message)
        return next
      })
    },
    [],
  )

  const undo = useCallback(() => {
    setHistory((items) => {
      const [previous, ...rest] = items
      if (!previous) return items
      setSnapshot(previous)
      setSelectedCardId(null)
      setHoveredCard(null)
      setLastAction("Undid previous action")
      return rest
    })
  }, [])

  const resetGame = useCallback(() => {
    setSnapshot(initialSnapshot(shuffledOpeningState(initialState)))
    setHistory([])
    setSelectedCardId(null)
    setHoveredCard(null)
    setLastAction("Started a new game")
  }, [initialState])

  const keepHand = useCallback(() => {
    commit((current) => ({ ...current, openingHand: false }), "Kept opening hand")
  }, [commit])

  const changeLife = useCallback(
    (delta: number) => {
      commit(
        (current) => ({ ...current, lifeTotal: Math.max(0, current.lifeTotal + delta) }),
        `${delta > 0 ? "Gained" : "Lost"} ${Math.abs(delta)} life`,
      )
    },
    [commit],
  )

  const draw = useCallback(
    (count = actionCount) => {
      commit(
        (current) => ({ ...current, state: drawCards(current.state, count), openingHand: false }),
        `Drew ${count} card${count === 1 ? "" : "s"}`,
      )
    },
    [actionCount, commit],
  )

  const mill = useCallback(
    (count = actionCount) => {
      commit(
        (current) => ({ ...current, state: millCards(current.state, count) }),
        `Milled ${count} card${count === 1 ? "" : "s"}`,
      )
    },
    [actionCount, commit],
  )

  const exileTop = useCallback(
    (count = actionCount) => {
      commit(
        (current) => ({ ...current, state: exileFromLibrary(current.state, count) }),
        `Exiled ${count} card${count === 1 ? "" : "s"} from library`,
      )
    },
    [actionCount, commit],
  )

  const shuffle = useCallback(() => {
    commit((current) => ({ ...current, state: shuffleLibrary(current.state) }), "Shuffled library")
  }, [commit])

  const mulligan = useCallback(() => {
    commit(
      (current) => ({
        ...current,
        battlefieldCardPositions: {},
        openingHand: true,
        cardStatuses: {},
        state: mulliganPlaytest(current.state),
        tappedCardIds: [],
      }),
      "Took a mulligan",
    )
  }, [commit])

  const markCardHovered = useCallback((cardId: string, zone: PlaytestZone) => {
    setHoveredCard({ cardId, zone })
  }, [])

  const clearCardHovered = useCallback((cardId: string) => {
    setHoveredCard((current) => (current?.cardId === cardId ? null : current))
  }, [])

  const moveCard = useCallback(
    (from: PlaytestZone, to: PlaytestZone, cardId: string, placement?: "top" | "bottom", battlefieldPosition?: BattlefieldCardPosition) => {
      commit(
        (current) => {
          const nextState = movePlaytestCard(current.state, from, to, cardId, placement)
          if (nextState === current.state) return current
          const nextStatuses = { ...current.cardStatuses }
          const nextPositions = { ...current.battlefieldCardPositions }

          if (to === "battlefield") {
            nextPositions[cardId] =
              battlefieldPosition ?? nextPositions[cardId] ?? defaultBattlefieldPosition(current.state.battlefield.length)
          } else {
            delete nextStatuses[cardId]
            delete nextPositions[cardId]
          }

          return {
            ...current,
            battlefieldCardPositions: nextPositions,
            cardStatuses: nextStatuses,
            state: nextState,
            tappedCardIds: to === "battlefield" ? current.tappedCardIds : current.tappedCardIds.filter((id) => id !== cardId),
            openingHand: false,
          }
        },
        `Moved card to ${ZONE_LABELS[to].toLowerCase()}`,
      )
      setContextMenu(null)
      setSelectedCardId(to === "battlefield" ? cardId : null)
      clearCardHovered(cardId)
    },
    [clearCardHovered, commit],
  )

  const moveBattlefieldCardPosition = useCallback(
    (cardId: string, position: BattlefieldCardPosition) => {
      commit(
        (current) => {
          if (!current.state.battlefield.some((card) => card.id === cardId)) return current

          return {
            ...current,
            battlefieldCardPositions: {
              ...current.battlefieldCardPositions,
              [cardId]: position,
            },
          }
        },
        "Moved card on battlefield",
      )
      setSelectedCardId(cardId)
    },
    [commit],
  )

  const moveBattlefieldCardPositionLive = useCallback((cardId: string, position: BattlefieldCardPosition) => {
    setSnapshot((current) => {
      if (!current.state.battlefield.some((card) => card.id === cardId)) return current

      return {
        ...current,
        battlefieldCardPositions: {
          ...current.battlefieldCardPositions,
          [cardId]: position,
        },
      }
    })
    setSelectedCardId(cardId)
  }, [])

  const flushBattlefieldPointerDrag = useCallback(() => {
    const drag = battlefieldPointerDragRef.current
    if (!drag) return

    drag.frame = null
    moveBattlefieldCardPositionLive(
      drag.cardId,
      battlefieldPositionFromPointer(drag.latestClientX, drag.latestClientY, drag.surface, zoom, drag.offset),
    )
  }, [moveBattlefieldCardPositionLive, zoom])

  const beginBattlefieldPointerDrag = useCallback(
    (cardId: string, event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return
      const surface = battlefieldSurfaceRef.current
      if (!surface) return

      const rect = event.currentTarget.getBoundingClientRect()
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
      setContextMenu(null)
      setSelectedCardId(cardId)
      setDraggingBattlefieldCardId(cardId)
      setHoverPreviewCardId(null)

      battlefieldPointerDragRef.current = {
        cardId,
        frame: null,
        latestClientX: event.clientX,
        latestClientY: event.clientY,
        offset: {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        },
        pointerId: event.pointerId,
        surface,
      }
    },
    [],
  )

  const updateBattlefieldPointerDrag = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const drag = battlefieldPointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      event.preventDefault()
      drag.latestClientX = event.clientX
      drag.latestClientY = event.clientY
      if (drag.frame === null) {
        drag.frame = window.requestAnimationFrame(flushBattlefieldPointerDrag)
      }
    },
    [flushBattlefieldPointerDrag],
  )

  const finishBattlefieldPointerDrag = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const drag = battlefieldPointerDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    if (drag.frame !== null) {
      window.cancelAnimationFrame(drag.frame)
      drag.frame = null
      moveBattlefieldCardPositionLive(
        drag.cardId,
        battlefieldPositionFromPointer(event.clientX, event.clientY, drag.surface, zoom, drag.offset),
      )
    }

    event.currentTarget.releasePointerCapture(event.pointerId)
    battlefieldPointerDragRef.current = null
    setDraggingBattlefieldCardId(null)
  }, [moveBattlefieldCardPositionLive, zoom])

  const toggleTapped = useCallback(
    (cardId: string) => {
      commit(
        (current) => ({
          ...current,
          tappedCardIds: current.tappedCardIds.includes(cardId)
            ? current.tappedCardIds.filter((id) => id !== cardId)
            : [...current.tappedCardIds, cardId],
        }),
        tappedCards.has(cardId) ? "Untapped card" : "Tapped card",
      )
    },
    [commit, tappedCards],
  )

  const untapAll = useCallback(() => {
    commit((current) => ({ ...current, tappedCardIds: [] }), "Untapped all permanents")
  }, [commit])

  const nextTurn = useCallback(() => {
    commit(
      (current) => ({
        ...current,
        state: drawCards(current.state, 1),
        tappedCardIds: [],
        turn: current.turn + 1,
        openingHand: false,
      }),
      "Advanced to next turn and drew a card",
    )
  }, [commit])

  const activateCard = useCallback(
    (card: PlaytestCard, zone: PlaytestZone) => {
      if (zone === "hand") {
        moveCard("hand", "battlefield", card.id)
        return
      }
      if (zone === "command") {
        moveCard("command", "battlefield", card.id)
        return
      }
      setSelectedCardId((current) => (current === card.id ? null : card.id))
    },
    [moveCard],
  )

  const openContextMenu = useCallback((card: PlaytestCard, zone: PlaytestZone, event: MouseEvent) => {
    event.preventDefault()
    setSelectedCardId(card.id)
    setContextMenu({ cardId: card.id, zone, x: event.clientX, y: event.clientY })
  }, [])

  const startCardDrag = useCallback((card: PlaytestCard, zone: PlaytestZone, event: DragEvent<HTMLElement>) => {
    const sourceRect = event.currentTarget.getBoundingClientRect()
    const dragOffset =
      zone === "battlefield" ? { x: event.clientX - sourceRect.left, y: event.clientY - sourceRect.top } : undefined

    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData(DRAG_MIME, encodeDragPayload(card.id, zone, dragOffset))
    event.dataTransfer.setData("text/plain", card.name)

    const preview = createCardDragPreview(card, event.currentTarget)
    const offset = dragImageOffset(event, event.currentTarget, preview.width, preview.height)

    try {
      event.dataTransfer.setDragImage(preview.element, offset.x, offset.y)
    } catch {
      preview.element.remove()
      return
    }

    removeDragPreviewAfterDragStart(preview.element)
  }, [])

  const dropCardOnBattlefield = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      const payload = decodeDragPayload(event.dataTransfer.getData(DRAG_MIME))
      if (!payload) return

      const surface = battlefieldSurfaceRef.current
      const dragOffset =
        typeof payload.offsetX === "number" && typeof payload.offsetY === "number"
          ? { x: payload.offsetX, y: payload.offsetY }
          : undefined
      const position = surface ? battlefieldPositionFromDrop(event, surface, zoom, dragOffset) : undefined

      if (payload.from === "battlefield") {
        if (position) moveBattlefieldCardPosition(payload.cardId, position)
        else setSelectedCardId(payload.cardId)
        return
      }

      moveCard(payload.from, "battlefield", payload.cardId, undefined, position)
    },
    [moveBattlefieldCardPosition, moveCard, zoom],
  )

  const updateCardStatus = useCallback(
    (cardId: string, update: (status: CardStatus) => CardStatus, message: string) => {
      commit(
        (current) => ({
          ...current,
          cardStatuses: {
            ...current.cardStatuses,
            [cardId]: update(statusFor(current.cardStatuses, cardId)),
          },
        }),
        message,
      )
    },
    [commit],
  )

  const toggleFaceDown = useCallback(
    (cardId: string) => {
      updateCardStatus(
        cardId,
        (status) => ({ ...status, faceDown: !status.faceDown }),
        statusFor(cardStatuses, cardId).faceDown ? "Turned card face up" : "Turned card face down",
      )
      setContextMenu(null)
    },
    [cardStatuses, updateCardStatus],
  )

  const adjustCounter = useCallback(
    (cardId: string, kind: "plusOneCounters" | "minusOneCounters", delta: number) => {
      updateCardStatus(
        cardId,
        (status) => ({ ...status, [kind]: Math.max(0, status[kind] + delta) }),
        kind === "plusOneCounters" ? "Updated +1/+1 counters" : "Updated -1/-1 counters",
      )
    },
    [updateCardStatus],
  )

  const addMarker = useCallback(
    (cardId: string) => {
      updateCardStatus(cardId, (status) => ({ ...status, markers: status.markers + 1 }), "Added marker")
    },
    [updateCardStatus],
  )

  const setPowerToughness = useCallback(
    (cardId: string, power: string, toughness: string) => {
      updateCardStatus(cardId, (status) => ({ ...status, power, toughness }), "Set power/toughness")
      setContextMenu(null)
    },
    [updateCardStatus],
  )

  const clearCardStatus = useCallback(
    (cardId: string) => {
      updateCardStatus(
        cardId,
        (status) => ({
          ...status,
          markers: 0,
          minusOneCounters: 0,
          plusOneCounters: 0,
          power: undefined,
          toughness: undefined,
        }),
        "Removed counters and markers",
      )
      setContextMenu(null)
    },
    [updateCardStatus],
  )

  const openTokenDialog = useCallback(() => {
    setTokenDialogOpen(true)
  }, [])

  const createToken = useCallback(
    ({ name, power, toughness, typeLine }: TokenFormValues) => {
      const token: PlaytestCard = {
        id: `playtest-token-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
        deckCardId: "playtest-token",
        name,
        typeLine,
      }
      const tokenStatus: CardStatus = {
        ...defaultCardStatus(),
        ...(power ? { power } : {}),
        ...(toughness ? { toughness } : {}),
      }

      commit(
        (current) => ({
          ...current,
          battlefieldCardPositions: {
            ...current.battlefieldCardPositions,
            [token.id]: defaultBattlefieldPosition(current.state.battlefield.length),
          },
          cardStatuses: { ...current.cardStatuses, [token.id]: tokenStatus },
          openingHand: false,
          state: { ...current.state, battlefield: [token, ...current.state.battlefield] },
        }),
        `Created ${name}`,
      )
      setSelectedCardId(token.id)
      setTokenDialogOpen(false)
    },
    [commit],
  )

  const rollDiceAndCoin = useCallback(() => {
    const die = Math.floor(Math.random() * 20) + 1
    const coin = Math.random() < 0.5 ? "heads" : "tails"
    setLastAction(`Rolled d20: ${die}; coin: ${coin}`)
  }, [])
  const moveTopLibraryCard = useCallback(
    (cardId: string, to: PlaytestZone, placement?: "top" | "bottom") => {
      moveCard("library", to, cardId, placement)
    },
    [moveCard],
  )
  const activeKeyboardCard = useMemo<CardHoverTarget | null>(() => {
    if (hoveredCard && cardZone(state, hoveredCard.cardId) === hoveredCard.zone) return hoveredCard
    if (selectedCardId && selectedZone) return { cardId: selectedCardId, zone: selectedZone }
    return null
  }, [hoveredCard, selectedCardId, selectedZone, state])

  const moveActiveKeyboardCard = useCallback(
    (to: PlaytestZone) => {
      if (!activeKeyboardCard || activeKeyboardCard.zone === to) return false
      moveCard(activeKeyboardCard.zone, to, activeKeyboardCard.cardId)
      return true
    },
    [activeKeyboardCard, moveCard],
  )
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return

      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === "z") {
        event.preventDefault()
        undo()
        return
      }

      if (key === "d") {
        event.preventDefault()
        draw(1)
      } else if (key === "m" && openingHand) {
        event.preventDefault()
        mulligan()
      } else if (key === "n") {
        event.preventDefault()
        nextTurn()
      } else if (key === "s") {
        event.preventDefault()
        shuffle()
      } else if (key === "u") {
        event.preventDefault()
        untapAll()
      } else if (key === "t" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (activeKeyboardCard?.zone !== "battlefield") return

        event.preventDefault()
        toggleTapped(activeKeyboardCard.cardId)
      } else if (!event.metaKey && !event.ctrlKey && !event.altKey && (key === "h" || key === "g" || key === "e" || key === "b")) {
        const canPlayActiveKeyboardCard =
          activeKeyboardCard?.zone === "hand" ||
          activeKeyboardCard?.zone === "command" ||
          activeKeyboardCard?.zone === "library"
        const moved =
          key === "h"
            ? moveActiveKeyboardCard("hand")
            : key === "g"
              ? moveActiveKeyboardCard("graveyard")
              : key === "e"
                ? moveActiveKeyboardCard("exile")
                : canPlayActiveKeyboardCard
                  ? moveActiveKeyboardCard("battlefield")
                  : false

        if (!moved) return
        event.preventDefault()
      } else if (key === "enter" && openingHand) {
        event.preventDefault()
        keepHand()
      } else if (key === "escape") {
        event.preventDefault()
        setContextMenu(null)
        setSelectedCardId(null)
      } else if (key === "+" || key === "=") {
        event.preventDefault()
        changeLife(1)
      } else if (key === "-") {
        event.preventDefault()
        changeLife(-1)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeKeyboardCard, changeLife, draw, keepHand, moveActiveKeyboardCard, mulligan, nextTurn, openingHand, shuffle, toggleTapped, undo, untapAll])

  return (
    <div className="h-[calc(100dvh-1.25rem)] min-h-[42rem] overflow-hidden rounded-box border border-base-300 bg-[#0d0e0c] text-base-content shadow-2xl">
      <div className="grid h-full grid-rows-[2.75rem_minmax(0,1fr)_10.5rem] lg:grid-cols-[minmax(0,1fr)_14rem]">
        <PlaytestTopBar deckId={deckId} deckName={deckName} turn={turn} />

        <main className="relative row-start-2 min-h-0 overflow-hidden border-y border-base-300/70 bg-[radial-gradient(circle_at_center,color-mix(in_oklch,var(--color-primary),transparent_88%),transparent_34rem)] lg:col-start-1">
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2 text-[0.65rem] font-black uppercase tracking-[0.22em] text-base-content/35">
            Battlefield
            <Badge tone={state.battlefield.length ? "primary" : "neutral"}>{state.battlefield.length}</Badge>
          </div>

          <div
            className="h-full overflow-auto p-8"
            onDragOver={(event) => event.preventDefault()}
            onDrop={dropCardOnBattlefield}
          >
            <div ref={battlefieldSurfaceRef} className="relative h-full min-h-[32rem] min-w-[48rem]">
              {state.battlefield.length ? (
                state.battlefield.map((card, index) => {
                  const position = battlefieldCardPositions[card.id] || defaultBattlefieldPosition(index)

                  return (
                    <CanvasCard
                      key={card.id}
                      card={card}
                      isSelected={selectedCardId === card.id}
                      isTapped={tappedCards.has(card.id)}
                      position={position}
                      status={statusFor(cardStatuses, card.id)}
                      onClick={() => activateCard(card, "battlefield")}
                      onContextMenu={(event) => openContextMenu(card, "battlefield", event)}
                      onPointerDown={(event) => beginBattlefieldPointerDrag(card.id, event)}
                      onPointerMove={updateBattlefieldPointerDrag}
                      onPointerUp={finishBattlefieldPointerDrag}
                      onPointerCancel={finishBattlefieldPointerDrag}
                      onMouseEnter={() => markCardHovered(card.id, "battlefield")}
                      onMouseLeave={() => clearCardHovered(card.id)}
                      onFocus={() => markCardHovered(card.id, "battlefield")}
                      onBlur={() => clearCardHovered(card.id)}
                      isDragging={draggingBattlefieldCardId === card.id}
                      zoom={zoom}
                    />
                  )
                })
              ) : (
                <div className="flex h-full min-h-[28rem] items-center justify-center">
                  <EmptyBattlefield
                    command={state.command}
                    onCardHover={markCardHovered}
                    onCardLeave={clearCardHovered}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-box border border-base-300 bg-base-100/80 p-1 text-xs shadow-xl backdrop-blur">
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-square"
              aria-label="Zoom out"
              onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs min-w-14"
              onClick={() => setZoom(1)}
              title="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-square"
              aria-label="Zoom in"
              onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          {openingHand ? (
            <OpeningHandOverlay
              hand={state.hand}
              mulligans={state.mulligans}
              onCardHover={markCardHovered}
              onCardLeave={clearCardHovered}
              onKeep={keepHand}
              onMulligan={mulligan}
              onNewHand={resetGame}
            />
          ) : null}
        </main>

        <PlaytestSidebar
          actionCount={actionCount}
          canUndo={history.length > 0}
          lastAction={lastAction}
          libraryCount={state.library.length}
          lifeTotal={lifeTotal}
          onActionCountChange={setActionCount}
          onDraw={draw}
          onExile={exileTop}
          onCreateToken={openTokenDialog}
          onMill={mill}
          onLibrary={() => setPeek({ count: state.library.length, mode: "Library" })}
          onLifeChange={changeLife}
          onNewGame={resetGame}
          onDiceAndCoin={rollDiceAndCoin}
          onNextTurn={nextTurn}
          onShuffle={shuffle}
          onLook={() => setPeek({ count: Math.min(state.library.length, actionCount), mode: "Look" })}
          onUndo={undo}
          onScry={() => setPeek({ count: Math.min(state.library.length, actionCount), mode: "Scry" })}
          onUntapAll={untapAll}
          onSurveil={() => setPeek({ count: Math.min(state.library.length, actionCount), mode: "Surveil" })}
          selectedCard={selectedCard}
          selectedZone={selectedZone}
          tapped={selectedCard ? tappedCards.has(selectedCard.id) : false}
          selectedStatus={selectedStatus}
          onMove={moveCard}
          onTapSelected={selectedCard ? () => toggleTapped(selectedCard.id) : undefined}
        />

        <PlaytestBottomZones
          command={state.command}
          exile={state.exile}
          graveyard={state.graveyard}
          hand={state.hand}
          libraryCount={state.library.length}
          onCardClick={activateCard}
          onCardContextMenu={openContextMenu}
          onCardDragStart={startCardDrag}
          onCardHover={markCardHovered}
          onCardLeave={clearCardHovered}
          selectedCardId={selectedCardId}
        />
        {hoverPreviewCard && !contextMenu && !peek ? <HoverCardPreview card={hoverPreviewCard} /> : null}
        {contextMenu ? (
          <CardContextMenu
            card={selectedCard}
            cardStatus={selectedStatus || defaultCardStatus()}
            menu={contextMenu}
            onAddMarker={addMarker}
            onAdjustCounter={adjustCounter}
            onClearStatus={clearCardStatus}
            onClose={() => setContextMenu(null)}
            onMove={moveCard}
            onSetPowerToughness={setPowerToughness}
            onToggleFaceDown={toggleFaceDown}
            onToggleTapped={toggleTapped}
            tapped={selectedCard ? tappedCards.has(selectedCard.id) : false}
          />
        ) : null}
        {tokenDialogOpen ? <CreateTokenDialog onCancel={() => setTokenDialogOpen(false)} onCreate={createToken} /> : null}
        {peek ? (
          <PeekOverlay
            cards={state.library.slice(0, peek.count)}
            mode={peek.mode}
            onClose={() => setPeek(null)}
            onMoveCard={moveTopLibraryCard}
            onCardHover={markCardHovered}
            onCardLeave={clearCardHovered}
          />
        ) : null}
      </div>
    </div>
  )
}

function PlaytestTopBar({
  deckId,
  deckName,
  turn,
}: {
  deckId: string
  deckName: string
  turn: number
}) {
  return (
    <header className="col-span-full row-start-1 flex min-w-0 items-center gap-3 border-b border-base-300 bg-base-100/95 px-3 text-sm shadow-sm">
      <div className="min-w-0 flex-1 truncate text-xs font-black uppercase tracking-[0.18em] text-base-content/70">
        {deckName}
      </div>
      <div className="hidden rounded border border-base-300 bg-base-200 px-3 py-1 text-xs font-bold text-base-content/70 sm:block">
        Turn {turn}
      </div>
      <Link
        to="/decks/$id"
        params={{ id: deckId }}
        className="btn btn-ghost btn-xs gap-1 text-base-content/60"
      >
        <X className="h-3.5 w-3.5" />
        Close
      </Link>
    </header>
  )
}

function PlaytestSidebar({
  actionCount,
  canUndo,
  lastAction,
  libraryCount,
  lifeTotal,
  onActionCountChange,
  onCreateToken,
  onDiceAndCoin,
  onDraw,
  onExile,
  onLibrary,
  onLifeChange,
  onLook,
  onMill,
  onMove,
  onNewGame,
  onNextTurn,
  onScry,
  onShuffle,
  onSurveil,
  onTapSelected,
  onUndo,
  onUntapAll,
  selectedCard,
  selectedStatus,
  selectedZone,
  tapped,
}: {
  actionCount: number
  canUndo: boolean
  lastAction: string
  libraryCount: number
  lifeTotal: number
  onActionCountChange: (count: number) => void
  onCreateToken: () => void
  onDiceAndCoin: () => void
  onDraw: (count?: number) => void
  onExile: (count?: number) => void
  onLibrary: () => void
  onLifeChange: (delta: number) => void
  onLook: () => void
  onMill: (count?: number) => void
  onMove: (from: PlaytestZone, to: PlaytestZone, cardId: string, placement?: "top" | "bottom") => void
  onNewGame: () => void
  onNextTurn: () => void
  onScry: () => void
  onShuffle: () => void
  onSurveil: () => void
  onTapSelected?: () => void
  onUndo: () => void
  onUntapAll: () => void
  selectedCard: PlaytestCard | null
  selectedStatus: CardStatus | null
  selectedZone: PlaytestZone | null
  tapped: boolean
}) {
  const selectedActions = selectedZone ? ZONE_ACTIONS[selectedZone] || [] : []

  return (
    <aside className="row-start-2 hidden min-h-0 flex-col gap-1.5 overflow-y-auto border-l border-base-300 bg-base-100/90 p-2 shadow-2xl lg:col-start-2 lg:flex">
      <div className="rounded-box border border-primary/30 bg-primary/10 p-2 text-primary shadow-sm">
        <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-primary/80">Life</p>
        <div className="mt-1 flex items-center overflow-hidden rounded-full border border-primary/25 bg-base-100 text-base-content">
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square h-8 min-h-8 rounded-none border-r border-primary/15 hover:bg-primary/10"
            onClick={() => onLifeChange(-1)}
            aria-label="Lose 1 life"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-center px-3">
            <span className="text-2xl font-black leading-none tabular-nums">{lifeTotal}</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square h-8 min-h-8 rounded-none border-l border-primary/15 hover:bg-primary/10"
            onClick={() => onLifeChange(1)}
            aria-label="Gain 1 life"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onLibrary} disabled={libraryCount === 0}>
        <Library className="h-4 w-4" />
        Library
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onNewGame}>
        <Play className="h-4 w-4" />
        Restart
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onCreateToken}>
        <Sparkles className="h-4 w-4" />
        Create Token
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onShuffle} disabled={libraryCount < 2}>
        <Shuffle className="h-4 w-4" />
        Shuffle <kbd className="kbd kbd-xs">S</kbd>
      </Button>
      <ActionWithCount
        count={actionCount}
        disabled={libraryCount === 0}
        icon={Hand}
        label="Draw"
        onAction={() => onDraw(actionCount)}
        onCountChange={onActionCountChange}
        shortcut="D"
      />
      <ActionWithCount
        count={actionCount}
        disabled={libraryCount === 0}
        icon={Eye}
        label="Scry"
        onAction={onScry}
        onCountChange={onActionCountChange}
      />
      <ActionWithCount
        count={actionCount}
        disabled={libraryCount === 0}
        icon={EyeOff}
        label="Surveil"
        onAction={onSurveil}
        onCountChange={onActionCountChange}
      />
      <ActionWithCount
        count={actionCount}
        disabled={libraryCount === 0}
        icon={Eye}
        label="Look"
        onAction={onLook}
        onCountChange={onActionCountChange}
      />
      <ActionWithCount
        count={actionCount}
        disabled={libraryCount === 0}
        icon={Skull}
        label="Mill"
        onAction={() => onMill(actionCount)}
        onCountChange={onActionCountChange}
      />
      <ActionWithCount
        count={actionCount}
        disabled={libraryCount === 0}
        icon={Flame}
        label="Exile"
        onAction={() => onExile(actionCount)}
        onCountChange={onActionCountChange}
      />
      <Button type="button" variant="outline" size="sm" onClick={onDiceAndCoin}>
        <Dices className="h-4 w-4" />
        Dice & Coin
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={onNextTurn}>
        <Swords className="h-4 w-4" />
        Next Turn <kbd className="kbd kbd-xs">N</kbd>
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onUntapAll}>
        <RotateCcw className="h-4 w-4" />
        Untap All <kbd className="kbd kbd-xs">U</kbd>
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onUndo} disabled={!canUndo}>
        <Undo2 className="h-4 w-4" />
        Undo <kbd className="kbd kbd-xs">Ctrl+Z</kbd>
      </Button>

      <div className="mt-2 rounded-box border border-base-300 bg-base-200/70 p-3">
        <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-base-content/45">Selected</p>
        {selectedCard && selectedZone ? (
          <div className="mt-3 space-y-3">
            <div className="flex gap-3">
              <CardThumb card={selectedCard} compact faceDown={selectedStatus?.faceDown} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-black leading-tight">{selectedStatus?.faceDown ? "Face-down card" : selectedCard.name}</p>
                <p className="mt-1 text-xs text-base-content/55">{ZONE_LABELS[selectedZone]}</p>
                {selectedStatus && (selectedStatus.plusOneCounters || selectedStatus.minusOneCounters || selectedStatus.markers) ? (
                  <p className="mt-1 text-xs text-base-content/55">
                    +1/+1 {selectedStatus.plusOneCounters} · -1/-1 {selectedStatus.minusOneCounters} · markers {selectedStatus.markers}
                  </p>
                ) : null}
              </div>
            </div>
            {selectedZone === "battlefield" && onTapSelected ? (
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={onTapSelected}>
                {tapped ? "Untap" : "Tap"}
              </Button>
            ) : null}
            <div className="grid gap-1.5">
              {selectedActions.map((action) => {
                const Icon = action.icon
                return (
                  <Button
                    key={`${action.to}-${action.label}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={() => onMove(selectedZone, action.to, selectedCard.id, action.placement)}
                  >
                    {Icon ? <Icon className="h-4 w-4" /> : null}
                    {action.label}
                  </Button>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-base-content/55">Drag hand cards to the battlefield or right-click any card for actions.</p>
        )}
      </div>

      <div className="mt-auto rounded-box border border-base-300 bg-base-200/70 p-3 text-xs text-base-content/65">
        <p className="font-bold text-base-content">{lastAction}</p>
        <p className="mt-2">Keys: <kbd className="kbd kbd-xs">D</kbd> draw, <kbd className="kbd kbd-xs">T</kbd> tap hovered card, <kbd className="kbd kbd-xs">S</kbd> shuffle, <kbd className="kbd kbd-xs">N</kbd> next turn.</p>
      </div>
    </aside>
  )
}

function ActionWithCount({
  count,
  disabled,
  icon: Icon,
  label,
  onAction,
  onCountChange,
  shortcut,
}: {
  count: number
  disabled?: boolean
  icon: LucideIcon
  label: string
  onAction: () => void
  onCountChange: (count: number) => void
  shortcut?: string
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_3.5rem] gap-1">
      <Button type="button" variant="outline" size="sm" onClick={onAction} disabled={disabled}>
        <Icon className="h-4 w-4" />
        {label} {shortcut ? <kbd className="kbd kbd-xs">{shortcut}</kbd> : null}
      </Button>
      <input
        type="number"
        className="input input-sm input-bordered h-8 min-h-8 px-2 text-center text-xs font-bold"
        min={1}
        max={99}
        value={count}
        onChange={(event) => onCountChange(Math.max(1, Number(event.target.value) || 1))}
        aria-label={`${label} count`}
      />
    </div>
  )
}

function PlaytestBottomZones({
  command,
  exile,
  graveyard,
  hand,
  libraryCount,
  onCardClick,
  onCardContextMenu,
  onCardDragStart,
  onCardHover,
  onCardLeave,
  selectedCardId,
}: {
  command: PlaytestCard[]
  exile: PlaytestCard[]
  graveyard: PlaytestCard[]
  hand: PlaytestCard[]
  libraryCount: number
  onCardClick: (card: PlaytestCard, zone: PlaytestZone) => void
  onCardContextMenu: (card: PlaytestCard, zone: PlaytestZone, event: MouseEvent) => void
  onCardDragStart: (card: PlaytestCard, zone: PlaytestZone, event: DragEvent<HTMLElement>) => void
  onCardHover: (cardId: string, zone: PlaytestZone) => void
  onCardLeave: (cardId: string) => void
  selectedCardId: string | null
}) {
  return (
    <footer className="col-span-full row-start-3 grid min-h-0 grid-cols-[minmax(0,1fr)_8rem_8rem_8rem_8rem] border-t border-base-300 bg-base-100/95 text-xs shadow-2xl">
      <ZoneStrip title="Hand" count={hand.length} className="border-r border-base-300">
        <div className="flex h-full items-end gap-2 overflow-x-auto px-2 pb-2 pt-5">
          {hand.map((card) => (
            <button
              key={card.id}
              type="button"
              className={cn(
                "group relative h-[8.7rem] w-[6.25rem] shrink-0 cursor-grab rounded-md border border-base-300 bg-base-200 shadow transition hover:-translate-y-2 hover:border-primary active:cursor-grabbing active:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                selectedCardId === card.id && "border-primary ring-2 ring-primary/35",
              )}
              title={`Play ${card.name}`}
              onClick={() => onCardClick(card, "hand")}
              draggable
              onContextMenu={(event) => onCardContextMenu(card, "hand", event)}
              onDragStart={(event) => onCardDragStart(card, "hand", event)}
              onMouseEnter={() => onCardHover(card.id, "hand")}
              onMouseLeave={() => onCardLeave(card.id)}
              onFocus={() => onCardHover(card.id, "hand")}
              onBlur={() => onCardLeave(card.id)}
            >
              <CardThumb card={card} />
            </button>
          ))}
        </div>
      </ZoneStrip>
      <PileZone title="Library" count={libraryCount} icon={EyeOff} />
      <VisiblePileZone
        title="Graveyard"
        cards={graveyard}
        icon={Skull}
        onCardClick={(card) => onCardClick(card, "graveyard")}
        onCardContextMenu={(card, event) => onCardContextMenu(card, "graveyard", event)}
        onCardDragStart={(card, event) => onCardDragStart(card, "graveyard", event)}
        onCardHover={(card) => onCardHover(card.id, "graveyard")}
        onCardLeave={(card) => onCardLeave(card.id)}
      />
      <VisiblePileZone
        title="Exile"
        cards={exile}
        icon={Flame}
        onCardClick={(card) => onCardClick(card, "exile")}
        onCardContextMenu={(card, event) => onCardContextMenu(card, "exile", event)}
        onCardDragStart={(card, event) => onCardDragStart(card, "exile", event)}
        onCardHover={(card) => onCardHover(card.id, "exile")}
        onCardLeave={(card) => onCardLeave(card.id)}
      />
      <VisiblePileZone
        title="Command"
        cards={command}
        icon={Sparkles}
        onCardClick={(card) => onCardClick(card, "command")}
        onCardContextMenu={(card, event) => onCardContextMenu(card, "command", event)}
        onCardDragStart={(card, event) => onCardDragStart(card, "command", event)}
        onCardHover={(card) => onCardHover(card.id, "command")}
        onCardLeave={(card) => onCardLeave(card.id)}
      />
    </footer>
  )
}

function ZoneStrip({
  children,
  className,
  count,
  title,
}: {
  children: ReactNode
  className?: string
  count: number
  title: string
}) {
  return (
    <section className={cn("relative min-w-0", className)}>
      <div className="absolute left-2 top-1 z-10 flex items-center gap-1 text-[0.62rem] font-black uppercase tracking-[0.18em] text-base-content/45">
        {title} ({count})
      </div>
      {children}
    </section>
  )
}

function PileZone({ count, icon: Icon, title }: { count: number; icon: LucideIcon; title: string }) {
  return (
    <ZoneStrip title={title} count={count} className="border-r border-base-300">
      <div className="flex h-full items-center justify-center p-2 pt-5">
        <div className="flex aspect-[5/7] w-20 flex-col items-center justify-center rounded-md border border-base-300 bg-base-200 text-base-content/50 shadow-inner">
          <Icon className="h-5 w-5" />
          <span className="mt-2 font-black tabular-nums">{count}</span>
        </div>
      </div>
    </ZoneStrip>
  )
}

function VisiblePileZone({
  cards,
  icon,
  onCardClick,
  onCardContextMenu,
  onCardDragStart,
  onCardHover,
  onCardLeave,
  title,
}: {
  cards: PlaytestCard[]
  icon: LucideIcon
  onCardClick: (card: PlaytestCard) => void
  onCardContextMenu: (card: PlaytestCard, event: MouseEvent) => void
  onCardDragStart: (card: PlaytestCard, event: DragEvent<HTMLElement>) => void
  onCardHover: (card: PlaytestCard) => void
  onCardLeave: (card: PlaytestCard) => void
  title: string
}) {
  const topCard = cards[0]

  return (
    <ZoneStrip title={title} count={cards.length} className="border-r border-base-300 last:border-r-0">
      <div className="flex h-full items-center justify-center p-2 pt-5">
        {topCard ? (
          <button
            type="button"
            className="aspect-[5/7] w-20 cursor-grab overflow-hidden rounded-md border border-base-300 bg-base-200 shadow transition hover:-translate-y-1 hover:border-primary active:cursor-grabbing active:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title={topCard.name}
            onClick={() => onCardClick(topCard)}
            draggable
            onContextMenu={(event) => onCardContextMenu(topCard, event)}
            onDragStart={(event) => onCardDragStart(topCard, event)}
            onMouseEnter={() => onCardHover(topCard)}
            onMouseLeave={() => onCardLeave(topCard)}
            onFocus={() => onCardHover(topCard)}
            onBlur={() => onCardLeave(topCard)}
          >
            <CardThumb card={topCard} />
          </button>
        ) : (
          <PileZoneCard count={cards.length} icon={icon} />
        )}
      </div>
    </ZoneStrip>
  )
}

function PileZoneCard({ count, icon: Icon }: { count: number; icon: LucideIcon }) {
  return (
    <div className="flex aspect-[5/7] w-20 flex-col items-center justify-center rounded-md border border-dashed border-base-300 bg-base-200/55 text-base-content/40">
      <Icon className="h-5 w-5" />
      <span className="mt-2 font-black tabular-nums">{count}</span>
    </div>
  )
}

function EmptyBattlefield({
  command,
  onCardHover,
  onCardLeave,
}: {
  command: PlaytestCard[]
  onCardHover: (cardId: string, zone: PlaytestZone) => void
  onCardLeave: (cardId: string) => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      {command.length ? (
        <div>
          <p className="mb-2 text-[0.65rem] font-black uppercase tracking-[0.2em] text-base-content/45">Commander</p>
          <div
            className="mx-auto w-36 overflow-hidden rounded-lg border border-dashed border-primary/70 bg-base-200 p-1 shadow-2xl shadow-primary/10"
            onMouseEnter={() => onCardHover(command[0].id, "command")}
            onMouseLeave={() => onCardLeave(command[0].id)}
            onFocus={() => onCardHover(command[0].id, "command")}
            onBlur={() => onCardLeave(command[0].id)}
          >
            <CardThumb card={command[0]} />
          </div>
        </div>
      ) : null}
      <p className="max-w-xs text-sm text-base-content/45">Drag cards here from your hand or command zone.</p>
    </div>
  )
}

function OpeningHandOverlay({
  hand,
  mulligans,
  onCardHover,
  onCardLeave,
  onKeep,
  onMulligan,
  onNewHand,
}: {
  hand: PlaytestCard[]
  mulligans: number
  onCardHover: (cardId: string, zone: PlaytestZone) => void
  onCardLeave: (cardId: string) => void
  onKeep: () => void
  onMulligan: () => void
  onNewHand: () => void
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm">
      <section className="w-full max-w-6xl rounded-box border border-base-300 bg-base-100/95 p-5 shadow-2xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black">Opening Hand</h2>
            <p className="text-sm text-base-content/55">
              Press <kbd className="kbd kbd-xs">Enter</kbd> to keep · <kbd className="kbd kbd-xs">M</kbd> to mulligan
            </p>
          </div>
          <Badge tone={mulligans > 0 ? "warning" : "neutral"}>{mulligans ? `${mulligans} mulligan${mulligans === 1 ? "" : "s"}` : "Free mulligan available"}</Badge>
        </div>
        <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
          {hand.map((card) => (
            <div
              key={card.id}
              className="w-36 shrink-0 overflow-hidden rounded-lg border border-base-300 bg-base-200 shadow-xl"
              onMouseEnter={() => onCardHover(card.id, "hand")}
              onMouseLeave={() => onCardLeave(card.id)}
              onFocus={() => onCardHover(card.id, "hand")}
              onBlur={() => onCardLeave(card.id)}
            >
              <CardThumb card={card} />
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Button type="button" variant="outline" onClick={onMulligan}>
            <Dices className="h-4 w-4" />
            Mulligan
          </Button>
          <Button type="button" onClick={onKeep}>
            <Sparkles className="h-4 w-4" />
            Keep Hand
          </Button>
          <Button type="button" variant="ghost" onClick={onNewHand}>
            <RotateCcw className="h-4 w-4" />
            New Hand
          </Button>
        </div>
      </section>
    </div>
  )
}

function HoverCardPreview({ card }: { card: PlaytestCard }) {
  return (
    <aside className="pointer-events-none fixed bottom-44 right-4 z-40 w-56 rounded-box border border-primary/40 bg-base-100/95 p-2 shadow-2xl shadow-black/45 backdrop-blur lg:right-60 lg:w-64">
      <div className="overflow-hidden rounded-lg border border-base-300 bg-base-200">
        <CardThumb card={card} />
      </div>
      <div className="px-1 pb-1 pt-2">
        <p className="line-clamp-2 text-sm font-black leading-tight">{card.name}</p>
        {card.typeLine ? <p className="mt-1 line-clamp-2 text-xs text-base-content/60">{card.typeLine}</p> : null}
      </div>
    </aside>
  )
}

function CreateTokenDialog({
  onCancel,
  onCreate,
}: {
  onCancel: () => void
  onCreate: (values: TokenFormValues) => void
}) {
  const [name, setName] = useState("Token")
  const [typeLine, setTypeLine] = useState("Token Creature")
  const [power, setPower] = useState("")
  const [toughness, setToughness] = useState("")

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <form
        aria-labelledby="create-token-title"
        aria-modal="true"
        className="w-full max-w-sm rounded-box border border-base-300 bg-base-100 p-4 shadow-2xl"
        role="dialog"
        onSubmit={(event) => {
          event.preventDefault()
          onCreate({
            name: name.trim() || "Token",
            power: power.trim(),
            toughness: toughness.trim(),
            typeLine: typeLine.trim() || "Token Creature",
          })
        }}
      >
        <h2 id="create-token-title" className="text-lg font-black">Create Token</h2>
        <div className="mt-4 space-y-3">
          <label className="form-control">
            <span className="label-text">Name</span>
            <input className="input input-bordered input-sm" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </label>
          <label className="form-control">
            <span className="label-text">Type line</span>
            <input className="input input-bordered input-sm" value={typeLine} onChange={(event) => setTypeLine(event.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="form-control">
              <span className="label-text">Power</span>
              <input className="input input-bordered input-sm" value={power} onChange={(event) => setPower(event.target.value)} />
            </label>
            <label className="form-control">
              <span className="label-text">Toughness</span>
              <input className="input input-bordered input-sm" value={toughness} onChange={(event) => setToughness(event.target.value)} />
            </label>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            Create
          </Button>
        </div>
      </form>
    </div>
  )
}

function CardContextMenu({
  card,
  cardStatus,
  menu,
  onAddMarker,
  onAdjustCounter,
  onClearStatus,
  onClose,
  onMove,
  onSetPowerToughness,
  onToggleFaceDown,
  onToggleTapped,
  tapped,
}: {
  card: PlaytestCard | null
  cardStatus: CardStatus
  menu: NonNullable<ContextMenuState>
  onAddMarker: (cardId: string) => void
  onAdjustCounter: (cardId: string, kind: "plusOneCounters" | "minusOneCounters", delta: number) => void
  onClearStatus: (cardId: string) => void
  onClose: () => void
  onMove: (from: PlaytestZone, to: PlaytestZone, cardId: string, placement?: "top" | "bottom") => void
  onSetPowerToughness: (cardId: string, power: string, toughness: string) => void
  onToggleFaceDown: (cardId: string) => void
  onToggleTapped: (cardId: string) => void
  tapped: boolean
}) {
  const [power, setPower] = useState(cardStatus.power || "0")
  const [toughness, setToughness] = useState(cardStatus.toughness || "0")
  const hasClearableStatus = hasClearableCardStatus(cardStatus)

  if (!card) return null

  return (
    <>
      <button type="button" aria-label="Close card menu" className="fixed inset-0 z-40 cursor-default bg-transparent" onClick={onClose} />
      <div
        className="fixed z-50 w-80 overflow-hidden rounded-box border border-base-300 bg-base-100/95 text-sm shadow-2xl backdrop-blur"
        style={{ left: menu.x, top: menu.y }}
        role="menu"
      >
        <div className="border-b border-base-300 px-3 py-2 font-black">{cardStatus.faceDown ? "Face-down card" : card.name}</div>
        {menu.zone === "battlefield" ? (
          <MenuButton label={tapped ? "Untap" : "Tap"} shortcut="T" icon={RotateCcw} onClick={() => onToggleTapped(card.id)} />
        ) : null}
        <MenuButton label={cardStatus.faceDown ? "Turn face up" : "Turn face down"} icon={EyeOff} onClick={() => onToggleFaceDown(card.id)} />
        <MenuButton label={`+1/+1 Counter (${cardStatus.plusOneCounters})`} shortcut="+" icon={Plus} onClick={() => onAdjustCounter(card.id, "plusOneCounters", 1)} />
        <MenuButton label={`-1/-1 Counter (${cardStatus.minusOneCounters})`} shortcut="-" icon={Plus} onClick={() => onAdjustCounter(card.id, "minusOneCounters", 1)} />
        <MenuButton label={`Add Marker (${cardStatus.markers})`} icon={Sparkles} onClick={() => onAddMarker(card.id)} />
        <MenuButton label="Remove all counters" icon={Minus} onClick={() => onClearStatus(card.id)} disabled={!hasClearableStatus} />
        <div className="border-y border-base-300 px-3 py-2 text-xs text-base-content/60">
          Counters: +1/+1 {cardStatus.plusOneCounters}, -1/-1 {cardStatus.minusOneCounters}, markers {cardStatus.markers}
        </div>
        <div className="flex items-center gap-2 border-b border-base-300 px-3 py-2">
          <span className="min-w-0 flex-1 text-base-content/80">Set power / toughness</span>
          <input className="input input-xs input-bordered w-12 text-center" value={power} onChange={(event) => setPower(event.target.value)} />
          <span>/</span>
          <input className="input input-xs input-bordered w-12 text-center" value={toughness} onChange={(event) => setToughness(event.target.value)} />
          <button type="button" className="btn btn-xs btn-outline" onClick={() => onSetPowerToughness(card.id, power, toughness)}>
            OK
          </button>
        </div>
        {menu.zone !== "hand" ? <MenuButton label="Return to Hand" shortcut="H" icon={Hand} onClick={() => onMove(menu.zone, "hand", card.id)} /> : null}
        {menu.zone !== "graveyard" ? <MenuButton label="Graveyard" shortcut="G" icon={Skull} onClick={() => onMove(menu.zone, "graveyard", card.id)} /> : null}
        {menu.zone !== "exile" ? <MenuButton label="Exile" shortcut="E" icon={Flame} onClick={() => onMove(menu.zone, "exile", card.id)} /> : null}
        <MenuButton label="Top of Library" icon={ArrowUpFromLine} onClick={() => onMove(menu.zone, "library", card.id, "top")} />
        <MenuButton label="Bottom of Library" icon={ArrowDownToLine} onClick={() => onMove(menu.zone, "library", card.id, "bottom")} />
      </div>
    </>
  )
}

function MenuButton({
  disabled = false,
  icon: Icon,
  label,
  onClick,
  shortcut,
}: {
  disabled?: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
  shortcut?: string
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2 text-left text-base-content/80 hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        disabled && "cursor-not-allowed text-base-content/35 hover:bg-transparent",
      )}
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
    >
      <Icon className={cn("h-4 w-4 text-base-content/45", disabled && "text-base-content/25")} />
      <span className="min-w-0 flex-1">{label}</span>
      {shortcut ? <kbd className="kbd kbd-xs">{shortcut}</kbd> : null}
    </button>
  )
}

function PeekOverlay({
  cards,
  mode,
  onCardHover,
  onCardLeave,
  onClose,
  onMoveCard,
}: {
  cards: PlaytestCard[]
  mode: PeekMode
  onCardHover?: (cardId: string, zone: PlaytestZone) => void
  onCardLeave?: (cardId: string) => void
  onClose: () => void
  onMoveCard: (cardId: string, to: PlaytestZone, placement?: "top" | "bottom") => void
}) {
  const isActionMode = mode === "Scry" || mode === "Surveil"
  const hasDestinationActions = mode === "Library" || mode === "Look"
  const cardListClassName = isActionMode
    ? "mt-5 flex gap-3 overflow-x-auto pb-2"
    : "mt-5 grid max-h-[70vh] grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3 overflow-y-auto pr-1"
  const cardFrameClassName = isActionMode
    ? "w-36 shrink-0 overflow-hidden rounded-lg border border-base-300 bg-base-200 shadow-xl"
    : "min-w-0 overflow-hidden rounded-lg border border-base-300 bg-base-200 shadow-xl"
  const summary =
    mode === "Library"
      ? `${cards.length} card${cards.length === 1 ? "" : "s"} in library`
      : cards.length
        ? `Top ${cards.length} card${cards.length === 1 ? "" : "s"} of library`
        : "Library is empty"
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-5 backdrop-blur-sm">
      <section className="flex max-h-[90vh] w-full max-w-6xl flex-col rounded-box border border-base-300 bg-base-100/95 p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">{mode === "Library" ? "Library" : mode}</h2>
            <p className="text-sm text-base-content/55">{summary}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className={cardListClassName}>
          {cards.map((card) => (
            <div
              key={card.id}
              className={cardFrameClassName}
              onBlur={() => onCardLeave?.(card.id)}
              onFocus={() => onCardHover?.(card.id, "library")}
              onMouseEnter={() => onCardHover?.(card.id, "library")}
              onMouseLeave={() => onCardLeave?.(card.id)}
            >
              <CardThumb card={card} />
              {mode === "Scry" ? (
                <div className="grid grid-cols-2 gap-1 p-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => onMoveCard(card.id, "library", "bottom")}>
                    Bottom
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                    Keep
                  </Button>
                </div>
              ) : null}
              {mode === "Surveil" ? (
                <div className="grid grid-cols-2 gap-1 p-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => onMoveCard(card.id, "graveyard")}>
                    Grave
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                    Keep
                  </Button>
                </div>
              ) : null}
              {hasDestinationActions ? (
                <div className="grid grid-cols-2 gap-1 p-2">
                  {PEEK_LIBRARY_ACTIONS.map((action) => {
                    const Icon = action.icon

                    return (
                      <button
                        key={action.to}
                        type="button"
                        className="btn btn-xs btn-ghost min-h-7 justify-start gap-1.5 px-2 text-[0.65rem] font-black"
                        onClick={() => {
                          onCardLeave?.(card.id)
                          onMoveCard(card.id, action.to)
                        }}
                        aria-label={`${action.title} ${card.name}`}
                        title={action.title}
                      >
                        <Icon className="h-3 w-3 shrink-0 text-base-content/50" />
                        <span className="min-w-0 flex-1 truncate text-left">{action.label}</span>
                        <kbd className="kbd kbd-xs hidden px-1 sm:inline-flex">{action.shortcut}</kbd>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function CanvasCard({
  card,
  isSelected,
  isTapped,
  onClick,
  onContextMenu,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  isDragging,
  position,
  status,
  zoom,
}: {
  card: PlaytestCard
  isSelected: boolean
  isTapped: boolean
  onClick: () => void
  onContextMenu: (event: MouseEvent) => void
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onFocus: () => void
  onBlur: () => void
  isDragging: boolean
  position: BattlefieldCardPosition
  status: CardStatus
  zoom: number
}) {
  const hasCounters = status.plusOneCounters > 0 || status.minusOneCounters > 0 || status.markers > 0

  return (
    <button
      type="button"
      draggable={false}
      className={cn(
        "absolute origin-center touch-none select-none overflow-hidden rounded-lg border bg-base-200 shadow-2xl transition-[box-shadow,border-color,opacity] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isDragging ? "z-30 cursor-grabbing opacity-95 shadow-primary/40" : "cursor-grab",
        isSelected ? "border-primary ring-2 ring-primary/40" : "border-base-300 hover:border-primary/70",
        isTapped && "rotate-90",
      )}
      style={{ left: position.x, top: position.y, width: `${BATTLEFIELD_CARD_WIDTH_REM * zoom}rem` }}
      title={status.faceDown ? "Face-down card" : card.name}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className="relative">
        <CardThumb card={card} faceDown={status.faceDown} />
        {hasCounters || status.power || status.toughness ? (
          <div className="absolute inset-x-1 bottom-1 flex flex-wrap justify-center gap-1">
            {status.plusOneCounters ? <span className="badge badge-success badge-xs">+{status.plusOneCounters}</span> : null}
            {status.minusOneCounters ? <span className="badge badge-error badge-xs">-{status.minusOneCounters}</span> : null}
            {status.markers ? <span className="badge badge-info badge-xs">{status.markers} mark</span> : null}
            {status.power || status.toughness ? (
              <span className="badge badge-warning badge-xs">
                {status.power || "0"}/{status.toughness || "0"}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </button>
  )
}

function CardThumb({
  card,
  compact = false,
  faceDown = false,
}: {
  card: PlaytestCard
  compact?: boolean
  faceDown?: boolean
}) {
  return (
    <div
      className={
        compact
          ? "h-20 w-14 shrink-0 overflow-hidden rounded-md bg-base-300"
          : "aspect-[5/7] overflow-hidden bg-base-300"
      }
    >
      {faceDown ? (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle,color-mix(in_oklch,var(--color-primary),transparent_70%),var(--color-base-300))] p-2 text-center text-xs font-black uppercase tracking-[0.18em] text-base-content/60">
          Face down
        </div>
      ) : card.imageUrl ? (
        <img
          src={card.imageUrl}
          alt={card.name}
          className="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-base-content/50">
          <span className={cn(card.deckCardId === "playtest-token" && "font-black text-base-content/75")}>{card.name}</span>
          {card.deckCardId === "playtest-token" ? <span className="text-[0.6rem] uppercase tracking-[0.14em]">{card.typeLine}</span> : null}
        </div>
      )}
    </div>
  )
}
