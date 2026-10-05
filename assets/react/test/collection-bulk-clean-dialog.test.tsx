import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { MockLink } from "@apollo/client/testing"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { BulkCleanDialog } from "../src/pages/collection/bulk-clean-dialog"
import {
  CollectionBulkCleanDocument,
  RemoveBulkCleanPullsDocument,
} from "../src/pages/collection/bulk-clean/documents"

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function pull(id: string, location: { id: string | null; name: string }, quantity: number) {
  return {
    collectionItemId: id,
    cardId: "oracle-elves",
    cardName: "Llanowar Elves",
    setCode: "m19",
    collectorNumber: "314",
    imageUrl: null,
    finish: "nonfoil",
    priceCents: 5,
    ownedQuantity: 6,
    quantity,
    fromLocationId: location.id,
    fromLocationName: location.name,
  }
}

test("shows where to pull surplus bulk and refetches when thresholds change", async () => {
  const user = userEvent.setup()
  const link = new MockLink([
    {
      request: {
        query: CollectionBulkCleanDocument,
        variables: {
          maxPriceCents: 20,
          minCopies: 10,
          keepCopies: 4,
          preferKeepFoils: true,
          kept: [],
        },
      },
      maxUsageCount: 2,
      result: {
        data: {
          collectionBulkClean: {
            cardCount: 1,
            pullQuantity: 8,
            pullValueCents: 40,
            cards: [
              {
                cardId: "oracle-elves",
                cardName: "Llanowar Elves",
                typeLine: "Creature — Elf Druid",
                colors: ["G"],
                totalCopies: 12,
                pullQuantity: 8,
                swappableCopies: 0,
                pulls: [
                  pull("1", { id: "7", name: "Commons box" }, 6),
                  pull("2", { id: null, name: "Unfiled" }, 2),
                ],
              },
            ],
          },
        },
      },
    },
    {
      request: {
        query: CollectionBulkCleanDocument,
        variables: {
          maxPriceCents: 20,
          minCopies: 20,
          keepCopies: 4,
          preferKeepFoils: true,
          kept: [],
        },
      },
      maxUsageCount: 2,
      result: {
        data: {
          collectionBulkClean: { cardCount: 0, pullQuantity: 0, pullValueCents: 0, cards: [] },
        },
      },
    },
  ])

  const client = new ApolloClient({ cache: new InMemoryCache(), link })
  const dialog = (
    <ApolloProvider client={client}>
      <BulkCleanDialog open onDone={() => {}} onOpenChange={() => {}} />
    </ApolloProvider>
  )
  const view = render(dialog)

  const box = await screen.findByRole("heading", { level: 3, name: "Commons box" })
  expect(screen.getByRole("heading", { level: 3, name: "Unfiled" })).toBeTruthy()
  const boxGroup = box.closest("details")
  if (!(boxGroup instanceof HTMLElement)) throw new Error("Missing location group")
  expect(within(boxGroup).getByRole("link", { name: "Llanowar Elves" })).toBeTruthy()
  expect(within(boxGroup).getAllByText("Pull 6")).toHaveLength(3)
  expect(
    within(boxGroup).getByText("12 loose copies owned · pulling 8 across your collection"),
  ).toBeTruthy()
  expect(screen.getByText("Pull 2 of 6")).toBeTruthy()
  expect(screen.getByText("$0.40")).toBeTruthy()

  expect(screen.getByText("0 of 8")).toBeTruthy()
  await user.click(
    screen.getByRole("checkbox", { name: "Pulled 6 Llanowar Elves M19 #314 from Commons box" }),
  )
  expect(screen.getByText("6 of 8")).toBeTruthy()
  expect(within(boxGroup).getAllByText("Pulled 6")).toHaveLength(2)

  const pullAll = screen.getByRole("button", { name: "Pull all Llanowar Elves from Unfiled" })
  await user.click(pullAll)
  expect(screen.getByText("8 of 8")).toBeTruthy()
  expect(pullAll.closest("details")?.open).toBe(true)
  await user.click(screen.getByRole("button", { name: "Unmark all Llanowar Elves from Unfiled" }))
  expect(screen.getByText("6 of 8")).toBeTruthy()

  view.unmount()
  render(dialog)
  const restored = await screen.findByRole("checkbox", {
    name: "Pulled 6 Llanowar Elves M19 #314 from Commons box",
  })
  expect((restored as HTMLInputElement).checked).toBe(true)
  expect(screen.getByText("6 of 8")).toBeTruthy()

  const minCopies = screen.getByLabelText("Own at least")
  await user.clear(minCopies)
  await user.type(minCopies, "20")

  expect(await screen.findByText("Nothing to pull.", {}, { timeout: 2000 })).toBeTruthy()

  cleanup()
  render(dialog)
  expect((screen.getByLabelText("Own at least") as HTMLInputElement).value).toBe("20")
  expect(await screen.findByText("Nothing to pull.", {}, { timeout: 2000 })).toBeTruthy()
})

function bulkCleanResult(pulls: ReturnType<typeof pull>[], swappableCopies = 0) {
  const pullQuantity = pulls.reduce((total, entry) => total + entry.quantity, 0)
  return {
    data: {
      collectionBulkClean: {
        cardCount: pulls.length ? 1 : 0,
        pullQuantity,
        pullValueCents: pullQuantity * 5,
        cards: pulls.length
          ? [
              {
                cardId: "oracle-elves",
                cardName: "Llanowar Elves",
                typeLine: "Creature — Elf Druid",
                colors: ["G"],
                totalCopies: 12,
                pullQuantity,
                swappableCopies,
                pulls,
              },
            ]
          : [],
      },
    },
  }
}

test("toggles the foil preference and removes checked pulls after confirming", async () => {
  const user = userEvent.setup()
  const onDone = vi.fn()
  const defaults = { maxPriceCents: 20, minCopies: 10, keepCopies: 4 }
  const boxPull = pull("1", { id: "7", name: "Commons box" }, 6)
  const unfiledPull = pull("2", { id: null, name: "Unfiled" }, 2)
  const link = new MockLink([
    {
      request: {
        query: CollectionBulkCleanDocument,
        variables: { ...defaults, preferKeepFoils: true, kept: [] },
      },
      result: bulkCleanResult([boxPull, unfiledPull]),
    },
    {
      request: {
        query: CollectionBulkCleanDocument,
        variables: { ...defaults, preferKeepFoils: false, kept: [] },
      },
      result: bulkCleanResult([boxPull, unfiledPull]),
    },
    {
      request: {
        query: RemoveBulkCleanPullsDocument,
        variables: { pulls: [{ collectionItemId: "1", quantity: 6 }] },
      },
      result: { data: { removeBulkCleanPulls: { removedCount: 6 } } },
    },
    {
      request: {
        query: CollectionBulkCleanDocument,
        variables: { ...defaults, preferKeepFoils: false, kept: [] },
      },
      result: bulkCleanResult([unfiledPull]),
    },
  ])

  render(
    <ApolloProvider client={new ApolloClient({ cache: new InMemoryCache(), link })}>
      <BulkCleanDialog open onDone={onDone} onOpenChange={() => {}} />
    </ApolloProvider>,
  )

  const foils = await screen.findByRole("switch", { name: /Prefer to keep foils/ })
  expect(foils.getAttribute("aria-checked")).toBe("true")
  await screen.findByRole("heading", { level: 3, name: "Commons box" })
  await user.click(foils)
  expect(foils.getAttribute("aria-checked")).toBe("false")
  // Let the debounced refetch with the new preference go out before removing.
  await new Promise((resolve) => setTimeout(resolve, 400))

  const removeButton = screen.getByRole("button", { name: "Remove pulled" })
  expect((removeButton as HTMLButtonElement).disabled).toBe(true)
  await user.click(
    screen.getByRole("checkbox", { name: "Pulled 6 Llanowar Elves M19 #314 from Commons box" }),
  )
  await user.click(removeButton)
  await user.click(screen.getByRole("button", { name: "Remove from collection" }))

  await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
  expect(screen.queryByRole("heading", { level: 3, name: "Commons box" })).toBeNull()
  expect(window.localStorage.getItem("manavault.collection.bulkCleanPulled")).toBe("{}")
})

test("keeping a copy swaps it for one from another stack and can be reset", async () => {
  const user = userEvent.setup()
  const defaults = { maxPriceCents: 20, minCopies: 10, keepCopies: 4, preferKeepFoils: true }
  const unfiled = { id: null, name: "Unfiled" }
  const box = { id: "7", name: "Commons box" }
  const link = new MockLink([
    {
      request: { query: CollectionBulkCleanDocument, variables: { ...defaults, kept: [] } },
      result: bulkCleanResult([pull("1", box, 6), pull("2", unfiled, 2)], 1),
      maxUsageCount: 2,
    },
    {
      request: {
        query: CollectionBulkCleanDocument,
        variables: { ...defaults, kept: [{ collectionItemId: "1", quantity: 1 }] },
      },
      result: bulkCleanResult([pull("1", box, 5), pull("2", unfiled, 3)], 0),
    },
  ])

  render(
    <ApolloProvider client={new ApolloClient({ cache: new InMemoryCache(), link })}>
      <BulkCleanDialog open onDone={() => {}} onOpenChange={() => {}} />
    </ApolloProvider>,
  )

  await user.click(
    await screen.findByRole("button", {
      name: "Keep one Llanowar Elves M19 #314 from Commons box",
    }),
  )

  expect(await screen.findByText("Pull 5 of 6", {}, { timeout: 2000 })).toBeTruthy()
  expect(screen.getByText("Pull 3 of 6")).toBeTruthy()
  expect(screen.getByText(/keeping 1/)).toBeTruthy()
  const keepAgain = screen.getByRole("button", {
    name: "Keep one Llanowar Elves M19 #314 from Commons box",
  }) as HTMLButtonElement
  expect(keepAgain.disabled).toBe(true)

  await user.click(screen.getByRole("button", { name: "Reset kept (1)" }))
  expect(await screen.findByText("Pull 2 of 6", {}, { timeout: 2000 })).toBeTruthy()
  expect(window.localStorage.getItem("manavault.collection.bulkCleanKept")).toBe("{}")
})
