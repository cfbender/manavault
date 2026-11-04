import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  mutationVariables: undefined as unknown,
  navigate: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock("@apollo/client/react", async () => {
  const documents = await import("../src/pages/decks/deck-list-documents")
  return {
    useApolloClient: () => ({ refetchQueries: () => Promise.resolve([]) }),
    useMutation: () => [
      (options: { onCompleted?: (data: unknown) => void; variables?: unknown }) => {
        mocks.mutationVariables = options.variables
        options.onCompleted?.({
          importCommanderPrecon: {
            deck: { id: "deck-9", name: "Kitties" },
            unresolved: [],
            addedToCollection: 64,
          },
        })
        return Promise.resolve({ data: {} })
      },
      { loading: false },
    ],
    useQuery: (document: unknown, options: { skip?: boolean }) => {
      if (options.skip) return { data: undefined, loading: false }
      if (document === documents.CommanderPreconsDocument) {
        return {
          data: {
            commanderPrecons: [
              {
                id: "SubjectiveReality_C18",
                name: "Subjective Reality",
                product: "Commander 2018",
                releaseDate: "2018-08-10",
                url: "https://magic.wizards.com/c18",
              },
              {
                id: "EowynsRiders_LTC",
                name: "Éowyn's Riders",
                product: "The Lord of the Rings Commander",
                releaseDate: "2023-06-23",
                url: null,
              },
              {
                id: "NatureOfTheBeast_C13",
                name: "Nature of the Beast",
                product: "Commander 2013",
                releaseDate: "2013-11-01",
                url: "https://magic.wizards.com/c13",
              },
            ],
          },
          loading: false,
        }
      }
      return {
        data: {
          locations: {
            edges: [
              { node: { id: "unfiled", name: "Unfiled", kind: "unfiled" } },
              { node: { id: "loc-box", name: "Precon shelf", kind: "box" } },
              { node: { id: "loc-wants", name: "Wants", kind: "list" } },
            ],
          },
        },
        loading: false,
      }
    },
  }
})

import { PreconImportDialog } from "../src/pages/decks/precon-import-dialog"

afterEach(() => {
  cleanup()
  mocks.mutationVariables = undefined
  mocks.navigate.mockReset()
})

function preconNames() {
  const list = screen.getByRole("list", { name: "Commander precons" })
  return within(list)
    .getAllByRole("button")
    .map((button) => button.querySelector("span span")?.textContent)
}

test("searches precons by every word of the deck name or product", async () => {
  const user = userEvent.setup()
  render(<PreconImportDialog open onOpenChange={vi.fn()} />)

  expect(preconNames()).toEqual(["Subjective Reality", "Éowyn's Riders", "Nature of the Beast"])

  await user.type(screen.getByRole("searchbox", { name: "Search precons" }), "commander 2013")
  expect(preconNames()).toEqual(["Nature of the Beast"])
  expect(screen.getByText("1 of 3 precons")).toBeInstanceOf(HTMLElement)

  await user.clear(screen.getByRole("searchbox", { name: "Search precons" }))
  await user.type(screen.getByRole("searchbox", { name: "Search precons" }), "eowyn rings")
  expect(preconNames()).toEqual(["Éowyn's Riders"])
})

test("imports the chosen precon into a storage location and opens the new deck", async () => {
  const user = userEvent.setup()
  const onOpenChange = vi.fn()
  render(<PreconImportDialog open onOpenChange={onOpenChange} />)

  await user.click(screen.getByRole("button", { name: /Subjective Reality/ }))
  const name = screen.getByRole("textbox")
  expect((name as HTMLInputElement).value).toBe("Subjective Reality")
  await user.clear(name)
  await user.type(name, "Kitties")

  await user.click(screen.getByRole("switch", { name: "Add the cards to my collection" }))
  const locations = screen.getByRole("radiogroup", { name: "Location" })
  expect(within(locations).queryByRole("radio", { name: "Wants" })).toBeNull()
  await user.click(within(locations).getByRole("radio", { name: "Precon shelf" }))

  await user.click(screen.getByRole("button", { name: "Import deck" }))

  expect(mocks.mutationVariables).toEqual({
    input: {
      preconId: "SubjectiveReality_C18",
      name: "Kitties",
      addToCollection: true,
      locationId: "loc-box",
    },
  })
  expect(onOpenChange).toHaveBeenCalledWith(false)
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/decks/$id", params: { id: "deck-9" } })
})
