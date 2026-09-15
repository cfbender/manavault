import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"

import { DeckMarkdown, DeckPrimer } from "../src/pages/decks/deck-primer"

afterEach(cleanup)

test("deck primer renders safe Markdown inside an accessible disclosure", () => {
  const { container } = render(
    <DeckPrimer
      primer={
        '## Game plan\n\n- Ramp early\n- Protect the commander\n\n<script data-testid="unsafe">alert("no")</script>'
      }
    />,
  )

  const disclosure = container.querySelector("details")
  expect(disclosure).toBeInstanceOf(HTMLDetailsElement)
  expect(disclosure?.open).toBe(false)

  fireEvent.click(container.querySelector("summary") as HTMLElement)
  expect(disclosure?.open).toBe(true)
  expect(screen.getByRole("heading", { name: "Game plan" })).toBeInstanceOf(HTMLElement)
  expect(screen.getByText("Ramp early")).toBeInstanceOf(HTMLElement)
  expect(document.querySelector("script")).toBeNull()
  expect(screen.queryByTestId("unsafe")).toBeNull()
})

test("deck Markdown renders inline LaTeX", () => {
  const { container } = render(
    <DeckMarkdown>{"Cards flow $A \\rightarrow B$ through the sequence."}</DeckMarkdown>,
  )

  expect(container.querySelector(".katex")).toBeInstanceOf(HTMLElement)
  expect(container.querySelector(".katex .mrel")?.textContent).toBe("→")
  expect(container.querySelector('annotation[encoding="application/x-tex"]')?.textContent).toBe(
    "A \\rightarrow B",
  )
})

test("deck primer stays hidden when it has no content", () => {
  const { container } = render(<DeckPrimer primer="   " />)
  expect(container.innerHTML).toBe("")
})
