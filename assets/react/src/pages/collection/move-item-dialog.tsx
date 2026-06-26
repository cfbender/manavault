import { useMutation, useQuery } from "@apollo/client/react"
import type * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { useToast } from "../../components/ui/toast"
import { pluralize, present, titleize } from "../../lib/utils"
import { CollectionItemFormOptionsDocument, UpdateCollectionItemDocument } from "./documents"
import {
  collectionTargetItems,
  collectionTargetLabel,
  type CollectionItemTarget,
} from "./item-target"
import { isUnfiledLocation } from "./location-summary"

export function MoveCollectionItemDialog({
  item,
  listOnly = false,
  onDone,
  onOpenChange,
}: {
  item: CollectionItemTarget
  listOnly?: boolean
  onDone: () => void
  onOpenChange: (open: boolean) => void
}) {
  const { showToast } = useToast()
  const [locationId, setLocationId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const targetItems = collectionTargetItems(item)
  const targetCount = targetItems.length
  const singleTarget = targetCount === 1 ? targetItems[0] : null
  const open = targetCount > 0
  const optionsQuery = useQuery(CollectionItemFormOptionsDocument, {
    skip: !open,
    fetchPolicy: "cache-and-network",
  })
  const [updateItemMutation, updateItem] = useMutation(UpdateCollectionItemDocument)
  const locations = useMemo(
    () =>
      (optionsQuery.data?.locations?.edges?.map((edge) => edge?.node).filter(present) || []).filter(
        (location) => !isUnfiledLocation(location) && (!listOnly || location.kind === "list"),
      ),
    [listOnly, optionsQuery.data],
  )

  useEffect(() => {
    if (open) setLocationId(listOnly ? "" : singleTarget?.location?.id || "")
    else {
      setLocationId("")
      setError(null)
    }
  }, [listOnly, open, singleTarget])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (listOnly && !locationId) {
      setError("Choose a list")
      return
    }

    if (!targetItems.length) {
      setError("Choose at least one item")
      return
    }

    void Promise.all(
      targetItems.map((targetItem) =>
        updateItemMutation({
          variables: {
            id: targetItem.id,
            input: { locationId: locationId || null },
          },
        }),
      ),
    )
      .then(() => {
        showToast(
          listOnly
            ? `${pluralize(targetCount, "card")} added to list`
            : `${pluralize(targetCount, "card")} moved`,
        )
        onDone()
        onOpenChange(false)
      })
      .catch((error) =>
        setError(error instanceof Error ? error.message : "Could not move collection items"),
      )
  }

  function close() {
    if (updateItem.loading) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent
        className="max-w-lg"
        labelledBy={listOnly ? "add-collection-item-to-list-title" : "move-collection-item-title"}
      >
        <DialogHeader>
          <div>
            <DialogTitle
              id={listOnly ? "add-collection-item-to-list-title" : "move-collection-item-title"}
            >
              {listOnly
                ? targetCount > 1
                  ? "Add items to list"
                  : "Add to list"
                : targetCount > 1
                  ? "Move items"
                  : "Move item"}
            </DialogTitle>
            <p className="mt-1 text-sm text-base-content/60">{collectionTargetLabel(item)}</p>
          </div>
          <DialogClose onClose={close} />
        </DialogHeader>
        <form className="space-y-4 p-5" onSubmit={submit}>
          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.18em] text-accent">
              {listOnly ? "List" : "Location"}
            </span>
            <select
              className="select select-bordered w-full bg-base-100"
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              autoFocus
            >
              {!listOnly ? (
                <option value="">Unfiled</option>
              ) : (
                <option value="">Choose a list</option>
              )}
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} ({titleize(location.kind)})
                </option>
              ))}
            </select>
          </label>
          {listOnly && !optionsQuery.loading && locations.length === 0 ? (
            <p className="text-sm text-base-content/60">
              Create a List location before adding items to a list.
            </p>
          ) : null}
          {error ? (
            <p className="rounded-box border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close} disabled={updateItem.loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateItem.loading || (listOnly && !locationId)}>
              {updateItem.loading
                ? "Saving..."
                : listOnly
                  ? targetCount > 1
                    ? `Add ${targetCount} to list`
                    : "Add to list"
                  : targetCount > 1
                    ? `Move ${targetCount}`
                    : "Move"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
