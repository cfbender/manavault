import { act, renderHook } from "@testing-library/react"
import { expect, test } from "vitest"
import { useTokenSelection } from "../src/pages/collection/tokens/token-selection"

test("toggling a token enters selection mode; select all covers every loaded token", () => {
  const ids = ["t1", "t2", "t3"]
  const { result } = renderHook(() => useTokenSelection(ids, ""))

  expect(result.current.selectionActive).toBe(false)
  act(() => result.current.toggle("t2"))
  expect(result.current.selectionActive).toBe(true)
  expect(result.current.selectedIds).toEqual(["t2"])
  expect(result.current.allSelected).toBe(false)

  act(() => result.current.selectAll())
  expect(result.current.selectedIds).toEqual(ids)
  expect(result.current.allSelected).toBe(true)

  act(() => result.current.toggle("t1"))
  expect(result.current.selectedIds).toEqual(["t2", "t3"])
  expect(result.current.allSelected).toBe(false)
})

test("the Select button turns the mode on without a selection, and off again with one", () => {
  const { result } = renderHook(() => useTokenSelection(["t1"], ""))

  act(() => result.current.toggleSelectionMode())
  expect(result.current.selectionActive).toBe(true)
  expect(result.current.selectedIds).toEqual([])

  act(() => result.current.toggle("t1"))
  act(() => result.current.toggleSelectionMode())
  expect(result.current.selectionActive).toBe(false)
  expect(result.current.selectedIds).toEqual([])
})

test("a changed filter drops the selection; a refetch with the same filter keeps it", () => {
  const { result, rerender } = renderHook(({ ids, filter }) => useTokenSelection(ids, filter), {
    initialProps: { ids: ["t1", "t2"], filter: "" },
  })

  act(() => result.current.toggle("t1"))
  // One token was removed elsewhere: the selection only ever reports loaded IDs.
  rerender({ ids: ["t1", "t2", "t3"], filter: "" })
  expect(result.current.selectedIds).toEqual(["t1"])

  rerender({ ids: ["t2"], filter: "sold" })
  expect(result.current.selectionActive).toBe(false)
  expect(result.current.selectedIds).toEqual([])
})
