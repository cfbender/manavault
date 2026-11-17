import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test } from "vitest"

import { ToastProvider, useToast } from "../src/components/ui/toast"

afterEach(cleanup)

function ToastHarness() {
  const { showToast } = useToast()

  return (
    <>
      <button
        type="button"
        onClick={() =>
          showToast("Analyzing Counter Deck with AI…", {
            id: "deck-analysis-deck-1",
            loading: true,
            tone: "info",
          })
        }
      >
        Start analysis
      </button>
      <button
        type="button"
        onClick={() =>
          showToast("Deck analysis complete.", {
            id: "deck-analysis-deck-1",
          })
        }
      >
        Complete analysis
      </button>
    </>
  )
}

test("a loading toast shows a progress bar and is replaced by a later toast with its id", async () => {
  const user = userEvent.setup()
  render(
    <ToastProvider>
      <ToastHarness />
    </ToastProvider>,
  )

  await user.click(screen.getByRole("button", { name: "Start analysis" }))

  expect(screen.getByText("Analyzing Counter Deck with AI…")).toBeInstanceOf(HTMLElement)
  expect(screen.getByRole("progressbar", { name: "AI deck analysis in progress" })).toBeInstanceOf(
    HTMLProgressElement,
  )

  await user.click(screen.getByRole("button", { name: "Complete analysis" }))

  expect(screen.getByText("Deck analysis complete.")).toBeInstanceOf(HTMLElement)
  expect(screen.queryByRole("progressbar")).toBeNull()
  expect(screen.queryByText("Analyzing Counter Deck with AI…")).toBeNull()
})
