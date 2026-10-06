import { History } from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
} from "react"
import { type PlaytestCard, type PlaytestZone } from "../lib/deck-playtest"
import { cn } from "../lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import {
  battlefieldPositionFromDrop,
  battlefieldPositionFromPointer,
  clampBattlefieldPosition,
  clampZoom,
} from "./deck-playtester/battlefield-helpers"
import { PlaytestBattlefield } from "./deck-playtester/battlefield-view"
import { PlaytestBottomZones } from "./deck-playtester/bottom-zones"
import { CardContextMenu } from "./deck-playtester/card-menu"
import { defaultCardStatus } from "./deck-playtester/card-status"
import { COMPACT_ZOOM, HOVER_PREVIEW_DELAY_MS, ZOOM_STEP } from "./deck-playtester/constants"
import {
  DRAG_MIME,
  createCardDragPreview,
  decodeDragPayload,
  dragImageOffset,
  encodeDragPayload,
  removeDragPreviewAfterDragStart,
} from "./deck-playtester/drag-helpers"
import { usePlaytesterKeyboardShortcuts } from "./deck-playtester/keyboard-shortcuts"
import {
  CreateTokenDialog,
  HoverCardPreview,
  OpeningHandOverlay,
  PeekOverlay,
} from "./deck-playtester/overlays"
import { SelectionBar } from "./deck-playtester/selection-bar"
import { PlaytestTopBar } from "./deck-playtester/top-bar"
import { loadSettings, saveSettings } from "./deck-playtester/saved-game"
import type {
  BattlefieldPointerDrag,
  DeckPlaytesterProps,
  PlaytestSettings,
} from "./deck-playtester/types"
import { usePlaytesterState } from "./deck-playtester/use-playtester-state"

/** Finds the zone (hand, graveyard, ...) under a point, ignoring the dragged card itself. */
function dropZoneAt(clientX: number, clientY: number): PlaytestZone | null {
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    const zone = (element as HTMLElement).closest<HTMLElement>("[data-playtest-zone]")
    if (zone) return zone.dataset.playtestZone as PlaytestZone
  }
  return null
}

export function DeckPlaytester({
  closeSlot,
  deckId,
  deckName,
  initialState,
  tokenOptions,
}: DeckPlaytesterProps) {
  const [settings, setSettings] = useState(loadSettings)
  const playtest = usePlaytesterState(deckId, initialState, {
    drawOnNextTurn: settings.drawOnNextTurn,
  })
  const {
    actionLog,
    activateCard: activatePlaytestCard,
    battlefieldCardPositions,
    clearCardHovered,
    clearContextMenu,
    clearTransientSelection,
    closePeek,
    contextMenu,
    hoveredCard,
    lastAction,
    moveBattlefieldCardPosition,
    moveBattlefieldCardPositionsLive,
    moveCard,
    moveCards,
    openContextMenu,
    openingHand,
    peek,
    selectCard,
    selectedCard,
    selectedCardIds,
    selectedCards,
    selectedStatus,
    selectedZone,
    state,
    tappedCards,
    toggleCardSelection,
  } = playtest
  const [hoverPreview, setHoverPreview] = useState<{
    cardId: string
    side: "left" | "right"
  } | null>(null)
  const [draggingCardIds, setDraggingCardIds] = useState<string[]>([])
  const isDragging = draggingCardIds.length > 0
  const [dropTargetZone, setDropTargetZone] = useState<PlaytestZone | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  // Phones start zoomed out so a few permanents fit side by side.
  const [zoom, setZoom] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 640 ? COMPACT_ZOOM : 1,
  )
  const battlefieldSurfaceRef = useRef<HTMLDivElement>(null)
  const battlefieldPointerDragRef = useRef<BattlefieldPointerDrag | null>(null)
  const suppressCardClickRef = useRef(false)

  const updateSettings = useCallback((patch: Partial<PlaytestSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      saveSettings(next)
      return next
    })
  }, [])

  useEffect(() => {
    setHoverPreview(null)
    setDraggingCardIds([])
  }, [initialState])

  const { setBattlefieldLayout } = playtest
  useEffect(() => {
    const surface = battlefieldSurfaceRef.current
    if (!surface) return
    const measure = () =>
      setBattlefieldLayout({ height: surface.clientHeight, width: surface.clientWidth, zoom })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(surface)
    return () => observer.disconnect()
  }, [setBattlefieldLayout, zoom])

  const hoverPreviewCard = useMemo(() => {
    if (!hoverPreview) return null
    return (
      [
        ...state.hand,
        ...state.command,
        ...state.battlefield,
        ...state.graveyard,
        ...state.exile,
      ].find((card) => card.id === hoverPreview.cardId) || null
    )
  }, [hoverPreview, state])

  useEffect(() => {
    setHoverPreview(null)
    if (isDragging || !hoveredCard || hoveredCard.zone === "library") return

    const timeout = window.setTimeout(() => {
      const element = document.querySelector(`[data-playtest-card="${hoveredCard.cardId}"]`)
      const rect = element?.getBoundingClientRect()
      const side = rect && rect.left + rect.width / 2 < window.innerWidth / 2 ? "right" : "left"
      setHoverPreview({ cardId: hoveredCard.cardId, side })
    }, HOVER_PREVIEW_DELAY_MS)

    return () => window.clearTimeout(timeout)
  }, [isDragging, hoveredCard])

  /** New positions for every dragged card: the grabbed card follows the pointer, the rest keep formation. */
  const groupPositionsFor = useCallback(
    (drag: BattlefieldPointerDrag, clientX: number, clientY: number) => {
      const lead = battlefieldPositionFromPointer(clientX, clientY, drag.surface, zoom, drag.offset)
      const leadStart = drag.startPositions[drag.cardId] || lead
      const delta = { x: lead.x - leadStart.x, y: lead.y - leadStart.y }
      return Object.fromEntries(
        drag.cardIds.map((cardId) => {
          if (cardId === drag.cardId) return [cardId, lead]
          const start = drag.startPositions[cardId] || leadStart
          return [
            cardId,
            clampBattlefieldPosition(
              { x: start.x + delta.x, y: start.y + delta.y },
              drag.surface,
              zoom,
            ),
          ]
        }),
      )
    },
    [zoom],
  )

  const flushBattlefieldPointerDrag = useCallback(() => {
    const drag = battlefieldPointerDragRef.current
    if (!drag) return

    drag.frame = null
    setDropTargetZone(dropZoneAt(drag.latestClientX, drag.latestClientY))
    moveBattlefieldCardPositionsLive(
      groupPositionsFor(drag, drag.latestClientX, drag.latestClientY),
    )
  }, [groupPositionsFor, moveBattlefieldCardPositionsLive])

  const beginBattlefieldPointerDrag = useCallback(
    (cardId: string, event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return
      const surface = battlefieldSurfaceRef.current
      if (!surface) return

      clearContextMenu()
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        toggleCardSelection(cardId)
        suppressCardClickRef.current = true
        return
      }

      const rect = event.currentTarget.getBoundingClientRect()
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
      const cardIds =
        selectedCardIds.includes(cardId) && selectedCards.length > 1
          ? selectedCards.map((card) => card.id)
          : [cardId]
      if (cardIds.length === 1) selectCard(cardId)
      setDraggingCardIds(cardIds)
      setHoverPreview(null)

      battlefieldPointerDragRef.current = {
        cardId,
        cardIds,
        frame: null,
        latestClientX: event.clientX,
        latestClientY: event.clientY,
        moved: false,
        offset: {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        },
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPositions: Object.fromEntries(
          cardIds
            .map((id) => [id, battlefieldCardPositions[id]])
            .filter(([, position]) => position),
        ),
        surface,
      }
    },
    [
      battlefieldCardPositions,
      clearContextMenu,
      selectCard,
      selectedCardIds,
      selectedCards,
      toggleCardSelection,
    ],
  )

  const updateBattlefieldPointerDrag = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const drag = battlefieldPointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      event.preventDefault()
      drag.latestClientX = event.clientX
      drag.latestClientY = event.clientY
      if (
        Math.abs(event.clientX - drag.startClientX) + Math.abs(event.clientY - drag.startClientY) >
        3
      )
        drag.moved = true
      if (drag.moved && drag.frame === null) {
        drag.frame = window.requestAnimationFrame(flushBattlefieldPointerDrag)
      }
    },
    [flushBattlefieldPointerDrag],
  )

  const finishBattlefieldPointerDrag = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const drag = battlefieldPointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      if (drag.frame !== null) {
        window.cancelAnimationFrame(drag.frame)
        drag.frame = null
      }
      event.currentTarget.releasePointerCapture(event.pointerId)
      battlefieldPointerDragRef.current = null
      setDraggingCardIds([])
      setDropTargetZone(null)
      if (!drag.moved) return
      // A drag ends with a click on the card; don't let it collapse a group selection.
      suppressCardClickRef.current = true

      const zone = event.type === "pointerup" ? dropZoneAt(event.clientX, event.clientY) : null
      if (zone && zone !== "battlefield") {
        moveCards(
          drag.cardIds.map((cardId) => ({ cardId, zone: "battlefield" as const })),
          zone,
        )
        return
      }

      moveBattlefieldCardPositionsLive(groupPositionsFor(drag, event.clientX, event.clientY))
    },
    [groupPositionsFor, moveBattlefieldCardPositionsLive, moveCards],
  )

  const activateCard = useCallback(
    (card: PlaytestCard, zone: PlaytestZone) => {
      if (zone === "battlefield" && suppressCardClickRef.current) {
        suppressCardClickRef.current = false
        return
      }
      activatePlaytestCard(card, zone)
    },
    [activatePlaytestCard],
  )

  const startCardDrag = useCallback(
    (card: PlaytestCard, zone: PlaytestZone, event: DragEvent<HTMLElement>) => {
      const sourceRect = event.currentTarget.getBoundingClientRect()
      const dragOffset =
        zone === "battlefield"
          ? { x: event.clientX - sourceRect.left, y: event.clientY - sourceRect.top }
          : undefined

      setHoverPreview(null)
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
    },
    [],
  )

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
      const position = surface
        ? battlefieldPositionFromDrop(event, surface, zoom, dragOffset)
        : undefined

      if (payload.from === "battlefield") {
        if (position) moveBattlefieldCardPosition(payload.cardId, position)
        else selectCard(payload.cardId)
        return
      }

      moveCard(payload.from, "battlefield", payload.cardId, undefined, position)
    },
    [moveBattlefieldCardPosition, moveCard, selectCard, zoom],
  )

  const handleEscape = useCallback(() => {
    if (shortcutsOpen) setShortcutsOpen(false)
    else clearTransientSelection()
  }, [clearTransientSelection, shortcutsOpen])

  usePlaytesterKeyboardShortcuts({
    adjustCounter: playtest.adjustCounter,
    changeLife: playtest.changeLife,
    draw: playtest.draw,
    duplicateCards: playtest.duplicateCards,
    keepHand: playtest.keepHand,
    moveCards,
    mulligan: playtest.mulligan,
    nextTurn: playtest.nextTurn,
    onEscape: handleEscape,
    onToggleShortcuts: () => setShortcutsOpen((open) => !open),
    openingHand,
    shuffle: playtest.shuffle,
    targets: playtest.keyboardTargets,
    toggleFaceDown: playtest.toggleFaceDown,
    toggleTapped: playtest.toggleTapped,
    undo: playtest.undo,
    untapAll: playtest.untapAll,
  })

  const openSelectionMenu = (event: MouseEvent) => {
    if (!selectedCard || !selectedZone) return
    openContextMenu(selectedCard, selectedZone, event)
  }

  // A multi-selection is always battlefield permanents (shift-click and box-select only add those).
  const selectionIds = selectedCards.length > 1 ? selectedCards.map((card) => card.id) : null
  const barCardIds = selectionIds || (selectedCard ? [selectedCard.id] : [])
  const contextMenuCard = contextMenu
    ? [
        ...state.hand,
        ...state.battlefield,
        ...state.command,
        ...state.graveyard,
        ...state.exile,
      ].find((card) => card.id === contextMenu.cardId) || null
    : null

  const peekCards = !peek
    ? []
    : peek.mode === "Graveyard"
      ? state.graveyard
      : peek.mode === "Exile"
        ? state.exile
        : state.library.slice(0, peek.count)

  return (
    <div className="h-full min-h-0 overflow-hidden bg-base-100 text-base-content [--hand-card-width:4.5rem] sm:rounded-box sm:border sm:border-base-300 sm:[--hand-card-width:5.5rem] md:[--hand-card-width:6.5rem] [@media(min-width:768px)_and_(max-height:760px)]:[--hand-card-width:5.25rem]">
      <div className="grid h-full grid-rows-[3rem_minmax(0,1fr)_auto]">
        <PlaytestTopBar
          canUndo={playtest.history.length > 0}
          closeSlot={closeSlot}
          deckId={deckId}
          deckName={deckName}
          lifeTotal={playtest.lifeTotal}
          onAdjustPlayerCounter={playtest.adjustPlayerCounter}
          onCreateToken={playtest.openTokenDialog}
          onFlipCoin={playtest.flipCoin}
          onLifeChange={playtest.changeLife}
          onNextTurn={playtest.nextTurn}
          onRestart={playtest.resetGame}
          onRollDie={playtest.rollDie}
          onShortcutsOpenChange={setShortcutsOpen}
          onUndo={playtest.undo}
          onUntapAll={playtest.untapAll}
          playerCounters={playtest.playerCounters}
          settings={settings}
          onSettingsChange={updateSettings}
          shortcutsOpen={shortcutsOpen}
          turn={playtest.turn}
        />

        <PlaytestBattlefield
          battlefield={state.battlefield}
          battlefieldCardPositions={battlefieldCardPositions}
          cardStatuses={playtest.cardStatuses}
          command={state.command}
          draggingCardIds={draggingCardIds}
          onActivateCard={activateCard}
          onAdjustCounter={(cardId, kind, delta) => playtest.adjustCounter([cardId], kind, delta)}
          onBackgroundClick={clearTransientSelection}
          onBeginPointerDrag={beginBattlefieldPointerDrag}
          onCardHover={playtest.markCardHovered}
          onCardLeave={clearCardHovered}
          onCastCommander={(card) => moveCard("command", "battlefield", card.id)}
          onDrop={dropCardOnBattlefield}
          onFinishPointerDrag={finishBattlefieldPointerDrag}
          onMarqueeSelect={playtest.selectCards}
          onOpenContextMenu={openContextMenu}
          onToggleTapped={(cardId) => playtest.toggleTapped([cardId])}
          onUpdatePointerDrag={updateBattlefieldPointerDrag}
          onZoomIn={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
          onZoomOut={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}
          onZoomReset={() => setZoom(1)}
          selectedCardIds={selectedCardIds}
          surfaceRef={battlefieldSurfaceRef}
          tappedCards={tappedCards}
          zoom={zoom}
        >
          <ActionLog
            className={cn(selectedCard && "max-lg:hidden")}
            entries={actionLog}
            lastAction={lastAction}
          />
          {selectedCard && selectedZone && !isDragging && !contextMenu ? (
            <SelectionBar
              key={selectionIds ? "group" : selectedCard.id}
              card={selectedCard}
              count={barCardIds.length}
              onClose={() => selectCard(null)}
              onDuplicate={() => playtest.duplicateCards(barCardIds)}
              onMore={openSelectionMenu}
              onMove={(to, placement) =>
                moveCards(
                  barCardIds.map((cardId) => ({
                    cardId,
                    zone: selectionIds ? "battlefield" : selectedZone,
                  })),
                  to,
                  placement,
                )
              }
              onToggleFaceDown={() => playtest.toggleFaceDown(barCardIds)}
              onToggleTapped={() => playtest.toggleTapped(barCardIds)}
              status={selectedStatus}
              tapped={barCardIds.every((cardId) => tappedCards.has(cardId))}
              zone={selectionIds ? "battlefield" : selectedZone}
            />
          ) : null}
          {settings.showHoverPreview &&
          hoverPreviewCard &&
          hoverPreview &&
          !contextMenu &&
          !peek &&
          !openingHand ? (
            <HoverCardPreview card={hoverPreviewCard} side={hoverPreview.side} />
          ) : null}
          {openingHand ? (
            <OpeningHandOverlay
              hand={state.hand}
              mulligans={state.mulligans}
              onCardHover={playtest.markCardHovered}
              onCardLeave={clearCardHovered}
              onKeep={playtest.keepHand}
              onMulligan={playtest.mulligan}
              onNewHand={playtest.resetGame}
            />
          ) : null}
          {playtest.tokenDialogOpen ? (
            <CreateTokenDialog
              deckTokens={tokenOptions}
              onCancel={playtest.closeTokenDialog}
              onCreate={playtest.createToken}
            />
          ) : null}
          {peek ? (
            <PeekOverlay
              key={peek.mode}
              cards={peekCards}
              mode={peek.mode}
              onClose={closePeek}
              onMoveAll={playtest.moveAllCards}
              onMoveCard={(cardId, from, to, placement) => moveCard(from, to, cardId, placement)}
              onResolve={playtest.resolvePeek}
              onShuffle={() => {
                playtest.shuffle()
                closePeek()
              }}
              onCardHover={playtest.markCardHovered}
              onCardLeave={clearCardHovered}
            />
          ) : null}
        </PlaytestBattlefield>

        <PlaytestBottomZones
          command={state.command}
          dropTargetZone={dropTargetZone}
          exile={state.exile}
          graveyard={state.graveyard}
          hand={state.hand}
          libraryActions={{
            actionCount: playtest.actionCount,
            onActionCountChange: playtest.setActionCount,
            onDraw: playtest.draw,
            onExile: playtest.exileTop,
            onLibrary: playtest.openLibraryPeek,
            onLook: playtest.openLookPeek,
            onMill: playtest.mill,
            onScry: playtest.openScryPeek,
            onShuffle: playtest.shuffle,
            onSurveil: playtest.openSurveilPeek,
          }}
          libraryCount={state.library.length}
          onCardClick={activateCard}
          onCardContextMenu={openContextMenu}
          onCardDragStart={startCardDrag}
          onCardHover={playtest.markCardHovered}
          onCardLeave={clearCardHovered}
          onDropCard={(cardId, from, to) => moveCard(from, to, cardId)}
          onViewZone={playtest.openZoneViewer}
          selectedCardId={playtest.selectedCardId}
        />

        {contextMenu ? (
          <CardContextMenu
            key={contextMenu.cardId}
            card={contextMenuCard}
            cardStatus={
              (contextMenuCard && playtest.cardStatuses[contextMenuCard.id]) || defaultCardStatus()
            }
            menu={contextMenu}
            onAdjustCounter={(cardId, kind, delta) => playtest.adjustCounter([cardId], kind, delta)}
            onClearStatus={playtest.clearCardStatus}
            onClose={clearContextMenu}
            onDuplicate={(cardId) => playtest.duplicateCards([cardId])}
            onMove={moveCard}
            onSetPowerToughness={playtest.setPowerToughness}
            onToggleFaceDown={(cardId) => playtest.toggleFaceDown([cardId])}
            onToggleTapped={(cardId) => playtest.toggleTapped([cardId])}
            tapped={contextMenuCard ? tappedCards.has(contextMenuCard.id) : false}
          />
        ) : null}
      </div>
    </div>
  )
}

function ActionLog({
  className,
  entries,
  lastAction,
}: {
  className?: string
  entries: string[]
  lastAction: string
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "absolute bottom-3 left-3 z-10 flex max-w-[min(22rem,calc(100%-8rem))] items-center gap-2 rounded-field border border-base-300 bg-base-100 px-2.5 py-1.5 text-left text-xs shadow-sm hover:bg-base-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            className,
          )}
          title="Game log"
        >
          <History className="h-3.5 w-3.5 shrink-0 text-base-content/60" />
          <span className="truncate font-bold" aria-live="polite">
            {lastAction}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-0">
        <h2 className="border-b border-base-300 px-3 py-2 text-sm font-black">Game log</h2>
        <ol className="max-h-72 overflow-y-auto py-1 text-sm">
          {entries.map((entry, index) => (
            <li
              key={`${entries.length - index}-${entry}`}
              className={cn("px-3 py-1", index === 0 ? "font-bold" : "text-base-content/70")}
            >
              {entry}
            </li>
          ))}
        </ol>
      </PopoverContent>
    </Popover>
  )
}
