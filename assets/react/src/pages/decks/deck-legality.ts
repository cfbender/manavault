import { compactNumber } from "../../lib/utils"
import type { DeckLegality } from "./deck-types"

export function deckLegalityLabel(legality: DeckLegality) {
  return legality?.status === "legal" ? "Legal" : "Illegal"
}

export function deckLegalityTone(legality: DeckLegality): "success" | "error" {
  return legality?.status === "legal" ? "success" : "error"
}

export function deckLegalityIssues(legality: DeckLegality) {
  return (legality?.issues || []).flatMap((issue) =>
    issue?.message ? [{ ...issue, message: issue.message }] : [],
  )
}

export function deckLegalityIssueCount(legality: DeckLegality) {
  return deckLegalityIssues(legality).length
}

export function deckLegalityIssueCountLabel(count: number) {
  return `${compactNumber(count)} ${count === 1 ? "issue" : "issues"}`
}
