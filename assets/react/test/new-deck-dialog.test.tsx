import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  calls: [] as unknown[],
  error: null as Error | null,
  navigate: vi.fn(),
  showToast: vi.fn(),
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock("@apollo/client/react", () => ({
  useApolloClient: () => ({ refetchQueries: () => Promise.resolve([]) }),
  useMutation: () => [
    (options: {
      onCompleted?: (data: unknown) => void
      onError?: (error: Error) => void
      variables?: unknown
    }) => {
      mocks.calls.push(options.variables)
      if (mocks.error) {
        options.onError?.(mocks.error)
      } else {
        options.onCompleted?.({
          createDeck: { deck: { id: "deck-7" } },
          createLinkedDeck: { deck: { id: "deck-8", name: "Remote Deck" }, unresolved: [] },
        })
      }
      return Promise.resolve({ data: {} })
    },
    { loading: false },
  ],
  useQuery: () => ({ data: undefined, error: undefined, loading: false }),
}))

vi.mock("../src/components/ui/toast", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}))

import { NewDeckDialog } from "../src/pages/decks/deck-editor-dialogs"

afterEach(() => {
  cleanup()
  mocks.calls = []
  mocks.error = null
  mocks.navigate.mockReset()
  mocks.showToast.mockReset()
})

test("new deck dialog creates a deck without linking by default", async () => {
  const user = userEvent.setup()
  render(<NewDeckDialog open onOpenChange={vi.fn()} />)

  const toggle = screen.getByRole("switch", { name: "Link external deck" })
  expect(toggle.getAttribute("aria-checked")).toBe("false")

  // The URL box stays disabled until the switch is on, so a link can't be
  // pasted and then dropped when the deck is created unlinked.
  const urlInput = screen.getByRole("textbox", {
    name: "Moxfield or Archidekt URL",
  }) as HTMLInputElement
  expect(urlInput.disabled).toBe(true)

  await user.type(screen.getByPlaceholderText("Deck name"), "Plain")
  await user.click(screen.getByRole("button", { name: "Create deck" }))

  expect(mocks.calls).toEqual([
    { input: { name: "Plain", format: "commander", status: "brewing" } },
  ])
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/decks/$id", params: { id: "deck-7" } })
})

test("new deck dialog uses the external deck's name when the name is blank", async () => {
  const user = userEvent.setup()
  const onOpenChange = vi.fn()
  render(<NewDeckDialog open onOpenChange={onOpenChange} />)

  await user.click(screen.getByRole("switch", { name: "Link external deck" }))
  const nameInput = screen.getByPlaceholderText(
    "Leave blank to use the external deck's name",
  ) as HTMLInputElement
  expect(nameInput.disabled).toBe(false)

  await user.click(screen.getByRole("button", { name: "Create deck" }))
  expect(screen.getByText("Paste a Moxfield or Archidekt deck link first")).toBeTruthy()
  expect(mocks.calls).toEqual([])

  await user.type(
    screen.getByRole("textbox", { name: "Moxfield or Archidekt URL" }),
    "https://archidekt.com/decks/123",
  )
  await user.click(screen.getByRole("button", { name: "Create deck" }))

  expect(mocks.calls).toEqual([
    {
      input: {
        url: "https://archidekt.com/decks/123",
        name: null,
        format: "commander",
        status: "brewing",
      },
    },
  ])
  expect(onOpenChange).toHaveBeenCalledWith(false)
  expect(mocks.navigate).toHaveBeenCalledWith({ to: "/decks/$id", params: { id: "deck-8" } })
})

test("new deck dialog creates nothing and reports an error when the pull fails", async () => {
  const user = userEvent.setup()
  const onOpenChange = vi.fn()
  mocks.error = new Error("That deck was not found; it may be private or deleted.")
  render(<NewDeckDialog open onOpenChange={onOpenChange} />)

  await user.click(screen.getByRole("switch", { name: "Link external deck" }))
  await user.type(
    screen.getByRole("textbox", { name: "Moxfield or Archidekt URL" }),
    "https://moxfield.com/decks/missing",
  )
  await user.click(screen.getByRole("button", { name: "Create deck" }))

  expect(screen.getByText("That deck was not found; it may be private or deleted.")).toBeTruthy()
  expect(mocks.showToast).toHaveBeenCalledWith(
    "Deck not created: That deck was not found; it may be private or deleted.",
    { tone: "error" },
  )
  expect(onOpenChange).not.toHaveBeenCalled()
  expect(mocks.navigate).not.toHaveBeenCalled()
})

test("new deck dialog can't link an archived deck", async () => {
  const user = userEvent.setup()
  render(<NewDeckDialog open onOpenChange={vi.fn()} />)

  const toggle = screen.getByRole("switch", { name: "Link external deck" }) as HTMLButtonElement
  await user.click(toggle)
  expect(toggle.getAttribute("aria-checked")).toBe("true")

  await user.click(screen.getByRole("combobox", { name: /Status/ }))
  await user.click(screen.getByRole("option", { name: "Archived" }))

  expect(toggle.getAttribute("aria-checked")).toBe("false")
  expect(toggle.disabled).toBe(true)
  expect(screen.getByText("Archived decks can't be linked to an external deck.")).toBeTruthy()
  expect(
    (screen.getByRole("textbox", { name: "Moxfield or Archidekt URL" }) as HTMLInputElement)
      .disabled,
  ).toBe(true)
})

test("new deck dialog lets a typed name override the external deck's name", async () => {
  const user = userEvent.setup()
  render(<NewDeckDialog open onOpenChange={vi.fn()} />)

  await user.click(screen.getByRole("switch", { name: "Link external deck" }))
  await user.type(
    screen.getByPlaceholderText("Leave blank to use the external deck's name"),
    "  My Name  ",
  )
  await user.type(
    screen.getByRole("textbox", { name: "Moxfield or Archidekt URL" }),
    "https://moxfield.com/decks/abc",
  )
  await user.click(screen.getByRole("button", { name: "Create deck" }))

  expect(mocks.calls).toEqual([
    {
      input: {
        url: "https://moxfield.com/decks/abc",
        name: "My Name",
        format: "commander",
        status: "brewing",
      },
    },
  ])
})
