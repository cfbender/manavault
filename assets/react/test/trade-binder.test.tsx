import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { ToastProvider } from "../src/components/ui/toast"
import { BinderTab } from "../src/pages/trade/binder-tab"

const apolloMocks = vi.hoisted(() => ({
  binderRefetch: vi.fn(),
  countRefetch: vi.fn(),
  setForTradeQuantity: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}))

vi.mock("@apollo/client/react", () => apolloMocks)

vi.mock("../src/pages/collection/selection-grid", () => ({
  VirtualizedCollectionGrid: ({
    forTradeQuantityOverrides,
    groups,
    onToggleForTrade,
    pendingForTradePrintingIds,
  }: {
    forTradeQuantityOverrides?: Record<string, number>
    groups: Array<{
      items: Array<{ forTradeQuantity: number }>
      printingId: string
    }>
    onToggleForTrade?: (group: {
      items: Array<{ forTradeQuantity: number }>
      printingId: string
    }) => void
    pendingForTradePrintingIds?: Set<string>
  }) => (
    <div>
      {groups.map((group) => (
        <div key={group.printingId}>
          <span data-testid={`trade-quantity-${group.printingId}`}>
            {forTradeQuantityOverrides?.[group.printingId] ??
              group.items.reduce((total, item) => total + item.forTradeQuantity, 0)}
          </span>
          <button type="button" onClick={() => onToggleForTrade?.(group)}>
            Change trade quantity
          </button>
          {pendingForTradePrintingIds?.has(group.printingId) ? <span>Saving</span> : null}
        </div>
      ))}
    </div>
  ),
}))

vi.mock("../src/pages/trade/binder-share-dialog", () => ({
  BinderShareDialog: () => null,
}))

type QueryOptions = {
  variables?: {
    filters: Record<string, unknown>
    sort: { direction: string; field: string }
  }
}

const BINDER_GROUP = {
  printingId: "printing-1",
  quantity: 2,
  items: [
    {
      id: "item-1",
      forTradeQuantity: 0,
    },
  ],
}

function latestBinderQueryOptions() {
  const binderCalls = apolloMocks.useQuery.mock.calls.filter(([, options]) =>
    Boolean((options as QueryOptions | undefined)?.variables),
  )
  return binderCalls.at(-1)?.[1] as QueryOptions
}

function renderBinder() {
  return render(
    <ToastProvider>
      <BinderTab />
    </ToastProvider>,
  )
}

beforeEach(() => {
  apolloMocks.binderRefetch.mockResolvedValue({})
  apolloMocks.countRefetch.mockResolvedValue({})
  apolloMocks.setForTradeQuantity.mockResolvedValue({})
  apolloMocks.useMutation.mockReturnValue([apolloMocks.setForTradeQuantity])
  apolloMocks.useQuery.mockImplementation((_document: unknown, options?: QueryOptions) => {
    if (!options?.variables) {
      return {
        data: { collectionItemCount: 0 },
        refetch: apolloMocks.countRefetch,
      }
    }

    return {
      data: {
        collectionItemGroups: {
          edges: [{ node: BINDER_GROUP }],
          pageInfo: { endCursor: null, hasNextPage: false },
        },
      },
      fetchMore: vi.fn().mockResolvedValue({}),
      loading: false,
      refetch: apolloMocks.binderRefetch,
    }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test("trade binder excludes allocated cards until the include toggle is enabled", async () => {
  const user = userEvent.setup()
  renderBinder()

  expect(latestBinderQueryOptions().variables?.filters).toEqual({ unallocatedOnly: true })

  await user.click(screen.getByRole("checkbox", { name: "Include deck cards" }))

  expect(latestBinderQueryOptions().variables?.filters).toEqual({})
})

test("trade binder applies collection sorting and structured filters", async () => {
  const user = userEvent.setup()
  renderBinder()

  await user.click(screen.getByRole("button", { name: "Sort by Card name, Asc" }))
  const sortMenu = screen.getByRole("menu")
  expect(sortMenu.classList.contains("w-[min(18rem,calc(100vw-2rem))]")).toBe(true)
  await user.click(screen.getByRole("menuitem", { name: "Descending" }))
  await user.click(screen.getByRole("button", { name: "Sort by Card name, Desc" }))
  await user.click(screen.getByRole("menuitem", { name: "Price" }))

  expect(latestBinderQueryOptions().variables?.sort).toEqual({ field: "price", direction: "desc" })

  await user.click(screen.getByRole("button", { name: "Filter" }))
  const filterDialog = screen.getByRole("dialog", { name: "Filter collection" })
  const filterScroller = filterDialog.querySelector(".overscroll-contain")
  expect(filterScroller?.classList.contains("min-w-0")).toBe(true)
  expect(filterScroller?.classList.contains("flex-1")).toBe(true)
  expect(filterScroller?.classList.contains("overflow-y-auto")).toBe(true)
  expect(
    screen.getAllByRole("button", { name: "Any" })[0].parentElement?.classList.contains("w-full"),
  ).toBe(true)
  await user.type(screen.getByPlaceholderText("Card name"), "Black Lotus")
  await user.click(screen.getByRole("button", { name: "Apply filters" }))

  expect(latestBinderQueryOptions().variables?.filters).toEqual({
    q: '(name:"Black Lotus")',
    unallocatedOnly: true,
  })
})

test("sort dropdown supports keyboard navigation", async () => {
  const user = userEvent.setup()
  renderBinder()
  const trigger = screen.getByRole("button", { name: "Sort by Card name, Asc" })

  trigger.focus()
  await user.keyboard("{Enter}")
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Ascending" })),
  )
  await user.keyboard("{ArrowDown}{Enter}")

  expect(screen.getByRole("button", { name: "Sort by Card name, Desc" })).toBeInstanceOf(
    HTMLElement,
  )
})

test("trade quantity updates optimistically without refetching the binder", async () => {
  const user = userEvent.setup()
  let finishMutation: (() => void) | undefined
  apolloMocks.setForTradeQuantity.mockReturnValue(
    new Promise((resolve) => {
      finishMutation = () => resolve({})
    }),
  )
  renderBinder()

  await user.click(screen.getByRole("button", { name: "Change trade quantity" }))

  expect(screen.getByTestId("trade-quantity-printing-1").textContent).toBe("1")
  expect(screen.getByText("Saving")).toBeInstanceOf(HTMLElement)
  expect(apolloMocks.binderRefetch).not.toHaveBeenCalled()

  await act(async () => finishMutation?.())
  await waitFor(() => expect(apolloMocks.countRefetch).toHaveBeenCalledTimes(1))

  expect(screen.getByTestId("trade-quantity-printing-1").textContent).toBe("1")
  expect(screen.queryByText("Saving")).toBeNull()
  expect(apolloMocks.binderRefetch).not.toHaveBeenCalled()
})

test("failed trade quantity updates roll back the optimistic value", async () => {
  const user = userEvent.setup()
  apolloMocks.setForTradeQuantity.mockRejectedValue(new Error("Could not save trade quantity"))
  renderBinder()

  await user.click(screen.getByRole("button", { name: "Change trade quantity" }))

  await waitFor(() => expect(screen.getByTestId("trade-quantity-printing-1").textContent).toBe("0"))
  expect(screen.getByText("Could not save trade quantity")).toBeInstanceOf(HTMLElement)
  expect(apolloMocks.countRefetch).not.toHaveBeenCalled()
  expect(apolloMocks.binderRefetch).not.toHaveBeenCalled()
})
