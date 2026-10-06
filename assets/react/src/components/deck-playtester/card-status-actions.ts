import { useCallback } from "react"
import { statusFor } from "./card-status"
import type { CardStatus, ContextMenuState, CounterKind, PlaytestSnapshot } from "./types"

type CommitPlaytestChange = (
  recipe: (current: PlaytestSnapshot) => PlaytestSnapshot,
  message: string | ((current: PlaytestSnapshot) => string),
) => void

const COUNTER_LABELS: Record<CounterKind, string> = {
  markers: "marker",
  minusOneCounters: "-1/-1 counter",
  plusOneCounters: "+1/+1 counter",
}

function countLabel(cardIds: string[]) {
  return cardIds.length === 1 ? "" : ` on ${cardIds.length} cards`
}

export function useCardStatusActions({
  commit,
  setContextMenu,
}: {
  commit: CommitPlaytestChange
  setContextMenu: (menu: ContextMenuState) => void
}) {
  const updateCardStatuses = useCallback(
    (
      cardIds: string[],
      update: (status: CardStatus, current: PlaytestSnapshot) => CardStatus,
      message: string | ((current: PlaytestSnapshot) => string),
    ) => {
      if (cardIds.length === 0) return
      commit(
        (current) => ({
          ...current,
          cardStatuses: {
            ...current.cardStatuses,
            ...Object.fromEntries(
              cardIds.map((cardId) => [
                cardId,
                update(statusFor(current.cardStatuses, cardId), current),
              ]),
            ),
          },
        }),
        message,
      )
    },
    [commit],
  )

  /** Flips every card face down, or face up when they are all already face down. */
  const toggleFaceDown = useCallback(
    (cardIds: string[]) => {
      const allFaceDown = (current: PlaytestSnapshot) =>
        cardIds.every((cardId) => statusFor(current.cardStatuses, cardId).faceDown)
      updateCardStatuses(
        cardIds,
        (status, current) => ({ ...status, faceDown: !allFaceDown(current) }),
        (current) =>
          `Turned ${cardIds.length === 1 ? "card" : `${cardIds.length} cards`} face ${allFaceDown(current) ? "up" : "down"}`,
      )
      setContextMenu(null)
    },
    [setContextMenu, updateCardStatuses],
  )

  const adjustCounter = useCallback(
    (cardIds: string[], kind: CounterKind, delta: number) => {
      updateCardStatuses(
        cardIds,
        (status) => ({ ...status, [kind]: Math.max(0, status[kind] + delta) }),
        `${delta > 0 ? "Added" : "Removed"} ${Math.abs(delta)} ${COUNTER_LABELS[kind]}${countLabel(cardIds)}`,
      )
    },
    [updateCardStatuses],
  )

  const setPowerToughness = useCallback(
    (cardId: string, power: string, toughness: string) => {
      updateCardStatuses(
        [cardId],
        (status) => ({ ...status, power, toughness }),
        "Set power/toughness",
      )
      setContextMenu(null)
    },
    [setContextMenu, updateCardStatuses],
  )

  const clearCardStatus = useCallback(
    (cardId: string) => {
      updateCardStatuses(
        [cardId],
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
    [setContextMenu, updateCardStatuses],
  )

  return { adjustCounter, clearCardStatus, setPowerToughness, toggleFaceDown }
}
