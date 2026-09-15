import { cleanup, render } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"

const router = vi.hoisted(() => ({
  state: {
    location: { pathname: "/decks/deck-1" },
    matches: [{ staticData: { title: "Deck" } }],
  } as {
    location: { pathname: string }
    matches: Array<{ staticData: { title?: string } }>
  },
}))

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: typeof router.state) => unknown }) =>
    select(router.state),
}))

import { PageTitleProvider, usePageTitle } from "../src/lib/page-title"

function DynamicDeckTitle() {
  usePageTitle("Example Deck")
  return null
}

afterEach(() => {
  cleanup()
  document.title = ""
})

test("a dynamic title cleanup restores the destination route title", () => {
  const { rerender } = render(
    <PageTitleProvider>
      <DynamicDeckTitle />
    </PageTitleProvider>,
  )

  expect(document.title).toBe("ManaVault - Example Deck")

  router.state = {
    location: { pathname: "/decks" },
    matches: [{ staticData: { title: "Decks" } }],
  }

  // TanStack Router can update the location before replacing the prior route's component.
  rerender(
    <PageTitleProvider>
      <DynamicDeckTitle />
    </PageTitleProvider>,
  )
  rerender(<PageTitleProvider>Deck gallery</PageTitleProvider>)

  expect(document.title).toBe("ManaVault - Decks")
})
