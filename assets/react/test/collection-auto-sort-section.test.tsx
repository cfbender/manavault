import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import { AutoSortSummaryDialog } from "../src/pages/collection/auto-sort-summary-dialog"
import { CollectionAutoSortSection } from "../src/pages/settings/collection-auto-sort-section"
import type {
  CollectionAutoSortRuleInput,
  CollectionAutoSortSettingsLocation,
  CollectionAutoSortSettingsRule,
} from "../src/pages/settings/data"

const BOX = { id: "box-1", kind: "box", name: "Trade binder" }
const LOCATIONS: CollectionAutoSortSettingsLocation[] = [BOX]

afterEach(cleanup)

function sourceRule(
  id: string,
  changes: Partial<CollectionAutoSortSettingsRule> = {},
): CollectionAutoSortSettingsRule {
  return {
    colorMode: "any",
    colors: [],
    enabled: true,
    id,
    maxPriceCents: null,
    minPriceCents: null,
    name: id,
    priority: 1,
    rarities: [],
    releaseDate: null,
    releaseDateOperator: "after",
    setCodes: [],
    setOperator: "in",
    targetLocation: BOX,
    typeLineExcludes: [],
    typeLineIncludes: [],
    ...changes,
  }
}

function ruleNames() {
  return screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent ?? "")
}

function ruleRow(name: string) {
  const row = screen.getByRole("heading", { level: 3, name }).closest("li")
  if (!(row instanceof HTMLElement)) throw new Error(`Missing row for ${name}`)
  return row
}

test("users can cancel, create, edit, reorder, delete, preview, and save staged rules", async () => {
  const user = userEvent.setup()
  const onPreview = vi.fn<(input: CollectionAutoSortRuleInput[]) => void>()
  const onSave = vi.fn<(input: CollectionAutoSortRuleInput[]) => void>()
  const onValidationError = vi.fn<(message: string) => void>()
  const initialRules = [
    sourceRule("alpha", { name: "Alpha", priority: 1 }),
    sourceRule("beta", { name: "Beta", priority: 2 }),
  ]
  const commonProps = {
    isLoading: false,
    isPreviewing: false,
    locations: LOCATIONS,
    onPreview,
    onSave,
    onValidationError,
  }
  const { rerender } = render(
    <CollectionAutoSortSection {...commonProps} isSaving={false} rules={initialRules} />,
  )

  expect(ruleNames()).toEqual(["Alpha", "Beta"])

  await user.click(screen.getByRole("button", { name: "Add rule" }))
  await user.clear(screen.getByLabelText("Rule name"))
  await user.type(screen.getByLabelText("Rule name"), "Cancelled rule")
  await user.click(screen.getByRole("button", { name: "Cancel" }))
  expect(screen.queryByRole("heading", { level: 3, name: "Cancelled rule" })).toBeNull()
  expect(ruleNames()).toEqual(["Alpha", "Beta"])

  await user.click(screen.getByRole("button", { name: "Add rule" }))
  await user.clear(screen.getByLabelText("Rule name"))
  await user.type(screen.getByLabelText("Rule name"), "Gamma")
  await user.click(screen.getByRole("button", { name: "Done" }))

  await user.click(within(ruleRow("Gamma")).getByRole("button", { name: "Edit" }))
  await user.click(screen.getByLabelText("Enable this rule"))
  await user.click(screen.getByRole("button", { name: "Done" }))
  expect(within(ruleRow("Gamma")).getByText("Disabled")).not.toBeNull()

  await user.click(screen.getByRole("button", { name: "Move Gamma up" }))
  await user.click(screen.getByRole("button", { name: "Move Gamma up" }))
  await user.click(within(ruleRow("Beta")).getByRole("button", { name: "Delete" }))
  expect(ruleNames()).toEqual(["Gamma", "Alpha"])

  await user.click(screen.getByRole("button", { name: "Preview auto-sort" }))
  expect(onPreview).toHaveBeenLastCalledWith([
    {
      colorMode: "any",
      colors: [],
      enabled: false,
      maxPriceCents: null,
      minPriceCents: null,
      name: "Gamma",
      priority: 1,
      rarities: [],
      releaseDate: null,
      releaseDateOperator: "after",
      setCodes: [],
      setOperator: "in",
      targetLocationId: "box-1",
      typeLineExcludes: [],
      typeLineIncludes: [],
    },
    {
      id: "alpha",
      colorMode: "any",
      colors: [],
      enabled: true,
      maxPriceCents: null,
      minPriceCents: null,
      name: "Alpha",
      priority: 2,
      rarities: [],
      releaseDate: null,
      releaseDateOperator: "after",
      setCodes: [],
      setOperator: "in",
      targetLocationId: "box-1",
      typeLineExcludes: [],
      typeLineIncludes: [],
    },
  ])

  const previewInput = onPreview.mock.calls[0]?.[0]
  if (!previewInput) throw new Error("Preview did not produce input")

  await user.click(screen.getByRole("button", { name: "Save rules" }))
  expect(onSave).toHaveBeenLastCalledWith(previewInput)
  expect(onValidationError).not.toHaveBeenCalled()

  rerender(<CollectionAutoSortSection {...commonProps} isSaving rules={initialRules} />)
  rerender(<CollectionAutoSortSection {...commonProps} isSaving={false} rules={initialRules} />)
  expect(ruleNames()).toEqual(["Gamma", "Alpha"])

  const savedRules = [
    sourceRule("gamma", { enabled: false, name: "Gamma", priority: 1 }),
    sourceRule("alpha", { name: "Alpha", priority: 2 }),
  ]
  rerender(<CollectionAutoSortSection {...commonProps} isSaving={false} rules={savedRules} />)
  rerender(
    <CollectionAutoSortSection
      {...commonProps}
      isSaving={false}
      rules={[savedRules[0], sourceRule("alpha", { name: "Alpha refreshed", priority: 2 })]}
    />,
  )
  expect(ruleNames()).toEqual(["Gamma", "Alpha refreshed"])
})

test("client validation blocks preview and save without discarding the staged rule", async () => {
  const user = userEvent.setup()
  const onPreview = vi.fn<(input: CollectionAutoSortRuleInput[]) => void>()
  const onSave = vi.fn<(input: CollectionAutoSortRuleInput[]) => void>()
  const onValidationError = vi.fn<(message: string) => void>()

  render(
    <CollectionAutoSortSection
      isLoading={false}
      isPreviewing={false}
      isSaving={false}
      locations={LOCATIONS}
      rules={[]}
      onPreview={onPreview}
      onSave={onSave}
      onValidationError={onValidationError}
    />,
  )

  await user.click(screen.getByRole("button", { name: "Add rule" }))
  await user.type(screen.getByRole("textbox", { name: /Minimum price/ }), "not money")
  await user.click(screen.getByRole("button", { name: "Done" }))
  await user.click(screen.getByRole("button", { name: "Preview auto-sort" }))
  await user.click(screen.getByRole("button", { name: "Save rules" }))

  expect(onValidationError).toHaveBeenNthCalledWith(
    1,
    "New auto-sort rule: minimum price must be a dollar amount.",
  )
  expect(onValidationError).toHaveBeenNthCalledWith(
    2,
    "New auto-sort rule: minimum price must be a dollar amount.",
  )
  expect(onPreview).not.toHaveBeenCalled()
  expect(onSave).not.toHaveBeenCalled()
  expect(screen.getByRole("heading", { level: 3, name: "New auto-sort rule" })).not.toBeNull()
})

test("auto-sort summary shows printing details and keeps the image preview in the viewport", () => {
  render(
    <AutoSortSummaryDialog
      open
      onOpenChange={vi.fn()}
      result={{
        checkedCount: 1,
        dryRun: true,
        movedCount: 1,
        moves: [
          {
            cardId: "oracle-1",
            cardName: "Black Lotus",
            collectorNumber: "233",
            collectionItemId: "item-1",
            finish: "nonfoil",
            fromLocationName: "Unfiled",
            imageUrl: "https://example.test/black-lotus.jpg",
            quantity: 1,
            setCode: "lea",
            toLocationId: "location-1",
            toLocationName: "Power",
          },
        ],
        skippedCount: 0,
      }}
    />,
  )

  expect(screen.getByText("LEA #233")).not.toBeNull()
  expect(screen.queryByText(/Item ID|Source ID/)).toBeNull()

  const cardLink = screen.getByRole("link", { name: "Black Lotus" })
  vi.spyOn(cardLink, "getBoundingClientRect").mockReturnValue({
    bottom: 527,
    height: 20,
    left: 294,
    right: 394,
    top: 507,
    width: 100,
    x: 294,
    y: 507,
    toJSON: () => ({}),
  })
  const dialog = cardLink.closest('[role="dialog"]')
  if (!(dialog instanceof HTMLElement)) throw new Error("Auto-sort dialog not found")
  vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
    bottom: 678,
    height: 456,
    left: 256,
    right: 1024,
    top: 222,
    width: 768,
    x: 256,
    y: 222,
    toJSON: () => ({}),
  })

  fireEvent.pointerEnter(cardLink)

  const previewImage = document.querySelector<HTMLImageElement>(
    'img[src="https://example.test/black-lotus.jpg"]',
  )
  expect(previewImage).not.toBeNull()
  expect(Number.parseFloat(previewImage?.parentElement?.style.top || "0")).toBeGreaterThanOrEqual(
    12,
  )
  expect(previewImage?.parentElement?.style.left).toBe("72px")
})

test.each([true, false])(
  "auto-sort can group by source and destination (dryRun=%s)",
  async (dryRun) => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    const baseMove = {
      finish: "nonfoil",
      quantity: 2,
      fromLocationId: "box-1",
      fromLocationName: "Red / Green / Multicolor",
      toLocationId: "binder-1",
      toLocationName: "Trade binder",
    }
    render(
      <AutoSortSummaryDialog
        open
        onOpenChange={vi.fn()}
        onApply={onApply}
        result={{
          dryRun,
          checkedCount: 8,
          movedCount: 8,
          moves: [
            { ...baseMove, collectionItemId: "1", cardName: "Lightning Bolt" },
            {
              ...baseMove,
              collectionItemId: "2",
              cardName: "Llanowar Elves",
              toLocationId: "binder-2",
              toLocationName: "Keep binder",
            },
            {
              ...baseMove,
              collectionItemId: "3",
              cardName: "Sol Ring",
              fromLocationId: null,
              fromLocationName: null,
            },
            {
              ...baseMove,
              collectionItemId: "4",
              cardName: "Birds of Paradise",
              fromLocationId: "box-2",
            },
          ],
        }}
      />,
    )

    const to = screen.getByRole("radio", { name: "To" })
    const from = screen.getByRole("radio", { name: "From" })
    expect(to.getAttribute("aria-checked")).toBe("true")
    expect(ruleNames()).toEqual(["Keep binder", "Trade binder"])
    const tradeGroup = screen.getByRole("heading", { name: "Trade binder" }).closest("details")!
    expect(within(tradeGroup).getAllByRole("listitem")).toHaveLength(3)

    await user.click(from)
    expect(from.getAttribute("aria-checked")).toBe("true")
    expect(ruleNames()).toEqual(["Red / Green / Multicolor", "Red / Green / Multicolor", "Unfiled"])
    const sourceGroups = screen.getAllByRole("heading", { name: "Red / Green / Multicolor" })
    const firstSource = sourceGroups[0].closest("details")!
    expect(within(firstSource).getByText("Location ID: box-1")).not.toBeNull()
    expect(within(firstSource).getByText("Lightning Bolt")).not.toBeNull()
    expect(within(firstSource).getByText("Llanowar Elves")).not.toBeNull()
    expect(within(firstSource).queryByText("Birds of Paradise")).toBeNull()
    const moveLabel = dryRun ? "Would move" : "Moved"
    expect(
      within(firstSource).getByText(`${moveLabel} from Red / Green / Multicolor to Keep binder`),
    ).not.toBeNull()
    expect(screen.getByText(`${moveLabel} from Unfiled to Trade binder`)).not.toBeNull()
    expect(screen.getAllByText("Qty 2")).toHaveLength(4)
    expect(onApply).not.toHaveBeenCalled()

    // Clicking the active segment must not leave the view unselected.
    await user.click(from)
    expect(from.getAttribute("aria-checked")).toBe("true")
    await user.keyboard("{ArrowLeft} ")
    expect(to.getAttribute("aria-checked")).toBe("true")
    expect(ruleNames()).toEqual(["Keep binder", "Trade binder"])

    if (dryRun) {
      await user.click(from)
      await user.click(screen.getByRole("button", { name: "Apply auto-sort" }))
      expect(onApply).toHaveBeenCalledOnce()
    } else {
      expect(screen.queryByRole("button", { name: "Apply auto-sort" })).toBeNull()
    }
  },
)
