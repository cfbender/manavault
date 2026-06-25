import type { DeckCardEntry } from "./deck-types"

type AllocationCandidate = DeckCardEntry["allocationStatus"]["candidates"][number]

export type DeckPullListMode = "exact" | "any"

export type DeckPullListEntry = {
  id: string
  deckCard: DeckCardEntry
  candidate: DeckCardEntry["allocationStatus"]["candidates"][number]
  quantity: number
  exact: boolean
  choiceId?: string
}

export type DeckPullListChoice = {
  id: string
  deckCard: DeckCardEntry
  candidates: DeckCardEntry["allocationStatus"]["candidates"]
  selectedItemId: string | null
}

export type DeckPullList = {
  needed: number
  selected: number
  skipped: number
  exactEntries: DeckPullListEntry[]
  choices: DeckPullListChoice[]
  skippedDeckCards: DeckCardEntry[]
}

export type DeckPullListLocationGroup = {
  locationId: string
  locationName: string
  entries: DeckPullListEntry[]
}

export function hasMainboardAllocationAvailable(deckCards: DeckCardEntry[]) {
  return deckCards.some(
    (deckCard) =>
      deckCard.zone === "mainboard" &&
      deckCard.allocationStatus.available > 0 &&
      deckCard.allocationStatus.allocated < deckCard.allocationStatus.required,
  )
}

export function createDeckPullList(
  deckCards: readonly DeckCardEntry[],
  selectedItemIds?: Record<string, string | null>,
  mode: DeckPullListMode = "any",
): DeckPullList {
  const selectedChoices = selectedItemIds ?? {}
  const exactEntries: DeckPullListEntry[] = []
  const choices: DeckPullListChoice[] = []
  const skippedDeckCards: DeckCardEntry[] = []
  let needed = 0
  let skipped = 0
  const usedItemQuantities = new Map<string, number>()

  for (const deckCard of deckCards) {
    const status = deckCard.allocationStatus
    const cardNeeded = Math.max(status.required - status.allocated, 0)

    if (deckCard.zone !== "mainboard" || status.state === "basic_land" || cardNeeded <= 0) {
      continue
    }

    needed += cardNeeded

    const exactCandidates = status.candidates.filter((candidate) =>
      isExactCandidate(deckCard, candidate),
    )
    let remaining = cardNeeded

    exactCandidates.forEach((candidate, candidateIndex) => {
      const available = candidateRemainingAvailable(candidate, usedItemQuantities)

      if (remaining <= 0 || available <= 0) return

      const quantity = Math.min(remaining, available)
      exactEntries.push({
        id: pullListEntryId(deckCard.id, candidate.item.id, "exact", candidateIndex),
        deckCard,
        candidate,
        quantity,
        exact: true,
      })
      reserveCandidate(candidate, usedItemQuantities, quantity)
      remaining -= quantity
    })

    if (mode === "exact") {
      if (remaining > 0) {
        skipped += remaining
        skippedDeckCards.push(deckCard)
      }

      continue
    }

    const nonExactCandidates = status.candidates.filter(
      (candidate) =>
        candidateRemainingAvailable(candidate, usedItemQuantities) > 0 &&
        !isExactCandidate(deckCard, candidate),
    )

    const choiceCount = Math.min(
      remaining,
      nonExactCandidates.reduce(
        (total, candidate) =>
          total + candidateRemainingAvailable(candidate, usedItemQuantities),
        0,
      ),
    )

    for (let choiceIndex = 0; choiceIndex < choiceCount; choiceIndex += 1) {
      const defaultSelectedItemId = defaultChoiceSelection(nonExactCandidates, usedItemQuantities)
      const choiceId = pullListChoiceId(
        deckCard.id,
        nonExactCandidates[0]?.item.id ?? "none",
        choiceIndex,
      )
      const selectedItemId = selectedItemIdForChoice(
        selectedChoices,
        choiceId,
        defaultSelectedItemId,
        nonExactCandidates,
      )

      if (selectedItemId != null) {
        const selectedCandidate = nonExactCandidates.find(
          (candidate) => candidate.item.id === selectedItemId,
        )

        if (selectedCandidate) {
          reserveCandidate(selectedCandidate, usedItemQuantities, 1)
        }
      }

      choices.push({
        id: choiceId,
        deckCard,
        candidates: nonExactCandidates,
        selectedItemId,
      })
    }

    const unfilled = remaining - choiceCount

    if (unfilled > 0) {
      skipped += unfilled
      skippedDeckCards.push(deckCard)
    }
  }

  const selected =
    exactEntries.reduce((total, entry) => total + entry.quantity, 0) +
    choices.filter((choice) => choice.selectedItemId != null).length

  return {
    needed,
    selected,
    skipped,
    exactEntries,
    choices,
    skippedDeckCards,
  }
}

export function selectedDeckPullListEntries(pullList: DeckPullList): DeckPullListEntry[] {
  const entries = [...pullList.exactEntries]

  pullList.choices.forEach((choice) => {
    const candidate = choice.candidates.find(
      (candidate) => candidate.item.id === choice.selectedItemId,
    )

    if (!candidate) return

    entries.push({
      id: `${choice.id}:${candidate.item.id}`,
      deckCard: choice.deckCard,
      candidate,
      quantity: 1,
      exact: false,
      choiceId: choice.id,
    })
  })

  return entries
}

export function deckPullListSelectionError(pullList: DeckPullList): string | null {
  for (const choice of pullList.choices) {
    if (choice.candidates.length > 0 && choice.selectedItemId == null) {
      return "Choose a collection copy for every selectable deck card."
    }
  }

  const selectedByItemId = new Map<string, { selected: number; available: number }>()

  for (const entry of selectedDeckPullListEntries(pullList)) {
    const itemId = entry.candidate.item.id
    const current = selectedByItemId.get(itemId) ?? {
      selected: 0,
      available: entry.candidate.available,
    }

    current.selected += entry.quantity
    current.available = Math.min(current.available, entry.candidate.available)
    selectedByItemId.set(itemId, current)
  }

  for (const { selected, available } of selectedByItemId.values()) {
    if (selected > available) {
      return "Selected copies exceed the available collection quantity."
    }
  }

  return null
}

export function groupDeckPullListEntriesByLocation(
  entries: readonly DeckPullListEntry[],
): DeckPullListLocationGroup[] {
  const groups = new Map<string, DeckPullListLocationGroup>()

  for (const entry of entries) {
    const locationId = entry.candidate.item.location?.id ?? "unfiled"
    const locationName = entry.candidate.item.location?.name ?? "Unfiled"
    const group = groups.get(locationId)

    if (group) {
      group.entries.push(entry)
    } else {
      groups.set(locationId, { locationId, locationName, entries: [entry] })
    }
  }

  return [...groups.values()]
}

function isExactCandidate(deckCard: DeckCardEntry, candidate: AllocationCandidate) {
  const preferredScryfallId = deckCard.preferredPrinting?.scryfallId

  return (
    preferredScryfallId != null &&
    candidate.item.printing?.scryfallId === preferredScryfallId
  )
}

function defaultChoiceSelection(
  candidates: readonly AllocationCandidate[],
  usedItemQuantities: ReadonlyMap<string, number>,
) {
  const candidate = candidates.find(
    (candidate) => candidateRemainingAvailable(candidate, usedItemQuantities) > 0,
  )

  return candidate?.item.id ?? null
}

function candidateRemainingAvailable(
  candidate: AllocationCandidate,
  usedItemQuantities: ReadonlyMap<string, number>,
) {
  return Math.max(candidate.available - (usedItemQuantities.get(candidate.item.id) ?? 0), 0)
}

function reserveCandidate(
  candidate: AllocationCandidate,
  usedItemQuantities: Map<string, number>,
  quantity: number,
) {
  usedItemQuantities.set(
    candidate.item.id,
    (usedItemQuantities.get(candidate.item.id) ?? 0) + quantity,
  )
}

function selectedItemIdForChoice(
  selectedItemIds: Record<string, string | null>,
  choiceId: string,
  defaultSelectedItemId: string | null,
  candidates: readonly AllocationCandidate[],
) {
  if (!Object.prototype.hasOwnProperty.call(selectedItemIds, choiceId)) {
    return defaultSelectedItemId
  }

  const selectedItemId = selectedItemIds[choiceId]

  if (selectedItemId == null) {
    return null
  }

  return candidates.some((candidate) => candidate.item.id === selectedItemId)
    ? selectedItemId
    : defaultSelectedItemId
}

function pullListEntryId(
  deckCardId: string,
  collectionItemId: string,
  kind: "choice" | "exact",
  index: number,
) {
  return `${deckCardId}:${collectionItemId}:${kind}:${index}`
}

function pullListChoiceId(deckCardId: string, firstCollectionItemId: string, index: number) {
  return `${deckCardId}:${firstCollectionItemId}:choice-slot:${index}`
}
