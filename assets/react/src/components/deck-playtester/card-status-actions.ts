import { useCallback } from "react"
import { statusFor } from "./card-status"
import type { CardStatus, ContextMenuState, PlaytestSnapshot } from "./types"

type CommitPlaytestChange = (
  recipe: (current: PlaytestSnapshot) => PlaytestSnapshot,
  message: string,
) => void

export function useCardStatusActions({
  cardStatuses,
  commit,
  setContextMenu,
}: {
  cardStatuses: Record<string, CardStatus>
  commit: CommitPlaytestChange
  setContextMenu: (menu: ContextMenuState) => void
}) {
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
    [cardStatuses, setContextMenu, updateCardStatus],
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
      updateCardStatus(
        cardId,
        (status) => ({ ...status, markers: status.markers + 1 }),
        "Added marker",
      )
    },
    [updateCardStatus],
  )

  const setPowerToughness = useCallback(
    (cardId: string, power: string, toughness: string) => {
      updateCardStatus(cardId, (status) => ({ ...status, power, toughness }), "Set power/toughness")
      setContextMenu(null)
    },
    [setContextMenu, updateCardStatus],
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
    [setContextMenu, updateCardStatus],
  )

  return { addMarker, adjustCounter, clearCardStatus, setPowerToughness, toggleFaceDown }
}
