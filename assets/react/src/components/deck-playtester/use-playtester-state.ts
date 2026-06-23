import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react"
import {
  drawCards,
  exileFromLibrary,
  millCards,
  movePlaytestCard,
  mulliganPlaytest,
  shuffleLibrary,
  type PlaytestCard,
  type PlaytestState,
  type PlaytestZone,
} from "../../lib/deck-playtest"
import { defaultBattlefieldPosition } from "./battlefield-helpers"
import { defaultCardStatus, statusFor } from "./card-status"
import { useCardStatusActions } from "./card-status-actions"
import { MAX_HISTORY, ZONE_LABELS } from "./constants"
import { cardZone, initialSnapshot, shuffledOpeningState } from "./state"
import type {
  BattlefieldCardPosition,
  CardHoverTarget,
  CardStatus,
  ContextMenuState,
  PeekState,
  PlaytestSnapshot,
  TokenFormValues,
} from "./types"

export function usePlaytesterState(initialState: PlaytestState) {
  const [snapshot, setSnapshot] = useState(() => initialSnapshot(initialState))
  const [history, setHistory] = useState<PlaytestSnapshot[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [hoveredCard, setHoveredCard] = useState<CardHoverTarget | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [peek, setPeek] = useState<PeekState>(null)
  const [actionCount, setActionCount] = useState(1)
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)
  const [lastAction, setLastAction] = useState("Opening hand ready")

  useEffect(() => {
    setSnapshot(initialSnapshot(initialState))
    setHistory([])
    setSelectedCardId(null)
    setHoveredCard(null)
    setContextMenu(null)
    setPeek(null)
    setTokenDialogOpen(false)
    setLastAction("Opening hand ready")
  }, [initialState])

  const {
    battlefieldCardPositions,
    cardStatuses,
    state,
    tappedCardIds,
    turn,
    lifeTotal,
    openingHand,
  } = snapshot
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

  const selectCard = useCallback((cardId: string | null) => {
    setSelectedCardId(cardId)
  }, [])

  const moveCard = useCallback(
    (
      from: PlaytestZone,
      to: PlaytestZone,
      cardId: string,
      placement?: "top" | "bottom",
      battlefieldPosition?: BattlefieldCardPosition,
    ) => {
      commit((current) => {
        const nextState = movePlaytestCard(current.state, from, to, cardId, placement)
        if (nextState === current.state) return current
        const nextStatuses = { ...current.cardStatuses }
        const nextPositions = { ...current.battlefieldCardPositions }

        if (to === "battlefield") {
          nextPositions[cardId] =
            battlefieldPosition ??
            nextPositions[cardId] ??
            defaultBattlefieldPosition(current.state.battlefield.length)
        } else {
          delete nextStatuses[cardId]
          delete nextPositions[cardId]
        }

        return {
          ...current,
          battlefieldCardPositions: nextPositions,
          cardStatuses: nextStatuses,
          state: nextState,
          tappedCardIds:
            to === "battlefield"
              ? current.tappedCardIds
              : current.tappedCardIds.filter((id) => id !== cardId),
          openingHand: false,
        }
      }, `Moved card to ${ZONE_LABELS[to].toLowerCase()}`)
      setContextMenu(null)
      setSelectedCardId(to === "battlefield" ? cardId : null)
      clearCardHovered(cardId)
    },
    [clearCardHovered, commit],
  )

  const moveBattlefieldCardPosition = useCallback(
    (cardId: string, position: BattlefieldCardPosition) => {
      commit((current) => {
        if (!current.state.battlefield.some((card) => card.id === cardId)) return current

        return {
          ...current,
          battlefieldCardPositions: {
            ...current.battlefieldCardPositions,
            [cardId]: position,
          },
        }
      }, "Moved card on battlefield")
      setSelectedCardId(cardId)
    },
    [commit],
  )

  const moveBattlefieldCardPositionLive = useCallback(
    (cardId: string, position: BattlefieldCardPosition) => {
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
    },
    [],
  )

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

  const openContextMenu = useCallback(
    (card: PlaytestCard, zone: PlaytestZone, event: MouseEvent) => {
      event.preventDefault()
      setSelectedCardId(card.id)
      setContextMenu({ cardId: card.id, zone, x: event.clientX, y: event.clientY })
    },
    [],
  )

  const { addMarker, adjustCounter, clearCardStatus, setPowerToughness, toggleFaceDown } =
    useCardStatusActions({
      cardStatuses,
      commit,
      setContextMenu,
    })

  const openTokenDialog = useCallback(() => {
    setTokenDialogOpen(true)
  }, [])

  const closeTokenDialog = useCallback(() => {
    setTokenDialogOpen(false)
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const openLibraryPeek = useCallback(() => {
    setPeek({ count: state.library.length, mode: "Library" })
  }, [state.library.length])

  const openLookPeek = useCallback(() => {
    setPeek({ count: Math.min(state.library.length, actionCount), mode: "Look" })
  }, [actionCount, state.library.length])

  const openScryPeek = useCallback(() => {
    setPeek({ count: Math.min(state.library.length, actionCount), mode: "Scry" })
  }, [actionCount, state.library.length])

  const openSurveilPeek = useCallback(() => {
    setPeek({ count: Math.min(state.library.length, actionCount), mode: "Surveil" })
  }, [actionCount, state.library.length])

  const closePeek = useCallback(() => {
    setPeek(null)
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

  const clearTransientSelection = useCallback(() => {
    setContextMenu(null)
    setSelectedCardId(null)
  }, [])

  return {
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
    clearContextMenu: closeContextMenu,
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
  }
}
