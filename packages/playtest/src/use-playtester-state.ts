import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react"
import {
  drawCards,
  exileFromLibrary,
  millCards,
  moveAllPlaytestCards,
  movePlaytestCard,
  mulliganPlaytest,
  resolveLibraryTop,
  shuffleLibrary,
  type LibraryTopDecision,
  type PlaytestCard,
  type PlaytestState,
  type PlaytestZone,
} from "./engine"
import {
  defaultBattlefieldPosition,
  findOpenBattlefieldPosition,
  isLandCard,
} from "./battlefield-helpers"
import { defaultCardStatus, statusFor } from "./card-status"
import { useCardStatusActions } from "./card-status-actions"
import {
  BATTLEFIELD_DEFAULT_OFFSET_X,
  BATTLEFIELD_DEFAULT_OFFSET_Y,
  MAX_HISTORY,
  MAX_LOG_ENTRIES,
  ZONE_LABELS,
} from "./constants"
import { loadSavedGame, saveGame } from "./saved-game"
import { cardZone, initialSnapshot, nextTurnSnapshot, shuffledOpeningState } from "./snapshot"
import type {
  BattlefieldCardPosition,
  CardHoverTarget,
  CardStatus,
  ContextMenuState,
  HostValue,
  PeekMode,
  PeekState,
  PlayerCounterKind,
  PlayerCounters,
  PlaytestSnapshot,
  TokenFormValues,
} from "./types"

function newTokenId() {
  return `playtest-token-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

function startingGame(saveKey: string | undefined, initialState: PlaytestState) {
  const saved = saveKey ? loadSavedGame(saveKey, initialState) : null
  return {
    log: saved ? [`Resumed your saved game on turn ${saved.turn}`] : ["Opening hand ready"],
    snapshot: saved || initialSnapshot(initialState),
  }
}

export type PlaytesterStateOptions = {
  drawOnNextTurn?: boolean
  initialState: PlaytestState
  life?: HostValue<number> | null
  onSnapshotChange?: (snapshot: PlaytestSnapshot) => void
  playerCounters?: HostValue<PlayerCounters> | null
  saveKey?: string
  /** Controlled snapshot; when set, the hook reports changes instead of keeping its own copy. */
  snapshot?: PlaytestSnapshot
  turn?: HostValue<number> | null
}

export function usePlaytesterState({
  drawOnNextTurn = true,
  initialState,
  life,
  onSnapshotChange,
  playerCounters: hostPlayerCounters,
  saveKey,
  snapshot: controlledSnapshot,
  turn: hostTurn,
}: PlaytesterStateOptions) {
  const isControlled = controlledSnapshot !== undefined
  const [start] = useState(() =>
    isControlled
      ? { log: ["Opening hand ready"], snapshot: controlledSnapshot }
      : startingGame(saveKey, initialState),
  )
  const [localSnapshot, setLocalSnapshot] = useState(start.snapshot)
  const snapshot = controlledSnapshot ?? localSnapshot
  // The newest snapshot, including changes the host has not rendered back yet, so several changes
  // in one event build on each other.
  const latestSnapshotRef = useRef(snapshot)
  const onSnapshotChangeRef = useRef(onSnapshotChange)
  const isControlledRef = useRef(isControlled)
  useLayoutEffect(() => {
    latestSnapshotRef.current = snapshot
    onSnapshotChangeRef.current = onSnapshotChange
    isControlledRef.current = isControlled
  })
  const [history, setHistory] = useState<PlaytestSnapshot[]>([])
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])
  const [hoveredCard, setHoveredCard] = useState<CardHoverTarget | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [peek, setPeek] = useState<PeekState>(null)
  const [actionCount, setActionCount] = useState(1)
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)
  const [actionLog, setActionLog] = useState<string[]>(start.log)
  // Where dragged cards are while a battlefield drag is in progress; committed when it ends.
  const [livePositions, setLivePositions] = useState<Record<
    string,
    BattlefieldCardPosition
  > | null>(null)
  const lastAction = actionLog[0]
  // Measured by the battlefield view; used to auto-place played cards in open slots.
  const battlefieldLayoutRef = useRef({ height: 600, width: 1100, zoom: 1 })
  const loadedGameRef = useRef({ initialState, saveKey })

  const replaceSnapshot = useCallback((next: PlaytestSnapshot) => {
    latestSnapshotRef.current = next
    if (!isControlledRef.current) setLocalSnapshot(next)
    onSnapshotChangeRef.current?.(next)
  }, [])

  const setBattlefieldLayout = useCallback(
    (layout: { height: number; width: number; zoom: number }) => {
      battlefieldLayoutRef.current = layout
    },
    [],
  )
  const openBattlefieldPosition = useCallback(
    (positions: Record<string, BattlefieldCardPosition>, card: PlaytestCard) => {
      const { zoom, ...bounds } = battlefieldLayoutRef.current
      return findOpenBattlefieldPosition(Object.values(positions), bounds, {
        isLand: isLandCard(card),
        zoom,
      })
    },
    [],
  )
  const setLastAction = useCallback((message: string) => {
    setActionLog((items) => [message, ...items].slice(0, MAX_LOG_ENTRIES))
  }, [])

  // A new deck (or a refetched one) starts over, unless a matching saved game exists. A controlled
  // game belongs to the host, which decides when to start over.
  useEffect(() => {
    const loaded = loadedGameRef.current
    if (loaded.saveKey === saveKey && loaded.initialState === initialState) return
    loadedGameRef.current = { initialState, saveKey }
    if (isControlledRef.current) return
    const next = startingGame(saveKey, initialState)
    replaceSnapshot(next.snapshot)
    setHistory([])
    setSelectedCardIds([])
    setHoveredCard(null)
    setContextMenu(null)
    setPeek(null)
    setTokenDialogOpen(false)
    setActionLog(next.log)
  }, [initialState, replaceSnapshot, saveKey])

  useEffect(() => {
    if (!isControlled && saveKey) saveGame(saveKey, snapshot)
  }, [isControlled, saveKey, snapshot])

  const { cardStatuses, state, tappedCardIds, openingHand } = snapshot
  const battlefieldCardPositions = useMemo(
    () =>
      livePositions
        ? { ...snapshot.battlefieldCardPositions, ...livePositions }
        : snapshot.battlefieldCardPositions,
    [livePositions, snapshot.battlefieldCardPositions],
  )
  const lifeTotal = life ? life.value : snapshot.lifeTotal
  const playerCounters = hostPlayerCounters ? hostPlayerCounters.value : snapshot.playerCounters
  const turn = hostTurn ? hostTurn.value : snapshot.turn
  const tappedCards = useMemo(() => new Set(tappedCardIds), [tappedCardIds])
  const selectedCardId = selectedCardIds.at(-1) || null
  const selectedCard = useMemo(
    () =>
      [state.hand, state.battlefield, state.command, state.graveyard, state.exile]
        .flat()
        .find((card) => card.id === selectedCardId) || null,
    [selectedCardId, state],
  )
  const selectedZone = selectedCardId ? cardZone(state, selectedCardId) : null
  const selectedStatus = selectedCard ? statusFor(cardStatuses, selectedCard.id) : null
  const selectedCards = useMemo(
    () => state.battlefield.filter((card) => selectedCardIds.includes(card.id)),
    [selectedCardIds, state.battlefield],
  )

  const commit = useCallback(
    (
      recipe: (current: PlaytestSnapshot) => PlaytestSnapshot,
      message: string | ((current: PlaytestSnapshot) => string),
    ) => {
      const current = latestSnapshotRef.current
      const next = recipe(current)
      if (next === current) return
      setHistory((items) => [current, ...items].slice(0, MAX_HISTORY))
      setLastAction(typeof message === "function" ? message(current) : message)
      replaceSnapshot(next)
    },
    [replaceSnapshot, setLastAction],
  )

  const undo = useCallback(() => {
    const [previous, ...rest] = history
    if (!previous) return
    setHistory(rest)
    replaceSnapshot(previous)
    setSelectedCardIds([])
    setHoveredCard(null)
    setLastAction("Undid previous action")
  }, [history, replaceSnapshot, setLastAction])

  const resetGame = useCallback(() => {
    replaceSnapshot(initialSnapshot(shuffledOpeningState(initialState)))
    setHistory([])
    setSelectedCardIds([])
    setHoveredCard(null)
    setPeek(null)
    setActionLog(["Started a new game"])
  }, [initialState, replaceSnapshot])

  const keepHand = useCallback(() => {
    commit((current) => ({ ...current, openingHand: false }), "Kept opening hand")
  }, [commit])

  const changeLife = useCallback(
    (delta: number) => {
      if (life === null) return
      const message = `${delta > 0 ? "Gained" : "Lost"} ${Math.abs(delta)} life`
      if (life) {
        life.onChange(life.value + delta)
        setLastAction(message)
        return
      }
      commit(
        (current) => ({ ...current, lifeTotal: Math.max(0, current.lifeTotal + delta) }),
        message,
      )
    },
    [commit, life, setLastAction],
  )

  const adjustPlayerCounter = useCallback(
    (kind: PlayerCounterKind, delta: number) => {
      if (hostPlayerCounters === null) return
      const adjust = (counters: PlayerCounters) => ({
        ...counters,
        [kind]: Math.max(0, counters[kind] + delta),
      })
      const message = `${delta > 0 ? "Added" : "Removed"} ${Math.abs(delta)} ${kind}`
      if (hostPlayerCounters) {
        hostPlayerCounters.onChange(adjust(hostPlayerCounters.value))
        setLastAction(message)
        return
      }
      commit((current) => ({ ...current, playerCounters: adjust(current.playerCounters) }), message)
    },
    [commit, hostPlayerCounters, setLastAction],
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
    setSelectedCardIds(cardId ? [cardId] : [])
  }, [])

  const toggleCardSelection = useCallback((cardId: string) => {
    setSelectedCardIds((current) =>
      current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId],
    )
  }, [])

  const selectCards = useCallback((cardIds: string[], additive = false) => {
    setSelectedCardIds((current) =>
      additive ? [...current, ...cardIds.filter((id) => !current.includes(id))] : cardIds,
    )
  }, [])

  /** Moves cards in one undoable step. Played cards fill open battlefield slots. */
  const moveCards = useCallback(
    (
      targets: CardHoverTarget[],
      to: PlaytestZone,
      placement?: "top" | "bottom",
      battlefieldPosition?: BattlefieldCardPosition,
    ) => {
      const moving = targets.filter(({ zone }) => zone !== to || to === "library")
      if (moving.length === 0) return
      const movingIds = moving.map(({ cardId }) => cardId)

      commit(
        (current) => {
          let nextState = current.state
          const nextStatuses = { ...current.cardStatuses }
          const nextPositions = { ...current.battlefieldCardPositions }

          for (const { cardId, zone: from } of moving) {
            const card = nextState[from].find((item) => item.id === cardId)
            const movedState = movePlaytestCard(nextState, from, to, cardId, placement)
            if (movedState === nextState || !card) continue
            nextState = movedState

            if (to === "battlefield") {
              nextPositions[cardId] =
                (moving.length === 1 ? battlefieldPosition : undefined) ??
                nextPositions[cardId] ??
                openBattlefieldPosition(nextPositions, card)
            } else {
              delete nextStatuses[cardId]
              delete nextPositions[cardId]
            }
          }
          if (nextState === current.state) return current

          return {
            ...current,
            battlefieldCardPositions: nextPositions,
            cardStatuses: nextStatuses,
            state: nextState,
            tappedCardIds:
              to === "battlefield"
                ? current.tappedCardIds
                : current.tappedCardIds.filter((id) => !movingIds.includes(id)),
            openingHand: false,
          }
        },
        (current) =>
          moving.length === 1
            ? moveMessage(cardName(current, movingIds[0]), to, placement)
            : moveMessage(`${moving.length} cards`, to, placement),
      )
      setContextMenu(null)
      setSelectedCardIds(to === "battlefield" && moving.length === 1 ? movingIds : [])
      setHoveredCard((current) => (current && movingIds.includes(current.cardId) ? null : current))
    },
    [commit, openBattlefieldPosition],
  )

  const moveCard = useCallback(
    (
      from: PlaytestZone,
      to: PlaytestZone,
      cardId: string,
      placement?: "top" | "bottom",
      battlefieldPosition?: BattlefieldCardPosition,
    ) => {
      moveCards([{ cardId, zone: from }], to, placement, battlefieldPosition)
    },
    [moveCards],
  )

  /** Shows dragged cards at their drag positions without touching the snapshot. */
  const previewBattlefieldPositions = useCallback(
    (positions: Record<string, BattlefieldCardPosition> | null) => setLivePositions(positions),
    [],
  )

  /** Ends a battlefield drag: the cards stay where they were dropped (not an undo step). */
  const placeBattlefieldCards = useCallback(
    (positions: Record<string, BattlefieldCardPosition>) => {
      setLivePositions(null)
      const current = latestSnapshotRef.current
      replaceSnapshot({
        ...current,
        battlefieldCardPositions: { ...current.battlefieldCardPositions, ...positions },
      })
    },
    [replaceSnapshot],
  )

  /** Taps every card, or untaps them when they are all already tapped. */
  const toggleTapped = useCallback(
    (cardIds: string[]) => {
      if (cardIds.length === 0) return
      const allTapped = (current: PlaytestSnapshot) =>
        cardIds.every((cardId) => current.tappedCardIds.includes(cardId))
      commit(
        (current) => ({
          ...current,
          tappedCardIds: allTapped(current)
            ? current.tappedCardIds.filter((id) => !cardIds.includes(id))
            : [...new Set([...current.tappedCardIds, ...cardIds])],
        }),
        (current) =>
          `${allTapped(current) ? "Untapped" : "Tapped"} ${
            cardIds.length === 1 ? cardName(current, cardIds[0]) : `${cardIds.length} cards`
          }`,
      )
    },
    [commit],
  )

  const untapAll = useCallback(() => {
    commit((current) => ({ ...current, tappedCardIds: [] }), "Untapped all permanents")
  }, [commit])

  const nextTurn = useCallback(() => {
    if (hostTurn === null) return
    const nextNumber = (hostTurn ? hostTurn.value : latestSnapshotRef.current.turn) + 1
    commit(
      (current) => nextTurnSnapshot(current, { draw: drawOnNextTurn }),
      `Turn ${nextNumber}: untapped${drawOnNextTurn ? " and drew a card" : ""}`,
    )
    hostTurn?.onChange(nextNumber)
  }, [commit, drawOnNextTurn, hostTurn])

  const activateCard = useCallback(
    (card: PlaytestCard, zone: PlaytestZone) => {
      if (zone === "hand" || zone === "command") {
        moveCard(zone, "battlefield", card.id)
        return
      }
      setSelectedCardIds([card.id])
    },
    [moveCard],
  )

  const openContextMenu = useCallback(
    (card: PlaytestCard, zone: PlaytestZone, event: MouseEvent) => {
      event.preventDefault()
      setSelectedCardIds((current) => (current.includes(card.id) ? current : [card.id]))
      setContextMenu({ cardId: card.id, zone, x: event.clientX, y: event.clientY })
    },
    [],
  )

  const { adjustCounter, clearCardStatus, setPowerToughness, toggleFaceDown } =
    useCardStatusActions({ commit, setContextMenu })

  const openTokenDialog = useCallback(() => setTokenDialogOpen(true), [])
  const closeTokenDialog = useCallback(() => setTokenDialogOpen(false), [])
  const closeContextMenu = useCallback(() => setContextMenu(null), [])

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

  const closePeek = useCallback(() => setPeek(null), [])

  const createToken = useCallback(
    ({ imageUrl, name, power, toughness, typeLine }: TokenFormValues) => {
      const token: PlaytestCard = {
        id: newTokenId(),
        deckCardId: "playtest-token",
        imageUrl,
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
            [token.id]: openBattlefieldPosition(current.battlefieldCardPositions, token),
          },
          cardStatuses: { ...current.cardStatuses, [token.id]: tokenStatus },
          openingHand: false,
          state: { ...current.state, battlefield: [token, ...current.state.battlefield] },
        }),
        `Created ${name}`,
      )
      setSelectedCardIds([token.id])
      setTokenDialogOpen(false)
    },
    [commit, openBattlefieldPosition],
  )

  const moveAllCards = useCallback(
    (from: PlaytestZone, to: PlaytestZone, options?: { shuffle?: boolean }) => {
      commit(
        (current) => {
          const nextState = moveAllPlaytestCards(current.state, from, to, options)
          if (nextState === current.state) return current
          return { ...current, state: nextState }
        },
        options?.shuffle
          ? `Shuffled ${ZONE_LABELS[from].toLowerCase()} into library`
          : `Moved all ${ZONE_LABELS[from].toLowerCase()} cards to ${ZONE_LABELS[to].toLowerCase()}`,
      )
      setPeek(null)
    },
    [commit],
  )

  /** Token copies land just below and right of each original, keeping its counters. */
  const duplicateCards = useCallback(
    (cardIds: string[]) => {
      const sources = state.battlefield.filter((card) => cardIds.includes(card.id))
      if (sources.length === 0) return
      const copies = sources.map((source) => ({
        copy: { ...source, deckCardId: "playtest-token", id: newTokenId() } as PlaytestCard,
        sourceId: source.id,
      }))

      commit(
        (current) => {
          const positions = { ...current.battlefieldCardPositions }
          const statuses = { ...current.cardStatuses }
          for (const { copy, sourceId } of copies) {
            const sourcePosition = positions[sourceId]
            positions[copy.id] = sourcePosition
              ? {
                  x: sourcePosition.x + BATTLEFIELD_DEFAULT_OFFSET_X,
                  y: sourcePosition.y + BATTLEFIELD_DEFAULT_OFFSET_Y,
                }
              : defaultBattlefieldPosition(current.state.battlefield.length)
            if (statuses[sourceId]) statuses[copy.id] = { ...statuses[sourceId] }
          }
          return {
            ...current,
            battlefieldCardPositions: positions,
            cardStatuses: statuses,
            state: {
              ...current.state,
              battlefield: [...copies.map(({ copy }) => copy), ...current.state.battlefield],
            },
          }
        },
        sources.length === 1
          ? `Created a token copy of ${sources[0].name}`
          : `Created token copies of ${sources.length} cards`,
      )
      setContextMenu(null)
      setSelectedCardIds(copies.map(({ copy }) => copy.id))
    },
    [commit, state.battlefield],
  )

  const resolvePeek = useCallback(
    (decisions: Record<string, LibraryTopDecision>, mode: PeekMode) => {
      const bottomCount = Object.values(decisions).filter((choice) => choice !== "top").length
      commit(
        (current) => {
          const nextState = resolveLibraryTop(current.state, decisions)
          if (nextState === current.state) return current
          return { ...current, state: nextState }
        },
        `${mode === "Scry" ? "Scried" : "Surveilled"} ${Object.keys(decisions).length}: ${
          bottomCount
        } ${mode === "Scry" ? "to bottom" : "to graveyard"}`,
      )
      setPeek(null)
    },
    [commit],
  )

  const openZoneViewer = useCallback((zone: "graveyard" | "exile") => {
    setPeek({ count: 0, mode: zone === "graveyard" ? "Graveyard" : "Exile" })
  }, [])

  const rollDie = useCallback(
    (sides: number) => {
      const result = Math.floor(Math.random() * sides) + 1
      setLastAction(`Rolled d${sides}: ${result}`)
    },
    [setLastAction],
  )

  const flipCoin = useCallback(() => {
    setLastAction(`Flipped a coin: ${Math.random() < 0.5 ? "heads" : "tails"}`)
  }, [setLastAction])

  /**
   * What keyboard shortcuts act on: the hovered card, unless it is part of the selection (or nothing
   * is hovered), in which case the whole selection.
   */
  const keyboardTargets = useMemo<CardHoverTarget[]>(() => {
    const hovered =
      hoveredCard && cardZone(state, hoveredCard.cardId) === hoveredCard.zone ? hoveredCard : null
    if (hovered && !selectedCardIds.includes(hovered.cardId)) return [hovered]
    const selected = selectedCardIds.flatMap((cardId) => {
      const zone = cardZone(state, cardId)
      return zone ? [{ cardId, zone }] : []
    })
    return selected.length ? selected : hovered ? [hovered] : []
  }, [hoveredCard, selectedCardIds, state])

  const clearTransientSelection = useCallback(() => {
    setContextMenu(null)
    setSelectedCardIds([])
  }, [])

  return {
    actionCount,
    actionLog,
    activateCard,
    adjustCounter,
    adjustPlayerCounter,
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
    duplicateCards,
    exileTop,
    flipCoin,
    history,
    hoveredCard,
    keepHand,
    keyboardTargets,
    lastAction,
    lifeTotal,
    markCardHovered,
    mill,
    moveAllCards,
    placeBattlefieldCards,
    previewBattlefieldPositions,
    moveCard,
    moveCards,
    mulligan,
    nextTurn,
    openContextMenu,
    openingHand,
    openLibraryPeek,
    openLookPeek,
    openScryPeek,
    openSurveilPeek,
    openTokenDialog,
    openZoneViewer,
    peek,
    playerCounters,
    resetGame,
    resolvePeek,
    rollDie,
    selectCard,
    selectCards,
    selectedCard,
    selectedCardId,
    selectedCardIds,
    selectedCards,
    selectedStatus,
    selectedZone,
    setActionCount,
    setBattlefieldLayout,
    setPowerToughness,
    shuffle,
    state,
    tappedCards,
    toggleCardSelection,
    toggleFaceDown,
    toggleTapped,
    tokenDialogOpen,
    turn,
    undo,
    untapAll,
  }
}

function cardName(snapshot: PlaytestSnapshot, cardId: string) {
  if (snapshot.cardStatuses[cardId]?.faceDown) return "a face-down card"
  const zones = Object.values(snapshot.state).filter(Array.isArray) as PlaytestCard[][]
  return zones.flat().find((card) => card.id === cardId)?.name || "card"
}

function moveMessage(name: string, to: PlaytestZone, placement?: "top" | "bottom") {
  if (to === "library")
    return `Put ${name} on ${placement === "bottom" ? "bottom" : "top"} of library`
  if (to === "battlefield") return `Played ${name}`
  if (to === "hand") return `Returned ${name} to hand`
  return `Moved ${name} to ${ZONE_LABELS[to].toLowerCase()}`
}
