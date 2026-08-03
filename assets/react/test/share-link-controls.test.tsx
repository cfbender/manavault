import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"

const apolloMocks = vi.hoisted(() => ({
  mutations: vi.fn<(name: string) => void>(),
}))

vi.mock("@apollo/client/react", () => ({
  useApolloClient: () => ({ refetchQueries: vi.fn(() => Promise.resolve()) }),
  useMutation: (document: { definitions: Array<{ name?: { value?: string } }> }) => {
    const name = document.definitions[0]?.name?.value || ""

    return [
      (options?: { onCompleted?: (data: Record<string, unknown>) => void }) => {
        apolloMocks.mutations(name)
        options?.onCompleted?.(mutationResult(name))
        return Promise.resolve({ data: mutationResult(name) })
      },
      { data: undefined, error: undefined, loading: false },
    ]
  },
  useQuery: (document: { definitions: Array<{ name?: { value?: string } }> }) => {
    const name = document.definitions[0]?.name?.value
    const data =
      name === "TradeWantsShareToken"
        ? { tradeWantsShareToken: "wants-token" }
        : { tradeBinderShareToken: "binder-token" }

    return { data, error: undefined, loading: false, refetch: vi.fn() }
  },
}))

import { ShareDeckDialog } from "../src/pages/decks/deck-share-dialogs"
import { BinderShareDialog } from "../src/pages/trade/binder-share-dialog"
import { WantsShareDialog } from "../src/pages/trade/wants-share-dialog"

function mutationResult(name: string) {
  switch (name) {
    case "EnsureDeckShareToken":
      return { ensureDeckShareToken: { deck: { id: "deck-1", shareToken: "deck-token" } } }
    case "EnsureTradeWantsShareToken":
      return { ensureTradeWantsShareToken: { token: "wants-token" } }
    case "EnsureTradeBinderShareToken":
      return { ensureTradeBinderShareToken: { token: "binder-token" } }
    case "RotateDeckShareToken":
      return { rotateDeckShareToken: { deck: { id: "deck-1", shareToken: "rotated" } } }
    case "DisableDeckSharing":
      return { disableDeckSharing: { deck: { id: "deck-1", shareToken: null } } }
    case "RotateTradeWantsShareToken":
      return { rotateTradeWantsShareToken: { token: "rotated" } }
    case "DisableTradeWantsSharing":
      return { disableTradeWantsSharing: { success: true } }
    case "RotateTradeBinderShareToken":
      return { rotateTradeBinderShareToken: { token: "rotated" } }
    case "DisableTradeBinderSharing":
      return { disableTradeBinderSharing: { success: true } }
    default:
      return {}
  }
}

function WantsHarness() {
  const [open, setOpen] = useState(true)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open wants sharing
      </button>
      <WantsShareDialog onOpenChange={setOpen} open={open} />
    </>
  )
}

afterEach(() => {
  cleanup()
  apolloMocks.mutations.mockClear()
})

describe("share link owner controls", () => {
  test("deck, wants, and binder dialogs expose rotation and revocation", () => {
    const onOpenChange = vi.fn()

    const { unmount } = render(
      <ShareDeckDialog
        deck={{ id: "deck-1", name: "Deck", shareToken: "deck-token" } as never}
        onOpenChange={onOpenChange}
        open
      />,
    )
    expect(screen.getByRole("button", { name: "Rotate link" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Disable sharing" })).toBeTruthy()
    unmount()

    render(<WantsShareDialog onOpenChange={onOpenChange} open />)
    expect(screen.getByRole("button", { name: "Rotate link" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Disable sharing" })).toBeTruthy()
    cleanup()

    render(<BinderShareDialog onOpenChange={onOpenChange} open />)
    expect(screen.getByRole("button", { name: "Rotate link" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Disable sharing" })).toBeTruthy()
  })

  test("confirmed wants rotation invokes the authenticated rotation mutation", async () => {
    const user = userEvent.setup()
    render(<WantsShareDialog onOpenChange={vi.fn()} open />)

    await user.click(screen.getByRole("button", { name: "Rotate link" }))
    const confirmation = screen.getByRole("alertdialog")
    await user.click(within(confirmation).getByRole("button", { name: "Rotate link" }))

    expect(apolloMocks.mutations).toHaveBeenCalledWith("RotateTradeWantsShareToken")
  })

  test("reopening after disable verifies a fresh token through ensure", async () => {
    const user = userEvent.setup()
    render(<WantsHarness />)

    expect(
      apolloMocks.mutations.mock.calls.filter(([name]) => name === "EnsureTradeWantsShareToken"),
    ).toHaveLength(1)

    await user.click(screen.getByRole("button", { name: "Disable sharing" }))
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Disable sharing" }),
    )
    await user.click(screen.getByRole("button", { name: "Open wants sharing" }))

    expect(
      apolloMocks.mutations.mock.calls.filter(([name]) => name === "EnsureTradeWantsShareToken"),
    ).toHaveLength(2)
  })
})
