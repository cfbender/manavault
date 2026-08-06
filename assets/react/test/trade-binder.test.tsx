import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { BinderTab } from "../src/pages/trade/binder-tab"

const apolloMocks = vi.hoisted(() => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}))

vi.mock("@apollo/client/react", () => apolloMocks)

vi.mock("../src/pages/collection/selection-grid", () => ({
  VirtualizedCollectionGrid: () => <div>Binder results</div>,
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

function latestBinderQueryOptions() {
  const binderCalls = apolloMocks.useQuery.mock.calls.filter(([, options]) =>
    Boolean((options as QueryOptions | undefined)?.variables),
  )
  return binderCalls.at(-1)?.[1] as QueryOptions
}

beforeEach(() => {
  apolloMocks.useMutation.mockReturnValue([vi.fn()])
  apolloMocks.useQuery.mockImplementation((_document: unknown, options?: QueryOptions) => {
    if (!options?.variables) {
      return {
        data: { collectionItemCount: 0 },
        refetch: vi.fn().mockResolvedValue({}),
      }
    }

    return {
      data: {
        collectionItemGroups: {
          edges: [],
          pageInfo: { endCursor: null, hasNextPage: false },
        },
      },
      fetchMore: vi.fn().mockResolvedValue({}),
      loading: false,
      refetch: vi.fn().mockResolvedValue({}),
    }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test("trade binder excludes allocated cards until the include toggle is enabled", async () => {
  const user = userEvent.setup()
  render(<BinderTab />)

  expect(latestBinderQueryOptions().variables?.filters).toEqual({ unallocatedOnly: true })

  await user.click(screen.getByRole("checkbox", { name: "Include deck cards" }))

  expect(latestBinderQueryOptions().variables?.filters).toEqual({})
})

test("trade binder applies collection sorting and structured filters", async () => {
  const user = userEvent.setup()
  render(<BinderTab />)

  await user.click(screen.getByRole("button", { name: "Sort by Card name, Asc" }))
  await user.click(screen.getByRole("button", { name: "Descending" }))
  await user.click(screen.getByRole("button", { name: "Sort by Card name, Desc" }))
  await user.click(screen.getByRole("button", { name: "Price" }))

  expect(latestBinderQueryOptions().variables?.sort).toEqual({ field: "price", direction: "desc" })

  await user.click(screen.getByRole("button", { name: "Filter" }))
  await user.type(screen.getByPlaceholderText("Card name"), "Black Lotus")
  await user.click(screen.getByRole("button", { name: "Apply filters" }))

  expect(latestBinderQueryOptions().variables?.filters).toEqual({
    q: '(name:"Black Lotus")',
    unallocatedOnly: true,
  })
})
