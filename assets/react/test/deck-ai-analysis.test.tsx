import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

import { SummaryActionMenu } from "../src/pages/decks/deck-actions"
import { DeckAIAnalysis } from "../src/pages/decks/deck-ai-analysis"
import type { DeckDetail } from "../src/pages/decks/deck-types"

afterEach(cleanup)

function deck(attrs: Partial<DeckDetail> = {}) {
  return {
    id: "deck-1",
    aiAnalysis: "## Overview\n\nBuild value, then turn the corner.",
    aiAnalysisModel: "test/model",
    aiAnalyzedAt: "2026-08-19T02:09:23Z",
    commanderBracket: 3,
    commanderBracketEstimate: 2,
    ...attrs,
  } as DeckDetail
}

test("saved AI analysis is collapsed by default", () => {
  const { container } = render(<DeckAIAnalysis deck={deck()} />)

  const disclosure = container.querySelector("details")
  expect(disclosure).toBeInstanceOf(HTMLDetailsElement)
  expect(disclosure?.open).toBe(false)

  fireEvent.click(container.querySelector("summary") as HTMLElement)
  expect(disclosure?.open).toBe(true)
  expect(screen.getByRole("heading", { name: "Overview" })).toBeInstanceOf(HTMLElement)
  expect(screen.queryByRole("button", { name: /refresh ai analysis/i })).toBeNull()
})

test("AI analysis panel stays hidden until an analysis exists", () => {
  const { container } = render(<DeckAIAnalysis deck={deck({ aiAnalysis: null })} />)
  expect(container.innerHTML).toBe("")
})

test("AI analysis is the first deck action", async () => {
  const user = userEvent.setup()
  const analyze = vi.fn()

  render(
    <SummaryActionMenu
      label="Deck actions"
      analyzeLabel="Refresh AI analysis"
      onAnalyze={analyze}
      onEdit={() => undefined}
    />,
  )

  await user.click(screen.getByRole("button", { name: "Deck actions" }))
  const menuItems = screen.getAllByRole("menuitem")
  expect(menuItems[0]?.textContent).toContain("Refresh AI analysis")

  await user.click(menuItems[0])
  expect(analyze).toHaveBeenCalledOnce()
})
