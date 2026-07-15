import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, test, vi } from "vitest"
import { CollectionAutoSortSection } from "../src/pages/settings/collection-auto-sort-section"
import type {
  CollectionAutoSortRuleInput,
  CollectionAutoSortSettingsLocation,
  CollectionAutoSortSettingsRule,
} from "../src/pages/settings/data"

const BOX = { id: "box-1", kind: "box", name: "Trade binder" }
const LOCATIONS: CollectionAutoSortSettingsLocation[] = [BOX]

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
  await user.type(screen.getByLabelText("Minimum price"), "not money")
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
