import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  calls: [] as unknown[],
  navigate: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock("@apollo/client/react", () => ({
  useApolloClient: () => ({ refetchQueries: () => Promise.resolve([]) }),
  useMutation: () => [
    (options: { onCompleted?: (data: unknown) => void; variables?: unknown }) => {
      mocks.calls.push(options.variables)
      options.onCompleted?.({
        createDeck: { deck: { id: "deck-7" } },
        linkDeckExternalSource: { unresolved: [] },
      })
      return Promise.resolve({ data: {} })
    },
    { loading: false },
  ],
  useQuery: () => ({ data: undefined, error: undefined, loading: false }),
}))

vi.mock("../src/components/ui/toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

import { NewDeckDialog } from "../src/pages/decks/deck-editor-dialogs"

afterEach(() => {
  cleanup()
  mocks.calls = []
  mocks.navigate.mockReset()
})

test("new deck dialog creates a deck without linking by default", async () => {
  const user = userEvent.setup()
  render(<NewDeckDialog open onOpenChange={vi.fn()} />)

  const toggle = screen.getByRole("switch", { name: "Link external deck" })
  expect(toggle.getAttribute("aria-checked")).toBe("false")

  await user.type(screen.getByPlaceholderText("Deck name"), "Plain")
  await user.type(
    screen.getByRole("textbox", { name: "Moxfield or Archidekt URL" }),
    "https://moxfield.com/decks/abc",
  )
  expect(toggle.getAttribute("aria-checked")).toBe("false")
  await user.click(screen.getByRole("button", { name: "Create deck" }))

  expect(mocks.calls).toEqual([
    { input: { name: "Plain", format: "commander", status: "brewing" } },
  ])
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/decks/$id", params: { id: "deck-7" } })
})

test("new deck dialog links the created deck when the toggle is on", async () => {
  const user = userEvent.setup()
  render(<NewDeckDialog open onOpenChange={vi.fn()} />)

  await user.type(screen.getByPlaceholderText("Deck name"), "Linked")
  await user.click(screen.getByRole("switch", { name: "Link external deck" }))
  await user.click(screen.getByRole("button", { name: "Create deck" }))
  expect(screen.getByText("Paste a Moxfield or Archidekt deck link first")).toBeTruthy()
  expect(mocks.calls).toEqual([])

  await user.type(
    screen.getByRole("textbox", { name: "Moxfield or Archidekt URL" }),
    "https://archidekt.com/decks/123",
  )
  await user.click(screen.getByRole("button", { name: "Create deck" }))

  expect(mocks.calls).toEqual([
    { input: { name: "Linked", format: "commander", status: "brewing" } },
    { id: "deck-7", url: "https://archidekt.com/decks/123" },
  ])
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/decks/$id", params: { id: "deck-7" } })
})
