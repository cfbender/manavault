import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

const apolloMocks = vi.hoisted(() => ({
  mutationVariables: undefined as unknown,
}))

const navigateMock = vi.hoisted(() => vi.fn())

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}))

vi.mock("@apollo/client/react", () => ({
  useApolloClient: () => ({ refetchQueries: () => Promise.resolve([]) }),
  useMutation: () => [
    (options: { onCompleted?: () => void; variables?: unknown }) => {
      apolloMocks.mutationVariables = options.variables
      options.onCompleted?.()
      return Promise.resolve({ data: {} })
    },
    { loading: false },
  ],
  useQuery: () => ({
    data: {
      decks: {
        edges: Array.from({ length: 40 }, (_, index) => ({
          node: {
            id: `deck-${index + 1}`,
            name: `Deck ${index + 1}`,
            format: "commander",
            status: "active",
          },
        })).concat({
          node: {
            id: "archived-deck",
            name: "Archived Deck",
            format: "commander",
            status: "archived",
          },
        }),
      },
    },
    loading: false,
  }),
}))

import { AddCatalogCardToDeckDialog } from "../src/pages/cards/add-card-to-deck-dialog"

afterEach(() => {
  cleanup()
  apolloMocks.mutationVariables = undefined
  navigateMock.mockReset()
})

function renderDialog() {
  const onOpenChange = vi.fn()
  render(
    <AddCatalogCardToDeckDialog
      target={{ cardName: "Sol Ring", finishes: ["nonfoil"] }}
      onOpenChange={onOpenChange}
    />,
  )
  return { onOpenChange }
}

test("lists many editable decks without archived decks in a bounded scrollable listbox", async () => {
  const user = userEvent.setup()
  renderDialog()

  await user.click(screen.getByRole("combobox", { name: "Deck" }))

  const listbox = await screen.findByRole("listbox")
  const options = within(listbox).getAllByRole("option")
  expect(options).toHaveLength(40)
  expect(within(listbox).queryByRole("option", { name: "Archived Deck (Commander)" })).toBeNull()

  const scrollViewport = listbox.querySelector("[data-radix-select-viewport]")
  expect(scrollViewport?.className).toContain("max-h-")
  expect(scrollViewport?.className).toContain("overflow-y-auto")
})

test("selects a deck with the keyboard and submits it", async () => {
  const user = userEvent.setup()
  renderDialog()

  const trigger = screen.getByRole("combobox", { name: "Deck" })
  await user.click(trigger)
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}")

  expect(document.activeElement).toBe(trigger)
  expect(trigger.textContent).toContain("Deck 3")

  await user.click(screen.getByRole("button", { name: "Add to deck" }))

  expect(apolloMocks.mutationVariables).toMatchObject({
    deckId: "deck-3",
    input: { name: "Sol Ring", quantity: 1, zone: "mainboard" },
  })
  expect(navigateMock).toHaveBeenCalledWith({ to: "/decks/$id", params: { id: "deck-3" } })
})
