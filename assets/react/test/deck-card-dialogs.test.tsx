import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"

vi.mock("@apollo/client/react", () => ({
  useQuery: () => ({
    data: {
      card: {
        printings: {
          edges: [
            {
              node: {
                id: "printing-alpha",
                scryfallId: "scryfall-alpha",
                setCode: "lea",
                setName: "Limited Edition Alpha",
                collectorNumber: "232",
                rarity: "rare",
                finishes: ["nonfoil", "foil"],
                imageUrl: null,
              },
            },
            {
              node: {
                id: "printing-beta",
                scryfallId: "scryfall-beta",
                setCode: "leb",
                setName: "Limited Edition Beta",
                collectorNumber: "233",
                rarity: "rare",
                finishes: ["nonfoil"],
                imageUrl: null,
              },
            },
          ],
        },
      },
    },
    loading: false,
  }),
}))

import { EditDeckCardDialog } from "../src/pages/decks/deck-card-dialogs"

afterEach(cleanup)

test("shows owned and free collection counts on printing choices", () => {
  render(
    <EditDeckCardDialog
      deckCard={
        {
          id: "deck-card-1",
          quantity: 1,
          zone: "mainboard",
          finish: "nonfoil",
          tag: null,
          card: { id: "card-1", name: "Black Lotus" },
          preferredPrinting: { id: "printing-alpha", finishes: ["nonfoil", "foil"] },
          allocationStatus: {
            candidates: [
              {
                available: 1,
                allocated: 0,
                allocatedElsewhere: 0,
                item: {
                  id: "item-free",
                  quantity: 2,
                  finish: "nonfoil",
                  printing: { id: "printing-alpha" },
                },
              },
              {
                available: 0,
                allocated: 1,
                allocatedElsewhere: 0,
                item: {
                  id: "item-allocated",
                  quantity: 1,
                  finish: "foil",
                  printing: { id: "printing-alpha" },
                },
              },
            ],
          },
        } as never
      }
      deckFormat="vintage"
      error={null}
      isPending={false}
      onClose={vi.fn()}
      onSave={vi.fn()}
    />,
  )

  const ownedPrinting = screen.getByRole("button", { name: /LEA.*#232/i })
  expect(within(ownedPrinting).getByText("3 owned · 1 free")).toBeInstanceOf(HTMLElement)

  const unownedPrinting = screen.getByRole("button", { name: /LEB.*#233/i })
  expect(within(unownedPrinting).queryByText(/owned.*free/i)).toBeNull()
})
