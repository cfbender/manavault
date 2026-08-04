import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

const apolloMocks = vi.hoisted(() => ({
  mutationVariables: undefined as unknown,
}))

vi.mock("@apollo/client/react", () => ({
  useMutation: () => [
    (options: { onCompleted?: () => void; variables?: unknown }) => {
      apolloMocks.mutationVariables = options.variables
      options.onCompleted?.()
      return Promise.resolve({ data: {} })
    },
    { loading: false },
  ],
  useQuery: (document: { definitions: Array<{ name?: { value?: string } }> }) => {
    const name = document.definitions[0]?.name?.value

    if (name === "CollectionItemPrintings") {
      return {
        data: {
          card: {
            printings: {
              edges: [
                {
                  node: {
                    id: "printing-original",
                    setCode: "old",
                    setName: "Old Set",
                    collectorNumber: "1",
                    rarity: "rare",
                    finishes: ["nonfoil", "foil"],
                  },
                },
                {
                  node: {
                    id: "printing-corrected",
                    setCode: "new",
                    setName: "Correct Set",
                    collectorNumber: "2",
                    rarity: "mythic",
                    finishes: ["nonfoil"],
                  },
                },
              ],
            },
          },
        },
        loading: false,
      }
    }

    return { data: { locations: { edges: [] } }, loading: false }
  },
}))

import { EditCollectionItemDialog } from "../src/pages/collection/edit-item-dialog"

afterEach(() => {
  cleanup()
  apolloMocks.mutationVariables = undefined
})

test("changes the printing while preserving the collection item details", async () => {
  const user = userEvent.setup()
  const onDone = vi.fn()
  const onOpenChange = vi.fn()

  render(
    <EditCollectionItemDialog
      item={
        {
          id: "item-1",
          quantity: 3,
          condition: "lightly_played",
          finish: "foil",
          language: "ja",
          notes: "Keep me",
          purchasePriceCents: 425,
          printing: {
            id: "printing-original",
            setCode: "old",
            setName: "Old Set",
            collectorNumber: "1",
            rarity: "rare",
            card: { id: "card-1", name: "Test Card" },
          },
        } as never
      }
      onDone={onDone}
      onOpenChange={onOpenChange}
    />,
  )

  await user.selectOptions(screen.getByLabelText("Printing"), "printing-corrected")
  expect(screen.getByRole("button", { name: "Nonfoil" }).getAttribute("aria-pressed")).toBe("true")
  expect(screen.queryByRole("button", { name: "Foil" })).toBeNull()

  await user.click(screen.getByRole("button", { name: "Save item" }))

  expect(apolloMocks.mutationVariables).toEqual({
    id: "item-1",
    input: {
      condition: "lightly_played",
      finish: "nonfoil",
      language: "ja",
      locationId: null,
      notes: "Keep me",
      purchasePriceCents: 425,
      quantity: 3,
      scryfallId: "printing-corrected",
    },
  })
  expect(onDone).toHaveBeenCalledOnce()
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
