import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

vi.mock("@apollo/client/react", () => ({
  useApolloClient: () => ({ refetchQueries: vi.fn(() => Promise.resolve()) }),
  useQuery: () => ({
    data: { collectionAutoSortRules: [], locations: { edges: [] } },
    loading: false,
  }),
  useMutation: (document: { definitions: Array<{ name?: { value?: string } }> }) => {
    const name = document.definitions[0]?.name?.value

    return [
      (options?: { onCompleted?: (data: Record<string, unknown>) => void }) => {
        if (name === "PreviewCollectionImport") {
          options?.onCompleted?.({
            previewCollectionImport: {
              importPreview: {
                locationId: null,
                total: 2,
                exact: 2,
                ambiguous: 0,
                unresolved: 0,
                rows: [importRow(1), importRow(2)],
              },
            },
          })
        }

        return Promise.resolve({ data: {} })
      },
      { loading: false },
    ]
  },
}))

import { ToastProvider } from "../src/components/ui/toast"
import { ImportCollectionDialog } from "../src/pages/collection/import-export-dialogs"

function importRow(rowNumber: number) {
  return {
    rowNumber,
    status: "exact",
    attrs: {
      name: `Card ${rowNumber}`,
      quantity: 30,
      finish: "nonfoil",
      purchasePriceCents: null,
    },
    candidates: [],
    printing: null,
  }
}

afterEach(cleanup)

test("total spend pricing previews the calculated per-card purchase price", async () => {
  const user = userEvent.setup()
  render(
    <ToastProvider>
      <ImportCollectionDialog open onOpenChange={vi.fn()} />
    </ToastProvider>,
  )

  await user.click(screen.getByRole("combobox", { name: "Purchase pricing" }))
  await user.click(screen.getByRole("option", { name: "Total amount spent" }))
  await user.type(screen.getByRole("textbox", { name: /^Total amount spent/ }), "439")
  await user.type(screen.getByRole("textbox", { name: "Import text" }), "60 Card")
  await user.click(screen.getByRole("button", { name: "Preview import" }))

  expect(screen.getByText("$439 ÷ 60 cards =")).not.toBeNull()
  expect(screen.getByText("$7.32 per card")).not.toBeNull()
  expect(screen.getAllByText("$7.32")).toHaveLength(2)
})
