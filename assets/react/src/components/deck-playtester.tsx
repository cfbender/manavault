import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from "react"
import { type PlaytestCard, type PlaytestZone } from "../lib/deck-playtest"
import {
  battlefieldPositionFromDrop,
  battlefieldPositionFromPointer,
  clampZoom,
} from "./deck-playtester/battlefield-helpers"
import { PlaytestBattlefield } from "./deck-playtester/battlefield-view"
import { PlaytestBottomZones } from "./deck-playtester/bottom-zones"
import { CardContextMenu } from "./deck-playtester/card-menu"
import { defaultCardStatus } from "./deck-playtester/card-status"
import { HOVER_PREVIEW_DELAY_MS, ZOOM_STEP } from "./deck-playtester/constants"
import { MobilePlaytestControls, PlaytestSidebar } from "./deck-playtester/controls"
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
import { PlaytestTopBar } from "./deck-playtester/top-bar"
import type { BattlefieldPointerDrag, DeckPlaytesterProps } from "./deck-playtester/types"
import { usePlaytesterState } from "./deck-playtester/use-playtester-state"

export function DeckPlaytester({ closeSlot, deckId, deckName, initialState }: DeckPlaytesterProps) {
  const {
    actionCount,
    activeKeyboardCard,
    activateCard,
    addMarker,
    adjustCounter,
    battlefieldCardPositions,
    cardStatuses,
    changeLife,
    clearCardHovered,
    clearCardStatus,
    clearContextMenu,
    clearTransientSelection,
    closePeek,
    closeTokenDialog,
    contextMenu,
    createToken,
    draw,
    exileTop,
    history,
    hoveredCard,
    keepHand,
    lastAction,
    lifeTotal,
    markCardHovered,
    mill,
    moveActiveKeyboardCard,
    moveBattlefieldCardPosition,
    moveBattlefieldCardPositionLive,
    moveCard,
    moveTopLibraryCard,
    mulligan,
    nextTurn,
    openContextMenu,
    openingHand,
    openLibraryPeek,
    openLookPeek,
    openScryPeek,
    openSurveilPeek,
    openTokenDialog,
    peek,
    resetGame,
    rollDiceAndCoin,
    selectedCard,
    selectedCardId,
    selectedStatus,
    selectedZone,
    setActionCount,
    selectCard,
    setPowerToughness,
    shuffle,
    state,
    tappedCards,
    toggleFaceDown,
    toggleTapped,
    tokenDialogOpen,
    turn,
    undo,
    untapAll,
  } = usePlaytesterState(initialState)
  const [hoverPreviewCardId, setHoverPreviewCardId] = useState<string | null>(null)
  const [draggingBattlefieldCardId, setDraggingBattlefieldCardId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const battlefieldSurfaceRef = useRef<HTMLDivElement>(null)
  const battlefieldPointerDragRef = useRef<BattlefieldPointerDrag | null>(null)
  const hoverPreviewTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    setHoverPreviewCardId(null)
    setDraggingBattlefieldCardId(null)
  }, [initialState])

  const hoverPreviewCard = useMemo(() => {
    if (!hoverPreviewCardId) return null
    return (
      [...state.hand, ...state.command, ...state.battlefield].find(
        (card) => card.id === hoverPreviewCardId,
      ) || null
    )
  }, [hoverPreviewCardId, state.battlefield, state.command, state.hand])

  useEffect(() => {
    if (hoverPreviewTimeoutRef.current) {
      window.clearTimeout(hoverPreviewTimeoutRef.current)
      hoverPreviewTimeoutRef.current = null
    }

    setHoverPreviewCardId(null)

    if (
      draggingBattlefieldCardId ||
      (hoveredCard?.zone !== "hand" &&
        hoveredCard?.zone !== "command" &&
        hoveredCard?.zone !== "battlefield")
    )
      return

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

  const flushBattlefieldPointerDrag = useCallback(() => {
    const drag = battlefieldPointerDragRef.current
    if (!drag) return

    drag.frame = null
    moveBattlefieldCardPositionLive(
      drag.cardId,
      battlefieldPositionFromPointer(
        drag.latestClientX,
        drag.latestClientY,
        drag.surface,
        zoom,
        drag.offset,
      ),
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
      clearContextMenu()
      selectCard(cardId)
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
    [clearContextMenu, selectCard],
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

  const finishBattlefieldPointerDrag = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const drag = battlefieldPointerDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return

      if (drag.frame !== null) {
        window.cancelAnimationFrame(drag.frame)
        drag.frame = null
        moveBattlefieldCardPositionLive(
          drag.cardId,
          battlefieldPositionFromPointer(
            event.clientX,
            event.clientY,
            drag.surface,
            zoom,
            drag.offset,
          ),
        )
      }

      event.currentTarget.releasePointerCapture(event.pointerId)
      battlefieldPointerDragRef.current = null
      setDraggingBattlefieldCardId(null)
    },
    [moveBattlefieldCardPositionLive, zoom],
  )

  const startCardDrag = useCallback(
    (card: PlaytestCard, zone: PlaytestZone, event: DragEvent<HTMLElement>) => {
      const sourceRect = event.currentTarget.getBoundingClientRect()
      const dragOffset =
        zone === "battlefield"
          ? { x: event.clientX - sourceRect.left, y: event.clientY - sourceRect.top }
          : undefined

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

  usePlaytesterKeyboardShortcuts({
    activeKeyboardCard,
    changeLife,
    draw,
    keepHand,
    moveActiveKeyboardCard,
    mulligan,
    nextTurn,
    onEscape: clearTransientSelection,
    openingHand,
    shuffle,
    toggleTapped,
    undo,
    untapAll,
  })

  return (
    <div className="h-full min-h-0 overflow-hidden border-0 bg-[#0d0e0c] text-base-content shadow-2xl sm:rounded-box sm:border sm:border-base-300">
      <div className="grid h-full grid-rows-[2.75rem_minmax(0,1fr)_auto_12rem] lg:grid-cols-[minmax(0,1fr)_14rem] lg:grid-rows-[2.75rem_minmax(0,1fr)_10.5rem]">
        <PlaytestTopBar closeSlot={closeSlot} deckId={deckId} deckName={deckName} turn={turn} />

        <PlaytestBattlefield
          battlefield={state.battlefield}
          battlefieldCardPositions={battlefieldCardPositions}
          cardStatuses={cardStatuses}
          command={state.command}
          draggingBattlefieldCardId={draggingBattlefieldCardId}
          onActivateCard={activateCard}
          onBeginPointerDrag={beginBattlefieldPointerDrag}
          onCardHover={markCardHovered}
          onCardLeave={clearCardHovered}
          onDrop={dropCardOnBattlefield}
          onFinishPointerDrag={finishBattlefieldPointerDrag}
          onOpenContextMenu={openContextMenu}
          onUpdatePointerDrag={updateBattlefieldPointerDrag}
          onZoomIn={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
          onZoomOut={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}
          onZoomReset={() => setZoom(1)}
          selectedCardId={selectedCardId}
          surfaceRef={battlefieldSurfaceRef}
          tappedCards={tappedCards}
          zoom={zoom}
        >
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
        </PlaytestBattlefield>

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
          onLibrary={openLibraryPeek}
          onLifeChange={changeLife}
          onNewGame={resetGame}
          onDiceAndCoin={rollDiceAndCoin}
          onNextTurn={nextTurn}
          onShuffle={shuffle}
          onLook={openLookPeek}
          onUndo={undo}
          onScry={openScryPeek}
          onUntapAll={untapAll}
          onSurveil={openSurveilPeek}
          selectedCard={selectedCard}
          selectedZone={selectedZone}
          tapped={selectedCard ? tappedCards.has(selectedCard.id) : false}
          selectedStatus={selectedStatus}
          onMove={moveCard}
          onTapSelected={selectedCard ? () => toggleTapped(selectedCard.id) : undefined}
        />

        <MobilePlaytestControls
          actionCount={actionCount}
          canUndo={history.length > 0}
          libraryCount={state.library.length}
          lifeTotal={lifeTotal}
          onActionCountChange={setActionCount}
          onCreateToken={openTokenDialog}
          onDiceAndCoin={rollDiceAndCoin}
          onDraw={draw}
          onExile={exileTop}
          onLibrary={openLibraryPeek}
          onLifeChange={changeLife}
          onLook={openLookPeek}
          onMill={mill}
          onMove={moveCard}
          onNewGame={resetGame}
          onNextTurn={nextTurn}
          onScry={openScryPeek}
          onShuffle={shuffle}
          onSurveil={openSurveilPeek}
          onTapSelected={selectedCard ? () => toggleTapped(selectedCard.id) : undefined}
          onUndo={undo}
          onUntapAll={untapAll}
          selectedCard={selectedCard}
          selectedStatus={selectedStatus}
          selectedZone={selectedZone}
          tapped={selectedCard ? tappedCards.has(selectedCard.id) : false}
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
        {hoverPreviewCard && !contextMenu && !peek ? (
          <HoverCardPreview card={hoverPreviewCard} />
        ) : null}
        {contextMenu ? (
          <CardContextMenu
            card={selectedCard}
            cardStatus={selectedStatus || defaultCardStatus()}
            menu={contextMenu}
            onAddMarker={addMarker}
            onAdjustCounter={adjustCounter}
            onClearStatus={clearCardStatus}
            onClose={clearContextMenu}
            onMove={moveCard}
            onSetPowerToughness={setPowerToughness}
            onToggleFaceDown={toggleFaceDown}
            onToggleTapped={toggleTapped}
            tapped={selectedCard ? tappedCards.has(selectedCard.id) : false}
          />
        ) : null}
        {tokenDialogOpen ? (
          <CreateTokenDialog onCancel={closeTokenDialog} onCreate={createToken} />
        ) : null}
        {peek ? (
          <PeekOverlay
            cards={state.library.slice(0, peek.count)}
            mode={peek.mode}
            onClose={closePeek}
            onMoveCard={moveTopLibraryCard}
            onCardHover={markCardHovered}
            onCardLeave={clearCardHovered}
          />
        ) : null}
      </div>
    </div>
  )
}
